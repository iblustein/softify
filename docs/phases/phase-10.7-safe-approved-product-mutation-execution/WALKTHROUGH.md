# Phase 10.7 — Safe Approved Product Mutation Execution Foundation Walkthrough

## Overview
Phase 10.7 introduces a highly secure, tenant-isolated, transaction-locked execution pipeline for merchant-approved product update proposals created in Phase 10.6. This allows a store owner to explicitly execute an `APPROVED` proposal request through a dedicated, safe execution pathway rather than executing directly at approval time.

All mutations are performed exclusively via the **Shopify Admin GraphQL API `productUpdate` mutation**, strictly avoiding the legacy REST write path. Concurrency is guarded via an atomic state claim transaction (`APPROVED` -> `EXECUTING`) before any external writes are dispatched.

This release has been heavily hardened to defend tenant boundaries, verify scopes defensively at all layers, and protect execution log sequences.

---

## Changes Implemented

### 1. Domain Types Redesign (`src/server/domain/types.ts`)
- Added `"EXECUTING" | "APPLIED" | "FAILED"` to `ApprovalStatus`.
- Updated `ApprovalRequest` to include lifecycle fields: `executedAt`, `executedBy`, and `failureReason`.
- Registered four execution-focused event names inside `AuditEventNames`:
  - `APPROVAL_EXECUTION_STARTED`
  - `APPROVAL_EXECUTION_BLOCKED`
  - `APPROVAL_APPLIED`
  - `APPROVAL_FAILED`

### 2. Atomic Claim Repository Wiring
- Added `claimApprovalForExecution(approvalId, organizationId)` to `ApprovalRepository` contract.
- Implemented transactional claims inside `firestore-approval.repository.ts` using `firestore.runTransaction` to atomically transition requests from `APPROVED` to `EXECUTING`.
- Implemented in-memory concurrency claim guards inside `in-memory-approval.repository.ts` for development runs.

### 3. Shopify Client GraphQL Integration (`src/server/services/shopify-admin-client.service.ts`)
- Implemented `updateProductAllowedFields` using the GraphQL Admin API `productUpdate` mutation.
- Fully encapsulated credentials resolution and token decryption inside the service.
- **Defensive Permission Guard**: Added a self-contained, internal `write_products` scope validation to prevent unauthorized updates even if pre-scanned.
- Enforced product GID structure normalization (supports both standard Shopify GIDs and raw numeric IDs, converting the latter seamlessly).
- Treated non-empty `userErrors` returning from GraphQL as failures.
- **Sanitized Outcome Shape**: Return type `SanitizedProductMutationResult` is hardened so that `updatedFields` returns strictly the names of fields updated (`AllowedProductProposalField[]`), completely suppressing the retrieval or leakage of raw values.

### 4. Product Mutation Executor Service (`src/server/services/approved-product-mutation-executor.service.ts`)
- Designed a separate, highly secure executor service orchestrating the full execution lifecycle.
- **Robust Tenant Verification**: Verifies `storeConn.organizationId === organizationId` immediately after connection lookup, throwing `TENANT_ISOLATION_VIOLATION` and auditing `APPROVAL_EXECUTION_BLOCKED` if mismatched.
- Managed transition states: logged block events and returned non-destructive failures (keeping status `APPROVED`) on pre-execution network/scope issues, then atomically transitioned to `EXECUTING` during the database claim transaction.
- **Hardened Audit Logging Order**: Shifted `APPROVAL_EXECUTION_STARTED` audit logging to occur strictly *after* the database transaction claim succeeds. If the claim fails due to concurrency lock conflicts, it audits `APPROVAL_EXECUTION_BLOCKED` with reason `concurrency_conflict`.
- Conducted sanitization, trimming, length-capping, enum checks, and tag deduplication filters on all payload properties.
- Triggered incremental product snapshot refresh on success by invoking the authentic read-based product sync service rather than patching database snapshots manually.

### 5. Execution Router Endpoint (`src/server/routes/approvals.routes.ts`)
- Mounted the `POST /api/approvals/:id/execute` endpoint.
- Enforced strict tenant validations: mandatory `organizationId` matching, and verification that optional `shop` or `storeConnectionId` parameters align with the target approval request properties.
- Mapped error codes to proper HTTP responses (404 for missing request, 403 for cross-tenant violations, 400 for bad parameters, and 500 for backend errors).

### 6. Automated Pre-Deployment Release Checks (`scripts/release-check.mjs`)
- Added Tests 43–47 to enforce all architectural constraints offline:
  - **Test 43**: Rejects any REST Admin API product write paths.
  - **Test 44**: Enforces token signature encapsulation inside the client service.
  - **Test 45**: Tests tenant boundaries and state rejections.
  - **Test 46**: Validates atomic concurrency locks and duplicate claims blocking.
  - **Test 47**: Hardens static validations (asserts client checks `write_products`, executor verifies store connection organization ownership, started audit happens after claim, and no pricing/media/variant mutations exist).

### 7. End-to-End Integration Verification (`scripts/smoke-test.mjs`)
- Extended `Test P` to verify:
  - Scoped execution test using `scope-mismatch.myshopify.com` connection without `write_products`.
  - Verifies execution attempts are blocked and return `400` errors.
  - Confirms approvals remain `APPROVED` non-destructively, `APPROVAL_EXECUTION_BLOCKED` audit is written, and no `APPLIED` state is reached.
  - Succeeded execution status transition to `APPLIED` on correct credentials.
  - Duplicate execution blocking / concurrency claim locks.
