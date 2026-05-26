# Verification Plan — Phase 10.11

This document provides instructions on how to verify that the Phase 10.11 hardening, explicit execution flow, and security boundaries are fully operational.

---

## 1. Automated Pre-Deployment Release Checks

Run the static analysis check suite to assert documentation compliance, absence of batch mutations, and allowlist sanitization.

### Command
```bash
node scripts/release-check.mjs
```

### Expected Output
```bash
Verifying: 55. Phase 10.11 MVP End-to-End Merchant Workflow Hardening static validation...
✓ PASS

=== RELEASE VERIFICATION SUMMARY ===
 ...
 ✓ 53. Phase 10.9 Multi-Agent Product Workspace static validation and guardrails: PASS
 ✓ 54. Phase 10.10 Multi-Agent Workspace Analytics & Operational Visibility static validation: PASS
 ✓ 55. Phase 10.11 MVP End-to-End Merchant Workflow Hardening static validation: PASS

Results: 55 passed, 0 failed, total 55
RELEASE VERIFICATION PASSED SUCCESSFULLY!
```

---

## 2. Automated End-to-End Smoke Tests

Start the server locally in production mode and run the smoke tests to verify the manual loop, explicit execution gating, and tenant context isolation.

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
set SOFTIFY_AGENT_DEV_BYPASS_SECRET=dev-bypass-secret
node scripts/smoke-test.mjs
```

### Expected Output
```bash
=== SOFTIFY SAAS RELEASE SMOKE TEST SUITE ===
...
Running: O. Merchant Approvals & Mutation Tools Foundation validation...
   [APPROVAL TESTS] Successfully intercepted proposal tool catalog.products.propose_update, validated sanitized containment shapes, verified zero mutation execution, and confirmed deferred execution approvals.
✓ PASS

Running: P. Safe Approved Product Mutation Execution validation...
   [EXECUTION TESTS] Verified successful execution, tenant rejections, claim locks, and audit events.
   [EXECUTION TESTS] Verified local scope-mismatch rejections and safe APPROVED preservation.
✓ PASS

Running: Q. Approval Execution Operations & Recovery validation...
   [RECOVERY TESTS] Successfully verified status filters, details/audit tenant scoping, performer constraints, timeout recoveries, and state reset bounds.
✓ PASS

Results: 27 passed, 0 failed, total 27
SMOKE TEST COMPLETED SUCCESSFULLY!
```

---

## 3. Manual Merchant Workflows Verification

For visual auditing and pilot demos:
1. Navigate to the **Agent Workspace** tab.
2. Verify that:
   - The **Sandboxed Environment** safety banner is present.
   - Descriptive onboarding empty cards appear for Recommendations and Proposed Actions if empty.
3. Select the **Product Intelligence Agent** and click **Launch Diagnostic Scan**:
   - Verify a backdrop-blur loading spinner overlay blocks controls while active.
   - Verify console logs are cleared.
4. Once scan completes, review:
   - High-contrast impact badging on recommendations.
   - Side-by-side Before/After grid cards for proposed changes (ensure **no** raw JSON is exposed!).
5. Click **Request Merchant Approval** on a proposed draft:
   - Verify a spinner appears inside the CTA while bridging the handshake.
6. Navigate to the **Write Approvals** tab:
   - Select the pending request. Click **Authorize Proposed Payload**:
     - Verify it is moved to the decided history log and marked as `APPROVED`.
     - Confirm **no** Shopify mutation is executed yet.
   - Select the `APPROVED` request from history:
     - Verify a yellow authorized notice is present.
     - Click **Execute Commit to Shopify**:
       - Verify the status shifts to `EXECUTING` with an active spinner and claims lock notice.
       - Verify completion switches to `APPLIED` with green success details.
7. Return to the **Agent Workspace / Analytics** tab:
   - Verify stats, trends, distributions, and the chronological timeline trace are dynamically synchronized with the committed event!
