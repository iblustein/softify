# Next Steps

This document outlines the goals, requirements, and scope definitions for the next upcoming phases of **Softify** as the project transitions toward a live MVP pilot.

---

## 1. Completed Milestone: Phase 10.13 — Real-Store Product Readiness

### Goal
Successfully prepared Softify for safe, stable use on a real Shopify store connection. Completed the sanitized readiness diagnostics API, premium dashboard checklist onboarding UI, blocked write warnings, bulk execution flags, and dynamic integration smoke tests.

---

## 2. Next Milestone: Phase 10.14 — Initial Agent Set & Merchant Workflows

### Goal
Define and configure the first production-safe multi-agent catalog MVP pilot set, mapping exact purposes, tool permissions, and merchant control interfaces.

### Production-Safe Agent Catalog Mappings

#### A. Catalog Health Agent
- **Purpose**: Scans catalog product snapshots to identify metadata completeness warnings and compute store health scores.
- **Allowed Tools**: `catalog.insights.health`, `catalog.insights.missing_images`, `catalog.insights.missing_tags`.
- **Read/Write Behavior**: Read-Only.
- **Mutation Scope**: None.
- **Pilot Value**: Instantly exposes catalog taxonomy weaknesses to merchants without storefront modifications.

#### B. Product SEO Agent
- **Purpose**: Evaluates product title lengths and suggests descriptive qualifiers for semantic discoverability.
- **Allowed Tools**: `catalog.insights.health` (read-only).
- **Read/Write Behavior**: Proposal-Only (blocked executable proposed actions).
- **Mutation Scope**: Capped to safe informational SEO tag/title qualified recommendations inside the database. No live Shopify mutations.
- **Pilot Value**: Safely highlights search visibility optimization opportunities.

#### C. Catalog Cleanup Agent
- **Purpose**: Proposes standardized categorization text and appends metadata compliance tags.
- **Allowed Tools**: `catalog.products.propose_update`.
- **Read/Write Behavior**: Approval-Gated Execution.
- **Mutation Scope**: `title`, `vendor`, `productType`, `status`, `tags`.
- **Pilot Value**: Merchant authorizes taxonomy fixes through the sequential approvals stepper.

#### D. Merchandising Insights Agent
- **Purpose**: Aggregates catalog stats, listing missing product types or top vendor distributions to identify sales gaps.
- **Allowed Tools**: `catalog.insights.vendor_summary`.
- **Read/Write Behavior**: Read-Only.
- **Mutation Scope**: None.
- **Pilot Value**: Provides high-level operational metrics for catalog layout planning.

#### E. Approval Operations Agent
- **Purpose**: Scans historical merchant approvals, providing operational analysis of approved, rejected, and recovered executions.
- **Allowed Tools**: Read-only access to audit logs and approval history logs.
- **Read/Write Behavior**: Read-Only.
- **Mutation Scope**: None.
- **Pilot Value**: Provides merchants with an aggregated overview of their workflow velocity.

### Explicitly Deferred Agent Scopes (Out-of-Scope)
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
