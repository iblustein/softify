# Next Steps

This document outlines the goals and requirements for the next proposed development phase.

---

## Next Milestone: Phase 10.13 — Production Catalog Auto-Optimization

### Goal
Establish an opt-in, merchant-controlled background auto-optimization system. After stabilizing bulk operations in Phase 10.12, Phase 10.13 allows merchants to define automated rules (e.g. auto-apply title case or missing tag corrections) that execute in the background via a safe scheduler, keeping their catalog continuously optimized without manual intervention.

### Scope & Requirements (Proposed)
1. **Automation Rules Configuration**:
   - Provide REST endpoints to store store-level merchant automation rules (e.g. enabled agents, specific keywords, or safe tags categories).
2. **Background Automation Engine**:
   - Create a background/cron engine that scans eligible proposed actions and automatically bridges, approves, and executes mutations for matching items.
3. **Execution Rate & Failure Gating**:
   - Enforce daily auto-optimization mutation limits per store.
   - Automatically pause rules and email/notify the merchant on *any* execution failure, transitioning the system back to manual-only until resolved.
4. **Authoritative Safety & Logging**:
   - All auto-optimizations must write distinct audit log events with the performer set to `'System Automation'`.
   - Maintain the strict allowlisted mutation fields cap (`title`, `vendor`, `productType`, `status`, `tags`).

### Deferrals & Boundaries
The following features remain strictly out-of-scope:
- **No Global Enablement**: Automation must be strictly opt-in and configured per-store.
- **Theme Capabilities**: No theme tools, no `read_themes`, and no `write_themes` permissions.
- **Direct AI Writes**: AI providers cannot execute mutations directly; they must still output structured `ProposedAction` objects processed by the rules engine.

---

## Ongoing Workflow & Maintenance Rules
For every future phase, Antigravity must create or update the phase folder before and after implementation.

Review flow reminder:
- ChatGPT may directly inspect repo/docs/workflows/tests for read-only review and planning validation.
- Antigravity must perform implementation changes.
- Implementation must not begin until the plan is reviewed and approved.

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
