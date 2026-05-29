# Phase 10.17 — Live Installed Store UI Truth Audit

This document outlines the technical design, implementation details, and verification criteria for auditing and hardening the merchant-facing UI of **Softify** against the installed Shopify store `yambasurf-co-il.myshopify.com`.

This phase supersedes the earlier "Merchant Pilot Access & Onboarding Implementation Plan" direction.

---

## 1. Objectives & Context

### Target Store
- **Store Domain**: `yambasurf-co-il.myshopify.com`
- **Current Status**: Shopify app is installed successfully.
- **Product Snapshot Count**: `13` products stored in Firestore.

### The Real Product Risk
The current primary product risk is not a lack of onboarding documentation, but rather **uncertainty about which merchant-facing UI areas are backed by real connected-store data versus mock/demo/fallback data**. Merchants must have full clarity on what data is real versus simulated, and how their actions interact with the live storefront.

### Primary Goal
Validate and harden the merchant-facing UI against the installed Shopify store, clearly separating real connected-store functionality from mock/demo/fallback behavior, without expanding Shopify scopes and without enabling product write operations.

---

## 2. Security Guardrails (Absolute Boundaries)

- **No expanded Shopify scopes**: Do not request or add `write_products`, `read_themes`, or `write_themes` to OAuth configurations or scope parameters.
- **No theme mutations**: Theme layout/CSS patching is entirely out-of-scope and disabled.
- **No Shopify product mutations**: Do not perform Shopify product write operations. All manual execution dispatches targeting Shopify GraphQL mutations remain blocked.
- **No auto-execution**: Automatic execution on approval is strictly prohibited. Approved proposals must wait for explicit execution dispatches, which are blocked.
- **Tenant Isolation**: Maintain strict tenant isolation boundaries.
- **Diagnostics Isolation**: Recovery endpoints must remain state-only and must never call Shopify. Analytics endpoints must remain read-only.
- **AI Constraints**: AI/providers remain stateless recommendation engines and cannot directly perform storefront mutations.
- **Credential Protection**: Do not expose tokens, secrets, raw Shopify payloads, raw prompts, raw provider output, raw tool arguments, PII, or raw model reasoning inside logs or UI views.

---

## 3. Scope of the Audit

### In Scope
- Auditing all merchant-facing navigation items and classifying them as **REAL**, **MIXED**, **MOCK/DEMO**, or **ADMIN/DEV ONLY**.
- Exposing a clear store connection and readiness checklist card in the UI using real backend diagnostics (`/api/pilot/readiness`).
- Preventing the mock product count (fallback of `5`) from appearing inside the catalog stats when a real store is connected but has `0` synced snapshots.
- Exposing a clear, read-only catalog sync flow button triggering `POST /api/catalog/products/sync` to sync snapshots from Shopify into Firestore without writes.
- Labeling non-pilot developer tools and diagnostics (e.g., Tool Gateway, Super Agent Chat, Reset Prototype DB) as "Admin/Dev Only" or disabling them in merchant views.
- Eliminating misleading terminology such as fixed "Sandbox" labels when a real store is connected, rendering truthful connection states.

### Out of Scope
- Requesting `write_products` or performing actual product mutations on Shopify.
- Implementing an interactive agent installation interface or custom theme asset management.
- Writing to Shopify storefront files or theme assets.
- Phase 10.18 work or other subsequent roadmap activities.

---

## 4. UI Truth Audit Mapping

Every merchant-facing UI area has been audited and classified under the following scheme:

| UI Area / Component | Classification | Description & Hardening Actions Taken |
| :--- | :--- | :--- |
| **Merchant Identity Sidebar** | **REAL** | Renders dynamic name (`Yamba Surf Co Il`) and domain (`yambasurf-co-il.myshopify.com`) from DB. Badge dynamically switches to `Read-Only Pilot` when connected (instead of fixed "Sandbox"). |
| **Store Connection Status** | **REAL** | Backed by `/api/pilot/readiness`. Shows connection status (`CONNECTED`/`DISCONNECTED`), shop domain, and dynamically filtered scopes. |
| **Product Snapshot Count** | **REAL** | Backed by `/api/pilot/readiness`. Shows actual Firestore snapshot count. If `0`, displays "No synced catalog found" instead of falling back to mock counts. |
| **Sync Freshness** | **REAL** | Backed by `/api/pilot/readiness` (using `getLatestProductSyncAt` timestamp). Shows exact catalog sync time. |
| **Granted Scopes** | **REAL** | Displays the actual granted OAuth scopes list, filtering out any sensitive backend data and actively stripping theme scopes. |
| **Write Approvals List** | **REAL** | Renders the exact approvals queue stored in the Firestore `merchant_approvals` collection for the active tenant. |
| **Readiness Checklist** | **REAL** | Lists connection details, scope posture, snapshot count, and displays a prominent disclaimer banner: *"This installed-store pilot is read-only. Softify will not change Shopify products in this phase."* |
| **Catalog Sync Flow** | **REAL** | Safe UI trigger calling `POST /api/catalog/products/sync` to pull catalog metadata. Non-mutating on Shopify. |
| **Agent Workspace (Scans)** | **REAL / MIXED** | Workspace runs against ProductSnapshots. Scans are blocked if `productSnapshotCount === 0`, requiring a sync. Run results generate recommendations and proposed actions within allowed fields. |
| **Store Dashboard metrics** | **MIXED** | Revenue, sessions, popular products, and conversions are currently generated from a local sales report (`LOCAL_SALES_REPORT` fixture) as simulated analytics. |
| **Tool Gateway** | **ADMIN/DEV ONLY** | Not part of normal merchant operations. Labeled as *"Admin/Dev Only"* in sidebar navigation. |
| **Super Agent Chat** | **ADMIN/DEV ONLY** | Interactive LLM chat window. Labeled as *"Admin/Dev Only"* in sidebar navigation. |
| **Reset Demo Database** | **ADMIN/DEV ONLY** | Prototype reset action. Labeled as *"Reset Prototype DB (Admin/Dev Only)"* on the Dashboard page. |

