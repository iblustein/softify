# Phase 10.17 — Merchant Pilot Access & Onboarding Implementation Plan

This document outlines the technical design, implementation details, and verification criteria for adding a server-side **Pilot Readiness / Pilot Access** capability to the **Softify** platform. 

This is a minimal, safe, and controlled runtime implementation to support a read-only pilot storefront validation.

---

## 1. Objectives

1. **Pilot Allowlist Guard**: Implement a robust environment-based allowlist mechanism matching `SOFTIFY_PILOT_SHOPS` to enforce pilot access restriction boundaries.
2. **Pilot Readiness Endpoint**: Construct the read-only endpoint `GET /api/pilot/readiness?shop=<shop-domain>` which validates pilot approval, connectedness, scopes posture, active agents, and product counts without leaking credentials.
3. **Clear Read-Only Messaging**: Explicitly return pilot safety headers and clear text warnings in the readiness payload to prevent any write mutations execution attempts.
4. **Integration Testing**: Add thorough regression and block assertions inside `scripts/smoke-test.mjs` verifying security isolation parameters.

---

## 2. Proposed Changes

### Component 1: Runtime Routing and Core Logic

#### [NEW] [pilot.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/pilot.routes.ts)
Create a modular Express routing file containing:
- Environment variable parser: `SOFTIFY_PILOT_SHOPS` split by comma, trimmed and normalized.
- Helper `isPilotShopApproved(shopDomain: string): boolean` matching normalized domains.
- Endpoint: `GET /api/pilot/readiness?shop=<shop-domain>` returning:
  - `shopDomain`: normalized string
  - `pilotApproved`: boolean (`true` if inside allowlist, `false` otherwise)
  - `connected`: boolean (`true` if a registered connection is found, `false` otherwise)
  - `readinessStatus`: string (`"READY"` if pilotApproved and connected, `"NOT_READY"` otherwise)
  - `canRunInsights`: boolean (`true` if `read_products` scope is present on connection, `false` otherwise)
  - `canExecuteMutations`: boolean (always `false` during this read-only pilot phase)
  - `grantedScopeSummary`: sanitized array of strings representing scopes granted to Softify (excluding secrets or tokens)
  - `productSnapshotCount`: number representing synced catalog items count
  - `visibleProductionAgentCount`: count of active production agents (non-legacy)
  - `mutationMode`: string `"read_only_blocked"`
  - `warnings`: array of strings (`"write_products missing"`, `"execution blocked"`, and `"dev bypass must not be merchant-facing"` if dev bypass is enabled)
  - `pilotMessaging`: object containing explicit safety and capability statements
  
No sensitive parameters, credentials, access tokens, or raw Shopify outputs are exposed.

#### [MODIFY] [app.ts](file:///c:/Projects/softify/softify/src/server/app.ts)
- Import `pilotRoutes` from `./routes/pilot.routes.js`.
- Mount `app.use("/api", pilotRoutes)` in the middleware chain.

### Component 2: Integration Testing

#### [MODIFY] [smoke-test.mjs](file:///c:/Projects/softify/softify/scripts/smoke-test.mjs)
Extend the existing automated smoke-testing script with a new test:
- `"Y. Controlled Merchant Pilot Access & Readiness Endpoint validation"`
- Verify that requesting an allowlisted shop (e.g. `yambasurf-co-il.myshopify.com`) returns `pilotApproved: true` and correct messaging structure.
- Verify that requesting an unallowlisted shop (e.g. `malicious-merchant.myshopify.com`) returns `pilotApproved: false` and a sanitized rejection.
- Assert that the response contains no forbidden keys (e.g. `accessToken`, `access_token`, `secret`, etc.).
- Assert that `canExecuteMutations` is strictly `false` and `mutationMode` is `"read_only_blocked"`.

---

## 3. Verification Plan

### Automated Tests
Run compilation, linting, and regression suites:
```bash
npm run lint
npm run build
npm run verify:release
npm run smoke
```

### Manual Verification
Confirm endpoint payloads locally by calling the readiness API with allowlisted and unallowlisted parameters, assessing response structure.
