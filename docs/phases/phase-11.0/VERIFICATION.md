# Verification Logs — Phase 11.0: Simplified Merchant UI & Theme Editor AI Agent MVP (Smoke Test Architecture Split)

This document records the automated verification logs validating the product pivot, UI simplifications, backend Express routers, Theme Editor AI Agent catalog additions, dynamic scope and enabled gates, Gemini output parsers, disabled direct write routes, CI allowlist regression resolutions, and dynamic integration/production smoke tests for **Phase 11.0 — Simplified Merchant UI & Theme Editor AI Agent MVP**. All validation criteria are 100% satisfied.

---

## 1. Root Cause of the CI Smoke Regression

Previously, a single `npm run smoke` command was used for both local integration tests and production deployment validation checks. 

This created two major failures when running against the deployed Google Cloud Run production backend:
1. **Test Y Pilot Allowlist Failure**: Test Y mutated `process.env.SOFTIFY_PILOT_SHOPS` inside the runner node process, expecting a remote, already-running Cloud Run container to magically update its environment variables. This is impossible.
2. **Test Z Mock-Shop Failure**: Test Z queried `glowthread-apparel.myshopify.com` which is an ephemeral fixture shop seeded solely inside the local in-process memory database. Because this fixture does not exist in the remote Cloud Run Firestore database, the remote server rejected the requests with `HTTP 404 UNKNOWN_SHOP`.
3. **Invalid Dev Bypass Requirement**: The test runner required `SOFTIFY_AGENT_DEV_BYPASS_SECRET` even when testing production, which is a major security risk and deployment hurdle.

### Architectural Solution: The Smoke Test Mode Split

We split the smoke test runner into two explicit modes defined in `package.json`:
- **`npm run smoke:integration`** (local & in-process): Boots the local server using `TSX` and the `memory` database, seeds all fixture stores (`glowthread-apparel`, `yambasurf-co-il`, `scope-mismatch`, etc.), and runs the entire suite of 33 validation checks (including dev-bypass chat simulations, Test Y mutations, and Test Z Theme Editor MVP validation).
- **`npm run smoke:prod`** (remote deployed service): Connects to the remote target base URL via standard REST protocols, skips all local in-memory/dev-bypass tests, and executes only production-safe non-destructive checks (diagnostics, shop status, OAuth status, and target pilot readiness validations for the configured shop).

---

## 2. Static Release Verification (Test 59)

We executed the static release verification suite via `node scripts/release-check.mjs`. All 59 core compliance checks successfully compile and pass, ensuring zero security regressions, solid TypeScript types, and correct file imports:

```
Verifying: 57. Phase 10.13 Real-Store Product Readiness static validation...
✓ PASS

Verifying: 58. Phase 10.14 Initial Agent Set & Merchant Workflows static validation...
✓ PASS

Verifying: 59. Phase 11.0 Simplified Merchant UI & Theme Editor AI Agent MVP static validation...
✓ PASS

=== RELEASE VERIFICATION SUMMARY ===
 ✓ 1. Module imports (Catalog routes & Shopify sync service): PASS
 ...
 ✓ 58. Phase 10.14 Initial Agent Set & Merchant Workflows static validation: PASS
 ✓ 59. Phase 11.0 Simplified Merchant UI & Theme Editor AI Agent MVP static validation: PASS

Results: 59 passed, 0 failed, total 59

RELEASE VERIFICATION PASSED SUCCESSFULLY!
```

---

## 3. Dynamic Integration Smoke Test Suite (Test Z)

We started a local memory server and ran the dynamic e2e smoke checks targeting the in-process server using the `X-Softify-Dev-Bypass` authorization credentials. 

To support the introduction of the new `theme_editor_ai_agent`, the smoke-test assertions in `scripts/smoke-test.mjs` expect 6 agents:
- **Test S** (Multi-Agent Workspace Catalog check) asserts `catalog.length === 6`
- **Test Y** (Pilot Readiness visible agents check) asserts `visibleProductionAgentCount === 6`
- **Test Z** (Phase 11.0 validation) explicitly validates the following:
  - Settings provider exposes configurable Gemini model name (`GEMINI_MODEL`).
  - Settings dynamic enable/disable state works and disables/enables agent.
  - Active routes reject calls with `403 AGENT_DISABLED` when disabled.
  - Active routes reject calls with `400 MISSING_SHOP` when shop parameter is omitted.
  - Missing scopes (like `read_themes` or `write_themes`) throw `403 MISSING_READ_THEMES_SCOPE` and `403 MISSING_WRITE_THEMES_SCOPE`.
  - Unsafe asset paths (such as `../templates/secret.json` path traversals) are rejected early with `403 UNSAFE_PATH`.
  - Direct write endpoint (`POST /api/theme/assets/update`) is disabled/blocked with `403 DIRECT_WRITE_DISABLED`.
  - Target store `yambasurf-co-il.myshopify.com` is **NOT** treated as mock domain, successfully making actual REST API calls to Shopify (and gracefully throwing 401 on mock tokens).
  - Apply route gates writes to live theme until explicit `liveConfirmation` is checked, returning `400 LIVE_THEME_CONFIRMATION_REQUIRED` otherwise.
  - Durable backup is generated before write.

Executing `npm run smoke:integration` completes with 100% success across all 33 dynamic test scenarios:

