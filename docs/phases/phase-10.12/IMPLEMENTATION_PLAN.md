# Implementation Plan — Phase 10.12: Production Bulk Operations Foundation

This phase introduces **Production Bulk Operations** inside the Softify multi-agent workspace, allowing merchants to dismiss proposed actions, request approval, decide approvals, and execute commits to Shopify in batches. Because bulk actions significantly increase the surface area of potential rate limit issues, transaction concurrency, and cross-tenant leakage, this implementation plan outlines a highly secure, throttled, and strictly isolated batch architectural framework.

---

## 1. Current State Assessment

### Core Single-Item Workflow Today
1. **Runs & Proposals**: When an agent completes a scan, it generates diagnostic recommendations and drafts a series of `ProposedAction` entities (e.g. modifying product `status`, `vendor`, `tags`).
2. **Merchant Request Approval**: Clicking "Request Merchant Approval" for an item hits `POST /api/proposed-actions/:id/request-approval`, which bridges the item to a `PENDING` merchant `ApprovalItem` via the `ProposedActionApprovalBridgeService`.
3. **Decide Queue Gating**: The merchant reviews the proposal in the queue and hits `POST /api/approvals/:id/decide` with decision `APPROVE` or `REJECT`.
   - Rejections directly update status to `REJECTED` and write a rejected audit event.
   - Approvals update status to `APPROVED` and return a wrapped `{ ok: true, status: "APPROVED", executionDeferred: true, approval }` payload without mutating live Shopify settings.
4. **Explicit Merchant Execution**: Clicking "Execute Commit to Shopify" hits `POST /api/approvals/:id/execute`. This endpoint:
   - Acquires a concurrency claim lock (marking status as `EXECUTING`).
   - Resolves the store's encrypted Shopify admin tokens safely.
   - Appoints the `ApprovedProductMutationExecutorService` to execute a strictly allowlisted `productUpdate` GraphQL mutation cap.
   - Updates status to `APPLIED` (or `FAILED` on error) and triggers asynchronous catalog snapshot synchronization.

### Reusable Single-Item Abstractions
- **Bridging**: `requestProposedActionApprovalBridge` in `proposed-action-approval-bridge.service.ts` can be scaled to run in loops or map inputs.
- **GraphQL Executor**: `ApprovedProductMutationExecutorService` in `approved-product-mutation-executor.service.ts` remains the single authoritative pipeline for executing changes and should not be modified.
- **Scrubbing & Sanitization**: Audit log scrubbing (`sanitizeAuditPayload`) and operational shape mapping (`buildLegacyApprovalShape`) will remain active.

### Primary Risk Vectors in Batch Operations
1. **Cross-Tenant Batch Pollution**: An attacker passing an array of mixed IDs (some belonging to other organizations) in a single request could trick the system into operating on unauthorized stores.
2. **Shopify Admin API Rate Exhaustion**: Committing multiple concurrent GraphQL mutations in a short window could exceed Shopify’s rate limits and trigger immediate throttling lockouts.
3. **Concurrency Locks Collisions**: Multiple requests updating the same product ID in parallel could cause database or state override conflicts.

---

## 2. Bulk Operation Scope Proposal

We propose implementing four precise, tenant-isolated batch endpoints:
1. **Batch Dismissal**: `POST /api/proposed-actions/batch-dismiss` to bulk-dismiss draft proposed actions.
2. **Batch Request Approval**: `POST /api/proposed-actions/batch-request-approval` to bridge multiple draft actions to `PENDING` approvals in a single merchant request.
3. **Batch Approval Decide**: `POST /api/approvals/batch-decide` to bulk-finalize `APPROVE` or `REJECT` decisions.
4. **Batch Approval Execute**: `POST /api/approvals/batch-execute` to manually dispatch execution commits to Shopify in a throttled, sequential queue.

---

## 3. Explicit Non-Goals

To maintain strict guardrails, Phase 10.12 **will not** implement:
- **Auto-Execution**: Automatic commit execution upon approval decision remains strictly forbidden.
- **AI-Triggered Execution**: LLMs or AI providers cannot trigger single or batch executions directly.
- **Direct AI-to-Shopify Path**: No LLM context has direct write scopes or interfaces with Shopify.
- **Theme Operations**: Theme tools, `read_themes`, and `write_themes` remain entirely disabled.
- **Unallowlisted Field Mutations**: Mutations are strictly limited to `title`, `vendor`, `productType`, `status`, and `tags`. Price, variant, inventory, media, or HTML description mutations are strictly prohibited.
- **Cross-Tenant Operations**: Inter-tenant batch operations are completely blocked.

