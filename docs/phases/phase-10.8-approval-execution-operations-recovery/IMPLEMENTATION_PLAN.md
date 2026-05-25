# Implementation Plan — Phase 10.8: Approval Execution Operations & Recovery Foundation

This phase establishes the operational control, visibility, and recovery-safe pipeline for managing merchant approvals and executing product mutations created in Phases 10.6 and 10.7. It introduces structured operational APIs, status filtering, execution telemetry tracking, audit trails, and recovery endpoints under rigorous tenant scoping, validation, and zero-PII/zero-credential containment.

## User Review Required

> [!IMPORTANT]
> **No Shopify Client / Mutation Invocation on Recovery**:
> - The recovery endpoints `/api/approvals/:id/reset-failed` and `/api/approvals/:id/mark-execution-failed` are strictly state-only operational tools. 
> - **Neither endpoint calls the Shopify client, executes mutations, or triggers/refreshes product snapshots.**
> - Resetting a failed approval simply makes the approval request eligible for a future explicit execution dispatch.

> [!WARNING]
> **Tenant Scoping & Operational Sanity Checks**:
> - All new endpoints (`GET /api/approvals/:id`, `GET /api/approvals/:id/audit`, `POST /api/approvals/:id/reset-failed`, `POST /api/approvals/:id/mark-execution-failed`) strictly enforce tenant boundary checking. Cross-tenant or cross-store queries are actively audited as `APPROVAL_RECOVERY_BLOCKED` and rejected with HTTP `403` or `400`.
> - Telemetry logs and the new operational detail endpoint return clean, sanitized parameters. Legacy formatting adapters (like `buildLegacyApprovalShape`) and raw payloads are completely omitted from the operational detail endpoint.

---

## Proposed Changes

### Component 1: Redesigned Mutation Telemetry, Audit Scope & Attempt Metadata

#### [MODIFY] [types.ts](file:///c:/Projects/softify/softify/src/server/domain/types.ts)
- **ApprovalRequest Interface Extensions**:
  - Add explicit lifecycle telemetry descriptors to track execution attempts, failure vectors, blockages, and correlations safely without storing raw payloads:
    ```typescript
    export interface ApprovalRequest {
      // Existing fields ...
      executionStartedAt?: string;
      executionFinishedAt?: string;
      executionAttemptCount?: number;
      lastExecutionStatus?: ApprovalStatus;
      lastFailureReason?: string; // Sanitized, scrubbed error description only
      lastFailureCode?: string;   // Sanitized code e.g. SHOPIFY_API_EXECUTION_FAILED
      lastBlockedReason?: string;  // e.g. missing_write_products_scope
      lastExecutedBy?: string;     // e.g. Shop Owner
      lastExecutionCorrelationId?: string; // UUID tracking this execution session
    }
    ```
- **Authoritative Telemetry Constants**:
  - Add and register the following new `AuditEventNames` constants:
    - `APPROVAL_VIEWED`: Recorded when GET `/api/approvals/:id` is queried by the client.
    - `APPROVAL_AUDIT_VIEWED`: Recorded when GET `/api/approvals/:id/audit` is queried.
    - `APPROVAL_RECOVERY_RESET`: Logged when an approval is safely transitioned `FAILED -> APPROVED`.
    - `APPROVAL_EXECUTION_TIMEOUT_MARKED_FAILED`: Logged when an execution stuck in `EXECUTING` status is marked `FAILED`.
    - `APPROVAL_RECOVERY_BLOCKED`: Logged when a recovery operation violates tenant constraints or lifecycle requirements.

---

### Component 2: Repository Layer Contract & Implementations

#### [MODIFY] [approval.repository.contract.ts](file:///c:/Projects/softify/softify/src/server/repositories/contracts/approval.repository.contract.ts)
- **Contract Declarations**:
  - Append the recovery signatures utilizing strong parameters objects to enforce repository-level encapsulation:
    ```typescript
    resetFailedApproval(params: {
      approvalId: string;
      organizationId: string;
      storeConnectionId?: string;
      performedBy: string;
    }): Promise<ApprovalRequest>;

    markStuckExecutingAsFailed(params: {
      approvalId: string;
      organizationId: string;
      storeConnectionId?: string;
      timeoutMs: number;
      performedBy: string;
      reason: "execution_timeout" | "operator_marked_stuck" | "manual_recovery";
    }): Promise<ApprovalRequest>;
    ```

