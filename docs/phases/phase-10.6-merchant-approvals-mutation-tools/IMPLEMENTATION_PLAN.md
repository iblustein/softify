# Phase 10.6 Implementation Plan — Merchant Approvals & Mutation Tools Foundation

## Goal
Introduce the foundation for catalog and theme mutation (write) capabilities, strictly protected behind a secure, tenant-isolated, merchant-in-the-loop approvals pipeline. No direct store modifications are committed without explicit merchant authorization.

---

## Proposed Changes

### Component 1: Domain & Types Updates

#### [MODIFY] [types.ts](file:///c:/Projects/softify/softify/src/server/domain/types.ts)
- Update `ApprovalStatus` type:
  ```typescript
  export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "APPLIED" | "FAILED";
  ```
- Re-architect `ApprovalRequest` domain model to include risk and execution metadata:
  ```typescript
  export interface ApprovalRequest {
    id: string;
    organizationId: string;
    storeConnectionId: string;
    agentInstallationId: string;
    agentId: string;
    toolName: string;
    requestedBy: string; // Agent name
    requestedAt: string;
    decidedAt?: string;
    decidedBy?: string;
    status: ApprovalStatus;
    riskLevel: 'Low' | 'Medium' | 'High';
    summary: string;
    beforeState: string;
    afterState: string;
    diff?: string;
    // Keep backward-compatible properties for legacy routes
    actionType: 'PRODUCT_UPDATE' | 'THEME_PATCH';
    targetId: string;
    details: {
      title: string;
      before: string;
      after: string;
      summary: string;
      productId?: number;
      themeId?: string;
      fields?: any;
      patch?: string;
    };
  }
  ```
- Update `AuditEventNames` in `src/server/domain/types.ts` to include:
  - `APPROVAL_CREATED`
  - `APPROVAL_APPROVED`
  - `APPROVAL_REJECTED`
  - `APPROVAL_APPLIED`
  - `APPROVAL_FAILED`

---

### Component 2: Firestore & Repository Wireup

#### [NEW] [firestore-approval.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/firestore/firestore-approval.repository.ts)
- Create the Firestore implementation of the `ApprovalRepository` contract.
- CRUD operations targeting the `merchant_approvals` Firestore collection.
- Enforce strict ascending sorting by `requestedAt` descending / chronological.

#### [MODIFY] [repository-provider.ts](file:///c:/Projects/softify/softify/src/server/repositories/repository-provider.ts)
- Import `firestoreApprovals` and wire `repos.approvals` dynamically:
  ```typescript
  const approvalsRepo = isConfigured ? firestoreApprovals : inMemoryApprovals;
  ```

---

### Component 3: Mutation Tool Definitions

#### [MODIFY] [tool-definitions.ts](file:///c:/Projects/softify/softify/src/server/tools/tool-definitions.ts)
- Register `catalog.products.update` and `theme.assets.patch` definitions in `ENABLED_TOOLS`:
  ```typescript
  {
    name: "catalog.products.update",
    description: "Update product snapshot attributes, pricing, or status in the catalog index (requires merchant approval).",
    parameters: '{"productId": "string", "fields": "object", "summary": "string"}',
    requiredScope: "write_products",
    riskLevel: "Medium"
  },
  {
    name: "theme.assets.patch",
    description: "Patch theme layout or CSS styles in the active theme (requires merchant approval).",
    parameters: '{"themeId": "string", "patch": "string", "summary": "string"}',
    requiredScope: "write_themes",
    riskLevel: "High"
  }
  ```

---

### Component 4: Tool Gateway Enforcements

#### [MODIFY] [tool-gateway.ts](file:///c:/Projects/softify/softify/src/server/tools/tool-gateway.ts)
- Update `executeToolWithContextRaw` to intercept mutation tools:
  - **`catalog.products.update`** & **`theme.assets.patch`**:
    1. Validate tenant permissions and active installations.
    2. Instead of executing the tool immediately, create a `merchant_approvals` record inside `repos.approvals` in state `PENDING`.
    3. Return a standard block status with `requires_approval: true` and the newly generated approval `id` in the outcome result.
- Write audited events for `APPROVAL_CREATED` using `writeAuditEvent(...)` detailing the risk parameters.

---

### Component 5: Approvals Routing & Decision API

#### [MODIFY] [approvals.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/approvals.routes.ts)
- Update GET `/api/approvals`:
  - Require `organizationId` parameter strictly.
  - Verify scoped shop ownership if `shop` parameter is supplied.
  - Query approvals from `repos.approvals.getApprovalsByOrganizationId(organizationId)`.
- Update POST `/api/approvals/:id/decide`:
  - Validate body contains `decision` `"APPROVE"` or `"REJECT"`.
  - Retrieve approval item and perform a strict tenant scope check (`item.organizationId === organizationId`).
  - **On REJECT**:
    - Update state to `REJECTED`.
    - Audit decision `APPROVAL_REJECTED` via `writeAuditEvent(...)`.
  - **On APPROVE**:
    - Update status to `APPROVED` and then `APPLIED` (or `FAILED` if execution fails).
    - Commit modifications securely to mock/local snapshots or themes, and write to `product_snapshots` Firestore collection if in database mode.
    - Audit decision `APPROVAL_APPROVED` and `APPROVAL_APPLIED` via `writeAuditEvent(...)`.

---

## Verification Plan

### Automated Tests
- Run `npm run lint` and `npm run build` to confirm compilation.
- Run `npm run verify:release` executing all static release checks.
- Run the smoke test suite with a new `Test O` verifying:
  - Invoking mutation tools returns `requires_approval: true` with an approval ID and does not execute directly.
  - Approval requests are successfully persisted in `merchant_approvals`.
  - Retrieval of approvals is strictly tenant-scoped and rejects cross-tenant lookup attempts.
  - Deciding an approval (approve or reject) correctly commits mock modifications and writes proper sanitized audit records to `agent_audit_logs`.
  - Zero PII, bypass secrets, or tokens are persisted inside approval request documents.
