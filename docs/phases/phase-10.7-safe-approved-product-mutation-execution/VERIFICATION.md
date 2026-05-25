# Phase 10.7 — Safe Approved Product Mutation Execution Foundation Verification Plan

## Automated Offline Pre-Deployment Checks

All offline release validation tests pass successfully:
- **Test 43**: Checked that no REST Admin write path exists in the codebase.
- **Test 44**: Verified that `updateProductAllowedFields` public signature does not accept decrypted access tokens.
- **Test 45**: Verified that `executeApprovedProductMutation` fails when there's an organizationId mismatch or invalid state.
- **Test 46**: Assured that concurrent execution is blocked by the transactional claims lock.
- **Test 47**: Confirmed that pricing, inventory, variant, media, or description mutations are completely blocked. Validated that:
  - The client service checks `write_products` internally.
  - The executor verifies store connection organization ownership.
  - Execution started audit happens after the atomic claim succeeds.

Run this check:
```bash
cmd /c "npm run verify:release"
```
**Status**: `RELEASE VERIFICATION PASSED SUCCESSFULLY! (47/47 tests passed)`

---

## Live Integration Smoke Tests

We ran local end-to-end smoke testing under isolated test scopes. The following execution pathways are distinguished and tested:

### 1. Local / Mock Successful Execution Validation
- **Environment**: Triggered in local/in-memory mode (`REPOSITORY_BACKEND=memory`).
- **Flow**:
  1. **Approval Generation**: Simulates a proposal tool `catalog.products.propose_update` and verifies the `PENDING` request creation.
  2. **Approval Action**: Approves the request successfully (`status` becomes `APPROVED`, actual execution deferred).
  3. **Execution Endpoint**: Executes with correct credentials -> Succeeded with HTTP `200` and state transitions to `APPLIED`.
  4. **Idempotency Guard**: Re-sends duplicate execution request -> Rejected with HTTP `400` indicating the request was already finalized.
  5. **Auditing**: Verifies presence of `APPROVAL_EXECUTION_STARTED` and `APPROVAL_APPLIED` audit logs.
  6. **Defensive Scope Guard Test**:
     - Seeds an in-memory connection without `write_products` scope.
     - Installs agent and generates a proposal.
     - Approves request successfully.
     - Executes proposal -> Blocked and returns HTTP `400` indicating missing `write_products` scope.
     - Verifies request remains `APPROVED` (non-destructive status preservation).
     - Verifies `APPROVAL_EXECUTION_BLOCKED` audit log exists and no `APPLIED` state is reached.

### 2. Deployed Read-Only Safe-Block Validation (Default GitHub Action)
- **Environment**: Triggered against the deployed Cloud Run service without enabling live writes.
- **Flow**:
  1. **Approval Generation**: Simulates a proposal tool `catalog.products.propose_update` and verifies the `PENDING` request creation.
  2. **Approval Action**: Approves the request successfully (`status` becomes `APPROVED`, actual execution deferred).
  3. **Execution Endpoint**: Calls execution endpoint `/api/approvals/:id/execute`.
  4. **Scope Safety Block**: Since the connected production store is missing `write_products` scope, it expects an HTTP `400` with the safe scope block.
  5. **Status Preservation**: Confirms the approval request remains non-destructively in `APPROVED` status.
  6. **Telemetry Verification**: Asserts `APPROVAL_EXECUTION_BLOCKED` audit log event exists (reason `missing_write_products_scope`), and no `APPLIED`/`APPROVAL_APPLIED` state is ever reached.

### 3. Optional Live Write Smoke Validation
- **Environment**: Deployed Cloud Run, explicitly triggered with `SOFTIFY_ENABLE_LIVE_WRITE_SMOKE=true`.
- **Flow**:
  - Requires a dedicated test store connection reauthorized with live `write_products` scopes.
  - Test P executes successfully, transitioning status to `APPLIED` on the live store and logging `APPROVAL_APPLIED` audit trails.

---

## Verification Commands

To run local mock successful execution validation:
```bash
cmd /c "npm run build"
cmd /c "set REPOSITORY_BACKEND=memory&& npm start"
cmd /c "set SOFTIFY_BASE_URL=http://localhost:3000&& node scripts/smoke-test.mjs"
```
**Status**: `SMOKE TEST COMPLETED SUCCESSFULLY! (23/23 tests passed)`
