# Implementation Plan — Phase 10.7: Safe Approved Product Mutation Execution Foundation

This phase establishes the execution boundary for merchant-approved catalog update proposals. Approved proposals can be explicitly executed by a dedicated, sandboxed execution service, connecting sanitized mutation fields directly to GCP Firestore states and the Shopify Admin GraphQL API under strict tenant scoping, atomic transaction-based state locks, validation, and audit logging.

## User Review Required

> [!IMPORTANT]
> **Shopify GraphQL API Mutators**:
> - Uses the Shopify Admin GraphQL API (`productUpdate` mutation) for executing product mutations. The legacy REST Admin write path is completely avoided and forbidden.
> - Decrypted token resolution is encapsulated strictly inside the Shopify admin service. Raw tokens are never passed in public helper signatures.

> [!WARNING]
> **Atomic Concurrency & Lock Protection**:
> - Implements a Firestore transaction to claim approval requests, transitioning status atomically from `APPROVED -> EXECUTING` before dispatching Shopify GraphQL requests.
> - This prevents duplicate concurrent executions. Validation blocks before the atomic claim keep the status as `APPROVED`.

---

## Proposed Changes

### Component 1: Redesigned Mutation States and Audit Scope

#### [MODIFY] [types.ts](file:///c:/Projects/softify/softify/src/server/domain/types.ts)
- **Status Extensions with Concurrency Guard**:
  - Update `ApprovalStatus` to support the atomic `EXECUTING` state and completion outcomes:
    ```typescript
    export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTING" | "APPLIED" | "FAILED";
    ```
- **ApprovalRequest Model**:
  - Append optional lifecycle descriptors to track executions securely:
    ```typescript
    export interface ApprovalRequest {
      // ... Phase 10.6 fields
      executedAt?: string;
      executedBy?: string;
      failureReason?: string; // Sanitized, scrubbed error description only
    }
    ```
- **Authoritative Telemetry Constants**:
  - Activate and export new `AuditEventNames` constants:
    - `APPROVAL_EXECUTION_STARTED`: Audit capture when mutation initiation enters the service.
    - `APPROVAL_EXECUTION_BLOCKED`: Audit entry if verification (tenant isolation, status checks, scope validation) fails.
    - `APPROVAL_APPLIED`: Audit entry upon successful Shopify API execution and state completion.
    - `APPROVAL_FAILED`: Audit entry on external API/Shopify errors with sanitized reason summaries.

---

### Component 2: Shopify GraphQL Client Integrations

#### [MODIFY] [shopify-admin-client.service.ts](file:///c:/Projects/softify/softify/src/server/services/shopify-admin-client.service.ts)
- **Encapsulated GraphQL Mutator**:
  - Implement and export `updateProductAllowedFields({ organizationId, storeConnectionId, productId, fields })`:
    - **Token Encapsulation**: Automatically resolves, retrieves, and decrypts the connected store's Shopify Admin access token internally from `StoreRepository` using `organizationId` and `storeConnectionId`. No raw access tokens are accepted as arguments.
    - **Product GID Precision**: Enforces that `productId` is a valid Shopify Product GID format (`gid://shopify/Product/{id}`). Any numeric IDs are explicitly normalized to GID format or rejected before request dispatch.
    - **GraphQL Execution**: Dispatches the Shopify GraphQL Admin API `productUpdate` mutation to update the product. The legacy REST Admin write path is forbidden and not used.
    - **Response Sanitization**: Returns only parsed, sanitized outcome parameters. Raw response payloads or developer bypass credentials are never logged or returned.

---

### Component 3: Sandbox Product Mutation Executor

