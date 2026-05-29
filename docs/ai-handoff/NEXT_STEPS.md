# Next Steps

This document outlines the goals, requirements, and scope definitions for the next upcoming phases of **Softify** as the project transitions toward a live MVP pilot.

---

## 1. Completed Milestones

### Phase 10.14 — Initial Agent Set & Merchant Workflows
- **Goal**: Defined and configured the active production-safe agent catalog MVP set, enforcing allowed field policies, hiding legacy agents, and rendering status change warnings.

### Phase 10.15 — Production Deployment & Pilot Readiness Checklist
- **Goal**: Formally validated the compiled production deployment pipeline, serverless source-based Cloud Run builds, OIDC Workload Identity Federation (using google-github-actions/auth@v3), environments mapping, GCP Secret Manager validations (`SHOPIFY_API_SECRET`, `SHOPIFY_TOKEN_ENCRYPTION_KEY`, `SOFTIFY_AGENT_DEV_BYPASS_SECRET`), operational database gates, and dynamic live Cloud Run deployed smoke tests (31/31 passed cleanly on Run ID: 26598640767).

### Phase 10.16 — MVP Pilot Launch & Merchant Onboarding Plan
- **Goal**: Drafted and validated the operational plans, checklists, runbooks, validation matrices, feedback templates, and executed a read-only agent dry run against the approved development store `yambasurf-co-il.myshopify.com` under production Firestore database mappings.

### Phase 10.17 — Live Installed Store UI Truth Audit
- **Goal**: Hardened the UI to prevent any mock/demo/fallback data from being presented as real connected-store data, sanitized OAuth scopes representation, and removed any write/full-access implications under read-only containment.

### Phase 10.18 — Merchant Onboarding UX & Read-Only Pilot Polish
- **Goal**: Fixed readiness allowlist regressions, added Guided Onboarding Checklist step-by-step progress cards, mounted an explicit Trust & Safety Panel, polished empty analytics states, rebranded proposed change cards to use non-jargon fields, collapsed developer tools under warning tags, and verified all static release checks and smoke tests pass (32/32 smoke tests passed!).

### Phase 11.0 — Simplified Merchant UI & Theme Editor AI Agent MVP
- **Goal**: Pivot the product direction around the Theme Editor AI Agent MVP. Simplify sidebar navigation to Settings and active/enabled dynamic Your Team roster. Build interactive conversational Theme Editor Chat (defaulting to safe unpublished target themes, live theme confirmation gating, side-by-side diff previews, apply actions) and SaaS Settings React panels. Connect Express backend theme asset editing routes securely under `/api`. Confirmed 100% successful compiler builds, static release passes (58/58 tests), and dynamic local smoke checks (32/32 tests).

---

## 2. Next Active Milestone: Phase 11.1 — Theme Editor AI Agent Pilot Launch

### Goal
Formally launch the live pilot program specifically for the Theme Editor AI Agent MVP, onboarding pilot merchants to interactively plan and execute theme updates.

### Scope
- **Controlled Onboarding Sequence**: Guide pilot merchants step-by-step through the connection of their Shopify store, provisioning of theme scopes, and onboarding checklist.
- **Feedback Collection Mechanics**: Gather feedback on conversational plan diffs clarity, warning checkbox gates utility, and overall editing experience.
- **Durable Backup Rollback Validation**: Verify that the pre-write database backups in `theme_backups` perform smoothly and safely under pilot production settings.

---

## 3. Explicitly Deferred Agent Scopes (Out-of-Scope)
- **Pricing Agent**: (No price mutations).
- **Inventory Agent**: (No inventory tracking).
- **Customer Support Agent**: (No store customer chat/interactions).
- **Media Agent**: (No product image uploads/deletions).
- **Auto-Optimization Agent**: (No automatic rules execution).

---

## 3. Future Backlog: Merchant-Controlled Auto-Optimization Rules

### Notes
- **Future backlog item only. Do not implement in the current MVP roadmap.**
- Auto-optimization will be reconsidered **only after receiving real merchant pilot feedback** from Phase 11.0.
- The initial future version of auto-rules must be **proposal-only** (e.g. automatically proposing draft items matching rules for manual review), before any automatic approvals or automatic executions are introduced.
- No auto-execution is permitted under the current MVP roadmap.

---

## 4. Preserved Core Architectural Guardrails & Constraints

During both upcoming phases, the following strict architectural constraints must be maintained:

- **AI Statelessness**: AI engines/providers remain stateless recommendation engines. They **must never have direct access to write tools, token decryptors, or live Shopify APIs**.
- **Execution Boundary**: All live Shopify storefront writes are strictly mediated through the authorized backend services and initiated via manual merchant clicks.
- **Unified Tool Gateway**: All tool calls are routed through the `Tool Gateway` SDK boundary, checking `allowedTools` permissions, tenant scopes, and recursively scrubbing internal credentials.
- **Strict Data Containment**: No raw prompts, raw model reasoning/chain-of-thought, raw Shopify payloads, raw tool arguments, tokens, secrets, or PII can be exposed to frontend dashboards or logged audits.
- **Theme Scopes Isolation**: Theme asset mutations are permitted strictly for the `theme_editor_ai_agent` context under the Safe Execution Boundary. No other agents may receive theme-reading or theme-writing tools. Unrelated write scopes (e.g. `write_products`, `write_customers`) remain strictly unauthorized and blocked.
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