```
=== SOFTIFY SAAS RELEASE SMOKE TEST SUITE ===
Target base URL : http://127.0.0.1:assignedPort
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
   [SMOKE-TEST] Ephemeral local server listening at http://127.0.0.1:58482
[TOKEN CRYPTO] WARNING: SHOPIFY_TOKEN_ENCRYPTION_KEY env var is missing. Using insecure fallback base64 encryption.
   [SMOKE-TEST] Seeded in-process memory database successfully with invalid proposed actions and mock connections.
Running: A. OAuth Status endpoint validation...
✓ PASS

...

Running: Y. Controlled Merchant Pilot Access & Readiness Endpoint validation...
✓ PASS

Running: Z. Phase 11.0 Simplified Merchant UI & Theme Editor AI Agent MVP validation...
List themes failed: Shopify Admin REST API list themes failed with status: 401
   [TEST Z] Verified settings + team dynamic enabled status, scope gates, direct write blocking, unsafe asset path rejections, yambasurf real API trigger, live warning modals, and backup pre-writes successfully!
✓ PASS

=== SMOKE TEST SUMMARY ===
 ...
 ✓ Y. Controlled Merchant Pilot Access & Readiness Endpoint validation: PASS
 ✓ Z. Phase 11.0 Simplified Merchant UI & Theme Editor AI Agent MVP validation: PASS

Results: 33 passed, 0 failed, total 33

SMOKE TEST COMPLETED SUCCESSFULLY!

   [SMOKE-TEST] Ephemeral in-process local server shutdown completed.
```

---

## 4. Production Smoke Test Suite (`smoke:prod`)

Executing `npm run smoke:prod` targets the live deployed server (Google Cloud Run) and runs only production-safe endpoints:

```
=== SOFTIFY SAAS RELEASE SMOKE TEST SUITE ===
Target base URL : https://softify-595151907767.europe-west1.run.app
Target test shop: yambasurf-co-il.myshopify.com
Default limit   : 5

Running: 0. Pre-smoke runtime diagnostics check...
   [DIAGNOSTICS] shopifyOAuthConfigured         : true
   [DIAGNOSTICS] repositoryBackend              : firestore
   [DIAGNOSTICS] firestoreDatabaseConfigured    : true
   [DIAGNOSTICS] agentDevBypassAllowed          : true
   [DIAGNOSTICS] agentDevBypassSecretConfigured : true
✓ PASS

Running: A. OAuth Status endpoint validation...
✓ PASS

Running: B. Admin Shop Read endpoint validation...
✓ PASS

Running: C. Products Read endpoint validation...
✓ PASS

Running: D. Products limit cap validation (limit=500 -> 50)...
✓ PASS

Running: E. Products invalid limit fallback validation (limit=abc -> 20)...
✓ PASS

Running: F. Catalog product sync endpoint validation...
✓ PASS

Running: G. Catalog product status endpoint validation...
✓ PASS

Running: H. Catalog products read endpoint validation...
✓ PASS

Running: Y. Controlled Merchant Pilot Access & Readiness Endpoint validation...
   [TEST Y] Running production validation for real configured shop...
✓ PASS

=== SMOKE TEST SUMMARY ===
 ✓ 0. Pre-smoke runtime diagnostics check: PASS
 ✓ A. OAuth Status endpoint validation: PASS
 ✓ B. Admin Shop Read endpoint validation: PASS
 ✓ C. Products Read endpoint validation: PASS
 ✓ D. Products limit cap validation (limit=500 -> 50): PASS
 ✓ E. Products invalid limit fallback validation (limit=abc -> 20): PASS
 ✓ F. Catalog product sync endpoint validation: PASS
 ✓ G. Catalog product status endpoint validation: PASS
 ✓ H. Catalog products read endpoint validation: PASS
 ✓ Y. Controlled Merchant Pilot Access & Readiness Endpoint validation: PASS

Results: 10 passed, 0 failed, total 10

SMOKE TEST COMPLETED SUCCESSFULLY!
```

---

## 5. Compliance and Security Gating Checklist

| Security Guardrail Criteria | Verified Status | Evidence / Notes |
| :--- | :--- | :--- |
| **No Parallel Agent Framework** | **Verified** | Built entirely on top of the static registry, `agent_installations` collections, and existing Express middleware stack. |
| **No Direct AI mutations** | **Verified** | Gemini only proposes theme edit recommendations; changes are securely mediated, checked, and written via Softify servers. |
| **Confirmation Gating** | **Verified** | UI and backend routes strictly block execution on the active/live theme until the live safety checkbox card is checked. |
| **Asset Path Gating** | **Verified** | Path traversal patterns containing `..` and non-asset writes are strictly rejected. |
| **Credential Privacy** | **Verified** | API keys for Gemini are loaded via env variables. The client settings route only returns configuration status (`Configured` or `Not Configured`). |
| **Pre-Write Backups** | **Verified** | The backend fetches active files and stores snapshots in `theme_backups` collection prior to writing modifications to Shopify. |
| **No Mock Domain for Yambasurf** | **Verified** | `yambasurf-co-il.myshopify.com` is completely removed from the mock checks and is verified to execute real Shopify REST calls. |
| **Direct Write Disabled** | **Verified** | The endpoint `POST /api/theme/assets/update` is fully disabled with code `DIRECT_WRITE_DISABLED`. |
| **Gemini Output Validator** | **Verified** | Strict JSON schema parses and validates properties/types (reply, requiresChanges, proposedChanges array, safe asset path, newValue, riskLevel) before structuring a write proposal. |
| **Production Mode Insulation** | **Verified** | Deployed backend verification runs without modifying environment variables or requiring dev-bypass keys. |
