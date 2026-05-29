# Implementation Plan — Phase 10.18: Merchant Onboarding UX & Read-Only Pilot Polish

This document outlines the Technical Design and Verification Checklist for **Phase 10.18 — Merchant Onboarding UX & Read-Only Pilot Polish**.

---

## 1. Regression Resolution & Environment Configuration (Part 1)

### Root Cause of Test Y Failure
- **Test expectation**: `/api/pilot/readiness?shop=yambasurf-co-il.myshopify.com` returns `pilotApproved: true` for the allowlisted shop.
- **Why it failed**: `isPilotShopApproved(shop)` reads `process.env.SOFTIFY_PILOT_SHOPS`. In separately running server processes, this env variable was not set because it was missing from the server's starting environment.

### The Fix and Environment Constraints
- **Local development**: Ensure the server process is launched with:
  `SOFTIFY_PILOT_SHOPS=yambasurf-co-il.myshopify.com`
  either via a local `.env` file or shell environment.
- **`.env` local-only isolation**: 
  - `.env` must remain local-only.
  - `.env` must remain ignored.
  - `.env` must not be committed or staged.
- **Repository/deployment configuration updates**:
  - `.env.example` (template reference updated and committed)
  - `cloudrun-firestore.env.yaml` (allowlist key added and committed)
- **Server Launch Requirement**: The server process itself must start with the `SOFTIFY_PILOT_SHOPS` environment variable loaded (e.g. `$env:SOFTIFY_PILOT_SHOPS="yambasurf-co-il.myshopify.com"` in terminal launches). We do not rely only on setting `process.env` dynamically inside the smoke-test script.

---

## 2. Security Guardrails (Absolute Boundaries)

- **No expanded Shopify scopes**: Do not request or add `write_products`, `read_themes`, or `write_themes`.
- **No theme mutations**: Theme layout/CSS patching remains strictly unauthorized.
- **No Shopify product mutations**: Product write executions remain blocked (`canExecuteMutations: false` / `mutationMode: "read_only_blocked"`).
- **No auto-execution**: Automatic execution on approval is strictly prohibited.
- **Tenant Isolation**: Maintain strict tenant isolation boundaries.
- **Credentials Protection**: No credentials or private tokens will propagate inside JSON payloads or logs.

---

## 3. Merchant UX Polish & Improvements (Part 2)

### A. Guided Onboarding Checklist Panel
We will implement a clean, visual **First-Run Merchant Path** in `DashboardOverview.tsx` to guide merchants step-by-step:
- **Step 1: Store Connected** (Indicates connection status)
- **Step 2: Sync Product Catalog** (Triggers read-only sync, checking `productSnapshotCount > 0`)
- **Step 3: Analyze Products** (Launches a read-only analysis run)
- **Step 4: Review Suggestions** (Navigates to proposed Changes)
- **Step 5: Approve or Dismiss Suggestions** (Gathers merchant feedback)
- **Step 6: Safe Read-Only Mode Gating** (Explains read-only safety parameters)

### B. Replace Technical Jargon with Merchant-Friendly Wording
We will refactor UI labels and descriptions to shield merchants from raw developer jargon:
- **Avoid/Reduce**: "Agent workers", "Diagnostic Scan", "Tool Gateway", "Super Agent Chat", "Prototype DB", "Gemini Managed Agents Paradigm", "Runtime", "Mutation", "Full metadata logging", "Sandboxed environment".
- **Prefer**: "Product Review Workspace", "Analyze Products", "Analysis Run", "Suggested Changes", "Changes Awaiting Approval", "Synced Products", "Last Sync", "Safe Read-Only Mode", "Product changes".

### C. Improved Empty States
We will refine empty states across panels to guide the merchant toward their next action:
- **No synced products yet**: Guide them to "Run Catalog Sync".
- **No suggested changes yet**: Guide them to run "Product Analysis".
- **History is empty**: Explain how approvals history will record their choices.
- **Analytics not available**: Clarify that storefront analytics are safely decoupled under the read-only pilot.

### D. Restrict Developer Tools Visibility
- Hidden developer-only modules like `Tool Gateway` and `Super Agent Chat` under a collapsed menu, or clearly labeled them as `[Admin/Dev Only]` with warning flags.
- Confirmed that "Reset Prototype DB" is hidden for connected stores.

### E. Trust & Safety Panel
We will implement an explicit **"What Softify can and cannot do in this pilot"** panel in the Dashboard to build high merchant trust:
- **Can**: Read product catalog metadata, sync secure snapshots, analyze copy inconsistencies, suggest metadata improvements, and collect owner approvals.
- **Cannot**: Make live Shopify product writes, change prices, change inventory/variants, alter images, change themes, or publish any changes automatically.

### F. Recommendation Card Display Refinements
Refine approval cards inside `ApprovalQueue.tsx` to display clear, readable merchant-facing headings:
- "Suggested change"
- "Why this matters"
- "Affected field"
- "Risk: Low / Medium"
- "Current value"
- "Suggested value"
- "Approve Choice / Dismiss Choice"

---

## 4. Proposed Code Changes

| Component / File | Rationale / Actions |
| :--- | :--- |
| **[LOCAL ONLY / DO NOT COMMIT]** `.env` | Developers may set `SOFTIFY_PILOT_SHOPS=yambasurf-co-il.myshopify.com` locally when launching the server. This file must remain ignored and must not be committed or staged. |
| **[MODIFY]** `.env.example` | Exposes `SOFTIFY_PILOT_SHOPS` template placeholder and restricts `SHOPIFY_SCOPES` to `"read_products,read_orders"`, removing theme scopes and non-essential scopes. |
| **[MODIFY]** `cloudrun-firestore.env.yaml` | Declares persistent pilot allowlist and restricts `SHOPIFY_SCOPES` to `"read_products,read_orders"`. |
| **[MODIFY]** [shopify.config.ts](file:///c:/Projects/softify/softify/src/server/config/shopify.config.ts) | Prunes fallback default scopes list to `"read_products,read_orders"`. |
| **[MODIFY]** `DashboardOverview.tsx` | Builds Guided Onboarding Checklist, Trust & Safety Panel, improves empty states, and refines connection card/OAuth description copy. |
| **[MODIFY]** `AgentWorkspace.tsx` | Replaces "Agent workers", "Diagnostic scan" jargon with clean "Analysis Runs", "Product Review Workspace", and optimizes empty states. |
| **[MODIFY]** `ApprovalQueue.tsx` | Fetches readiness from `/api/pilot/readiness` as the only authoritative policy source. Gates execution UI strictly behind `canExecuteMutations === true` instead of `hasWriteProducts`, and rebrands diff markers to "Suggested Changes". |
| **[MODIFY]** `App.tsx` | Integrates refined lateral dev tool headings. |

---

## 5. Verification Plan

### Automated Verification
We will run all compiler checks and release sweeps:
- `npm run lint` (TypeScript compilation checks)
- `npm run build` (Production Bundler checks)
- `npm run verify:release` (Static security rules and safety checks)

### Dynamic Smoke Integrations
- `$env:SOFTIFY_BASE_URL="http://localhost:3000"; node scripts/smoke-test.mjs`
- Assert that **Test Y** passes perfectly.
- Verify that `pilotApproved` returns `true` for `yambasurf-co-il.myshopify.com`.
- Verify that `canExecuteMutations` remains `false`.
- Verify that `mutationMode` remains `read_only_blocked`.
- Verify that `read_themes` and `write_themes` are strictly stripped from scopes rendering.
