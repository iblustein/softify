# Security & Gatekeeper Review Notes — Phase 10.14 (Corrective Hardening Pass)

This document serves as the formal Security Review for **Phase 10.14: Initial Agent Set & Merchant Workflows**. It outlines the strict enforcement of security guardrails, tenant containment, and field policies within the Softify runtime, including the corrective hardening measures.

---

## 1. Corrective Security Hardening

### A. Gating of Legacy Agents & Execution
- **Run Execution Gating**: A strict gating policy is enforced inside `POST /api/agent-runs` to prevent legacy and disabled agents from being executed. Any request to run legacy or unconfigured agents is immediately rejected with a `403 Forbidden` and error payload: `{"ok": false, "error": "Agent is not available for production execution."}`.
- **canExecuteActions Mitigation**: The routes catalog `AGENT_CATALOG` was updated to set `canExecuteActions` to `false` for mutating agents. They can propose changes but cannot execute updates directly.

### B. Strict Per-Agent Field Policies
Allowed fields are centrally defined inside `src/server/services/agent-policy.service.ts` using string matching to eliminate any circular dependencies with the routing catalog.
- **Catalog Health**: Allowed: `title`, `vendor`, `productType`, `tags`. Forbidden: `status`.
- **Product SEO**: Allowed: `title`, `productType`, `tags`. Forbidden: `vendor`, `status`, SEO metafields, handles, `descriptionHtml`.
- **Catalog Cleanup**: Allowed: `vendor`, `productType`, `status`, `tags`. Forbidden: `title`.
- **Insights & Operations**: Forbidden: All storefront write mutations and proposal generation tools.
- **Legacy/Unknown Agents**: Forbidden: All fields.

### C. Gatekeeper Bridge & Gateway Validation
- **Approval Queue Bridge**: In `proposed-action-approval-bridge.service.ts`, the proposal bridge strictly resolves the allowed fields via `getAllowedFieldsForAgent(act.agentId)`. If any forbidden fields are present in the proposal draft, the bridge request is immediately rejected.
- **Batch Gating**: In `proposed-actions.routes.ts`, `batch-request-approval` validates each draft proposed action independently based on `getAllowedFieldsForAgent(act.agentId)`. The entire batch request is rejected with `400` if any item violates these boundaries.
- **Tool Gateway Verification**: In `tool-gateway.ts`, allowed fields for `catalog.products.propose_update` are resolved dynamically via context. Arguments containing unallowlisted fields are blocked before generating approvals.

### D. Complete Runtime Cleanliness & Static Checking
- **No Test Backdoors**: There are absolutely no mock seeding branches, test backdoor parameters, or hardcoded test proposed actions inside the runtime routes or server entrypoints (such as `agents.routes.ts`, `proposed-actions.routes.ts`, or `src/server/index.ts`). All test/smoke-test fixtures are seeded cleanly inside the test-environment context only:
  - **In-Memory**: Seeded in-process via ephemeral port `0` (`app.listen(0)`), completely isolating tests to a dynamic, standalone in-process server instance.
  - **Firestore**: Explicitly opt-in via environment flag and sandbox check, with automatic cleanup inside a `finally` block.
- **Static Assertions**: `release-check.mjs` (Test 58) statically asserts that `src/server/index.ts` and runtime route files are structurally free from keywords and strings related to test-fixtures and simulated records (`test-invalid-bridge-`, `Support for smoke-test`, `Simulated invalid proposed action`, `ACT-TEST`, `test-invalid-seo-action`, `test-invalid-cleanup-action`, `test-invalid-readonly-action`).

---

## 2. Tenant Isolation Enforcement

- **Strict Mismatch Checks**: Mismatched organization context on agent runs and approvals endpoints immediately rejects execution with `403 Forbidden`.
- **Shop Validation**: Shop domains are dynamically normalized and verified against store connections; mismatches trigger `403 Forbidden` early.
- **Bypass Protections**: Development headers require matching environment variables and are restricted to secure local testing.
