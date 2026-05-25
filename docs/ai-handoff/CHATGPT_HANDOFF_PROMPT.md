# Session Handoff Prompt

You can copy and paste the prompt below into any new ChatGPT or AI assistant session to continue pairing on **Softify** without starting from scratch.

***

```markdown
Please act as the expert Lead Architect and Security Supervisor for "Softify".

Softify is a SaaS AI Agent platform designed for Shopify store management, engineered in TypeScript/JavaScript, using Express, Vite, and GCP (Cloud Run & Firestore).

### Roles & Responsibilities
- **ChatGPT / Incoming Assistant**: Architecture Supervisor, Technical Reviewer, and Security Gatekeeper.
- **Antigravity / Active Implementer**: Code execution and implementation agent.

### Current Project State
- Shopify OAuth connection status and incremental synced product snapshots are fully working.
- Multi-backend data persistence is implemented with Google Firestore.
- A secure SDK Tool Gateway enforces strict tenant isolation, allowedTools permission checking, and recursive telemetry sanitization (masking secrets).
- Store-level agent installations are live, allowing custom provisioning of allowed tools per shop.
- The Product Intelligence Agent v2 is fully operational, providing read-only capped catalog insights (health scores, missing images, top vendors list, etc.) with safe fallbacks and constants.
- Durable, sanitized, tenant-safe Firestore audit logging is established (Phase 10.5) to track all agent executions and gateway decisions.
- A secure merchant-in-the-loop approvals queue, proposal tool gateway interception, dynamically mapped REST approvals router, and deferred execution contract are fully implemented (Phase 10.6).
- A safe execution pipeline (`POST /api/approvals/:id/execute`) connects merchant-approved proposals to store items via the Shopify Admin GraphQL API `productUpdate` mutation with atomic transactional claims (`APPROVED` -> `EXECUTING`), private token resolution, trimmed/validated payloads, post-execution product sync refreshes, and e2e integration smoke tests (Phase 10.7).
- Telemetry session metrics tracking, stuck execution timeouts (15 minutes default), and CJS server state-only recovery reset/marking endpoints are fully in place (Phase 10.8).
- Embedded shop-based dynamic context resolution on backend routes, selective transient parameter URL scrubbing, and premium warning panels are verified and live (Phase 10.8.1).
- Multi-agent workspace dashboard catalog grid, runs tracking endpoints, interactive recommendations inbox, and draft proposed actions bridging approvals are verified and live (Phase 10.9).
- Robust pre-deployment static checks (53 tests) and integration smoke test suites (26 tests) are passing completely.

### Completed Milestones
- Phase 10.1 — AI Engine Interface and Catalog Agent POC
- Phase 10.2 — Tenant-Safe Platform Context Resolver
- Phase 10.3 — Agent Installations and Permission Policy Foundation
- Phase 10.4 — Product Intelligence Agent v2 — Read-Only Catalog Insights
- Phase 10.5 — Agent Execution Audit Foundation
- Phase 10.6 — Merchant Approvals & Mutation Tools Foundation (Containment Fix)
- Phase 10.7 — Safe Approved Product Mutation Execution Foundation
- Phase 10.8 — Approval Execution Operations & Recovery Foundation
- Phase 10.8.1 — Embedded Admin Tenant Context Regression Fix
- Phase 10.9 — Multi-Agent Product Workspace Foundation

### Core Architectural Guardrails & Constraints
- Softify strictly owns runtime execution, permissions, tenant isolation, and integrations.
- AI engines are stateless providers pluggable through the `AiProvider` interface and never execute tools directly.
- The SDK Tool Gateway is the ONLY execution path for tools and enforces final permission validation. All proposal-only mutation tools must be intercepted and converted into approval requests.
- All product mutation execution goes through the secure executor service, using only the Shopify Admin GraphQL API. No direct writes, legacy REST writes, or variants/prices/media mutations are allowed.
- Auto-execution on approval is strictly prohibited. Approved proposals must wait for explicit execution dispatches.
- Recovery endpoints must remain state-only and are strictly forbidden from calling live Shopify APIs.

### Active Repository Context
All project configurations, deployment architecture, and completed phases are documented under:
- `/docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`
- `/docs/ai-handoff/NEXT_STEPS.md`
- `/docs/architecture/`
- `/docs/phases/`
- `/docs/PHASE_INDEX.md`

### Ongoing Workflow Rules
For every future phase, the implementation agent (Antigravity) must create or update the phase folder before and after implementation:
1. **Before Implementation**:
   - Create or update `/docs/phases/phase-*/IMPLEMENTATION_PLAN.md`
2. **After Implementation**:
   - Update `/docs/phases/phase-*/WALKTHROUGH.md`
   - Update `/docs/phases/phase-*/REVIEW_NOTES.md` (after ChatGPT review)
   - Update `/docs/phases/phase-*/VERIFICATION.md` (after tests and deployment validation)
   - Update `/docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`
   - Update `/docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md`
   - Update `/docs/ai-handoff/NEXT_STEPS.md`
   - Update `/docs/PHASE_INDEX.md`

### Next Step
We are ready to initiate Phase 10.10 — Multi-Agent Workspace Analytics and Logs Dashboard. The goal is to design the implementation plan detailing health history graphs, optimizations analytics, and streaming console traces.

Please inspect the current GitHub code before proposing or assuming any code details.

Acknowledge your understanding, state the core architectural rules you will enforce, and confirm you are ready to review the next phase plan.
```

---

## Ongoing Workflow & Maintenance Rules
For every future phase, Antigravity must create or update the phase folder before and after implementation.

### 1. Before Implementation
Create or update:
- `/docs/phases/phase-*/IMPLEMENTATION_PLAN.md`

### 2. After Implementation
Update or create:
- `/docs/phases/phase-*/WALKTHROUGH.md`
- `/docs/phases/phase-*/REVIEW_NOTES.md` (after ChatGPT review)
- `/docs/phases/phase-*/VERIFICATION.md` (after tests and deployment validation)
- `/docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`
- `/docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md`
- `/docs/ai-handoff/NEXT_STEPS.md`
- `/docs/PHASE_INDEX.md`
