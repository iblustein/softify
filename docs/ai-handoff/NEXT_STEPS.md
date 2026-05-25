# Next Steps

This document outlines the goals and requirements for the next proposed development phase.

---

## Next Milestone: Phase 10.8 — Real-time Webhook Synchronization & Extended Field Mutations

### Goal
Extend the safe approved execution pipeline with real-time sync capabilities using Shopify Webhooks to capture external store changes, and expand allowed product fields (e.g. description updates) safely.

### Requirements & Scope
1. **Shopify Webhook Receiver**:
   - Create a secure webhook receiver endpoint `POST /api/shopify/webhooks/product-update`.
   - Validate Shopify webhook signatures (`X-Shopify-Hmac-SHA256`) to ensure authenticity.
   - Parse incoming webhook payloads and update matching `product_snapshots` records in the database.

2. **Description & Safe Extended Catalog Fields**:
   - Carefully extend the allowed fields collection to support `descriptionHtml` under strict sanitization policies (e.g. clean HTML tag parsing/stripping, strictly prohibiting `<script>` or event handlers).
   - Ensure the new field propagates through the proposal, approval, and execution boundaries.

3. **Merchant Webhook/App UI Execution Log**:
   - Provide visual audit trails and detailed execution state readouts (`EXECUTING`, `APPLIED`, `FAILED` with sanitized reason) in the merchant dashboard UI.

4. **Retry Mechanics for Transient Errors**:
   - Introduce a basic retry policy for transient execution errors (like Shopify Admin API rate limits or HTTP 502/503 network drops) to safely defer and re-attempt execution.

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
