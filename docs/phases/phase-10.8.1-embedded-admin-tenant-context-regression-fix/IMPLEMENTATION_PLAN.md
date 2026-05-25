# Implementation Plan — Phase 10.8.1: Embedded Admin Tenant Context Regression Fix

This phase addresses the critical regression where the Softify Shopify embedded app remains stuck on the syncing loading screen because `/api/approvals` and `/api/audit-logs` expect a mandatory `organizationId` parameter which the frontend embedded context does not supply. 

It introduces safe tenant context resolution from the `shop` URL query parameter, strengthens frontend propagation, and adds a robust UI fallback to gracefully handle sync connection warnings.

---

## User Review Required

> [!IMPORTANT]
> **Tenant Context Resolution Order**:
> - If `organizationId` is passed in req.query or req.body, it remains the primary context.
> - If `organizationId` is missing, but `shop` is provided, the backend will dynamically load the corresponding `StoreConnection` from database, derive its `organizationId`, and utilize it.
> - If both `organizationId` and `shop` are provided, a strict cross-tenant isolation assertion check prevents mismatches (HTTP 403 / Audit Event Block).
> - If neither is provided, the backend returns HTTP 400. This preserves the security boundaries of Phase 10.8.

> [!WARNING]
> **No Infinite Loading Spinner**:
> - If initial fetch queries fail (such as store database connection offline or server handshake warnings) and core datasets are absent, the loader screen immediately yields to a visible error card with an active retry trigger, avoiding infinite spinners.

---

## Proposed Changes

### Component 1: Embedded Frontend Context Propagation & Error Recovery

#### [MODIFY] [App.tsx](file:///c:/Projects/softify/softify/src/App.tsx)
- **Shop Query Parameter Propagation**:
  - Update `fetchAllData` to append the `shopQuery` parameter to all three GET calls: `/api/approvals`, `/api/audit-logs`, and `/api/dashboard-stats` (already has it).
  - Update `syncStatsAndLogs` to dynamically read `shop` from URL query parameter, construct `shopQuery`, and pass it to:
    - `/api/dashboard-stats`
    - `/api/audit-logs`
    - `/api/approvals`
    - `/api/products` (if present)
  - Update `handleDecideApproval` to pass `shopQuery` as part of the POST URL to enable the backend to resolve tenant context securely during the merchant decision dispatch.
- **Graceful Error UI State**:
  - Replace the infinite loading spinner condition (`if (isLoading || !store || !stats)`) by intercepting when `!isLoading && errorText && (!store || !stats)`.
  - Render a visually premium, HSL-harmonized error recovery card detailing the connection sync failure, offering a active "Retry Syncing Gateway" button that triggers `fetchAllData`.

---

### Component 2: Backend Tenant Context Resolution Revisions

#### [MODIFY] [audit.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/audit.routes.ts)
- **Resolve context from Shop parameter**:
  - Extract `organizationId` and `shop` from the query object.
  - If `shop` is provided:
    - Normalize shop URL.
    - Load the `StoreConnection` by URL from `repos.stores`.
    - If no connection is found, return HTTP 404.
    - If `organizationId` is *also* provided, assert that `storeConnection.organizationId === organizationId`. If they do not match, log `GATEWAY_VALIDATION_BLOCKED` and return HTTP 403.
    - Set `resolvedOrgId = storeConnection.organizationId` and `storeConnectionId = storeConnection.id`.
  - If `shop` is not provided, enforce `organizationId` presence (type check as string) and set `resolvedOrgId = organizationId`.
  - If neither parameter yields an organization ID, reject with HTTP 400.
  - Utilize `resolvedOrgId` and `storeConnectionId` to load and filter repository audit logs cleanly.

#### [MODIFY] [approvals.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/approvals.routes.ts)
- **GET /approvals Context Resolution**:
  - Implement the identical tenant context resolution sequence in the list endpoint.
  - If `shop` is provided, resolve `resolvedOrgId` and filter approvals by `storeConnectionId`.
  - If neither `organizationId` nor `shop` is provided, return HTTP 400.
- **POST /approvals/:id/decide Context Resolution**:
  - Load the requested approval `approvalItem` by `id` from the database.
  - Resolve caller's context from `organizationId` (from body/query) and `shop` (from body/query).
  - Verify that the resolved organization ID matches `approvalItem.organizationId`. Reject with HTTP 403 on mismatch.
  - If no context parameter is passed, return HTTP 400.
  - This eliminates reliance on hardcoded frontend parameters without compromising isolation rules.

---

### Component 3: Static & Integration Test Coverage Extensions

#### [MODIFY] [release-check.mjs](file:///c:/Projects/softify/softify/scripts/release-check.mjs)
- **Static Hardening Reassertions**:
  - Add static checks in `scripts/release-check.mjs` verifying that `audit-logs`, `approvals`, and `decide` routes actively check for context resolution (`repos.stores.getStoreConnectionByUrl` or `storeConnection.organizationId`).

#### [MODIFY] [smoke-test.mjs](file:///c:/Projects/softify/softify/scripts/smoke-test.mjs)
- **Test Q Regression Additions**:
  - Assert that embedded-style queries using `shop` parameter only succeed (HTTP 200):
    - `GET /api/approvals?shop=yambasurf-co-il.myshopify.com`
    - `GET /api/audit-logs?shop=yambasurf-co-il.myshopify.com`
  - Assert that missing both parameters returns HTTP 400.
  - Assert that mismatching `shop` and `organizationId` returns HTTP 403.
  - Assert that the frontend build and static checks are fully compliant.

---

## Verification Plan

### Automated Tests
We will execute the complete automated validation lifecycle:
```bash
# 1. TypeScript & Linter
npm run lint

# 2. Compile and production builds
npm run build

# 3. Static release-check validations
npm run verify:release

# 4. Integration smoke suite
node scripts/smoke-test.mjs
```

### Manual Verification
- Launch the server locally and inspect in Chrome DevTools that `/api/approvals` and `/api/audit-logs` requests are called with `?shop=...` query context and return HTTP 200.
- Trigger data loading error state by starting with disconnected stores to verify error panel styling and retry trigger functionality.
