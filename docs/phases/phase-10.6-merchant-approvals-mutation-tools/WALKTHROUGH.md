# Walkthrough — Phase 10.6: Merchant Approvals & Mutation Tools Foundation

We have successfully implemented and verified **Phase 10.6: Merchant Approvals & Mutation Tools Foundation**. This phase introduces write/mutation capabilities for catalog and theme optimization, completely isolated and protected by a robust merchant-in-the-loop approvals gateway.

---

## Changes Implemented

### 1. Domain Models & Audits
- **`src/server/domain/types.ts`**:
  - Expanded `ApprovalStatus` union type: `"PENDING" | "APPROVED" | "REJECTED" | "APPLIED" | "FAILED"`.
  - Re-architected `ApprovalRequest` to support detailed, structured metadata (`riskLevel`, chronological sorting, nested action structures, etc.) while preserving backward-compatible types for legacy route consumers.
  - Centralized new approval auditing events in `AuditEventNames` (`APPROVAL_CREATED`, `APPROVAL_APPROVED`, `APPROVAL_REJECTED`, `APPROVAL_APPLIED`, `APPROVAL_FAILED`).

### 2. Firestore Collections & Wireup
- **`src/server/repositories/firestore/firestore-approval.repository.ts`**:
  - Implemented Firestore-backed `ApprovalRepository` contract targeting the `merchant_approvals` collection.
  - Enforced chronological sorting by `requestedAt` descending.
  - Hardened database-level safety to prevent `clearApprovals()` operations when `NODE_ENV === "production"`.
- **`src/server/repositories/repository-provider.ts`**:
  - Wire database persistence dynamically inside `repository-provider.ts` so `repos.approvals` routes to Firestore when configured, with clean local fallback behavior.

### 3. Registry & Interception Boundary
- **`src/server/tools/tool-definitions.ts`**:
  - Registered two mutation tools in `ENABLED_TOOLS`: `catalog.products.update` (Medium risk) and `theme.assets.patch` (High risk).
- **`src/server/tools/tool-gateway.ts`**:
  - Refactored execution layer (`executeToolWithContextRaw`) to intercept both mutation tools immediately.
  - Replaces execution with a pending approval record created in the database and returns a standardized block response containing `requires_approval: true` and the new approval request ID.
  - Dispatches an asynchronous `writeAuditEvent` under event `APPROVAL_CREATED` to secure durable audit logs.

### 4. Tenant-Safe Approvals API Router
- **`src/server/routes/approvals.routes.ts`**:
  - Enforced mandatory `organizationId` matching and query validations across GET `/api/approvals`.
  - Enforced strict connection checks under `StoreRepository` when shop lookup is requested to prevent tenant leakage.
  - Re-architected POST `/api/approvals/:id/decide` to securely process merchant approvals:
    - Verifies store ownership strictly using `organizationId` matching.
    - Transitions requests from `PENDING` -> `APPROVED` -> `APPLIED` (or `FAILED` if execution fails).
    - Commits mock mutations directly to `getMockProducts()` in-memory arrays and Firestore product snapshots concurrently.
    - Audits every transition securely using `writeAuditEvent`.

---

## Verifications Performed

1. **Compilation & Static Checks**:
   - `npm run lint` checked cleanly with zero compilation warnings or type mismatches.
   - `npm run build` completed successfully, producing production bundles.
   - `npm run verify:release` executed successfully, passing all 39 pre-deployment release checks (including new assertions for approvals repos and registered tools).

2. **Integration & Flow Verification**:
   - Local test server started in `memory` backend mode.
   - Ran `npm run smoke:prod` with full integration suite:
     - **Test O** executed and passed completely.
     - Verified interception of AI-triggered `catalog.products.update` calls, blocking the provider and returning `requires_approval: true`.
     - Verified `merchant_approvals` item creation and chronological listing.
     - Proved cross-tenant lookup protection and decision API security.
     - Proved successful merchant approval committing mock catalog changes to both local memory snapshots.
     - Proved flawless audit logging trace with all chronological transitions.
