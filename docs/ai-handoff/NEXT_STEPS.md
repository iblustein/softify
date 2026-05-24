# Next Steps

This document outlines the goals and requirements for the next proposed development phase.

---

## Next Milestone: Phase 10.5 — Agent Execution Audit Foundation

### Goal
Persist sanitized, tenant-safe audit records for all agent runs, tool invocations, and gateway decisions to ensure compliance and auditability before adding approval or write capabilities.

### Requirements & Scope
- **Durable Persistence**: Replace simple transient console telemetry with structured Firestore database persistence (e.g., inside an `agent_audit_logs` collection).
- **Tenant Isolation**: Ensure all audit logs are strictly partitioned by organization and store-connection IDs, preventing cross-tenant leakage.
- **Zero Token/PII Leakage**: Ensure the audit pipeline recursively scrubs all access tokens, encryption keys, dev-bypass secrets, or customer PII before persistence.
- **Comprehensive Gateway Coverage**: Capture gateway results, dynamic allowed tools authorization outcomes, and structured block statuses (such as `tool_not_allowed_by_installation`).

---

### Maintenance Rule
After every completed phase, update:
- `/docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`
- `/docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md`
- `/docs/ai-handoff/NEXT_STEPS.md`
- `/docs/PHASE_INDEX.md`
- the relevant `/docs/phases/phase-*/` files.
