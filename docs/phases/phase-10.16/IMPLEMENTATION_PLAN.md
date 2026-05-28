# Implementation Plan — Phase 10.16: MVP Pilot Launch & Merchant Onboarding Plan

This phase defines the operational launch strategies, environment restrictions, onboarding checklists, safety scope gating, manual validation steps, and telemetry parameters to execute the live MVP pilot of **Softify** under strict security and containment guardrails.

As a planning-only phase, no runtime source code modifications, deployment alterations, or active merchant onboarding executions are conducted in this step.

---

## 1. Pilot Objective

The core objective of **Phase 10.16** is to validate that the complete **Softify** platform operates successfully and safely under controlled, real-world pilot store connections. This phase is designed to prove that:
1. **Onboarding & Authentication**: A merchant can seamlessly trigger and complete the Shopify OAuth connection handshake.
2. **Readiness Verification**: Softify can dynamically execute store preflights, validating configurations and reporting correct connectedness status.
3. **Firestore Synchronization**: Store product snapshots can be synchronized recursively and safely from Shopify Admin APIs into Google Firestore.
4. **Controlled Catalog Workspace**: The catalog workspace can resolve installations and allow the production-safe catalog agents to perform diagnostic scans.
5. **No Auto-Execution**: Scanned recommendations and proposed actions are bridged correctly into the merchant approvals queue, ensuring approvals remain strictly merchant-in-the-loop.
6. **Explicit Gated Executions**: Committing an approved update to a real storefront is blocked unless required scopes (`write_products`) are explicitly resolved and approved by the merchant.
7. **Trace Log Security**: Analytics counts, chronological timelines, and execution audit logging remain fully read-only and sanitized of credentials, model reasoning, raw arguments, or PII.

---

## 2. Pilot Environment Decision

To guarantee zero database pollution or accidental production service disruption, pilot environments are restricted to the following boundaries:

- **Preferred Pilot Environment**: A dedicated, controlled **Shopify Partner Sandbox or Development Store** (e.g., `yambasurf-co-il.myshopify.com` or custom sandboxes).
- **Optional Controlled Real Store**: Moving the pilot to a real production merchant storefront is permitted *only* after obtaining explicit, separate, and written merchant authorization and gatekeeper approval.
- **No Uncontrolled Rollouts**: Uncontrolled public or broad merchant production rollouts are strictly prohibited in this phase.

---

## 3. Merchant Onboarding Checklist

This checklist defines the operational verification sequence to onboard a pilot store safely:

- [ ] **Shopify App Installation**: Complete app installation via Shopify Partners dashboard or app URL.
- [ ] **OAuth Completion**: Complete redirect loops and confirm successful access token decryption setup.
- [ ] **Store Connection Status**: Confirm connection registers status `CONNECTED` in Firestore collection `shopify_store_connections`.
- [ ] **Scope Verification**: Confirm granted scopes strictly match pilot parameters (`read_products`, `read_orders`, `read_customers`).
- [ ] **Readiness Endpoint Validation**: Query `GET /api/shop/readiness` and assert it returns connection metrics without leakages.
- [ ] **Product Sync Validation**: Trigger sync `/api/catalog/products/sync` and verify product snapshots are stored correctly in Firestore `product_snapshots`.
- [ ] **Agent Catalog Validation**: Query `GET /api/agents/catalog` and verify exactly five production-safe agents are visible.
- [ ] **Merchant Workspace Loading**: Open the React workspace dashboard (`AgentWorkspace.tsx`) and confirm active panels and onboarding checklists render successfully.
- [ ] **Analytics Dashboard Loading**: Open analytics drawer and verify aggregated metrics and audit steppers render under strict read-only parameters.
- [ ] **Audit Log & Telemetry Review**: Query the `agent_audit_logs` collection to confirm all onboarding logs are thoroughly sanitized.

---

## 4. Scope Policy for Pilot

Softify operates under a strict minimal API scope posture during the pilot launch:

### A. Default Scope Posture
- `read_products`: Strictly required to fetch catalog snapshots.
- `read_orders`: Required to parse read-only merchandising metrics.
- `read_customers`: Required to parse read-only buyer trends.

**No `write_products` scope is requested by default during onboarding.**

### B. Controlled Write Exception
- The plan reserves a **separately approved path** where a sandbox execution pilot store can request `write_products` *only* if the merchant explicitly approves it for mutation commits testing. Even with write permissions, all mutations are gated strictly by internal field limits.

### C. Explicitly Prohibited Scopes & Fields
- **No Theme Scopes**: `read_themes` and `write_themes` are strictly unauthorized.
- **No High-Risk Mutations**: Price, inventory, variants, media, or product `descriptionHtml` mutations are completely banned inside the Approved Product Mutation Executor.

---

## 5. Dev Bypass Policy for Pilot

- **Smoke-Test Execution Only**: The setting `SOFTIFY_ALLOW_AGENT_DEV_BYPASS="true"` is allowed *only* during automated deployment verification runs and must **never** be exposed as default merchant pilot behavior.
- **Merchant Exposure Gate**: Before exposing the pilot environment to merchant-facing access, the team must decide whether the dev bypass should be completely disabled or fully isolated from the runtime router.
- **Credential Integrity**: The dev bypass is acceptable *only* while protected by `SOFTIFY_AGENT_DEV_BYPASS_SECRET` dynamically resolved from Secret Manager. No bypass header tokens or secrets may ever appear in logged audits or public headers.

---

## 6. Merchant Workflow Validation Plan

The manual validation sequence for the pilot storefront consists of the following steps:

