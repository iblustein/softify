# Next Steps

This document outlines the goals, requirements, and scope definitions for the next upcoming phases of **Softify** as the project transitions toward a live MVP pilot.

---

## 1. Completed Milestones

### Phase 10.14 — Initial Agent Set & Merchant Workflows
- **Goal**: Defined and configured the active production-safe agent catalog MVP set, enforcing allowed field policies, hiding legacy agents, and rendering status change warnings.

---

## 2. Next Active Milestone: Phase 10.15 — Production Deployment & Pilot Readiness Checklist (In Review)

### Goal
Validate compiled production assets under Cloud Run, map environment configurations, configure zero-trust OIDC WIF credentials, and execute deployed integration smoke validation targeting the spawned service revision following PR merger.

### Scope
- **Deployment Review Walkthrough**: Map dynamic service, region, and project variables cleanly to the existing workflow source of truth, and record public/secret variables mapping (such as `SHOPIFY_API_SECRET`, `SHOPIFY_TOKEN_ENCRYPTION_KEY`, and `SOFTIFY_AGENT_DEV_BYPASS_SECRET`).
- **Draft Security Review Notes**: Audit tenant isolation, scopes limit, and database isolation in draft form pending final reviewer feedback.
- **CI/CD Smoke Validation**: Execute GitHub Actions deployment pipeline (using google-github-actions/auth@v3) and dynamic deployed smoke tests once branch merger is finalized.
---

## 3. Explicitly Deferred Agent Scopes (Out-of-Scope)
- **Theme Agent**: (No storefront assets modifications).
- **Pricing Agent**: (No price mutations).
- **Inventory Agent**: (No inventory tracking).
- **Customer Support Agent**: (No store customer chat/interactions).
- **Media Agent**: (No product image uploads/deletions).
- **Auto-Optimization Agent**: (No automatic rules execution).

---

## 3. Future Backlog: Merchant-Controlled Auto-Optimization Rules

### Notes
- **Future backlog item only. Do not implement in the current MVP roadmap.**
- Auto-optimization will be reconsidered **only after receiving real merchant pilot feedback** from Phase 10.13 and 10.14.
- The initial future version of auto-rules must be **proposal-only** (e.g. automatically proposing draft items matching rules for manual review), before any automatic approvals or automatic executions are introduced.
- No auto-execution is permitted under the current MVP roadmap.

---

## 4. Preserved Core Architectural Guardrails & Constraints

During both upcoming phases, the following strict architectural constraints must be maintained:

- **AI Statelessness**: AI engines/providers remain stateless recommendation engines. They **must never have direct access to write tools, token decryptors, or live Shopify APIs**.
- **Execution Boundary**: All live Shopify storefront writes are strictly mediated through the authorized `ApprovedProductMutationExecutorService` and initiated via manual merchant clicks.
- **Unified Tool Gateway**: All tool calls are routed through the `Tool Gateway` SDK boundary, checking `allowedTools` permissions, tenant scopes, and recursively scrubbing internal credentials.
- **Strict Data Containment**: No raw prompts, raw model reasoning/chain-of-thought, raw Shopify payloads, raw tool arguments, tokens, secrets, or PII can be exposed to frontend dashboards or logged audits.
- **Theme Scopes Canned**: Theme asset mutations are completely disabled (`read_themes` and `write_themes` remain strictly unauthorized).
- **Mutation Field Capping**: Storefront writes remain strictly restricted to text fields: `title`, `vendor`, `productType`, `status`, and `tags`.
- **State-Only Recovery**: Recovery and reset endpoints `/api/approvals/:id/reset-failed` are strictly state-only and are forbidden from calling live Shopify APIs.

---

## 5. Ongoing Workflow & Maintenance Rules

For every future phase, the implementation agent (Antigravity) must create or update the phase folder before and after implementation:

### A. Before Implementation
Create or update:
- `/docs/phases/phase-*/IMPLEMENTATION_PLAN.md`

### B. After Implementation
Update or create:
- `/docs/phases/phase-*/WALKTHROUGH.md`
- `/docs/phases/phase-*/REVIEW_NOTES.md` (after ChatGPT review)
- `/docs/phases/phase-*/VERIFICATION.md` (after tests and deployment validation)
- `/docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`
- `/docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md`
- `/docs/ai-handoff/NEXT_STEPS.md`
- `/docs/PHASE_INDEX.md`
