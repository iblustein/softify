# Technical Walkthrough — Phase 10.14: Initial Agent Set & Merchant Workflows

This document details the implementation of Phase 10.14, which hardens the catalog of **active production-safe agents**, enforces **strict per-agent allowed field policies**, hides legacy development agents safely without physical deletion, and refines the merchant-in-the-loop workflow inside the frontend/backend console interface.

---

## 1. Backend Core Hardening

### A. Extended Types Definition
The `Agent` interface in `src/types.ts` has been extended to support the following metadata:
- `purpose?: string`: Clear merchant-facing agent descriptions.
- `allowedFields?: string[]`: Explicitly scoped permitted proposed mutation fields.
- `isLegacy?: boolean`: Distinguishes active production agents from deprecated development templates.

### B. Agent Registry Service Setup
In `src/server/services/agent-registry.service.ts`:
- Exactly five production-safe initial agent definitions have been activated (`enabled: true`, `isLegacy: false`):
  - `agent_catalog_health`
  - `agent_product_seo`
  - `agent_catalog_cleanup`
  - `agent_merchandising_insights`
  - `agent_approval_operations`
- Old placeholder development agents (`agent_store_setup`, `agent_content`, `agent_analytics`, `agent_theme_dev`, `agent_design`, `agent_customer_support`, `agent_media_digital`) have been disabled (`enabled: false`, `isLegacy: true`) to safely hide them from storefront catalogs without physical code deletions.

### C. Active Catalog Endpoint Filtration
In `src/server/routes/agents.routes.ts`:
- `GET /api/agents/catalog` filters out all legacy/development agents dynamically using `.filter(a => !a.isLegacy)`.
- Exactly the five production-safe agents are exposed to the UI catalog list.
- Deferred agents (Theme Agent, Pricing Agent, Inventory Agent, Media Agent, Customer Support Agent, Auto-Optimization Agent, Customer Data Agent, Order Mutation Agent) are completely excluded from the routing definitions.

### D. Per-Agent Allowed Field & Simulation Implementation
In `src/server/routes/agents.routes.ts`, POST `/api/agent-runs` handler was updated to support the five new agents with strict field policies:
- **`agent_catalog_health`**: Proposes changes containing `title`, `vendor`, `productType`, and `tags` only (explicitly excludes `status`).
- **`agent_product_seo`**: Proposes changes containing `title`, `productType`, and `tags` only (excludes `vendor`, `status`, `SEO metafields`, `meta title`, `meta description`, `handle`, `descriptionHtml`, variants, inventory).
- **`agent_catalog_cleanup`**: Proposes changes containing `vendor`, `productType`, `status`, and `tags` only (excludes `title`).
- **`agent_merchandising_insights`**: Read-only distribution insights matrix. Generates exactly `0` proposed actions.
- **`agent_approval_operations`**: Read-only operations checklist scanner. Generates exactly `0` proposed actions.

---

## 2. Frontend Workflow and UI Enhancements

### A. Approval Queue Status-Change Warning Badge
In `src/components/ApprovalQueue.tsx`:
- Rendered a small amber badge `[Status Change Warning]` inside the left queue items list next to `item.details.title` if the proposal contains status modifications (`item.details?.fields?.status` is present). This provides instant visual clarity before the details drawer is opened.
- A prominent orange warning banner is dynamically rendered in the details drawer details view if status changes are present:
  > **High-Impact Storefront Visibility Action**
  > Warning: Shifting Status to DRAFT / ARCHIVED will instantly alter visibility on your storefront and live checkout interfaces.

---

## 3. Test Coverage

- **Test 58 (Static Release Verification)**: Added checks in `release-check.mjs` verifying the registry configuration, correct filtration of legacy agents, strict per-agent field allowed lists (no status in Health, no title in Cleanup, no vendor in SEO, zero proposals in Insights/Operations), and absence of forbidden theme assets/scopes.
- **Test X (Dynamic Integration Smoke Test)**: Added dynamic check in `smoke-test.mjs` performing REST checks against `GET /api/agents/catalog`, verifying that SEO and Cleanup agent runs dynamically conform to field scopes, read-only agents generate exactly `0` proposals, and mismatched tenant context returns `403 Forbidden`.
