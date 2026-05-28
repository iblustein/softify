# Phase 10.16 Walkthrough — MVP Pilot Launch & Merchant Onboarding Plan

This walkthrough details the objectives, operational strategies, and guardrail structures established during the planning phase of **Phase 10.16**. It acts as a comprehensive reference guide for operators and security gatekeepers navigating the MVP pilot documentation package.

---

## 1. Phase 10.16 Objectives & Current State

### A. Core Intent of Phase 10.16
Phase 10.16 establishes the operational blueprint and readiness parameters for executing the first live MVP pilot of Softify. The primary objectives are:
* **OAuth Integrity**: Verify that store onboarding and Shopify OAuth loops function correctly under controlled access parameters.
* **Preflight Readiness**: Ensure the setup readiness panel dynamically validates API configurations and scope status.
* **Snapshot Storage**: Confirm that metadata sync operations populate Firestore snapshot collections securely without payload leaks.
* **Controlled Agent Catalog**: Bind the dashboard strictly to the five production-safe agents, hiding legacy or development-only tools.
* **Merchant-in-the-Loop Approvals**: Ensure all diagnostic recommendations populate the inbox in a `DRAFT` state and must be manually approved.
* **Execution Containment**: Guarantee storefront mutation execution remains blocked under default read-only scopes, displaying clear amber warnings.
* **Sanitized Diagnostics**: Verify that all telemetry audits, status payloads, and chronological timelines are thoroughly scrubbed of credentials, model reasoning, raw arguments, or PII.

### B. Current State
> [!IMPORTANT]
> **PLANNING AND DOCUMENTATION-ONLY STATUS**
> Phase 10.16 is currently restricted strictly to operational planning and documentation review. No runtime source code modifications, deployment updates, Shopify scope expansions, live merchant onboarding actions, or production pilot runs have been conducted in this step.

---

## 2. Approved Pilot Documentation Package

The Phase 10.16 operational package comprises five central planning resources:

