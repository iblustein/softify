# Technical Walkthrough — Phase 11.0: Simplified Merchant UI & Theme Editor AI Agent MVP (Bypass Gating & Scopes Hardening)

This document details the implementation of Phase 11.0, focusing on the simplification of Softify's merchant control center around a single primary experience: the **Theme Editor AI Agent MVP**. It walks through the key architectural changes, premium UI components, backend routing integrations, strict security gates, and validation milestones.

---

## 1. Product Direction Pivot & UI Simplification

The merchant control center has been pivoted away from technical, complex multi-agent diagnostics panels toward an elegant, streamlined conversational workspace centered around theme optimization:
- **Lateral Sidebar Redesign**: Modified the main sidebar to render only two primary destinations:
  - **Your Team**: A dynamic roster showing only the enabled agents driven by `agent_installations` state (currently displaying the **Theme Editor AI Agent**). All legacy diagnostic interfaces, multi-agent workspaces, and dev views are hidden from merchant-facing views.
  - **Settings**: A centralized merchant onboarding, store connection, and AI engine status control board.
- **Dynamic "Your Team" Navigation**: Driven dynamically by fetching the persisted enabled state of the registered `theme_editor_ai_agent` installation from Firestore/in-memory repositories rather than hardcoded client layouts.

---

## 2. Premium Frontend Component Suite

We built a stunning, modern UI tailored for an elite merchant experience using curated color palettes, smooth micro-animations, and structured safety checkpoints:

### A. Theme Editor Chat Panel (`src/components/ThemeEditorChat.tsx`)
- **Conversational Core**: Features a high-fidelity chat experience displaying conversation history with animated typing indicator steppers ("Analyzing theme files...", "Simulating changes...", "Calculating risk...").
- **Theme Selection**: Renders a premium dropdown selector showing available store themes. Defaults safely to unpublished/development themes, protecting the active live storefront.
- **Side-by-Side Code Diffs**: Provides a clear visual compare view of the proposed theme edits alongside risk alert cards.
- **Live Gating & Safety Checks**: If the merchant targets the live/active theme, mutations are strictly blocked until they check the explicit safety box: *"I understand this will change my live Shopify theme and affect customers immediately."*
- **Apply Action Commit**: Merchants explicitly trigger backend updates by clicking a premium "Apply Change" button.

### B. SaaS Settings Board (`src/components/Settings.tsx`)
- **Store Onboarding & Connection**: Visualizes active OAuth store scopes status (`read_themes`, `write_themes`, etc.) via a checklist.
- **Dynamic Agent Installations**: Toggles dynamic agent status (enabled/disabled) using the generic `agent_installations` model. Updates are reflected instantly in the sidebar navigation.
- **Secure AI Engine Configuration**: Displays Gemini status as "Configured" or "Not Configured" based on environment checks, completely masking raw secrets and credentials from the browser client.

---

## 3. Backend Architecture & Core Adaptations

We adhered strictly to code reuse policies, avoiding parallel frameworks and extending existing Softify primitives:
- **Extensible Agent Registry**: Registered the Theme Editor AI Agent as `theme_editor_ai_agent` in the static catalog database, keeping other legacy catalog agents intact in code and tests.
- **Protected Theme Editing Routes**: Mounted secure tenant-isolated controllers (`src/server/routes/theme-chat.routes.ts`) under the `/api` Express namespace.
- **Safe Execution Boundary**: The Gemini AI service remains stateless and is completely insulated from live Shopify credentials. It returns edit proposals which are parsed, validated for path traversals (blocking any paths containing `..`), and backed up before being committed by a dedicated Softify backend service.
- **Durable Theme Backup Snapshots**: Prior to applying updates, the backend reads the current asset value and stores a snapshot in the Firestore `theme_backups` collection, enabling instant rollbacks.

---

## 4. Corrective Hardening Accomplishments

### A. Removed Yambasurf from Mock Theme Mode
- Modified `src/server/services/shopify-theme.service.ts` to completely remove `yambasurf-co-il` from all `isMockDomain` checks.
- If OAuth is configured, `yambasurf-co-il.myshopify.com` makes actual REST API calls directly to the Shopify Admin API rather than returning sandbox success.

### B. Enforced Agent Enabled State on Theme Editor Routes
- Enforced strict agent availability checks on all Theme Editor conversational endpoints (`GET conversations`, `POST conversations`, `GET conversation`, `POST messages`, `POST plan`, `POST apply`).
- If `theme_editor_ai_agent` is disabled for the target store connection, the controller rejects the request early with a `403 Forbidden` and `AGENT_DISABLED` code.

### C. Gated Direct Theme Write Endpoint
- Disabled the direct theme write route `POST /api/theme/assets/update` completely for merchant-facing use.
- Any attempt to reach this endpoint returns `403 Forbidden` with a `DIRECT_WRITE_DISABLED` code, enforcing that all storefront mutations must traverse the controlled, merchant-approved, backup-snapshot conversational apply flow.

### D. Configurable Gemini Model Name
- Modified `src/server/routes/theme-chat.routes.ts` to fetch the model dynamically via `process.env.GEMINI_MODEL || "gemini-1.5-flash"`.
- Wired the SaaS Settings API to display the exact configured active model name on the frontend.

---

## 5. Smoke Testing Architecture Split (Prod vs Integration)

To fix critical CI and security regressions where local environment mutations, seeded fixture connections, and insecure bypass options polluted or failed remote environments, we split our verification loops cleanly.

### A. Modes of Operation
- **`npm run smoke:integration`** (Explicit Integration Mode):
  - Boots local/in-process ephemeral Express server using local TSX.
  - Seeds all local memory database fixtures (`glowthread-apparel`, `scope-mismatch`, etc.).
  - Enforces local dev-bypass secret credentials and triggers the complete A-Z integration test suite (33 dynamic checks).
- **`npm run smoke:prod`** (Explicit Production Mode):
  - Connects to remote deployed endpoints (Google Cloud Run URL).
  - **Bypass Safety Assertion**: Test 0 checks diagnostics and explicitly fails if the remote server returns `agentDevBypassAllowed === true`. This ensures production environments never deploy with dev bypass enabled.
  - Skips all local database fixture and credentials tests, verifying only 10 non-destructive production-safe endpoints.

### B. Deliberate Theme Scopes Configuration
To support real theme editing by the Theme Editor AI Agent under least-privilege constraints, we updated the deployed production scopes inside [.github/workflows/deploy-cloud-run.yml](file:///.github/workflows/deploy-cloud-run.yml):
- Added `read_themes`
- Added `write_themes`
- strictly omitted unrelated products/variants/customers mutation scopes.

### C. Command Execution and Results
- **Integration Validation Command**: `npm run smoke:integration`
  - *Result*: All 33 checks succeed (100% PASS).
- **Production Validation Command**: `npm run smoke:prod`
  - *Result*: Fails Test 0 if bypass is unhardened, otherwise completes successfully across all 10 production-safe diagnostics and readiness paths.
- **Static Verification Command**: `npm run verify:release`
  - *Result*: All 59 static release checks pass cleanly.
