# Phase 10.17 — UI Truth Audit Ledger

This document maps, evaluates, and classifies every merchant-facing user interface area of the **Softify** SaaS platform, clearly separating real connected-store functionality from mock, mixed, or developer-only features under Phase 10.17.

---

## 1. Summary of Classifications

- **REAL**: Fully backed by actual connected-store runtime state or persistent database records in Firestore for the active tenant.
- **MIXED**: Partly real but utilizes mock, demo, or default simulated fallback metrics in certain dashboard views.
- **MOCK/DEMO**: Entirely simulated behavior without actual connection backings (primarily used in initial unconnected sandbox states).
- **ADMIN/DEV ONLY**: Developer diagnostics and debugging tools not intended to be exposed as core merchant features in production.

---

## 2. Detailed UI Area Classifications

### A. Store Dashboard Page
* **Classification**: **MIXED / REAL**
* **Verification Detail**: 
  - The dashboard stats load dynamically via `/api/dashboard-stats`.
  - When connected to a real shop (e.g. `yambasurf-co-il.myshopify.com`), the **Product Count** card renders the actual, real Firestore snapshot count (sourcing `countProductSnapshotsByShop`).
  - If a connected shop is provided but has `0` snapshots, it returns the real count of `0` instead of falling back to the `5` mock products count.
  - The **Active Agents Count**, **Pending Approvals Count**, and **Audit Logs Count** cards pull actual database values.
  - The **Sales Reports metrics** (Weekly Revenue, conversion rates, popular products) have been completely replaced with a truthful read-only description block under active store connections: *"Sales analytics are not connected in this read-only catalog pilot. Only catalog snapshots, readiness checklists, agent workspace recommendations, and approval state history are active in Phase 10.17."*
  - When the store is unconnected, simulated sales report metrics are kept for demo purposes but explicitly labeled as *"Demo Mode: simulated placeholder values"*.

### B. Merchant Identity Sidebar
* **Classification**: **REAL**
* **Verification Detail**: 
  - Successfully pulls the actual store name (`Yamba Surf Co Il`) and `.myshopify.com` domain from the connection documents.
  - Dynamically replaces the hardcoded "Sandbox" text with a high-visibility `"Read-Only Pilot"` or `"Sandbox"` badge depending on the active OAuth registration status.

### C. Agent Workspace Page
* **Classification**: **REAL / MIXED**
* **Verification Detail**:
  - Dynamically queries `/api/pilot/readiness` to load active store parameters.
  - Pulls available agents from the production `/api/agents/catalog` endpoint, rendering exactly the five production-safe agents (excluding legacy agents).
  - Displays actual runs history via `GET /api/agent-runs`, recommendations via `GET /api/recommendations`, and proposed actions via `GET /api/proposed-actions`.
  - Audits before/after comparison fields against strict allowed field lists.
  - Blocks agent scans and shows a prominent full-page warning if the catalog has not been synced yet (`productSnapshotCount === 0`), guiding the merchant to perform a read-only catalog sync.
  - The runs execute stateless mock providers under the Tool Gateway runtime.

### D. Agent Registry Page
* **Classification**: **REAL**
* **Verification Detail**:
  - Fetches the exact active list of configured production agents from `/api/agents/catalog`.
  - Restricts configuration toggles and allowed tools parameters to durable store connections.

### E. Write Approvals Queue
* **Classification**: **REAL**
* **Verification Detail**:
  - Direct database hook to the `merchant_approvals` collection for the active tenant context.
  - Shows actual pending, approved, executing, applied, and failed items.
  - Hardened with concurrency state claim locks and explicit manual execution block banners.

### F. Tool Gateway Page
* **Classification**: **ADMIN/DEV ONLY**
* **Verification Detail**:
  - Internal developer-facing tool list illustrating gateway permissions sanitization allowlists.
  - Handoff instructions: Clearly labeled in lateral sidebar navigation as `"Admin/Dev Only"`.

### G. Super Agent Chat Page
* **Classification**: **ADMIN/DEV ONLY**
* **Verification Detail**:
  - Internal testing interface for stateless chat orchestration flows.
  - Handoff instructions: Clearly labeled in lateral sidebar navigation as `"Admin/Dev Only"`.

### H. Control Audit Logs Page
* **Classification**: **REAL**
* **Verification Detail**:
  - Pulls the exact chronological audit history from the `agent_audit_logs` collection in Firestore.
  - Fully sanitized on the server to scrub out prompts, query details, raw payloads, or raw tokens.

### I. Product Count / Catalog Count
* **Classification**: **REAL**
* **Verification Detail**:
  - Renders the actual, real number of stored `ProductSnapshot` files in Firestore.
  - Hardened in `dashboard.service.ts` to return `0` snapshots if none exist, rather than falling back to the default count of mock sandbox products.

### J. Store Connection & Readiness Checklist Card / Authorized Scopes List
* **Classification**: **REAL**
* **Verification Detail**:
  - Renders inside `AgentWorkspace.tsx` powered by `/api/pilot/readiness` and `DashboardOverview.tsx` powered by connection statistics.
  - Displays actual connection status, shop domain, and dynamically filtered granted scopes (actively stripping `read_themes` and `write_themes` from both merchant-facing components, even if they are defined in the backend DB connection).
  - Employs explicit `/api/pilot/readiness` fields (`hasWriteProducts`, `hasReadProducts`, `catalogSyncRequired`, `agentReadiness`) to avoid client-side computation errors.
  - Fully removes any "Full Access" UI labels; if `write_products` is somehow detected, it displays *"Write scope detected — execution still blocked by read-only pilot policy"*.
  - Renders a high-visibility amber warning disclaimer card explaining the read-only nature of the pilot.

### K. Catalog/Product-Related UI
* **Classification**: **REAL**
* **Verification Detail**:
  - Agent workspace comparison cards and product status badges render actual Firestore snapshots.
  - Renders `DRAFT` recommendations and allows direct "Request Merchant Approval" triggers.

### L. Reset / Demo Controls
* **Classification**: **ADMIN/DEV ONLY**
* **Verification Detail**:
  - Prototype database reset action.
  - Hardened by renaming the action button to `"Reset Prototype DB (Admin/Dev Only)"` on the central Dashboard page, and **completely hiding** the button under connected store states to protect configurations from accidental loss.

---

## 3. Truth Auditing Matrix Summary

| UI Section | Backed by Real Store Data? | Live Shopify Writes Enabled? | Pilot Exposure Labeling |
| :--- | :--- | :--- | :--- |
| **Merchant Identity** | **Yes** | No | Renders Dynamic Connected Store Name & Read-Only Pilot Badge |
| **Readiness Checklist** | **Yes** | No | Displays Detailed connection & scope grid with explicit amber disclaimers |
| **Catalog stats** | **Yes** | No | Shows exact snapshot count (correctly rendering `0` instead of falling back to mock counts) |
| **Catalog Sync Flow** | **Yes** | No | Safe `POST /api/catalog/products/sync` triggers to sync snapshots |
| **Agent Workspace Scans** | **Yes** | No | Recommendations run against real snapshots; scanner blocked if sync count is `0` |
| **Approvals Drawer** | **Yes** | No | Approvals transition state only; manual execution is explicitly blocked |
| **Audit Logs** | **Yes** | No | Fully scrubbed trace logs pulled from actual Firestore collection |
| **Tool Gateway** | No | No | Labeled `"Admin/Dev Only"` in sidebar |
| **Super Agent Chat** | No | No | Labeled `"Admin/Dev Only"` in sidebar |
| **Reset DB button** | No | No | Labeled `"Reset Prototype DB (Admin/Dev Only)"` |