1. **Workspace Diagnostics**: Open the merchant app workspace and verify green `CONNECTED` status.
2. **Product Sync**: Trigger a manual catalog synchronization, confirming that snapshot totals populate in the database.
3. **Agent Catalog Verification**: Verify that the workspace displays exactly the five production-safe agents:
   - `Catalog Health`
   - `Product SEO`
   - `Catalog Cleanup`
   - `Merchandising Insights`
   - `Approval Operations`
4. **Diagnostic Scan**: Trigger a manual scan for each agent, confirming read-only metrics populate and legacy/unauthorized agents are hidden.
5. **Recommendation & Proposed Actions**: Confirm recommendations are successfully written to the inbox, and proposed actions are created in `DRAFT` state.
6. **Approval Bridging**: Click "Request Approval" to bridge draft actions to the approvals queue in `PENDING` state.
7. **Approvals Gating**:
   - Approve or reject items from the queue detail drawer.
   - **No Auto-Execution**: Confirm that approving an item changes its status to `APPROVED` but performs **no automatic storefront writes**.
8. **Execution Gating**: Trigger manual execution and verify that the commit is successfully completed in write-allowed stores, or blocked with an amber "Mutations Blocked" banner if the store lacks `write_products` scope.

---

## 7. Operational Telemetry Checklist

During the pilot, operators must monitor telemetry channels to guarantee performance and security:

- [ ] **Cloud Run Health**: Watch CPU, memory limits, and container restarts in the GCP Console.
- [ ] **Firestore Performance**: Monitor collection write latencies and document read capacities.
- [ ] **Agent Audit Logs**: Verify that all runs populate the `agent_audit_logs` collection cleanly.
- [ ] **Gateway Allowed/Blocked Auditing**: Inspect `Tool Gateway` logs to verify that unallowlisted tool calls are blocked.
- [ ] **State Transition Audits**: Verify chronological state transition events (`APPROVAL_CREATED`, `APPROVAL_APPROVED`, etc.).
- [ ] **Sanitized Trace Timelines**: Confirm that the workspace analytics timeline mappers strip all raw developer inputs, prompts, reasoning steps, variants, secrets, or customer PII.

---

## 8. Pilot Stop / Rollback Conditions

The pilot must be immediately suspended and rolled back to a safe revision if any of the following occur:

- **Cross-Tenant Escalation**: Any event indicating a tenant isolation boundary failure.
- **Secrets Exposure**: Any leak of access tokens, api secrets, encryption keys, or bypass tokens in trace timelines or logs.
- **Raw Telemetry Leak**: Raw user prompts, model chains-of-thought, or raw Shopify payloads visible in analytics drawers.
- **Misgated Write Attempt**: Any automatic write, unauthorized mutation attempt, or mutation outside allowlisted fields.
- **Auto-Execution Detection**: Any scenario where approving a proposed action triggers automatic storefront execution without explicit merchant dispatch.
- **Theme Scope Detection**: Any reference to `read_themes`, `write_themes`, or theme assets tools inside the runtime Gateway.
- **Memory Backend in Prod**: Any deployment instance of Cloud Run initializing with `REPOSITORY_BACKEND=memory` in a pilot environment.
- **Execution State Mismatches**:Misleading approvals queue statuses or concurrency locks failures.

---

## 9. Merchant Feedback Collection

We will collect targeted feedback from pilot users covering:
- **Onboarding Clarity**: Was the Shopify connection process clear?
- **Readiness Checklist**: Did the setup dashboard card clearly explain scope requirements?
- **Agent Usefulness**: Did the five catalog agents address real merchant synchronization problems?
- **Recommendation Quality**: Were recommendations accurate, relevant, and trust-safe?
- **Approval UX**: Was the Approvals Inbox detail drawer intuitive to manage?
- **Safety Perception**: Did the manual execute gates and amber mutation warnings provide a strong sense of security control?

---

## 10. Documentation Deliverables for Phase Closeout

Following the completion of the Phase 10.16 operational reviews and plan validations, we will prepare the following closeout deliverables:
- `docs/phases/phase-10.16/WALKTHROUGH.md`
- `docs/phases/phase-10.16/VERIFICATION.md`
- `docs/phases/phase-10.16/REVIEW_NOTES.md` (following ChatGPT sign-off)
- `/docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`
- `/docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md`
- `/docs/ai-handoff/NEXT_STEPS.md`
- `/docs/PHASE_INDEX.md`

---

## 11. Preserved Core Guardrails & Constraints

During this planning phase and the subsequent pilot executions, the following core security boundaries are strictly preserved:

1. **AI Statelessness**: AI engines function purely as stateless recommendation advisors. They **must never have direct access to write tools, token decryptors, database writes, or live Shopify APIs**.
2. **Unified Tool Gateway**: All tool dispatches are mediated through the centralized Tool Gateway, checking `allowedTools`, tenant scopes, allowed field policies, and scrubbing raw payloads.
3. **No Theme mutations**: Theme asset mutations are completely disabled (`read_themes` and `write_themes` remain strictly unauthorized).
4. **Gated Mutations Capping**: Storefront writes are strictly limited to text fields (`title`, `vendor`, `productType`, `status`, `tags`).
5. **No Auto-Execution**: Manual merchant trigger is authoritatively required for all Shopify mutation dispatches.
6. **Data Containment**: Zero raw prompts, model chain-of-thought, or raw Shopify details can be logged or exposed.
7. **Tenant Context Normalization**: All audits, approvals, runs, and snapshots check tenant ownership strictly.
