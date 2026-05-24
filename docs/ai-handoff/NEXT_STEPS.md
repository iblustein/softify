# Next Steps

This document outlines the goals and requirements for the next proposed development phase.

---

## Next Milestone: Phase 10.7 — Shopify Write Integrations & Live Theme/Catalog Sync

### Goal
Extend the Merchant Approvals queue by connecting approved state mutations directly to the live Shopify Admin REST/GraphQL APIs. Enable agents to push approved catalog updates and theme assets directly to live Shopify environments under secure tenant scopes.

### Requirements & Scope
1. **Live Shopify Mutation Client**:
   - Implement authentic Shopify Admin API write integration for `catalog.products.update` and `theme.assets.patch` in `src/server/services/shopify-admin-client.service.ts`.
   - Ensure all write operations utilize the decrypted access token resolved from `StoreRepository`.

2. **Decide & Commit Integrations**:
   - Update the approvals decide route (POST `/api/approvals/:id/decide`) in Firestore mode so that an approved request triggers real live Shopify API calls instead of just mock product snapshots updates.
   - Enforce secure transaction limits and retry logic.

3. **Incremental Catalog Sync Hook**:
   - Upon successful live product mutation, immediately trigger an incremental database product snapshot sync to ensure catalog fresh synchronization.

4. **Safety & Fallbacks**:
   - Provide a safe local fallback if Shopify Admin API returns a rate limit (HTTP 429) or connection error, transitioning the approval status cleanly to `FAILED` with details.
   - Implement automatic webhook notifications or sync alerts.

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
