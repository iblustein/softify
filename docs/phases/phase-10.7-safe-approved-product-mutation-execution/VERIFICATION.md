# Phase 10.7 — Safe Approved Product Mutation Execution Foundation Verification Plan

## Automated Offline Pre-Deployment Checks

All offline release validation tests pass successfully:
- **Test 43**: Checked that no REST Admin write path exists in the codebase.
- **Test 44**: Verified that `updateProductAllowedFields` public signature does not accept decrypted access tokens.
- **Test 45**: Verified that `executeApprovedProductMutation` fails when there's an organizationId mismatch or invalid state.
- **Test 46**: Assured that concurrent execution is blocked by the transactional claims lock.
- **Test 47**: Confirmed that pricing, inventory, variant, media, or description mutations are completely blocked. Validated that:
  - the client service checks `write_products` internally.
  - the executor verifies store connection organization ownership.
  - execution started audit happens after the atomic claim succeeds.

Run this check:
```bash
cmd /c "npm run verify:release"
```
**Status**: `RELEASE VERIFICATION PASSED SUCCESSFULLY! (47/47 tests passed)`

---

## Live Integration Smoke Tests

We ran local end-to-end smoke testing under isolated test scopes. The following checks ran and succeeded:
1. **Approval Generation**: Simulates a proposal tool `catalog.products.propose_update` and verifies the `PENDING` request creation.
2. **Approval Action**: Approves the request successfully (`status` becomes `APPROVED`, actual execution deferred).
3. **Execution Endpoint**:
   - Sends execution request with mismatching `organizationId` -> Rejected with HTTP `403`.
   - Sends execution request with mismatching `shop` -> Rejected with HTTP `400`.
   - Executes with correct credentials -> Succeeded with HTTP `200` and state transitions to `APPLIED`.
4. **Defensive Missing Scope Verification**:
   - Seeds a connection without `write_products` scope.
   - Installs agent and generates a proposal.
   - Approves request successfully.
   - Executes proposal -> Blocked and returns `400` indicating missing `write_products` scope.
   - Verifies request remains `APPROVED` (non-destructive status preservation).
   - Verifies `APPROVAL_EXECUTION_BLOCKED` audit log exists.
   - Verifies no `APPROVAL_APPLIED` event exists.
5. **Idempotency Guard**: Re-sends duplicate execution request -> Rejected with HTTP `400` indicating the request was already finalized.
6. **Auditing Verification**: Verifies presence of `APPROVAL_EXECUTION_STARTED` and `APPROVAL_APPLIED` audit logs.

Run this check:
```bash
cmd /c "npm run build"
cmd /c "set REPOSITORY_BACKEND=memory&& npm start"
cmd /c "set SOFTIFY_BASE_URL=http://localhost:3000&& node scripts/smoke-test.mjs"
```
**Status**: `SMOKE TEST COMPLETED SUCCESSFULLY! (23/23 tests passed)`