---

## 4. Tenant Isolation Model

### Preflight Claim Validation
Every batch request must undergo strict, backend-side, item-by-item tenant validation. We enforce the following principles:

1. **Explicit Dynamic Scoping**: The request must pass `organizationId` and the active `shop` domain.
2. **Claim vs Authority Validation**:
   - The frontend-supplied `organizationId` is a **claimed context only, not a trusted authority**.
   - The backend must resolve the store connection directly from the verified `shop` context in the database to verify the true owning `organizationId`.
   - The backend must then fetch each item in the batch (whether proposed action or approval request) from the database by ID and assert that both the `organizationId` and the `storeConnectionId` match the verified shop context ownership.

3. **Fail-Fast Batch Integrity (Phase 1: Preflight Validation)**:
   - If **any** item in the batch fails tenant validation or does not belong to the active organization, the **entire batch request is immediately rejected** with `403 Forbidden` **before** any state changes or database mutations are applied.
   - Batch request processing is strictly divided into two phases:
     - **Phase 1: Preflight**: Validates tenant ownership, shop/store connection, batch size caps, duplicate IDs, item existence, and item eligibility.
     - **Phase 2: Execution**: Sequential operation execution is initiated only after Phase 1 preflight passes completely.

---

## 5. Batch Execution Safety & Idempotency Model

To prevent rate-limit blocks and lock collisions, `POST /api/approvals/batch-execute` will implement a strict safety engine:

### A. Orchestrate Existing Single-Item Execution
- The batch execution system **must call the existing approved execution pipeline per item** (i.e. invoking `ApprovedProductMutationExecutorService.executeApprovedProductMutation` inside a sequential queue).
- It **must not** create a second Shopify mutation pipeline, duplicate any `productUpdate` logic, or bypass `ApprovedProductMutationExecutorService`.

### B. Safety Parameters
1. **Max Batch Size**: Capped strictly at **10 items** per batch request.
2. **Sequential Queue Dispatch**:
   - The execution executor will process items **sequentially** (one-by-one) rather than concurrently, ensuring no parallel execution conflicts on the same store.
3. **Claim Lock Preservation**:
   - Each item in the batch must be locked individually in Firestore as `EXECUTING` before its Shopify mutation is dispatched.
4. **Shopify API Rate Protection**:
   - Inject a mandatory delay (e.g. **500ms**) between consecutive Shopify GraphQL mutation dispatches in the loop.
   - Do **not** assume REST-only headers like `X-Shopify-Shop-Api-Call-Limit` are available. Instead, utilize GraphQL cost metadata (`extensions.cost` or `throttleStatus` in the mutation responses) when available through the existing Shopify admin client abstraction to dynamically throttle if capacity is exhausted.
5. **Partial Success Reporting (Phase 2 Results)**:
   - The batch execution response will return a per-item results array detailing exactly which items succeeded (`APPLIED`) and which failed (`FAILED`), along with their respective failure reasons.
   - A single item failure does not rollback previously completed items but will safely log the error and proceed to the next item (or abort if a network/store connection drop is detected).

### C. Idempotency & Eligibility Gating Rules

To guarantee correctness, each endpoint enforces strict status validation during Phase 1 Preflight:

#### 1. Batch Execute Eligibility (`POST /api/approvals/batch-execute`)
- **APPROVED**: Items are eligible to be claimed and executed.
- **EXECUTING**: Items are reported as `BLOCKED / ALREADY_EXECUTING` and not executed again.
- **APPLIED / EXECUTED**: Items are reported as `ALREADY_APPLIED` and not executed again.
- **REJECTED / FAILED / PENDING**: Items are ineligible for execution and reported as `INELIGIBLE` (unless otherwise eligible by existing recovery policies in the case of `FAILED`).

#### 2. Batch Decide Eligibility (`POST /api/approvals/batch-decide`)
- Batch decide may **only** operate on approvals in **`PENDING`** status.
- Items in **`APPROVED`**, **`REJECTED`**, **`EXECUTING`**, **`APPLIED`**, **`EXECUTED`**, or **`FAILED`** status must be rejected during preflight as ineligible.