#### [MODIFY] [in-memory-approval.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/in-memory/in-memory-approval.repository.ts)
- **Local Reset & Timeout Recovery Implementation**:
  - Implement `resetFailedApproval({ approvalId, organizationId, storeConnectionId, performedBy })`:
    - Locate approval. Verify exists and `organizationId` matches.
    - If `storeConnectionId` is provided, verify it matches `approval.storeConnectionId`. Block and throw if mismatched.
    - Assert `status === "FAILED"`. Throw if not.
    - Transition `status` to `APPROVED`, update `lastExecutionStatus = "FAILED"`, and save `lastExecutedBy = performedBy`.
  - Implement `markStuckExecutingAsFailed({ approvalId, organizationId, storeConnectionId, timeoutMs, performedBy, reason })`:
    - Validate that `reason` is strictly allowlisted: `["execution_timeout", "operator_marked_stuck", "manual_recovery"]`.
    - Locate approval. Verify exists and `organizationId` matches.
    - If `storeConnectionId` is provided, verify it matches `approval.storeConnectionId`. Block and throw if mismatched.
    - Assert `status === "EXECUTING"`.
    - Assert `executionStartedAt` is older than `timeoutMs`.
    - Transition `status` to `FAILED`, set `lastExecutionStatus = "EXECUTING"`, `lastFailureReason = reason`, `lastFailureCode = "EXECUTION_TIMEOUT"`, `executionFinishedAt = new Date().toISOString()`, `lastExecutedBy = performedBy`.

#### [MODIFY] [firestore-approval.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/firestore/firestore-approval.repository.ts)
- **Firestore Transactional Recovery Implementation**:
  - Update `mapDocument` to support and map all 9 new execution telemetry fields to and from Firestore.
  - Implement `resetFailedApproval` using `firestore.runTransaction`:
    - Atomically verify `status === "FAILED"`, check `organizationId === organizationId` inside a transaction.
    - If `storeConnectionId` is provided, assert that it matches the fetched approval record.
    - Perform update to `status: "APPROVED"`, `lastExecutionStatus: "FAILED"`, `lastExecutedBy: performedBy`.
  - Implement `markStuckExecutingAsFailed` using `firestore.runTransaction`:
    - Validate allowlisted `reason`.
    - Fetch and atomically check `status === "EXECUTING"`, verify tenant ownership.
    - If `storeConnectionId` is provided, assert that it matches the fetched approval record.
    - Assert `executionStartedAt` exists and is older than `timeoutMs` (from current time).
    - Commit atomically `status: "FAILED"`, `lastExecutionStatus: "EXECUTING"`, `lastFailureReason: reason`, `lastFailureCode: "EXECUTION_TIMEOUT"`, `executionFinishedAt: new Date().toISOString()`, `lastExecutedBy: performedBy`.

---

### Component 3: Operations & Recovery REST Endpoints

#### [MODIFY] [approvals.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/approvals.routes.ts)
- **Status Filter Expansion in List Endpoint**:
  - Update `GET /api/approvals`:
    - Accept `status` query parameter.
    - Validate `status` against standard list: `PENDING`, `APPROVED`, `REJECTED`, `EXECUTING`, `APPLIED`, `FAILED`. Reject with HTTP `400` if invalid.
    - Apply status filter to final lists.
- **Sanitized Operational Approval Details Endpoint**:
  - Implement `GET /api/approvals/:id`:
    - Validate mandatory query/body `organizationId` parameter.
    - Check tenant boundary: reject with HTTP `403` if `approval.organizationId !== organizationId`.
    - Log `APPROVAL_VIEWED` audit trail.
    - **Operational Shape Sanitization**: Omit legacy adaptors (do NOT call `buildLegacyApprovalShape`). Return only the structured operational fields (such as IDs, status, telemetry, allowed fields). Do not return legacy fields (`actionType`, `beforeState`, `afterState`, `diff`), raw payloads, raw tool arguments, raw Shopify responses, prompts, tokens, or PII.
