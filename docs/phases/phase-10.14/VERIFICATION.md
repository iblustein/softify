# Verification Logs — Phase 10.14: Initial Agent Set & Merchant Workflows (Corrective Hardening Pass)

This document records the automated verification logs validating the initial agent set catalog, dynamic gating, per-agent allowed field schemas, and merchant workflows. All static validation assertions and dynamic integration smoke tests have passed successfully.

---

## 1. Static Release Verification (Test 58)

We executed the full static suite via `node scripts/release-check.mjs` containing the **Test 58** static guardrails checks, now including strict checks asserting the route files AND `src/server/index.ts` do not contain test fixture strings or simulate endpoints:

```
Verifying: 58. Phase 10.14 Initial Agent Set & Merchant Workflows static validation...
✓ PASS

=== RELEASE VERIFICATION SUMMARY ===
 ...
 ✓ 56. Phase 10.12 Production Bulk Operations Foundation static validation: PASS
 ✓ 57. Phase 10.13 Real-Store Product Readiness static validation: PASS
 ✓ 58. Phase 10.14 Initial Agent Set & Merchant Workflows static validation: PASS

Results: 58 passed, 0 failed, total 58

RELEASE VERIFICATION PASSED SUCCESSFULLY!
```

---

## 2. Dynamic Integration Smoke Test (Test X & Ephemeral In-Process Server)

We executed the full dynamic integration suite using the development server bypass token, dynamically starting an in-process local server on an ephemeral port (`app.listen(0)`) to isolate memory databases during verification:

```
=== SOFTIFY SAAS RELEASE SMOKE TEST SUITE ===
Target base URL : http://localhost:3000
Target test shop: yambasurf-co-il.myshopify.com
Default limit   : 5

Running: 0. Pre-smoke runtime diagnostics check...
   [DIAGNOSTICS] shopifyOAuthConfigured         : true
   [DIAGNOSTICS] repositoryBackend              : memory
   [DIAGNOSTICS] firestoreDatabaseConfigured    : false
   [DIAGNOSTICS] agentDevBypassAllowed          : true
   [DIAGNOSTICS] agentDevBypassSecretConfigured : true
✓ PASS

   [SMOKE-TEST] Diagnosed local in-memory backend. Initializing in-process local server on ephemeral port...
   [SMOKE-TEST] Ephemeral local server listening at http://127.0.0.1:58356
   [SMOKE-TEST] Seeded in-process memory database successfully with invalid proposed actions and mock connections.
Running: A. OAuth Status endpoint validation...
✓ PASS

Running: B. Admin Shop Read endpoint validation...
✓ PASS

...

Running: X. Phase 10.14 Initial Agent Set & Merchant Workflows integration check...
   [TEST X Hardening] Successfully verified legacy agent runs are blocked with 403.
   [TEST X Hardening] Successfully verified invalid SEO proposed action fails bridge.
   [TEST X Hardening] Successfully verified invalid Cleanup proposed action fails bridge.
   [TEST X Hardening] Successfully verified read-only agent proposed action fails bridge.
   [TEST X Hardening] Successfully verified Tool Gateway rejects forbidden fields dynamically.
   [TEST X] Successfully verified dynamic GET /api/agents/catalog exclusions, per-agent allowed field schemas, read-only agent mutation immunity, and strict tenant security isolation.
✓ PASS

=== SMOKE TEST SUMMARY ===
 ...
 ✓ W. Phase 10.13 Real-Store Product Readiness integration check: PASS
 ✓ X. Phase 10.14 Initial Agent Set & Merchant Workflows integration check: PASS

Results: 31 passed, 0 failed, total 31

SMOKE TEST COMPLETED SUCCESSFULLY!

   [SMOKE-TEST] Ephemeral in-process local server shutdown completed.
```

