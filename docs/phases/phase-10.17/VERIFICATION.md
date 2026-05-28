# Phase 10.17 — Merchant Pilot Access & Onboarding Verification Report

This document records the automated and manual verification results for the **Pilot Access / Pilot Readiness** endpoint implementation under Phase 10.17.

---

## 1. Automated Lint and Compilation Checks

All static compiler assertions and type-checking checks were run and resolved successfully.

### Command Executed:
```powershell
npm run lint
```

### Result:
```
> react-example@0.0.0 lint
> tsc --noEmit

✓ PASS (TypeScript compilation matches clean type definitions)
```

---

## 2. Production Bundler and Compiler Builds

The complete storefront build via Vite and back-end integration assembly via esbuild succeeded without errors.

### Command Executed:
```powershell
npm run build
```

### Result:
```
> react-example@0.0.0 build
> vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs

vite v6.4.2 building for production...
transforming...
✓ 1680 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.41 kB │ gzip:  0.28 kB
dist/assets/index-DcDRKvBt.css   61.52 kB │ gzip: 10.53 kB
dist/assets/index-BPYJ2NmB.js   347.44 kB │ gzip: 93.94 kB
✓ built in 3.52s

  dist\server.cjs      388.8kb
  dist\server.cjs.map  706.7kb

Done in 23ms
```

---

## 3. Pre-Deployment Release Verification

The static pre-deployment gatekeeper verification script executed and verified all 58 safety rules and module import postures.

### Command Executed:
```powershell
npm run verify:release
```

### Result Summary:
```
=== RELEASE VERIFICATION SUMMARY ===
...
 ✓ 51. Dynamic tenant context resolution static assertions on routes: PASS
 ✓ 52. Frontend shop context persistence and URL cleanup regression validation: PASS
 ✓ 53. Phase 10.9 Multi-Agent Product Workspace static validation and guardrails: PASS
 ✓ 54. Phase 10.10 Multi-Agent Workspace Analytics & Operational Visibility static validation: PASS
 ✓ 55. Phase 10.11 MVP End-to-End Merchant Workflow Hardening static validation: PASS
 ✓ 56. Phase 10.12 Production Bulk Operations Foundation static validation: PASS
 ✓ 57. Phase 10.13 Real-Store Product Readiness static validation: PASS
 ✓ 58. Phase 10.14 Initial Agent Set & Merchant Workflows static validation: PASS

Results: 58 passed, 0 failed, total 58

RELEASE VERIFICATION PASSED SUCCESSFULLY!
```

---

## 4. Dynamic Integration Smoke Tests

We verified our new pilot readiness endpoint dynamically using the local in-process memory database environment with the test suite.

### Command Executed:
```powershell
$env:SOFTIFY_BASE_URL="http://localhost:3000"; npm run smoke
```

### Verification Logs (Test Y):
```
Running: Y. Controlled Merchant Pilot Access & Readiness Endpoint validation...
   [TEST Y] Dynamic allowlist validation, readiness mapping, safety disclaimers, and scope scans passed successfully.
✓ PASS

=== SMOKE TEST SUMMARY ===
...
 ✓ W. Phase 10.13 Real-Store Product Readiness integration check: PASS
 ✓ X. Phase 10.14 Initial Agent Set & Merchant Workflows integration check: PASS
 ✓ Y. Controlled Merchant Pilot Access & Readiness Endpoint validation: PASS

Results: 32 passed, 0 failed, total 32

SMOKE TEST COMPLETED SUCCESSFULLY!
```

---

## 5. Security & Gatekeeper Review Metrics

1. **Token Security Check**: Both the endpoint resolver and the smoke validation scans strictly asset that no tokens or secrets propagate inside the JSON payloads.
2. **Theme Containment Check**: Actively filtered out any theme scopes (`read_themes` and `write_themes`) from the readiness responses to ensure zero theme scope exposure.
3. **Execution Blockage Check**: Explicitly returned `canExecuteMutations: false` and `mutationMode: "read_only_blocked"` for all pilot shops.
4. **Dev Bypass Alert Check**: Dynamically appended the warning `"dev bypass must not be merchant-facing"` if `SOFTIFY_ALLOW_AGENT_DEV_BYPASS` is active.
