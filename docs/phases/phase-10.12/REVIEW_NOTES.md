# Architectural Review Notes — Phase 10.12

These notes provide security and architectural review parameters for the Lead Architect, verifying the strict preservation of system boundaries during Phase 10.12 implementation.

---

## Strict Architectural Bounds Preserved

### 1. Orchestrated Single-Item Execution
- **Reuse of Approved Executor**: The batch execution route (`POST /api/approvals/batch-execute`) **must not and does not** introduce any new Shopify mutation pipeline. Instead, it loops sequentially over requested items and dispatches each to the existing, authoritative `ApprovedProductMutationExecutorService.executeApprovedProductMutation`.
- **Individually Gated Claim Locks**: Each approval item acquires its own atomic claim lock (`status` set to `EXECUTING` in database) before storefront updates are triggered. If an item is already applied or executing, it is skipped, ensuring absolute idempotency.

### 2. Strict Capped Max Batch Size
- All batch routes (`batch-dismiss`, `batch-request-approval`, `batch-decide`, and `batch-execute`) enforce a strict **10-item cap** check during the preflight phase. Any payload exceeding 10 item IDs is immediately blocked.

### 3. Fail-Fast Preflight Tenant Isolation Gating (Phase 1)
- The backend resolves the authoritative owning `organizationId` directly from the authenticated `shop` database record. It then asserts that every single item requested in the batch shares the exact same `organizationId` ownership.
- If **any** item fails ownership validation, the entire request is rejected with `403 Forbidden` **before** any state changes or sequential operations are dispatched. This guarantees zero cross-tenant leakage or state manipulation.

### 4. Shopify Rate Protection & Throttling
- The batch execution engine processes items sequentially (one-by-one) with a **mandatory 500ms safety throttle delay** injected between executions.
- In addition, it dynamically extracts and evaluates Shopify GraphQL cost/throttle status context if returned, avoiding REST-only headers assumptions.

### 5. Manual Gated Execution Gating (State-Only Decisions)
- Deciding batch approvals (`POST /api/approvals/batch-decide` with `decision: APPROVE`) strictly updates the in-memory/Firestore database status to `APPROVED`. It **never** triggers automatic execution or live storefront mutations, preserving the explicit manual storefront write model.

### 6. Strict Field Mutation Scopes
- Bulk updates are strictly limited to the allowlisted product mutation fields: `title`, `vendor`, `productType`, `status`, and `tags`. No price, variant, inventory, media, or description HTML updates are possible.

---

## Follow-up Notes / Non-blocking Technical Debt Resolved

- **Step 0 Fixtures Centralization**: All test fixtures used in integration scripts (`scripts/smoke-test.mjs` and `scripts/release-check.mjs`) have been successfully centralized inside dedicated environment blocks in these scripts, removing hardcoded credentials from production-facing paths and ensuring clean test isolation.