---

## 5. Proposed Code Modifications

### Backend
1. **[MODIFY] [dashboard.service.ts](file:///c:/Projects/softify/softify/src/server/services/dashboard.service.ts)**: Hardens `totalProductsCount` to return `0` when `store.connected` is active but snapshots are missing, preventing incorrect mock product fallback counts.
2. **[MODIFY] [pilot.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/pilot.routes.ts)**: Extends `/api/pilot/readiness` to calculate and return `syncFreshness` to support frontend freshness labels.

### Frontend
1. **[MODIFY] [AgentWorkspace.tsx](file:///c:/Projects/softify/softify/src/components/AgentWorkspace.tsx)**:
   - Mounts `/api/pilot/readiness` to drive store connection check grids.
   - Embeds a read-only warning card: *"This installed-store pilot is read-only. Softify will not change Shopify products in this phase."*
   - Adds a conditional overlay warning when `productSnapshotCount === 0`, urging the merchant to trigger a read-only sync and blocking agent run launchers.
   - Provides a "Run Read-Only Catalog Sync" button dispatching `POST /api/catalog/products/sync`.
   - Eliminates misleading "Sandbox" environment language in connected store contexts.
2. **[MODIFY] [App.tsx](file:///c:/Projects/softify/softify/src/App.tsx)**:
   - Makes the Quick Stats Panel sidebar badge dynamic (rendering `"Read-Only Pilot"` when store is connected, else `"Sandbox"`).
   - Labels `Super Agent Chat` and `Tool Gateway` lateral navigation items with a clear `"Admin/Dev Only"` tag.
3. **[MODIFY] [DashboardOverview.tsx](file:///c:/Projects/softify/softify/src/components/DashboardOverview.tsx)**:
   - Renames `"Reset Prototype DB"` button to `"Reset Prototype DB (Admin/Dev Only)"`.
   - Dynamically maps catalog metrics labels (`"Connected Shopify Store"` and `"Sync status: Read-Only snapshots"` when connected, else sandbox defaults).
   - Conditioned products card warnings to state `No synced catalog yet. Sync required` if snapshot count is `0`.

---

## 6. Runtime Verification Checklist

- [x] **Linting & Compilation**: `npm run lint` compiles successfully with no diagnostics errors.
- [x] **Vite & esbuild Bundle**: `npm run build` compiles frontend assets and backend server bundle correctly.
- [x] **Pre-deployment Release Checks**: `npm run verify:release` completes all 58 safety rules and module validations.
- [x] **Smoke Test Validation**: `npm run smoke` runs all 32 tests (including Test Y for pilot allowlist, scope stripping, and readiness disclaimers) successfully.

---

## 7. Corrective Pass (Post-Architecture Review Hardening)

A corrective pass was successfully planned and executed to harden UI truthfulness and eliminate any possibility of misleading mock presentations:
1. **Mock Sales Metrics Resolution**: Completely replaced the mock sales metrics panel with a truthful read-only description block under active store connections: *"Sales analytics are not connected in this read-only catalog pilot. Only catalog snapshots, readiness checklists, agent workspace recommendations, and approval state history are active in Phase 10.17."*
2. **Prototype/Demo Mode Labeling**: Explicitly labeled mock reporting metrics as `"Demo Mode: simulated placeholder values"` when store connection is offline.
3. **Risky OAuth Scope Shielding**: Removed selectable checkboxes for risky and out-of-scope permissions (`write_products`, `write_themes`, `read_customers`) from the merchant-facing setup forms. Keep only safe, required read-only items (`read_products`, `read_orders`, `read_analytics`).
4. **"Full Access" Removal**: Removed all references to "Ready (Full Access)" in the merchant workspace. If a test store connection somehow registers `write_products`, the badge gracefully displays *"Write scope detected — execution still blocked by read-only pilot policy"*.
5. **Readiness Payload Alignment**: Extended `/api/pilot/readiness` with explicit, robust fields: `hasWriteProducts`, `hasReadProducts`, `catalogSyncRequired`, and `agentReadiness` to avoid client-side computation errors.
6. **Commits Language Clarification**: Swapped misleading `"storefront commits"` strings with precise `"product mutations"` and `"product mutation tracking"` labels.
7. **Accidental Database Reset Gating**: Hidden the `"Reset Prototype DB (Admin/Dev Only)"` trigger completely inside connected store contexts.
8. **No Shopify Scope Extensions**: Verified that zero active write scopes or theme mutation paths have been added or executed on Shopify.

