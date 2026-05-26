# Next Steps

This document outlines the goals and requirements for the next proposed development phase.

---

## Next Milestone: Phase 10.11 — MVP End-to-End Merchant Workflow Hardening

### Goal
Harden the core MVP merchant workflow to ensure a highly stable, secure, and demo-ready end-to-end loop. The priority is user experience clarity, error resilience, empty-state guidance, and operational assurance across the entire pipeline:
  Run Agent
  → Review Recommendation
  → Review Proposed Action
  → Request Approval
  → Approve
  → Explicitly Execute
  → See Result
  → See Audit / Timeline / Analytics Update

### Scope & Requirements (Proposed)
1. **End-to-End Workflow Hardening**:
   - Ensure the full loop from agent run diagnostics to live catalog write executions operates safely, transactionally, and predictably.
2. **UX Clarity & Operational Guidance**:
   - Improve visual states throughout the workspace: clear empty states, descriptive error boundaries, dynamic success states, and informative step-by-step guidance.
   - Refine recommendations, proposed actions, merchant approvals, execution trackers, and analytics views to represent a coherent, cohesive workflow.
3. **Demo & Pilot Readiness**:
   - Prepare the application for stable merchant demonstration, verifying edge cases in context resolution, and providing seamless visual recovery flows.
4. **Preserved Mutation Scope**:
   - Ensure mutation scope remains strictly capped to approved text fields (`title`, `vendor`, `productType`, `status`, `tags`).

### Deferrals & Boundaries
The following features are explicitly deferred to later phases:
- **Bulk Operations**: Batch dismiss, batch request approval, batch approve, and batch execute are strictly deferred.
- **Automated Operations**: Auto-execution on approval is prohibited.
- **Theme Capabilities**: No theme tools, no `read_themes`, and no `write_themes` permissions.
- **Mutation Scope Expansion**: Price, inventory, variant, media, and descriptionHtml mutations remain strictly disallowed.

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
