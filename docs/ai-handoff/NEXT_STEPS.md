# Next Steps

This document outlines the goals and requirements for the next proposed development phase.

---

## Next Milestone: Phase 10.12 — Production Bulk Operations Foundation

### Goal
Define and implement secure, throttled, and transactional bulk/batch operational capabilities in the Softify multi-agent workspace. After hardening the end-to-end manual loop in Phase 10.11, the platform is ready to evaluate batch utilities while preserving strict tenant isolation and merchant safety controls.

### Scope & Requirements (Proposed)
1. **Safe Bulk Handshake**:
   - Introduce secure merchant-initiated batch approvals (`POST /api/approvals/batch-decide`) and batch execution (`POST /api/approvals/batch-execute`) routes.
2. **Rate-Limiting & Concurrency Control**:
   - Implement queue throttling in the execution pipeline to prevent API limit exhausts or rate-limit blocks on Shopify admin channels.
3. **Workspace Batch Actions**:
   - Enable batch request approval (`POST /api/proposed-actions/batch-request-approval`) and batch dismissal (`POST /api/proposed-actions/batch-dismiss`) in the frontend workspace.
4. **Preserved Mutation Scope**:
   - Ensure mutation scope remains strictly capped to approved text fields (`title`, `vendor`, `productType`, `status`, `tags`). No price, variant, inventory, media, or descriptionHtml mutations.

### Deferrals & Boundaries
The following features remain strictly out-of-scope:
- **Auto-Execution**: Automatic execution on approval is prohibited.
- **Theme Capabilities**: No theme tools, no `read_themes`, and no `write_themes` permissions.
- **Direct AI mutations**: AI provider runtime may never invoke write tools directly on live stores; mutations must go through the merchant proposal and approval execution pipelines.

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
