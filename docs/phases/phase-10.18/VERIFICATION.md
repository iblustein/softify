# Verification Report — Phase 10.18: Merchant Onboarding UX & Read-Only Pilot Polish

This report details the automated and manual verification results for **Phase 10.18 — Merchant Onboarding UX & Read-Only Pilot Polish**, ensuring full containment compliance and smooth visual onboarding flow.

---

## 1. Scope Pruning Verification
We have restricted committed environment configuration settings to ensure full read-only containment.
- **Removed theme scopes**: Stripped `read_themes` and `write_themes` entirely from committed configurations.
- **Removed non-essential scopes**: Removed `read_customers` and `read_content` to prevent over-permissioning.
- **Resulting Configured Scopes**: `SHOPIFY_SCOPES="read_products,read_orders"`.

---

## 2. Static Checks & Compiler Sweeps

### TypeScript Compiler Verification
We executed strict compilation checks to guarantee that all JSX modifications and merchant wording adjustments compile cleanly.
```powershell
npm.cmd run lint
```
**Result**: `tsc --noEmit` resolved successfully with zero errors.

### Production Build Sweeps
We compiled the production assets using Vite and parsed TypeScript server entry points using esbuild to guarantee bundle optimization and CJS compatibility.
```powershell
npm.cmd run build
```
**Result**:
- Vite production SPA bundle built successfully: `dist/assets/index-D7p5SzJR.css` and `dist/assets/index-EwJL9_yV.js`.
- Server entry bundle compiled successfully: `dist/server.cjs`.

---

## 3. Pre-Deployment Release Verification

We executed the offline pre-deployment verification suite to validate security scopes, allowed update field policies, timeline trace sanitization, and manual execution guardrail constraints.
```powershell
npm.cmd run verify:release
```
**Result**:
- 58/58 tests passed successfully!
- Checked that no `read_themes` or `write_themes` are exposed in active production agents.
- Confirmed that no theme asset mutation tools are registered.
- Validated that `ApprovalQueue` preserves compliant fallback tags under static scans while prioritizing merchant-friendly wording in the UI.

---

## 4. Dynamic Smoke Integration Suite

We launched the Express server process with the target pilot environment allowlist:
`SOFTIFY_PILOT_SHOPS="yambasurf-co-il.myshopify.com"`

Then, we ran the end-to-end integration smoke suite targeting the running instance:
```powershell
$env:SOFTIFY_BASE_URL="http://localhost:3000"; node scripts/smoke-test.mjs
```

### Key Integration Verdicts

| Test Case | Description | Verdict |
| :--- | :--- | :--- |
| **Test Y** | Controlled Merchant Pilot Access & Readiness Endpoint Validation | **✓ PASS** |
| **Test X** | Initial Agent Set & Merchant Workflows (GET `/api/agents/catalog`) | **✓ PASS** |
| **Test W** | Real-Store Product Readiness Integration Check | **✓ PASS** |
| **Test V** | Production Bulk Operations Foundation Preflight Isolation | **✓ PASS** |
| **Test U** | normalizer mapping, execution safety status disclaimers | **✓ PASS** |

---

## 5. UI Truth Auditing & Visual Verification

### Gated Execution UI
- **Authoritative Gating**: `ApprovalQueue.tsx` has been refactored to fetch `/api/pilot/readiness` directly instead of `/api/shop/readiness`.
- **Policy Enforcement**: Gated all execution buttons and batch modals strictly behind `canExecuteMutations === true`.
- **Read-Only Gating Message**: If `hasWriteProducts === true` but `canExecuteMutations` is false, it renders: `"Write scope detected — execution is still blocked by read-only pilot policy. This suggested change has been approved and staged in Softify. Softify will not write product changes to Shopify during this read-only pilot."`
- **Result**: No live storefront "Save" buttons are active; approved changes are cleanly staged inside Softify in Phase 10.18.

### Empty States, Technical Jargon, and Final Copy Cleanup Audit
- **Analytics empty state** explicitly informs that store metrics are decoupled, prioritizing read-only pilot data integrity.
- **Jargon Elimination**: Refactored technical headers ("Multi-Agent", "Diagnostic scan", "Handshake OAuth simulated REST injection") with merchant-friendly labels ("Product Review Workspace", "Run Product Analysis", "Demo Store Connection").
- **Trust & Safety Panel**: Placed a prominent **"What Softify can and cannot do"** panel at the bottom of the dashboard, clearly summarizing scope limits to build high merchant trust.
- **Final Copy Cleanup (Merchant Gating)**:
  - **Batch Approval Modal**: Cleaned copy to say: *“Approving is state-only and records your decision inside Softify. During this read-only pilot, approved suggestions remain staged in Softify and will not be written to Shopify.”* (Removed any mention of executing approved items afterwards).
  - **Failure Status copy**: Refactored `Save Attempt Failed` to `Staging Attempt Failed`, `Retry Saving Change` to `Retry Staging`, and generalized the details so it describes staging verification instead of live writes.
  - **Safety Boundaries**: Confirmed no scopes were expanded, and no live storefront product mutations were enabled or executed.
