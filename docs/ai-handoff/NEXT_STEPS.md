# Next Steps

This document outlines the goals, requirements, and scope definitions for the next upcoming phases of **Softify** as the project transitions toward a live MVP pilot.

---

## 1. Completed Milestones

### Phase 10.14 — Initial Agent Set & Merchant Workflows
- **Goal**: Defined and configured the active production-safe agent catalog MVP set, enforcing allowed field policies, hiding legacy agents, and rendering status change warnings.

### Phase 10.15 — Production Deployment & Pilot Readiness Checklist
- **Goal**: Formally validated the compiled production deployment pipeline, serverless source-based Cloud Run builds, OIDC Workload Identity Federation (using google-github-actions/auth@v3), environments mapping, GCP Secret Manager validations (`SHOPIFY_API_SECRET`, `SHOPIFY_TOKEN_ENCRYPTION_KEY`, `SOFTIFY_AGENT_DEV_BYPASS_SECRET`), operational database gates, and dynamic live Cloud Run deployed smoke tests (31/31 passed cleanly on Run ID: 26598640767).

---

## 2. Next Active Milestone: Phase 10.16 — MVP Pilot Launch & Merchant Onboarding Plan (Planning Only)

### Goal
Formulate the operational plan, tenant setup protocols, and merchant onboarding checklists to safely launch Softify's live MVP pilot.

### Scope
- **Implementation Plan Only**: Draft and finalize the onboarding implementation plan detailing tenant provisioning, store connectivity checks, and initial catalog synchronizations. Do not write runtime code.
- **Merchant Onboarding Checklists**: Create structured checklist templates to guide merchant installations and scope resolutions.
- **Telemetry Review Guidelines**: Define operational guardrails for reviewing live sanitizations, audit telemetry, and trace timelines during the pilot phase.
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
