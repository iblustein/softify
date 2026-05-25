# Phase 10.7 — Safe Approved Product Mutation Execution Foundation Walkthrough

## Overview
Phase 10.7 introduces a highly secure, tenant-isolated, transaction-locked execution pipeline for merchant-approved product update proposals created in Phase 10.6. This allows a store owner to explicitly execute an `APPROVED` proposal request through a dedicated, safe execution pathway rather than executing directly at approval time.

All mutations are performed exclusively via the **Shopify Admin GraphQL API `productUpdate` mutation**, strictly avoiding the legacy REST write path. Concurrency is guarded via an atomic state claim transaction (`APPROVED` -> `EXECUTING`) before any external writes are dispatched.

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
- Enforced product GID structure normalization (supports both standard Shopify GIDs and raw numeric IDs, converting the latter seamlessly).
- Treated non-empty `userErrors` returning from GraphQL as failures.
- Sanitized return shape to strictly return only `productId`, `updatedFields`, and optional `shopifyUpdatedAt`.

### 4. Product Mutation Executor Service (`src/server/services/approved-product-mutation-executor.service.ts`)
- Designed a separate, highly secure executor service orchestrating the full execution lifecycle.
- Applied tenant matching validations and verified connection status (`CONNECTED`) and scope capabilities (`write_products`).
- Managed transition states: logged block events and returned non-destructive failures (keeping status `APPROVED`) on pre-execution network/scope issues, then atomically transitioned to `EXECUTING` during the database claim transaction.
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
  - **Test 47**: Protects against unauthorized scope expansions (forbids pricing, variants, themes, inventory, or media mutations).

### 7. End-to-End Integration Verification (`scripts/smoke-test.mjs`)
- Added `Test P` running the full execution suite end-to-end:
  - Generates proposal request, approves request (validation deferral).
  - Triggers execution via `POST /execute` with tenant mismatch checks.
  - Validates successful execution state transition to `APPLIED`.
  - Verifies double execution / concurrency locks block correctly.
  - Asserts audit log events presence.
