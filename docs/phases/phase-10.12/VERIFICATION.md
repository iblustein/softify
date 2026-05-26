# Verification Plan — Phase 10.12

This document provides instructions on how to verify that the Phase 10.12 Production Bulk Operations foundation, UX elements, and security boundaries are fully operational.

---

## 1. Automated Pre-Deployment Release Checks

Run the static analysis check suite to assert documentation compliance, safety bounds, and tenant-isolation validations.

### Command
```bash
node scripts/release-check.mjs
```

### Expected Output
```bash
Verifying: 56. Phase 10.12 Production Bulk Operations Foundation static validation...
✓ PASS

=== RELEASE VERIFICATION SUMMARY ===
 ...
 ✓ 56. Phase 10.12 Production Bulk Operations Foundation static validation: PASS

Results: 56 passed, 0 failed, total 56
RELEASE VERIFICATION PASSED SUCCESSFULLY!
```

---

## 2. Automated End-to-End Smoke Tests

Start the server locally in production mode and run the smoke tests to verify batch endpoints, sequential executions, throttling, and fail-fast tenant validation.

### Step A: Build and Launch Server in compiled production mode
```bash
# Build production bundle
npm run build

# Start server in production mode with token encryption key configured
set NODE_ENV=production
set SHOPIFY_TOKEN_ENCRYPTION_KEY=my-development-secret-key
node dist/server.cjs
```

### Step B: Run Smoke Tests Suite
```bash
set SOFTIFY_BASE_URL=http://localhost:3000
node scripts/smoke-test.mjs
```

### Expected Output
```bash
=== SOFTIFY SAAS RELEASE SMOKE TEST SUITE ===
...
Running: V. Production Bulk Operations Foundation (batch request, decide, execute, and tenant isolation)...
   [TEST V] Successfully verified sequential batch request, batch decide deferred approvals, sequential batch execute, and strict preflight tenant isolation checks.
✓ PASS

=== SMOKE TEST SUMMARY ===
 ...
 ✓ V. Production Bulk Operations Foundation (batch request, decide, execute, and tenant isolation): PASS

Results: 29 passed, 0 failed, total 29
SMOKE TEST COMPLETED SUCCESSFULLY!
```

---

## 3. Manual Merchant Workflows Verification

For visual auditing and pilot demos:
1. Navigate to the **Agent Workspace** tab.
2. Launch a Diagnostic Scan. Once completed:
   - Checkboxes should appear next to the Proposed Actions cards (if eligible).
   - Select 2 or more checkboxes.
   - Verify that a floating, responsive **Bulk Actions Bar** slides into view at the bottom of the viewport showing: *"X items selected"*.
   - Click **Request Approval for Selected**:
     - Verify it opens a confirmation dialog showing comparison summaries.
     - Authorize the request. Confirm that the items transition to approval-requested and the checkboxes disappear.
3. Navigate to the **Write Approvals** tab:
   - Select multiple checkboxes next to the `PENDING` approval items.
   - A floating **Bulk Actions Bar** will appear at the bottom.
   - Click **Approve Selected**:
     - Verify it opens a decision warning reminding the merchant that approving is a state-only action.
     - Confirm the decision. Verify the status updates to `APPROVED` in-memory.
   - Select the `APPROVED` items using checkboxes.
   - Click **Execute Selected** in the Bulk Actions Bar:
     - Verify a high-impact warning modal appears: *"You are about to commit X changes to your live Shopify store. This operation writes data directly to your storefront. Proceed?"*
     - Click "Proceed Commit".
     - Verify that a sequential progress stepper dialog overlay blocks interaction and processes each item one-by-one (`Queued` -> `Executing` -> `Applied`), showing individual spinners and checkmarks.
