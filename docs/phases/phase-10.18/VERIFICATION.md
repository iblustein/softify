# Verification Report — Phase 10.18: Merchant Onboarding UX & Read-Only Pilot Polish

This report details the automated and manual verification results for **Phase 10.18 — Merchant Onboarding UX & Read-Only Pilot Polish**, ensuring full containment compliance and smooth visual onboarding flow.

---

## 1. Static Checks & Compiler Sweeps

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
- Vite production SPA bundle built successfully: `dist/assets/index-BZo0Mawx.js` (356.66 kB) and `dist/assets/index-D7p5SzJR.css` (61.92 kB).
- Server entry bundle compiled successfully: `dist/server.cjs` (389.7 kB).

---

## 2. Pre-Deployment Release Verification

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

## 3. Dynamic Smoke Integration Suite

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

### Verified Endpoint Shape — `/api/pilot/readiness`
GET `/api/pilot/readiness?shop=yambasurf-co-il.myshopify.com`
```json
{
  "shopDomain": "yambasurf-co-il.myshopify.com",
  "pilotApproved": true,
  "connected": true,
  "readinessStatus": "READY",
  "canRunInsights": true,
  "canExecuteMutations": false,
  "grantedScopeSummary": [
    "read_products",
    "read_orders",
    "read_customers"
  ],
  "productSnapshotCount": 0,
  "syncFreshness": null,
  "visibleProductionAgentCount": 5,
  "mutationMode": "read_only_blocked",
  "warnings": [
    "write_products missing",
    "execution blocked"
  ],
  "pilotMessaging": {
    "mode": "This pilot is read-only.",
    "approvals": "Approvals do not execute automatically.",
    "execution": "Execution is blocked unless write_products and policy allow it.",
    "disclaimer": "No Shopify product changes will be made in the current read-only pilot mode."
  },
  "hasReadProducts": true,
  "hasWriteProducts": false,
  "catalogSyncRequired": true,
  "agentReadiness": "NOT_READY"
}
```
*Note: All theme scopes (`read_themes`, `write_themes`) are strictly stripped from response payloads and rendered elements.*

---

## 4. UI Truth Auditing & Visual Verification

### Guided Onboarding Checklist
- Mounted a visual multi-step progress widget at the top of the **Store Dashboard**.
- Displays completed states dynamically based on backend connection status and active product sync counts.
- Communicates "Safe Read-Only Mode Gating" so merchants understand storefront safety.

### Empty States & Technical Jargon Audit
- **Analytics empty state** explicitly informs that store metrics are decoupled, prioritizing read-only pilot data integrity.
- **Diagnostics to Product Analysis**: Removed all technical labels ("Diagnostic Scan", "Agent Workers", "Claim Lock", "Mutations") and replaced them with user-focused labels ("Product Analysis", "Suggested Changes", "Save Changes").

### Trust & Safety Overview Panel
- Placed a prominent **"What Softify can and cannot do"** panel at the bottom of the dashboard, clearly summarizing scope limits to build high merchant trust.

### Recommendation Cards Refinements
- Replaced the visual JSON diff markers with clear comparative cards ("Suggested change", "Why this matters", "Affected field", "Current value", "Suggested value", "Approve Choice", "Dismiss Choice").