#### 3. Batch Request Approval Eligibility (`POST /api/proposed-actions/batch-request-approval`)
- **Draft proposed actions** (status `DRAFT` or `APPROVAL_ELIGIBLE`) are eligible to be bridged.
- **Already requested proposed actions** (status `APPROVAL_REQUESTED`, `APPROVED`, etc.) must not create duplicate approvals. The response should map them as `ALREADY_REQUESTED` and report their existing `approvalRequestId`.

#### 4. Batch Dismiss Safety (`POST /api/proposed-actions/batch-dismiss`)
- Batch dismiss may **only** operate on proposed actions in draft status (e.g. `DRAFT` or `APPROVAL_ELIGIBLE`).
- Proposed actions that have **already been bridged to approvals** must not be silently dismissed. They will be marked as ineligible.

---

## 6. UX Model (Visuals & Safeguards)

We will extend `AgentWorkspace.tsx` and `ApprovalQueue.tsx` with rich, highly responsive bulk controls:

1. **Workspace Selection Strips**:
   - Add multi-select checkboxes next to Proposed Actions and Approval Queue cards.
   - Render a floating persistent "Bulk Actions Bar" at the bottom of the workspace when 1 or more items are selected, indicating the count (e.g. *"3 items selected"*).
2. **Safety Banners & Confirmation Modals**:
   - **Batch Request Approval**: A modal displaying allowlisted comparison summaries for the selected actions with a prominent primary CTA button.
   - **Batch Approval Decide**: A confirmation warning reminding the merchant that approving is **state-only** and does not write to their storefront.
   - **Batch Approval Execute**: A high-impact confirmation modal warning: *"You are about to commit X changes to your live Shopify store. This operation writes data directly to your storefront. Proceed?"*
3. **Execution Spinner & Itemized Stepper**:
   - During batch execution, display a modal overlay displaying an itemized checklist of the executing items.
   - As each item processes sequentially, show status transformations live on the checklist (`PENDING` -> `CLAIMED/EXECUTING` -> `APPLIED` / `FAILED`).
4. **Disabled States**:
   - Select checkboxes and action buttons are disabled immediately upon clicking submit to prevent double-submissions.
5. **Result Summary Display**:
   - Upon batch completion, show a results dialog displaying the outcome (e.g. *"5 applied successfully, 1 failed"*), with clear, user-friendly recovery guidelines for any failed items.

---

## 7. API Design Proposal

### A. POST `/api/proposed-actions/batch-dismiss`
* **Request**:
  ```json
  {
    "organizationId": "org-123",
    "shop": "test-shop.myshopify.com",
    "ids": ["act-001", "act-002"]
  }
  ```
* **Response**:
  ```json
  {
    "ok": true,
    "dismissedCount": 2,
    "results": [
      { "id": "act-001", "status": "DISMISSED" },
      { "id": "act-002", "status": "DISMISSED" }
    ]
  }
  ```

### B. POST `/api/proposed-actions/batch-request-approval`
* **Request**:
  ```json
  {
    "organizationId": "org-123",
    "shop": "test-shop.myshopify.com",
    "ids": ["act-001", "act-002"]
  }
  ```
* **Response**:
  ```json
  {
    "ok": true,
    "bridgedCount": 1,
    "results": [
      { "id": "act-001", "status": "APPROVAL_REQUESTED", "approvalId": "APV-001" },
      { "id": "act-002", "status": "ALREADY_REQUESTED", "approvalId": "APV-old-99" }
    ]
  }
  ```

### C. POST `/api/approvals/batch-decide`
* **Request**:
  ```json
  {
    "organizationId": "org-123",
    "shop": "test-shop.myshopify.com",
    "decision": "APPROVE",
    "ids": ["APV-001", "APV-002"]
  }
  ```
* **Response**:
  ```json
  {
    "ok": true,
    "decision": "APPROVE",
    "executionDeferred": true,
    "results": [
      { "id": "APV-001", "status": "APPROVED" },
      { "id": "APV-002", "status": "APPROVED" }
    ]
  }
  ```

### D. POST `/api/approvals/batch-execute`
* **Request**:
  ```json
  {
    "organizationId": "org-123",
    "shop": "test-shop.myshopify.com",
    "ids": ["APV-001", "APV-002"],
    "performer": "Shop Owner"
  }
  ```
* **Response**:
  ```json
  {
    "ok": true,
    "results": [
      { "id": "APV-001", "status": "APPLIED" },
      { "id": "APV-002", "status": "ALREADY_APPLIED" }
    ]
  }
  ```