- **Sanitized Approval Audit Trail Endpoint**:
  - Implement `GET /api/approvals/:id/audit`:
    - Enforce mandatory `organizationId`.
    - Validate tenant boundary for approval.
    - Query audit events from `repos.audit` filtering by `organizationId`.
    - **Primary Audit Correlation**: Filter events primarily matching `e.metadata?.approvalId === id`. `correlationId` or `lastExecutionCorrelationId` matches are used only as secondary matching rules.
    - Log `APPROVAL_AUDIT_VIEWED` audit trail.
    - Return clean, sanitized list of audit events.
- **Recovery Resets Endpoint**:
  - Implement `POST /api/approvals/:id/reset-failed`:
    - Enforce mandatory `organizationId`.
    - Extract `performedBy` or `actor` (e.g. from `req.body`), defaulting to `"system"` if not provided. Include this actor in all audit events.
    - If `shop` or `storeConnectionId` is provided in request, normalize and pass `storeConnectionId` to validation.
    - Delegate reset to `repos.approvals.resetFailedApproval`.
    - On success: log `APPROVAL_RECOVERY_RESET` including the actor in metadata, and return HTTP `200`.
    - On validation/lifecycle failure: log `APPROVAL_RECOVERY_BLOCKED` and return HTTP `400`/`403`.
- **Stuck Execution Recovery Endpoint**:
  - Implement `POST /api/approvals/:id/mark-execution-failed`:
    - Enforce mandatory `organizationId`.
    - Extract `performedBy` or `actor` (e.g. from `req.body`).
    - Extract allowlisted `reason` (default `"execution_timeout"`). Check allowlist: `["execution_timeout", "operator_marked_stuck", "manual_recovery"]`. If mismatched, reject with HTTP `400`.
    - Read stuck timeout parameter from environment:
      ```typescript
      const APPROVAL_EXECUTION_STUCK_TIMEOUT_MS = Number(process.env.APPROVAL_EXECUTION_STUCK_TIMEOUT_MS || 900000); // 15 minutes
      ```
      If configuration resolves to an unsafe threshold (such as `0` or negative numbers), default strictly back to `900000` (15 minutes) or reject processing.
    - Delegate to `repos.approvals.markStuckExecutingAsFailed`.
    - On success: log `APPROVAL_EXECUTION_TIMEOUT_MARKED_FAILED` containing actor details, and return HTTP `200`.
    - On lifecycle/timeout validation failure: log `APPROVAL_RECOVERY_BLOCKED` and return HTTP `400`/`403`.

---

### Component 4: Sandbox Mutation Executor Telemetry Integration

#### [MODIFY] [approved-product-mutation-executor.service.ts](file:///c:/Projects/softify/softify/src/server/services/approved-product-mutation-executor.service.ts)
- **Metadata Instrumentation in Execution Pipeline**:
  - Inside `executeApprovedProductMutation`:
    - Generate unique transaction tracking ID: `const correlationId = "exec-" + crypto.randomUUID()`.
    - Increment attempt count: `const attemptCount = (approval.executionAttemptCount || 0) + 1`.
    - Update starting execution metrics on the database claim:
      - `executionStartedAt: new Date().toISOString()`
      - `executionAttemptCount: attemptCount`
      - `lastExecutionStatus: "EXECUTING"`
      - `lastExecutedBy: performer`
      - `lastExecutionCorrelationId: correlationId`
    - When execution succeeds:
      - Update completion metrics: `executionFinishedAt: new Date().toISOString()`, `lastExecutionStatus: "APPLIED"`.
    - When execution fails (GraphQL errors or field validation errors):
      - Update failure metrics: `executionFinishedAt: new Date().toISOString()`, `lastExecutionStatus: "FAILED"`, `lastFailureReason: sanitizedError`, `lastFailureCode: errorCode`.
    - When execution is blocked (missing scope/disconnected):
      - Update blocked metrics: `lastBlockedReason: reason`, `lastExecutionStatus: "APPROVED"` (status remains `APPROVED`).

---

### Component 5: Test Fixtures and Repository Seeding