1. **[IMPLEMENTATION_PLAN.md](file:///c:/Projects/softify/softify/docs/phases/phase-10.16/IMPLEMENTATION_PLAN.md)**: Defines the primary technical boundaries, scope policies, dev bypass regulations, workflow stages, telemetry checks, stop conditions, and closeout parameters.
2. **[PILOT_RUNBOOK.md](file:///c:/Projects/softify/softify/docs/phases/phase-10.16/PILOT_RUNBOOK.md)**: Provides step-by-step procedures for operators to initialize connections, verify sync performance, evaluate agent execution, test read-only gating, and invoke rollback steps.
3. **[MERCHANT_ONBOARDING_CHECKLIST.md](file:///c:/Projects/softify/softify/docs/phases/phase-10.16/MERCHANT_ONBOARDING_CHECKLIST.md)**: Sets a standard sequential checklist for operators to verify installation, complete readiness checks, confirm agent provisioning, and enforce storefront boundaries.
4. **[PILOT_VALIDATION_MATRIX.md](file:///c:/Projects/softify/softify/docs/phases/phase-10.16/PILOT_VALIDATION_MATRIX.md)**: Acts as a structured test ledger specifying required assertions, expected behaviors for all agents/endpoints, and evidence to capture (e.g. JSON schemas, UI screenshots).
5. **[MERCHANT_FEEDBACK_TEMPLATE.md](file:///c:/Projects/softify/softify/docs/phases/phase-10.16/MERCHANT_FEEDBACK_TEMPLATE.md)**: Contains structured Q&A and ratings prompts to gather qualitative feedback on setup friction, recommendation quality, approvals trust, and UX clarity.

---

## 3. How to Use the Documentation Package

### A. Operator Guidance for PILOT_RUNBOOK.md
Operators must execute pilot steps sequentially:
* **Preflight**: Verify release checks (58/58) and compiler types are fully healthy before initiating connection. Confirm that `REPOSITORY_BACKEND` resolves to `firestore` and `NODE_ENV` is set to `production`.
* **Sync Verification**: Observe backend counts in `product_snapshots` rather than looking at raw Shopify payloads or console chunks.
* **Containment Verification**: Confirm that clicking "Execute Commit" on a read-only store returns `EXECUTION_BLOCKED` and presents the amber alert banner.

### B. Executing the MERCHANT_ONBOARDING_CHECKLIST.md
Onboarding personnel should tick items off only after confirming the objective backend state:
* Do not mark Step 2 (OAuth) complete until the connection document is verified inside the `shopify_store_connections` Firestore collection.
* Verify Step 7 (Agent Provisioning) by visually checking that the catalog workspace loads exactly five production-safe agents (`Catalog Health`, `Product SEO`, `Catalog Cleanup`, `Merchandising Insights`, `Approval Operations`) and hides all others.

### C. Recording Evidence in the PILOT_VALIDATION_MATRIX.md
Operators must collect concrete evidence for each validation row:
* Capture logs showing gateway allowlist filtering when test runs occur.
* Record screenshots of the amber block warnings for read-only stores.
* File the diagnostic JSON responses to verify that no sensitive fields (e.g., tokens or internal prompts) are leaked.

### D. Collecting Feedback via MERCHANT_FEEDBACK_TEMPLATE.md
* Issue the template to the merchant immediately upon completing workspace exploration.
* Pay close attention to answers regarding the safety perception of the manual approvals list and the clarity of the amber block panel.

---

## 4. Pilot Scopes and Separately Approved Paths

The pilot explicitly defines two distinct operational paths:

| Path Name | Allowed Scopes | Description & Behavior | Mutation Status |
| :--- | :--- | :--- | :--- |
| **Default Read-Only Pilot Path (Standard)** | `read_products`, `read_orders`, `read_customers` | The standard onboarding posture for the pilot. Retains compatibility with read-oriented workflows while completely blocking live mutations. | **BLOCKED**: Execution commits fail; amber banner is displayed. |
| **Separately Approved Sandbox Path** | `read_products`, `write_products`, `read_orders`, `read_customers` | Allowed strictly in controlled developer sandbox stores after explicit, separate merchant authorization. | **ENABLED**: Writes are strictly capped to the current per-agent allowed fields, such as title where permitted, vendor, productType, status, and tags. Field permissions are strictly enforced per agent. |

---

## 5. Development Bypass Policy

To preserve credential security and ensure the pilot environment remains clean:
* **Smoke Testing Only**: Setting `SOFTIFY_ALLOW_AGENT_DEV_BYPASS="true"` is restricted to automated CI/CD deployment checks and must never be active for normal merchant onboarding.
* **Isolation Gate**: Before opening the system to live merchants, the bypass must be disabled or completely isolated from active routing layers.
* **Log Sanitation**: The bypass secret (`SOFTIFY_AGENT_DEV_BYPASS_SECRET`) must be resolved from Secret Manager. No bypass keys or tokens should ever be printed in logs or public request headers.

---

## 6. Stop / Rollback Conditions

Operators must instantly halt the pilot and route 100% of traffic back to the stable preceding Cloud Run revision if any of the following occur:
* **Isolation Breaches**: Any instance of cross-tenant data access or mismatched tenant headers.
* **Secrets Leakage**: Exposed API tokens, encryption keys, or developer secrets in logged outputs.
* **Raw Prompt Exposure**: Raw AI provider developer prompts or model chains-of-thought visible in user-facing components.
* **Automatic Writes**: Any write attempt launched automatically without explicit merchant trigger and dispatch.
* **Theme Activity**: Any detection of `read_themes` or `write_themes` tools inside the unified Tool Gateway.
* **Memory Database in Production**: Any instance where the container boots using `REPOSITORY_BACKEND=memory` in the active environment.

---

## 7. Preserved Softify Guardrails

Throughout Phase 10.16 planning and subsequent pilot iterations, the core architectural guardrails remain absolutely intact:
* **Stateless Recommendation Engines**: AI providers function strictly as offline advisors. They possess no direct database write paths, token access, or live API credentials.
* **Unified Tool Gateway**: All tool execution requests are validated dynamically against `allowedTools`, user tenant, and field policies, stripping unallowlisted keys.
* **Strict Mutation Capping**: Write commits are restricted to the current per-agent allowed metadata fields, including title only where the agent policy permits it, and vendor, productType, status, or tags where permitted.
* **Price/Inventory Protection**: Price, inventory, variant, product media, and product `descriptionHtml` mutations are strictly rejected by the executor.
* **Theme Protection**: Zero theme asset read or write capabilities are authorized.
* **Tenant Isolation**: Deep multi-tenant separation is checked strictly at the service and data layers before any database or gateway transaction.
