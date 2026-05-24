# Next Steps

This document outlines the goals and requirements for the next proposed development phase.

---

## Next Milestone: Phase 10.6 — Merchant Approvals & Mutation Tools Foundation

### Goal
Introduce mutation (write) capabilities to the AI Agent platform, strictly protected by an asynchronous merchant-in-the-loop approval pipeline. No store modifications can be committed to Shopify without explicit shop owner authorization.

### Requirements & Scope
1. **Mutation/Write Tools**:
   - Register basic mutation tools (e.g. `catalog.products.update` or `theme.assets.patch`) in the catalog definitions, marked with high risk levels.
   - Do NOT run them directly; intercept them inside the Tool Gateway.

2. **Asynchronous Approvals Queue**:
   - Design a Firestore collection `merchant_approvals` to track proposed changes.
   - When a mutation tool is invoked by an agent, pause execution, prepare a structured `ApprovalRequest` record containing before/after diff states, a summary explanation, and status `PENDING`, and return a standard `APV-XXX` reference ID.
   
3. **Approval API Endpoints**:
   - Implement GET `/api/approvals` (tenant-isolated list of pending/resolved approval requests).
   - Implement POST `/api/approvals/:id/decide` to allow the merchant to approve or reject the request.
   - Upon explicit approval, apply the changes to the mock product store or patch the theme securely.

4. **Audit Trail Synchronization**:
   - Write audited events for `APPROVAL_CREATED` and `APPROVAL_DECISION` (approved/rejected outcome) to the `agent_audit_logs` collection using the async `writeAuditEvent` framework.

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
