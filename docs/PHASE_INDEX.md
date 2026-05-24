# Phase Index

This index acts as the central directory for Softify's completed and planned development phases.

| Phase | Name | Status | Main Outcome | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **10.1** | AI Engine Interface and Catalog Agent POC | **Completed** | Core AI Provider interface, mock/gemini providers, agent runtime, catalog tools, Product Intelligence Agent POC, `/api/agents/chat` | 100% Passed (Pre-deploy checks & smoke tests) |
| **10.2** | Tenant-Safe Platform Context Resolver | **Completed** | Real shop context resolver, static agent/tool definitions, secured dev bypass, diagnostics route, deployment Secret Manager wiring | 100% Passed (Pre-deploy checks & smoke tests) |
| **10.3** | Agent Installations and Permission Policy Foundation | **Completed** | `agent_installations` collection/repository, installation routes, resolved installations in resolver, Tool Gateway allowedTools checking | 100% Passed (Pre-deploy checks & smoke tests) |
| **10.4** | Product Intelligence Agent v2 — Read-Only Catalog Insights | **Completed** | `catalog-insights.service.ts` health scoring and metrics, `catalog.insights.*` read-only tools, extended 32 release checks & 20 smoke tests | 100% Passed (Pre-deploy checks & smoke tests) |
| **10.5** | Agent Execution Audit Foundation | *Proposed* | PERSIST audit records for agent runs and tool calls, telemetry scrubbing, tenant-isolated lookups | *Pending Implementation* |

---

### Maintenance Rule
After every completed phase, update:
- `/docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`
- `/docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md`
- `/docs/ai-handoff/NEXT_STEPS.md`
- `/docs/PHASE_INDEX.md`
- the relevant `/docs/phases/phase-*/` files.
