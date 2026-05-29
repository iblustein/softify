# Security Review & Trust Model — Phase 11.0: Theme Editor AI Agent MVP (Corrective Hardening Pass)

This document details the security reviews, safe execution bounds, threat models, trust boundaries, and scope constraints implemented in **Phase 11.0 — Simplified Merchant UI & Theme Editor AI Agent MVP**. It guarantees that shop assets are edited safely and malicious injections or traversal attempts are blocked.

---

## 1. Overview of the Safe Execution Boundary

Direct theme writing poses significant risks to online stores. A bad write could crash the storefront, disrupt the shopping experience, or introduce XSS vulnerabilities. To mitigate these risks, Softify enforces a **Strict Safe Execution Boundary**:

```
[ Shopify Merchant UI ]
         │
         ▼ (Triggers explicitly approved updates only)
[ Softify Backend Server ]  ◄─── (Stateless Plan Proposals) ───►  [ Gemini AI Engine ]
         │
         ├─► [ Step A ] Validates Shopify OAuth scopes (read_themes, write_themes)
         ├─► [ Step B ] Checks Asset Key for Path Traversal (no '..', system files)
         ├─► [ Step C ] Takes a pre-write database snapshot (stored in theme_backups)
         │
         ▼ (Dispatches final sanitized request with OAuth credentials)
[ Shopify Admin GraphQL/REST API ]
```

---

## 2. Hardened Guardrail Implementations

### A. Non-Leaking AI Provider System
- **Stateless AI Execution**: The Gemini AI engine does not have access to Shopify store tokens, databases, or execution endpoints. It acts strictly as a stateless text generator that is given file schemas and responds with recommended updates.
- **Secure Key Injection**: The backend retrieves the Gemini API key from the `GEMINI_API_KEY` environment variable. 
- **Zero Client exposure**: Under no circumstances is the Gemini API key exposed in the frontend or returned in client settings JSON responses. The Settings API only returns configuration state (`Configured` / `Not Configured`).

### B. Input Path Gating & Sanitization
- **Strict Asset Allowlist**: Files can only be written to standard Shopify theme subdirectories:
  - `layout/`
  - `templates/`
  - `sections/`
  - `snippets/`
  - `assets/`
  - `config/`
- **Path Traversal Gating**: Incoming asset keys are sanitized and inspected via `validateAssetPath`. Any key containing path traversal components (e.g. `..`, `%2e%2e`, `/etc/passwd`, hidden `.env` files) is immediately rejected with a `403 Forbidden` and `UNSAFE_PATH` code before calling Shopify.

### C. Gemini Output Schema & Type Validation
- **Strict Parser Protection**: Implemented a JSON schema validator directly after fetching the Gemini response.
- **Properties check**: Ensures `reply` is a string, and `requiresChanges` is a boolean.
- **Proposed Changes array check**: If `requiresChanges` is true, it strictly asserts that `proposedChanges` is a non-empty array, `proposedChanges[0].assetKey` passes `validateAssetPath`, `proposedChanges[0].newValue` is a non-empty string, and `riskLevel` matches standard categories (defaults to `Medium`).
- **Fail-Safe Fallback**: If parsing or validation checks fail, the backend does **not** create a write proposal and instead saves a friendly explanation message.

### D. Durable Snapshot Pre-Write Backups
- **Restorable Backups**: Before writing a modified file to Shopify:
  1. The Softify backend pulls the existing file contents from Shopify.
  2. If the file already exists, it is saved as a snapshot record in the Firestore `theme_backups` collection, keyed by `shopDomain`, `themeId`, and `assetKey`.
  3. This ensures that even if an AI-proposed write causes errors, the merchant has a path to instantly restore the original file.
- **Audit Logging**: Every theme write operation is logged in the `agent_audit_logs` collections with timestamp, operator ID, and a checksum of the changes.

### E. Multi-Tier Consent Gating
- **No Direct AI Mutations**: The AI can never modify a theme autonomously. All changes are queued as proposals in the UI.
- **Double-Gated Live Theme Writes**: If the selected theme is the active live theme (impacts live customers), the frontend disables the "Apply Change" action until the merchant explicitly checks the live warning gate.
- **Disabled Direct Write Path**: The endpoint `POST /api/theme/assets/update` is completely disabled for merchant-facing use, returning a `403 DIRECT_WRITE_DISABLED` error. All theme edits must traverse the merchant-approved, double-gated Apply conversational loop.

### F. Insulated Production Smoke Testing (No Dev Bypass / Process Mutations)
- **Zero Deployed Dev-Bypass Reliance**: Deployed production verification (`smoke:prod`) is strictly separated from local integration testing. It does not require or allow `SOFTIFY_AGENT_DEV_BYPASS_SECRET` to be configured on the client runner, nor does it attempt to perform in-process mutations of environment variables such as `SOFTIFY_PILOT_SHOPS` against already-running remote environments.
- **Strict Production Bypass Gating**: In production mode (`smoke:prod`), the diagnostics check explicitly asserts that the server does **not** allow developer bypasses. If the remote server returns `agentDevBypassAllowed === true`, the test immediately fails, protecting the production ecosystem from accidental security exposure.
- **Fixture Insulation**: Production smoke testing skips all test assertions requiring database fixtures (`glowthread-apparel`, `scope-mismatch`, etc.) that are only present in local ephemeral in-memory databases, ensuring that live telemetry and production Firestore remain completely pristine and unpolluted.

---

## 3. Scope Gating Rules

Theme editing utilizes the minimum possible Shopify scopes:
- **Authorized Scopes**: `read_themes` and `write_themes` are strictly configured for the Shopify App. Preflight checks in conversational routes explicitly validate `read_themes` for listing/reading/planning (returns `403 MISSING_READ_THEMES_SCOPE`) and `write_themes` for applying changes (returns `403 MISSING_WRITE_THEMES_SCOPE`).
- **Forbidden Mutations**: Price updates, customer queries, inventory edits, bulk product mutations, and payment gateway overrides remain completely unauthorized and blocked.
