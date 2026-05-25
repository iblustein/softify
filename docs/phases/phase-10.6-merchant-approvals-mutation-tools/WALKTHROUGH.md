# Walkthrough — Phase 10.6: Merchant Approvals & Mutation Tools Foundation (Containment Fix)

We have successfully implemented the strictly-confined **Phase 10.6: Merchant Approvals & Mutation Tools Foundation** based on the containment criteria. All direct and mock mutation execution code paths are blocked and deferred, and theme patching has been completely removed.

---

## Changes Implemented

### 1. Proposal-Only Domain & Strict Persistence Types
- **`src/server/domain/types.ts`**:
  - Redesigned `ApprovalRequest` to store only strictly-sanitized proposal parameters in Firestore.
  - Eliminated raw/unrestricted persistence fields (`beforeState`, `afterState`, `diff`, `details.before`, `details.after`, `details.fields`).
  - Added a strict `AllowedProductProposalField` union list limit: `"title" | "vendor" | "productType" | "status" | "tags"`.
  - Restricted `ApprovalStatus` union strictly to `"PENDING" | "APPROVED" | "REJECTED"`.
  - Updated centralized names `AuditEventNames` to audit `APPROVAL_CREATED`, `APPROVAL_APPROVED`, and `APPROVAL_REJECTED` only.

### 2. Proposal Registry & Scope Reduction
- **`src/server/tools/tool-definitions.ts`**:
  - Completely removed the `theme.assets.patch` layout/CSS write tool.
  - Replaced `catalog.products.update` with proposal-only tool `catalog.products.propose_update`.
  - Downgraded scope requirement to low-privilege `read_products` (do not require `write_products` in Phase 10.6).
- **`src/server/agents/agent-definitions.ts` & `src/server/ai/mock-ai.provider.ts`**:
  - Re-registered allowed tools for the Product Intelligence Agent to `"catalog.products.propose_update"`.

### 3. Gateway Proposal Interceptor & Dynamic Telemetry Scrubbing
- **`src/server/tools/tool-gateway.ts`**:
  - Removed `theme.assets.patch` interception pathway.
  - Programmed interceptor logic to evaluate incoming `catalog.products.propose_update` calls:
    - Filters and sanitizes the requested parameters block, copying only the allowed fields list strictly.
    - Saves the pending `merchant_approvals` proposal record in Firestore.
    - Dispatches async `APPROVAL_CREATED` audit events.
    - Masks raw arguments inside returned results, providing only a summary metrics record (`argsCount`, `targetId`, `allowedFields`).

### 4. REST Router Dynamic Mappings & Deferred Decision contract
- **`src/server/routes/approvals.routes.ts`**:
  - **Dynamic Legacy Mapping**: Added route-level mapping functions that dynamically construct and project legacy UI fields (`details`, `diff`, `actionType`, `beforeState`, `afterState`) on-the-fly, utilizing only safe sanitized metadata. No raw fields ever touch the database collections.
  - Enforced strict tenant-scoped GET `/api/approvals` lookups.
  - Simplified POST `/api/approvals/:id/decide` transitions:
    - Moves request status strictly to `APPROVED` or `REJECTED`, auditing corresponding outcomes.
    - Completely bypassed `setMockProducts`, `setActiveThemeCode`, `upsertProductSnapshot`, or `APPLIED` / `FAILED` state pipelines.
    - Returns `{ ok: true, status: "APPROVED", executionDeferred: true }` upon approved merchant reviews.

### 5. Repositories & Database Index Schemas
- **`src/server/repositories/firestore/firestore-approval.repository.ts`**:
  - Redesigned document mappers to load and serialize proposal-scoped fields only.
- **`firestore.indexes.json`**:
  - Configured composite query descriptors for `merchant_approvals` to safely enable chronological sorting and organization filters.

### 6. Final Legacy Tools Cleanup & Backward Compatibility Redirects
- **Registry & Definitions Cleanup**: Completely removed `shopify.prepareThemePatch` and `shopify.prepareProductUpdate` from `ENABLED_TOOLS` in definitions, agent registry allowed lists, and platform contexts.
- **Dynamic Gateway Redirect**: Added dynamic mapping inside the Tool Gateway execution path (`executeToolWithContext`). Legacy calls to `shopify.prepareProductUpdate` are automatically redirected to `catalog.products.propose_update`, resolving under sanitized `merchant_approvals` storage paths to guarantee bulletproof backward compatibility without violating containment.
- **Theme Asset Write Refusal**: Theme layout adjustments proposed by theme/design agents are immediately refused and blocked, operating in a secure read-only audit state.
- **Pre-Deployment Checks Expansion**: Enhanced release checks (Tests 40-42) to fail if theme assets patch exists, prepareThemePatch exists in gateway execution/definitions, or direct/legacy writes are reachable from decide endpoints.
- **100% Verification**: Fully verified via compilation, linting, release verification checks, and Express integration smoke testing, passing 100% of checks.
