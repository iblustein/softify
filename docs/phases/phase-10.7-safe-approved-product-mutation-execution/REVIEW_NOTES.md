# Phase 10.7 — Safe Approved Product Mutation Execution Foundation Review Notes

## Architectural Safety Features

### 1. Zero REST Write Path Containment
Mutating catalog properties using the legacy Shopify REST Admin API has been strictly locked down. All updates occur via the Shopify GraphQL Admin API `productUpdate` mutation:
- Confirmed by pre-deployment **Test 43**, which performs static analysis on the client code to ensure zero REST write endpoints are registered.

### 2. Private Token Encapsulation & Field Suppression
The public signature of the mutator method in the Shopify Client service has zero visibility of decrypted tokens:
- Encrypted tokens are decrypted inside `updateProductAllowedFields` using the connection fetched via `StoreRepository`.
- Decrypted tokens are never logged or propagated beyond the private execution boundaries of the service.
- Pre-deployment **Test 44** verifies that `UpdateProductFieldsArgs` contains no token fields.
- Hardened return types so `updatedFields` returns strictly the names of updated fields (`AllowedProductProposalField[]`), preventing any leakage of sanitized values back to the router.

### 3. Concurrency Protection & State Claims
Execution is protected against race conditions and concurrent double-executions:
- Utilizes the repository-level `claimApprovalForExecution` contract.
- Performs an atomic Firestore transaction transitioning the request from `APPROVED` to `EXECUTING`.
- Any concurrent execution requests will encounter a state mismatch and fail safely without initiating duplicate GraphQL requests.
- Pre-deployment **Test 46** verifies that duplicate claims are blocked.
- Hardened order: The `APPROVAL_EXECUTION_STARTED` audit log is dispatched only *after* the claim is successfully committed.

### 4. Rigid Payload Sanitization & Defensive Scope Scanners
Payload fields are strictly filtered and validated:
- Only `title`, `vendor`, `productType`, `status`, and `tags` are permitted.
- Strings are trimmed and checked against character limits (max 255).
- Status is verified against allowed enums (`ACTIVE`, `ARCHIVED`, `DRAFT`).
- Tags are normalized, trimmed, lowercase-standardized, deduplicated, and limited to a max count of 50 (max 30 chars per tag).
- **Double-Layer Defensive Scope Scan**: Self-contained `write_products` check is present inside the write mutator client *in addition* to the pre-execution checks inside the executor service.
- **Tenant Scope Verification**: Verifies `storeConn.organizationId === organizationId` inside the executor, blocking the run and logging `APPROVAL_EXECUTION_BLOCKED` on cross-tenant connection ownership violations.

---

## Code Review Highlights

### Security Checks Catching Failures Gracefully
If a store connection is disconnected or scopes are missing:
- The executor logs an `APPROVAL_EXECUTION_BLOCKED` audit event.
- The approval status remains `APPROVED` rather than degrading to `FAILED`.
- This ensures transient store connectivity issues or temporary credentials loss do not permanently corrupt the approval request, allowing the merchant to resolve credentials and re-execute later.
