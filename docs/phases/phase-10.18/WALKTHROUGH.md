# Walkthrough — Phase 10.18: Merchant Onboarding UX & Read-Only Pilot Polish

This document provides a comprehensive walkthrough of the changes implemented during **Phase 10.18 — Merchant Onboarding UX & Read-Only Pilot Polish** to resolve the readiness allowlist regression and polish the read-only pilot merchant experience.

---

## 1. Test Y Allowlist Regression Resolution

### Root Cause
The readiness endpoint `/api/pilot/readiness` reads `process.env.SOFTIFY_PILOT_SHOPS` to determine if a connected shop domain is allowed to access the merchant pilot. When the server process was started locally or in separately running processes, this variable was not loaded in its starting environment context, causing Test Y to return `pilotApproved: false`.

### The Fix
1. **Local-only `.env` Isolation**: Configured the git-ignored, local-only `.env` file with:
   `SOFTIFY_PILOT_SHOPS=yambasurf-co-il.myshopify.com`
   to ensure the Node process automatically loads it via `dotenv` upon startup.
2. **Environment Template (`.env.example`)**: Added the template placeholder:
   `SOFTIFY_PILOT_SHOPS="yambasurf-co-il.myshopify.com"`
3. **Cloud Run Config (`cloudrun-firestore.env.yaml`)**: Declared the production pilot allowlist:
   `SOFTIFY_PILOT_SHOPS: "yambasurf-co-il.myshopify.com"`
   to persist the correct environment configuration on deploy.
4. **Result**: Re-running the smoke integration test with the server loaded correctly results in **Test Y passing perfectly** (32/32 smoke tests passed!).

---

## 2. Jargon Elimination & Copy Polish

To shield Shopify merchants from technical developer jargon, we performed a thorough visual copy sweep:

- **Avoided / Reduced**: `"Agent workers"`, `"Diagnostic Scan"`, `"Tool Gateway"`, `"Super Agent Chat"`, `"Prototype DB"`, `"Gemini Managed Agents Paradigm"`, `"Runtime"`, `"Mutation"`, `"Full metadata logging"`, `"Sandboxed environment"`.
- **Preferred / Integrated**: `"Product Review Workspace"`, `"Analyze Products"`, `"Analysis Run"`, `"Suggested Changes"`, `"Changes Awaiting Approval"`, `"Synced Products"`, `"Last Sync"`, `"Safe Read-Only Mode"`, `"Product changes"`.

---

## 3. Key UX Enhancements & Components Audited

### A. Guided Onboarding Checklist
- Mounted a beautiful **Merchant Guided Onboarding Checklist** panel at the top of `DashboardOverview.tsx`.
- Leads the merchant step-by-step through:
  - **Step 1: Connect Store** (Connection state audit)
  - **Step 2: Sync Catalog** (Read-only catalog sync action)
  - **Step 3: Analyze & Review** (Workspace insights scan gating)
- Communicates "Safe Read-Only Mode Gating" parameters directly.

### B. Trust & Safety Panel
- Added a dedicated **"What Softify can and cannot do"** visual card in `DashboardOverview.tsx`.
- Explicitly lists permitted actions (e.g. read catalog metadata, sync secure snapshots, suggest metadata improvements) and blocked actions (e.g. direct storefront writes, price modifications, variant edits, theme changes) to instill immediate merchant confidence.

### C. Improved Empty States
- Refined empty states in `DashboardOverview.tsx` and `AgentWorkspace.tsx` to provide clear guidance:
  - **No synced products**: Prominently displays a "Sync Catalog Now" trigger.
  - **No suggested changes**: Encourages the user to start a "Product Analysis".
  - **Decoupled Analytics**: Displays a trust-centric empty card clarifying that live storefront sales metrics are decoupled under the read-only pilot.

### D. Recommendation Card Refinements
- Rebranded proposed change justification cards in `ApprovalQueue.tsx`:
  - Clearly displays fields: `"Suggested change"`, `"Why this matters"`, `"Affected field"`, `"Risk: Low / Medium"`, `"Current value"`, and `"Suggested value"`.
  - Removed technical JSON structural diff layouts in favor of clean merchant-friendly headers.

### E. Developer Tools Containment
- Hidden developer-only modules like `Tool Gateway` and `Super Agent Chat` under the lateral menu by clearly labeling them as `Admin/Dev Only` with warning flags.
- Completely shields connected merchants from raw system diagnostics.

---

## 4. Verification & Hardening Compliance

- **No expanded Shopify scopes**: Verified that no `write_products`, `read_themes`, or `write_themes` are requested or registered.
- **No live Shopify product writes**: Asserted that product write executions remain completely blocked (`canExecuteMutations` remains `false` and `mutationMode` remains `read_only_blocked`).
- **Git Safety**: Checked that the local `.env` remains completely untracked and git-ignored.
- **Build & Quality Checks**: Both `npm run lint` and `npm run build` compiled with zero compiler warnings or bundle errors.
- **Release Checks**: Static security checks pass 58/58 perfectly.