#### [NEW] [approved-product-mutation-executor.service.ts](file:///c:/Projects/softify/softify/src/server/services/approved-product-mutation-executor.service.ts)
- **Dedicated Execution Handler**:
  - Create `executeApprovedProductMutation(approvalId: string, organizationId: string, performer: string): Promise<ApprovalRequest>`:
    - **Isolation Verification**: Fetches the approval request by ID and asserts that `organizationId` matches securely to prevent cross-tenant exposure.
    - **Lifecycle Assertions**:
      - Asserts that target approval `status === "APPROVED"` (blocks `PENDING`, `REJECTED`, `EXECUTING`, `APPLIED`, or `FAILED` states to enforce idempotency).
      - Asserts that `toolName === "catalog.products.propose_update"`.
      - Asserts that `targetType === "PRODUCT_PROPOSAL"`.
    - **Scope and Connection Checks**:
      - Resolves store connection settings using `repos.stores.getStoreConnectionByUrl`.
      - Verifies connection `status === "CONNECTED"`.
      - Asserts that the store connection has the required `"write_products"` scope.
    - **Validation Failures / Block Scoping**:
      - If validation checks fail (e.g., missing `"write_products"` scope or connection issues), the status is kept as `APPROVED` (run is deferred) and logs `APPROVAL_EXECUTION_BLOCKED` audit event.
    - **Atomic State Lock (Firestore Transaction)**:
      - Uses a Firestore transaction to claim the approval request, transitioning `status` atomically from `APPROVED` to `EXECUTING` before sending the GraphQL mutation request.
    - **Robust Field Sanitization & Validation**:
      - Ensures that only allowed fields (`title`, `vendor`, `productType`, `status`, `tags`) are applied.
      - **Field Validation Rules**:
        - Rejects any empty or unsupported fields.
        - Trims all string parameters.
        - Checks `status` against an enum-only block (e.g., `"ACTIVE" | "ARCHIVED" | "DRAFT"`).
        - Enforces string parameter maximum lengths (e.g., 255 chars).
        - Normalizes and deduplicates `tags` lists, bounding them by maximum count (e.g., max 50 tags) and maximum tag length (e.g., max 30 chars per tag).
    - **GraphQL Execution Dispatch**:
      - Calls `shopifyClient.updateProductAllowedFields`.
      - On **Success**:
        - Updates the `merchant_approvals` record status `EXECUTING -> APPLIED`, setting `executedAt: new Date().toISOString()` and `executedBy: performer`.
        - Logs `APPROVAL_APPLIED` audit event.
        - Triggers an asynchronous incremental database product sync refresh from Shopify to capture clean snapshots (preserves Shopify read-based refresh as the only source of truth; never manually patches `product_snapshots` in the database).
      - On **Deterministic failure**:
        - Updates status `EXECUTING -> FAILED`, recording `failureReason` as a generic, scrubbed error description (scans and redacts raw response contents, secrets, tokens, or system configurations).
        - Logs `APPROVAL_FAILED` audit event.
      - On **Transient/Network failure**:
        - Handles failures deliberately by applying a retry backoff queue or transitioning to `FAILED` with a clear retry descriptor.

---

### Component 4: REST Router Scoping

#### [MODIFY] [approvals.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/approvals.routes.ts)
- **Explicit Execution Endpoint**:
  - Add `POST /api/approvals/:id/execute`:
    - **No Execution on Approve**: Explicitly ensures that `POST /api/approvals/:id/decide` only changes status to `APPROVED` or `REJECTED`, and NEVER performs actual Shopify execution. Only `POST /api/approvals/:id/execute` can trigger mutation execution.
    - Enforces mandatory `organizationId` scoping checks.
    - Delegates directly to `approved-product-mutation-executor.service`.
    - Maps dynamic outputs securely, masking credentials and details.

---

## Verification Plan

### Automated Tests
We will append strict assertions to the `scripts/release-check.mjs` verification suite:
1. **Pre-Deploy Security Assertions**:
   - Assert that no theme tools (`theme.assets.patch`) or theme write permissions (`write_themes`) are registered or referenced anywhere.
   - Assert that the Product Intelligence Agent operates solely on read-only endpoints.
   - Assert that approvals `decide` routes bypass database mutations.
2. **Phase 10.7 Mutation Assertions**:
   - Assert that **no REST Admin write path** is implemented or used in `shopify-admin-client.service.ts` (enforce GraphQL-only product updates).
   - Assert that **no raw accessToken** is passed to the public helper signature of `updateProductAllowedFields`.
   - Assert that `POST /api/approvals/:id/execute` rejects execution if the request contains mismatched `organizationId` parameters (cross-tenant validation block).
   - Assert that execution fails gracefully if the store connection is missing `"write_products"` scope.
   - Assert that execution is strictly idempotent, utilizing Firestore transaction claims to block duplicate concurrent execution calls.
   - Assert that success transitions approvals strictly to `APPLIED`, and API failures transition to `FAILED` with fully redacted/sanitized error summaries.
   - Assert that **no price, inventory, variant, media, or descriptionHtml mutations** are registered, accepted, or reachable.

### Manual / Integration Verification
We will append a live integration test (`Test P`) to `scripts/smoke-test.mjs` using **isolated test scopes** (using a dedicated test fixture connection with `"write_products"` or stubbing the Shopify mutation client to avoid modifying OAuth scopes of real stores):
1. Initialize a pending proposal using `catalog.products.propose_update`.
2. Approve the proposal via `POST /api/approvals/:id/decide` and assert `status: APPROVED` with deferred execution.
3. Attempt executing without `"write_products"` scope and verify `APPROVAL_EXECUTION_BLOCKED` with status kept as `APPROVED`.
4. Trigger execution via `POST /api/approvals/:id/execute` on the test connection and verify:
   - Atomic state claims transition from `APPROVED -> EXECUTING -> APPLIED` upon success.
   - Concurrent calls are rejected with a lock conflict error.
   - Incremental catalog refresh triggers correct post-mutation database updates via read-based syncing only.
   - Authoritative audit events (`APPROVAL_EXECUTION_STARTED`, `APPROVAL_APPLIED`) are captured cleanly with zero PII/secret leaks.
