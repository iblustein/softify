# Next Steps

This document outlines the goals and requirements for the next proposed development phase.

---

## Next Milestone: Phase 10.9 — Multi-Agent Product Workspace Foundation

### Goal
Build the first real product workspace layer for Softify, productizing the existing safe agent foundation without expanding dangerous mutation capabilities. Merchants/admins can see available agents, launch safe tenant-scoped agent workspace runs, view active diagnostic recommendations and proposed draft updates, and safely request merchant approvals.

### Requirements & Scope
1. **Agent Catalog / Registry**:
   - Expose `GET /api/agents/catalog` listing the 4 available agents, their descriptions, risk levels, and required scopes.
2. **Agent Run Tracking**:
   - Record and query running/completed runs under Firestore/InMemory fallbacks (`POST /api/agent-runs`, `GET /api/agent-runs`, `GET /api/agent-runs/:id`).
3. **Recommendations Center**:
   - Expose diagnostics inbox endpoints with interactive dismiss actions (`GET /api/recommendations`, `POST /api/recommendations/:id/dismiss`).
4. **Proposed Actions Queue & Approval Bridging**:
   - Expose draft actions (`GET /api/proposed-actions`, `POST /api/proposed-actions/:id/dismiss`) that can be safely bridged to the global approvals pipeline via `POST /api/proposed-actions/:id/request-approval` without expanding field scope.
5. **CI/CD Index Automation**:
   - Configure a native `gcloud firestore indexes import` pipeline step inside GitHub Actions to automate deployment before smoke tests run.

> [!IMPORTANT]
> **Implementation Boundaries**:
> - Antigravity must **not** implement Phase 10.9 code or modify actual backend/frontend logic until the implementation plan is explicitly reviewed and approved by the Architecture Supervisor.
> - Phase 10.9 **must not expand mutation scope** beyond the existing text fields (`title`, `vendor`, `productType`, `status`, `tags`).
> - No theme tools, no `write_themes`, no price/inventory/variant/media/descriptionHtml mutations, and no auto-execution are allowed. All recovery endpoints remain strictly state-only.

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
