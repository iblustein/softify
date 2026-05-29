# Walkthrough — Phase 10.17: Live Installed Store UI Truth Audit

This document provides a complete walkthrough of the implementation, design changes, and validation results for **Phase 10.17 — Live Installed Store UI Truth Audit**.

---

## 1. Accomplishments

### A. Separation of Real vs Mock Data in Stats
- Hardened `totalProductsCount` calculation inside `dashboard.service.ts`. If a connected store context is active, it returns the real Firestore product snapshot count (even if 0) instead of falling back to the simulated count of `5` sandbox products.
- Updated the dashboard products count widget to show warnings if snapshots are `0` ("No synced catalog yet. Sync required."), and labeled connected states truthfully.

### B. Store Connection & Readiness Checklist Panel
- Fully integrated `/api/pilot/readiness` inside the `AgentWorkspace.tsx` component.
- The readiness panel now dynamically displays the connection status, shop domain, granted scopes (sanitized and stripped of theme scopes), sync freshness, and mutation modes.
- Added a high-visibility amber warning disclaimer card inside the checklist widget:
  > **Read-Only Pilot Enforcement**
  > This installed-store pilot is read-only. Softify will not change Shopify products in this phase.

### C. UI Guardrails for Ephemeral Snapshots
- Built a conditional layout shield inside `AgentWorkspace.tsx` when `productSnapshotCount === 0`.
- Scans are blocked entirely, and a full-width warning prompt is rendered: *"No synced catalog found. Run a read-only product sync before launching agents to analyze store data."*
- Provided a prominent "Run Read-Only Catalog Sync" button to trigger a safe `POST /api/catalog/products/sync` read-only synchronization.

### D. Correction of Misleading Merchant-Facing Language
- Replaced hardcoded "Sandbox" and "sandbox environment" text inside connection cards, dashboard panels, and the lateral sidebar panel with responsive, dynamic indicators.
- Sidebar identity badges dynamically render `"Read-Only Pilot"` or `"Sandbox"` based on real database connection status.

### E. Developer Tools Labeling & Containment
- sidebar lateral navigation labeled `Tool Gateway` and `Super Agent Chat` as `"Admin/Dev Only"`.
- Renamed the dashboard reset action button to `"Reset Prototype DB (Admin/Dev Only)"` to prevent merchant confusion.
- Confirmed the manual execution button is securely blocked and returns HTTP 400 (`EXECUTION_BLOCKED`) under missing write scopes.

---

## 2. Code Changes

The following files have been created or modified in the workspace repository:

- **[MODIFY] [dashboard.service.ts](file:///c:/Projects/softify/softify/src/server/services/dashboard.service.ts)**: Hardens products count to avoid sandbox fallback on active connected stores.
- **[MODIFY] [pilot.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/pilot.routes.ts)**: Exposes `syncFreshness` to support UI freshness labels.
- **[MODIFY] [AgentWorkspace.tsx](file:///c:/Projects/softify/softify/src/components/AgentWorkspace.tsx)**: Mounts readiness checkup data, adds sync alerts/buttons, block scanner overlays, and read-only disclaimers.
- **[MODIFY] [App.tsx](file:///c:/Projects/softify/softify/src/App.tsx)**: Tags lateral dev tools and builds dynamic sidebar badges.
- **[MODIFY] [DashboardOverview.tsx](file:///c:/Projects/softify/softify/src/components/DashboardOverview.tsx)**: Dynamic dashboard catalog metric labeling and admin button naming.
- **[NEW] [IMPLEMENTATION_PLAN.md](file:///c:/Projects/softify/softify/docs/phases/phase-10.17/IMPLEMENTATION_PLAN.md)**: Updated Phase 10.17 implementation design documents.
- **[NEW] [UI_TRUTH_AUDIT.md](file:///c:/Projects/softify/softify/docs/phases/phase-10.17/UI_TRUTH_AUDIT.md)**: Ledger mapping and classifying all merchant-facing UI zones.
- **[NEW] [VERIFICATION.md](file:///c:/Projects/softify/softify/docs/phases/phase-10.17/VERIFICATION.md)**: Logs compilation, release check, and smoke integration results.

---

## 3. Verification Highlights

- **Static Release Check Verification**: Passed all 58 safety rules and module validations successfully.
- **Dynamic Smoke Integration Suite**: Passed all 32 integration test suites cleanly (including allowlist access, scope stripping, and error blocks on Test Y).
- **Target Store Validation**: yambasurf-co-il.myshopify.com connection state and snapshots verify successfully.

---

## 4. Corrective Pass Accomplishments (Post-Architecture Review)

Following an external architecture review, additional modifications were completed to ensure total truthfulness and guardrails compliance:
- **Mock Metrics Gating**: Removed the simulated sales reports block from active connected store dashboard screens entirely, replacing it with a precise read-only disclaimer message. For unconnected sandboxes, labeled simulated metrics as simulated placeholders.
- **Accidental DB Reset Block**: Hidden the database reset button completely inside connected store contexts to prevent merchants from accidentally clearing credentials or metadata snapshots.
- **dangerous Scope Exclusions**: Screened setup screens to completely remove selectable options for out-of-scope permissions (`write_products`, `write_themes`, `read_customers`).
- **Wording Audit**: Eliminated all "Ready (Full Access)" labels from the connection checklist in favor of read-only blocked status checks. Swapped out all misleading "storefront commits" phrasing.
- **Backend Readiness Extension**: Aligned the client-side state parameters directly with robust, explicit `/api/pilot/readiness` payload keys.