---

## 8. Audit and Analytics Impact

### Use Consistent, Allowed Event Names
To preserve historical audit consistency, we **must strictly reuse the existing `AuditEventNames` constants** rather than inventing new ad hoc strings.

The pipeline will write:
1. **Per-Item Audit Records**:
   - Each individual action/approval in a batch writes its own distinct audit event (`PROPOSED_ACTION_DISMISSED`, `PROPOSED_ACTION_APPROVAL_REQUESTED`, `APPROVAL_APPROVED`, `APPROVAL_REJECTED`, `APPROVAL_APPLIED`, `APPROVAL_FAILED`) inside the centralized `writeAuditEvent` repository.
2. **Correlation IDs**:
   - A unique batch correlation ID (e.g. `batch-corr-xyz`) is generated for the bulk operation and injected into the `metadata` object of every audit log produced by that batch.
3. **Timeline Representation**:
   - The timeline aggregates the individual events cleanly, grouping them or displaying them sequentially marked with their respective batch correlation tags.
4. **Analytics Counts**:
   - Summary and counts analytics update immediately post-execution as each state transitions.

---

## 9. Release-Check Plan

We will add a new test checking Phase 10.12 guardrails statically inside `scripts/release-check.mjs`:
- **Theme Safeguards**: Assert that no batch route references or triggers `write_themes` or `read_themes`.
- **Field Limit Gating**: Verify that batch routes process only the approved Cap parameters (`title`, `vendor`, `productType`, `status`, `tags`).
- **Zero AI Execution Direct Path**: Confirm no direct execution routes exist in agent files.
- **Tenant Validation Strictness**: Statically scan batch controllers to ensure they throw `403` on tenant mismatches and validate each array item individually.
- **No Hardcoded Fixtures**: Assert that no hardcoded `'demo-org-id'` exists in runtime codes.

---

## 10. Smoke-Test Plan

We will append Test V inside `scripts/smoke-test.mjs` verifying:
1. **Batch Decisions isolation**:
   - Attempting `POST /api/approvals/batch-decide` with a mismatched `organizationId` inside the array items returns a `403 Forbidden` response.
2. **Batch Approve Normalization**:
   - Verify batch decisions return correct shapes and update statuses to `APPROVED` without triggering auto-execution.
3. **Sequential Execution & Throttling**:
   - Execute a batch of 3 approved items and assert they apply sequentially, updating statuses to `APPLIED`, and logging discrete audit logs.
4. **Partial Failure Containment**:
   - Intentionally execute a batch containing 1 valid item and 1 invalid item (e.g. non-existent product target). Verify the response marks the first as `APPLIED` and the second as `FAILED` without breaking the runner.

---

## 11. Documentation Plan

Post-implementation, we will compile and update the following metadata and documentation:
- `docs/phases/phase-10.12/WALKTHROUGH.md`
- `docs/phases/phase-10.12/REVIEW_NOTES.md`
- `docs/phases/phase-10.12/VERIFICATION.md`
- `docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`
- `docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md`
- `docs/ai-handoff/NEXT_STEPS.md`
- `docs/PHASE_INDEX.md`

---

## 12. Special Follow-up: Test Fixture Centralization

### Technical Debt Identified in Phase 10.11
During the merchant end-to-end hardening review, it was identified that `scripts/smoke-test.mjs` continues to use `'demo-org-id'` and other hardcoded credentials as test fixtures. Although isolated to test suites, this presents a risk of accidental copy-pasting into runtime frontend/backend controllers.

### Centralized Test Fixtures Strategy (Step 0)
As the **first step of implementation (Step 0)**, we will refactor `scripts/smoke-test.mjs` and `scripts/release-check.mjs` to centralize all test fixtures. We will declare a dedicated configuration block at the top of these scripts:

```javascript
// Centralized Test Fixtures (Strictly restricted to test environment context)
const TEST_ORGANIZATION_ID = "demo-org-id";
const TEST_SHOP = "yambasurf-co-il.myshopify.com";
const TEST_STORE_CONNECTION_ID = "store-luminary";
const TEST_AGENT_INSTALLATION_ID = "inst-mock";
```

**Crucial Boundaries**:
- This centralization will be **strictly limited to test scripts and testing fixtures only**.
- It **must not** affect any production runtime codes, backend routes, frontend components, or production configurations. No fixture parameters will leak outside the automated test boundaries.
