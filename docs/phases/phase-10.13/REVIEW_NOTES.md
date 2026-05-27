# Architectural Review Notes — Phase 10.13

These notes provide security and architectural review parameters for the Lead Architect, verifying the strict preservation of system boundaries during Phase 10.13 implementation.

---

## Strict Architectural Bounds Preserved

### 1. Authoritative Execution Gating
- The `ApprovedProductMutationExecutorService` remains the sole, authoritative source of truth for all live execution checks, including `write_products` scope validation, tenant validation, sequential claim locks, and Firestore audit logs.
- No execution preflight logic has been added to route levels that bypasses or duplicates the executor pipeline.
- If `/execute` is called and fails due to scope deficiencies, the executor service throws `EXECUTION_BLOCKED` and the route safely translates it to a `BLOCKED` status in a sanitized way.

### 2. Read-Only Diagnostic Gating
- The readiness diagnostics endpoint `GET /api/shop/readiness` is strictly read-only and has zero ability to perform or alter storefront state.
- **Tenant Isolation Safety**: Contains zero hardcoded demo-org-id or test store fallbacks in production runtime paths. Requires valid `shop` and/or `organizationId` parameter context, enforcing absolute tenant boundary validation and returning `403 Forbidden` early on organizational mismatches.
- All returned payload parameters are sanitized and allowlisted: no raw OAuth access tokens, decryption keys, secrets, raw Shopify API headers/bodies, or internal system metadata are exposed. Raw catch errors are fully sanitized before being returned.

### 3. Bulk Operations UX Gating
- The Vite environment variable `VITE_SOFTIFY_ALLOW_BULK_EXECUTE` gates the visual rendering of bulk controls in the React frontend.
- It is strictly a UX helper (controls UX gating only) and is never relied upon as a security boundary. Backend tenant isolation checks and scopes validation inside `ApprovedProductMutationExecutorService` remain the ultimate authoritative security boundaries.

### 4. Rigid Platform Guardrails Preserved
- **No Auto-Execution**: Automatic or background storefront commits remain strictly out-of-scope; all writes require manual, explicit merchant commits.
- **No Theme Tools / Theme Scopes**: The system does not request, store, or reference `read_themes` or `write_themes` scopes.
- **No Forbidden Field Mutations**: Storefront writes remain strictly capped at allowlisted text fields: `title`, `vendor`, `productType`, `status`, and `tags`. No variants, price, inventory, media, or descriptionHtml mutations are permitted.
- **State-Only Recoveries**: Performer-locked stuck execution timeouts and `/reset-failed` recovery routes alter database state only and never trigger catalog modifications.
