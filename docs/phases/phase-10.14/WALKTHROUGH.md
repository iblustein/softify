# Technical Walkthrough — Phase 10.14: Initial Agent Set & Merchant Workflows (Corrective Hardening Pass)

This document details the implementation and verification of Phase 10.14, with a primary focus on the **Phase 10.14 Corrective Hardening Pass** which hardens the catalog of **active production-safe agents**, enforces **strict centralized per-agent allowed field policies**, blocks legacy/disabled agents from run execution, and establishes robust gateway-level schema validations.

---

## 1. Corrective Hardening Implementation

### A. Gating Legacy Agents on Agent Runs Execution
In `src/server/routes/agents.routes.ts`:
- Added a production availability check inside `POST /api/agent-runs` right after agent definition lookup:
  - If `agent.isLegacy === true` or `agent.enabledByDefault !== true`, the execution request is rejected.
  - Returns `403 Forbidden` with the exact error payload: `{"ok": false, "error": "Agent is not available for production execution."}`.
- Legacy agents remain physically present in the registry but are completely non-executable and hidden from catalog listings.

### B. canExecuteActions Correction for Mutating Agents
In `src/server/routes/agents.routes.ts`:
- In `AGENT_CATALOG`, changed `canExecuteActions` to `false` for:
  - `agent_catalog_health`
  - `agent_product_seo`
  - `agent_catalog_cleanup`
- Keeps `executionMode: "APPROVAL_REQUIRED"` and `canProposeActions: true`. Mutating agents can propose changes but are never permitted to execute mutations directly.

### C. Centralized Per-Agent Field Policy Helper
Created `src/server/services/agent-policy.service.ts` to export:
- `getAllowedFieldsForAgent(agentId: string): AllowedProductProposalField[]`:
  - `agent_catalog_health` => `["title", "vendor", "productType", "tags"]`
  - `agent_product_seo` => `["title", "productType", "tags"]`
  - `agent_catalog_cleanup` => `["vendor", "productType", "status", "tags"]`
  - `agent_merchandising_insights` & `agent_approval_operations` => `[]`
  - Legacy/unknown agents => `[]`
- `isProductionAgentAllowed(agentId: string): boolean`:
  - Returns `true` only for non-legacy, enabled production agents.
- Defines boundaries by string checks to completely avoid circular import issues with `AGENT_CATALOG` router registry modules.

### D. Hardened Merchant Proposal Bridge
In `src/server/services/proposed-action-approval-bridge.service.ts`:
- Replaced the global `allowedFieldsList` with the centralized per-agent `getAllowedFieldsForAgent(act.agentId)`.
- If the agent has an empty allowed fields list (e.g. read-only/legacy agents), the bridge request is rejected with `"Agent is not permitted to propose actions."`.
- Strict validation checks incoming `payloadKeys` against the derived policy and rejects the bridge request if any forbidden field is present or if the update payload is empty.

### E. Hardened Batch Approvals Router
In `src/server/routes/proposed-actions.routes.ts`:
- In `POST /api/proposed-actions/batch-request-approval`, replaced the global allowlist check with item-level `getAllowedFieldsForAgent(act.agentId)` resolution.
- Validates each proposed action in the batch independently, early-rejecting the batch request with a `400` status if any item violates its agent's allowed fields list.

### F. Hardened Tool Gateway
In `src/server/tools/tool-gateway.ts` for `catalog.products.propose_update`:
- Allowed fields list is derived dynamically via `getAllowedFieldsForAgent(context.agentDefinition.id)`.
- If the agent is unknown, legacy, or read-only, it receives an empty allowed list and is immediately blocked.
- Strictly validates proposal arguments against the agent-specific allowed list.

### G. Chat Runtime Popping for Failed Tool Calls
In `src/server/services/agent-runtime.service.ts`:
- If a tool call fails completely in the gateway (and does not trigger a merchant approval request), the failed tool call is popped/removed from the returned `toolCalls` list in the chat response.

### H. Complete Cleanliness of Production Routes (Zero Test Backdoors)
- The entire dynamic test seeding logic has been completely removed from `src/server/routes/agents.routes.ts`.
- Production-facing route files contain **zero** mock logic, **zero** hidden test-fixture paths, and **zero** test keywords.
- Test ProposedAction fixtures are safely seeded in the local dev-only memory database during startup inside `src/server/index.ts`.

---

## 2. Frontend Workflow and UI Enhancements

### A. Approval Queue Status-Change Warning Badge
In `src/components/ApprovalQueue.tsx`:
- Rendered a small amber badge `[Status Change Warning]` inside the left queue items list next to `item.details.title` if the proposal contains status modifications (`item.details?.fields?.status` is present). This provides instant visual clarity before the details drawer is opened.
- A prominent orange warning banner is dynamically rendered in the details drawer details view if status changes are present:
  > **High-Impact Storefront Visibility Action**
  > Warning: Shifting Status to DRAFT / ARCHIVED will instantly alter visibility on your storefront and live checkout interfaces.

---

## 3. Dynamic Verification Outcomes

All 58 static checks and all 31 dynamic smoke integration tests pass successfully:
- Legacy gating in `POST /api/agent-runs` has been dynamically proven to block executions for legacy agents (`product_intelligence_agent`) with a `403`.
- Per-agent field limitations are strictly enforced:
  - Product SEO proposed action containing `vendor`/`status` fails the bridge.
  - Catalog Cleanup proposed action containing `title` fails the bridge.
  - Read-only agents (`agent_merchandising_insights`) are blocked from creating proposals.
- The Tool Gateway dynamically restricts input fields and rejects invalid proposals.