#### [MODIFY] [index.ts](file:///c:/Projects/softify/softify/src/server/index.ts)
- **Stuck Execution Seed Setup**:
  - Under `seedInMemoryDb()`, seed two pre-configured mock approval execution states specifically for operational recovery verification:
    1. **Stuck Executing Approval**:
       - `id: "stuck-executing-approval"`
       - `status: "EXECUTING"`
       - `executionStartedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()` (30 minutes ago, i.e. past stuck threshold)
       - `organizationId: "demo-org-id"`
       - `storeConnectionId: "store-luminary"`
       - `toolName: "catalog.products.propose_update"`
       - `riskLevel: "Medium"`
       - `targetType: "PRODUCT_PROPOSAL"`
       - `targetId: "101"`
    2. **Active Executing Approval (Non-stuck)**:
       - `id: "active-executing-approval"`
       - `status: "EXECUTING"`
       - `executionStartedAt: new Date().toISOString()` (just started)
       - `organizationId: "demo-org-id"`
       - `storeConnectionId: "store-luminary"`
       - `toolName: "catalog.products.propose_update"`
       - `riskLevel: "Medium"`
       - `targetType: "PRODUCT_PROPOSAL"`
       - `targetId: "101"`
  - This avoids introducing any public mutation route that allows arbitrary status modifications.

---

## Verification Plan

### Automated Tests
We will extend `scripts/release-check.mjs` with comprehensive checks for Phase 10.8 operational requirements:
1. **Scope Hard Guardrails**:
   - Assert that no new mutation tools or theme write scopes (`write_themes`) are registered or referenced.
   - Assert that `APPROVAL_EXECUTION_STUCK_TIMEOUT_MS` cannot be set to unsafe values like `0` or negative integers.
2. **Operations & Recovery Logic Checks**:
   - Assert that the detail endpoint `GET /api/approvals/:id` returns **sanitized operational fields only** and does not return the legacy shape (`actionType`, `diff`, `details.fields`) or raw developer configurations.
   - Assert that recovery endpoints require a `performedBy` / `actor` parameter.
   - Assert that recovery reason values are strictly allowlisted and checked against the allowlist.
   - Assert that `resetFailedApproval` contract method is fully defined with object parameters and restricts transitions only from `status === "FAILED"`.
   - Assert that `markStuckExecutingAsFailed` contract method restricts timeout recovery strictly to stuck `EXECUTING` states.
   - Assert that the recovery reset endpoint **never** triggers product updates, mock server tool handlers, or calls the Shopify client.
   - Assert that all new routing endpoints perform strict `organizationId` parameter verification, tenant isolation checks, and audit logging.

### Manual / Integration Verification
We will define `Test Q` inside `scripts/smoke-test.mjs` verifying:
1. **Filtering by Status**:
   - Lists approvals specifying `status=PENDING` and verifies outputs are restricted correctly.
2. **Sanitized Details**:
   - Requests detailed approval metadata via `GET /api/approvals/:id` and asserts tenant validation, presence of execution telemetry fields, clean sanitized shape, and logging of the `APPROVAL_VIEWED` event.
   - Rejects detail query with mismatched `organizationId` (expect HTTP `403` and `APPROVAL_RECOVERY_BLOCKED` logging).
3. **Audit Trails**:
   - Requests `/api/approvals/:id/audit` and asserts it only returns log events belonging to that specific approval session using `metadata.approvalId`, logging the `APPROVAL_AUDIT_VIEWED` event.
4. **Recovery Reset**:
   - Generates and approves a proposal, then simulates execution failure to transition status to `FAILED`.
   - Rejects `/api/approvals/:id/reset-failed` when status is not `FAILED` (e.g. `PENDING` or `APPROVED` requests return `400`).
   - Resets the `FAILED` approval to `APPROVED` using `/api/approvals/:id/reset-failed` and asserts that the status successfully transitions to `APPROVED`, metadata reflects reset history, `performedBy` is stored, `APPROVAL_RECOVERY_RESET` event is audited, and no Shopify mutation/catalog change is committed.
5. **Stuck Execution recovery**:
   - Recovers stuck execution on `"stuck-executing-approval"` fixture via `/api/approvals/:id/mark-execution-failed` and asserts status transitions to `FAILED` with failure telemetry, allowlisted reasons, and logs the `APPROVAL_EXECUTION_TIMEOUT_MARKED_FAILED` event.
   - Asserts that non-stuck execution `"active-executing-approval"` rejects the recovery transition (HTTP `400`).
