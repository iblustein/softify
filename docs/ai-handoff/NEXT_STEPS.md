# Next Steps

This document outlines the goals and requirements for the next proposed development phase.

---

## Next Milestone: Phase 10.11 — Workspace Bulk Operations Foundation

### Goal
Extend the multi-agent workspace with merchant-approved bulk operations and batch processing capabilities to safely streamline large-scale optimizations across multiple recommendations or proposed actions simultaneously.

### Scope & Requirements (Proposed)
1. **Batch Dismissal for Diagnostic Recommendations**:
   - Provide a `POST /api/recommendations/batch-dismiss` endpoint to safely dismiss multiple recommendations in a single tenant-scoped atomic write.
2. **Batch Optimization Proposals Handling**:
   - Provide a `POST /api/proposed-actions/batch-dismiss` endpoint to dismiss multiple actions.
   - Provide a `POST /api/proposed-actions/batch-request-approval` endpoint to bridge multiple draft actions to the approvals queue at once.
3. **Bulk UI Management Grid**:
   - Integrate multi-select grids and execution controls cleanly within the responsive **AgentWorkspace** dashboard.

> [!IMPORTANT]
> **Implementation Boundaries**:
> - Antigravity must **not** implement Phase 10.11 code or modify actual backend/frontend logic until the implementation plan is explicitly reviewed and approved by the Architecture Supervisor.
> - Any future phase **must not expand mutation scope** beyond the existing text fields (`title`, `vendor`, `productType`, `status`, `tags`).
> - No theme tools, no `write_themes`, no price/inventory/variant/media/descriptionHtml mutations, and no auto-execution are allowed. All recovery endpoints remain strictly state-only.


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
