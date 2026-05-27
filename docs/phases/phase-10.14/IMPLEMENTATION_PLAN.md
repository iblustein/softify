# Implementation Plan — Phase 10.14: Initial Agent Set & Merchant Workflows (Refined)

This phase prepares **Softify** for its first real-store product slice by defining, configuring, and verifying the **initial production-safe agent set** and **merchant workflows**. Rather than expanding raw write/mutation scopes, Phase 10.14 focuses on catalog visibility, informational SEO, clean operational boundaries, and a highly understandable user experience.

---

## 1. Current Platform State (Through Phase 10.13)

Prior phases have established a robust, enterprise-grade architecture with rigid security boundaries:
1. **Tenant-Safe Shopify Context**: Safe token decryption, normalized shop lookups, and strict context resolution preventing cross-tenant leakage.
2. **Stateless Agent Runtime**: Pluggable AI engine abstractions where agents act solely as stateless advisors with zero direct write capabilities.
3. **Centralized Tool Gateway**: Authoritative permission engine that intercepts mutation tools (`catalog.products.propose_update`) and generates approval requests.
4. **Agent Installations**: Store-level activation registers that provision tools per agent instance.
5. **Product Intelligence**: Highly tailored heuristic insights calculations (health scoring, tag compliance, top vendors summaries).
6. **Merchant-in-the-Loop Approvals**: Proposed action queues allowing merchants to request approvals, decide (approve/reject), and execute commits.
7. **Explicit Mutation Execution**: Atomic execution claims (`APPROVED` -> `EXECUTING`) mediating live writes strictly through `ApprovedProductMutationExecutorService` on allowed text fields.
8. **Operator Recovery Utilities**: Stuck-execution timeout monitoring (15-minute defaults) and state-only recovery endpoints.
9. **Workspace Analytics**: Read-only dashboard analytics summaries and chronological trace timelines.
10. **Production Bulk Operations**: Batch approvals decision loops, dismissal queues, and throttled sequential live executions (500ms safety delays).
11. **Real-Store Diagnostics**: Tenant-safe, read-only diagnostics API (`GET /api/shop/readiness`) driving the interactive Store Setup Checklist dashboard panel.

---

## 2. Phase 10.14 Goal

The goal of Phase 10.14 is to **define and deploy the initial production-safe agent catalog for the first production-ready product slice and formalize explicit merchant workflows**.

### Important Boundaries
- **No new mutation scopes**: Core mutator limits remain strictly capped to text fields: `title`, `vendor`, `productType`, `status`, and `tags`.
- **No automatic execution**: Silent background catalog writes remain strictly forbidden. Every change requires merchant initiation and approval execution.
- **Merchant clarity first**: Make Softify incredibly intuitive and useful by grouping capabilities into clear, dedicated agent personas with explicit purposes, risk profiles, and disabled/blocked overlays.
- **Legacy Agent Handling**: Do not physically delete existing agent definitions. Instead, disable, hide, or mark legacy/development agents as unavailable for production catalog display.

---

## 3. Initial Agent Set

We replace the old development placeholders by exposing exactly five production-safe, highly-focused agent personas:

### A. Catalog Health Agent
- **ID**: `agent_catalog_health`
- **Purpose**: Identify catalog quality deficiencies and missing product data to establish a structural health baseline.
- **Expected Heuristics**:
  - Scan product snapshots to find missing images, undefined vendors, missing types, or lack of classification tags.
  - Compute overall catalog health score using standardized rule deductions.
- **Per-Agent Field Policy**:
  - Propose Title, Vendor, ProductType, and Tags.
  - **Status is excluded** (not essential for health evaluations).
- **Forbidden Fields**: `status`, `price`, `inventory`, `variants`, `media` (direct image uploads), `descriptionHtml`, themes.

### B. Product SEO Agent
- **ID**: `agent_product_seo`
- **Purpose**: Improve discoverability and semantic search optimization within current safe mutation bounds.
- **Expected Heuristics**:
  - Analyze product titles for character length optimization (aiming for 20-70 characters).
  - Suggest descriptive qualifiers and clean categorization tags.
- **Per-Agent Field Policy**:
  - **Propose Title, ProductType, and Tags only**.
- **Forbidden Fields**: `vendor`, `status`, `SEO metafields`, `meta title`, `meta description`, `handle / URL`, `descriptionHtml`, `price`, `inventory`, `variants`, `media`, themes.

### C. Catalog Cleanup Agent
- **ID**: `agent_catalog_cleanup`
- **Purpose**: Normalize messy catalog hierarchies, taxonomy, and archiving states.
- **Expected Heuristics**:
  - Detect casing inconsistencies (e.g. `nike` vs `Adidas`), mismatched vendors, spelling variants, and duplicate-like tags.
  - Identify stale or inactive products that should be transitioned to archived/draft states.
- **Per-Agent Field Policy**:
  - **Propose Vendor, ProductType, Status, and Tags only**.
  - **Title is strictly excluded** (must not propose titles; SEO agent owns title overrides).
- **Forbidden Fields**: `title`, `price`, `inventory`, `variants`, `media`, themes.

### D. Merchandising Insights Agent
- **ID**: `agent_merchandising_insights`
- **Purpose**: Provide read-only business summaries and distribution matrices.
- **Expected Heuristics**:
  - Group catalog counts by vendor, productType, and status.
  - Surface products with low data freshness or stale synch histories.
- **Per-Agent Field Policy**:
  - **Read-Only only**. No proposed actions or catalog mutations.
- **Forbidden Fields**: All storefront writes.

### E. Approval Operations Agent
- **ID**: `agent_approval_operations`
- **Purpose**: Serve as a structural guide to help merchants manage active workflows and system parameters.
- **Expected Heuristics**:
  - Scans active `merchant_approvals` to summarize pending items, approved actions, and execution history.
  - Detects blocked execution states or missing permission scopes (especially `write_products`).
  - Identifies failed or stuck execution attempts and provides manual troubleshooting recovery advice.
- **Per-Agent Field Policy**:
  - **Read-Only operational summaries only**. No proposed actions, decisions, executions, or recovery mutation actions.
- **Forbidden Routes**: This agent is strictly an assistant and must never invoke decide (`/decide`), execute (`/execute` or `/batch-execute`), or recovery (`/reset-failed` or `/mark-execution-failed`) routes.

---

## 4. Explicitly Deferred Agents (Out of Scope)

The following agents remain deferred to protect storefront integrity and enforce clear operational bounds for the first production-ready product slice:

| Deferred Agent | Reason for Deferral | Missing Prerequisite Scopes / Scopes Blocked | Risk Level |
| :--- | :--- | :--- | :--- |
| **Theme Agent** | Interfering with visual CSS/HTML layouts is high-risk and decoupled from product inventory metadata. | `read_themes`, `write_themes` (Strictly Forbidden) | High |
| **Pricing Agent** | Price modifications directly affect checkout values and require distinct atomic guardrails and multi-currency controls. | `write_products` (Requires separate price/variant logic) | Critical |
| **Inventory Agent**| Real-time inventory shifts are handled by dedicated WMS systems. Direct agent-triggered inventory adjustments risk supply chain sync errors. | `write_inventory` (Requires inventory adjustments scope) | Critical |
| **Media Agent** | Direct binary image uploads/deletions require substantial backend CDN asset handling. | `write_products` (Requires CDN media capabilities) | High |
| **Customer Support Agent**| Interacting with customer details or orders involves high-exposure PII and direct transactional impact. | `read_customers`, `write_orders` (PII Containment bounds) | Critical |
| **Auto-Optimization Agent**| Background execution violates the core "manual merchant-in-the-loop" safety constraint. | Unified Auto-Execution framework | High |
| **Customer Data Agent** | Direct PII manipulation is out-of-scope to prevent compliance leaks. | `read_customers`, `write_customers` | Critical |
| **Order Mutation Agent** | Order adjustments, mutations, or shipping modifications require separate accounting workflows. | `write_orders` | Critical |

---

## 5. Agent Capability Matrix

| Agent Name | Business Value | Read-Only Tools | Proposal Tools | Execution Capability | Allowed Fields | Required Scopes | Risk Level | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Catalog Health** | Surfaces data gaps and image holes. | `catalog.insights.health`, `catalog.insights.missing_images` | `catalog.products.propose_update` | Approval-Gated | `title`, `vendor`, `productType`, `tags` | `read_products` | Medium | **P0 (First Real-Store Product Slice)** |
| **Product SEO** | Standardizes catalog naming to boost search metrics. | `catalog.insights.health` | `catalog.products.propose_update` | Approval-Gated | `title`, `productType`, `tags` | `read_products` | Low | **P0 (First Real-Store Product Slice)** |
| **Catalog Cleanup**| Normalizes spelling, casing, and tag mess. | `catalog.insights.vendor_summary` | `catalog.products.propose_update` | Approval-Gated | `vendor`, `productType`, `status`, `tags` | `read_products` | Low | **P0 (First Real-Store Product Slice)** |
| **Merchandising Insights**| Provides catalog taxonomy structural summaries. | `catalog.insights.vendor_summary` | None | **None (Read-Only)** | None | `read_products` | Low | **P1** |
| **Approval Operations**| Explains queue states, block exceptions, and errors. | Read-Only Audit / Approvals / Analytics summaries | None | **None (Read-Only)** | None | None | Low | **P1** |

---

## 6. Merchant Workflows

### Workflow 1: Store Readiness Review
1. Merchant opens Softify Control Center.
2. The dynamic **Store Readiness panel** displays current setup indicators:
   - OAuth active (`CONNECTED`)
   - Scopes verified (`read_products`, and optionally `write_products`)
   - Product Sync Freshness (green if < 24h, amber warnings if stale)
   - Snapshot availability (total Firestore cache records)
   - Active agents provisioned
3. If `write_products` is missing, the dashboard alerts the merchant that they are operating in **Read-Only Insights Mode** (mutations disabled).

### Workflow 2: Catalog Health Scan
1. Merchant navigates to **Multi-Agent Workspace**, selects the **Catalog Health Agent**, and clicks **"Launch Diagnostic Scan"**.
2. Agent scans product snapshots, calculates a Catalog Health Score, and writes open recommendations inside the dashboard.
3. The proposed actions list populates with structured tag improvements and product type normalizations.
4. Merchant reviews actions side-by-side, clicks **"Request Approval"**, transitioning drafts to the **Merchant Approval Queue**.
5. Merchant enters the queue, reviews details, approves the items, and clicks **"Execute Live Commit"** (requires explicit write access).
6. Merchant views updated snapshot metrics and sync freshness in the chronological audit timeline.

### Workflow 3: SEO Improvement Review
1. Merchant launches the **Product SEO Agent** workspace scan.
2. Agent identifies titles exceeding 70 characters.
3. Proposes optimized title and type options (excluding meta title, descriptionHtml, or handle).
4. Merchant reviews comparisons, approves the updates, and commits the clean titles directly to Shopify.

### Workflow 4: Catalog Cleanup Review
1. Merchant launches the **Catalog Cleanup Agent** scan.
2. Agent groups casing variants and surfaces messy tag structures.
3. Proposes normalization updates, which may include archiving state transitions (status to `DRAFT` or `ARCHIVED`).
4. **Status Change Guard**: Because changing status affects product visibility on the live store, the UI displays a high-impact orange status warning banner during review.
5. Merchant batch-approves the safe taxonomy/status fixes and triggers explicit execution.

### Workflow 5: Operational Queue Review
1. Merchant selects the **Approval Operations Agent** inside the Workspace.
2. The agent provides a structured analysis of the queue (e.g. 3 PENDING, 1 BLOCKED, 1 FAILED).
3. If an action is `BLOCKED`, the agent renders an amber-tinted warning explaining: *"This mutation is blocked because your Shopify connection is missing the write_products scope. Re-authorize to enable live commits."*
4. If an action has `FAILED`, the agent lists operator recovery cues and guides the merchant on troubleshooting retries.

---

## 7. Tool and Permission Policy

We establish a strict permission scheme mapping agents to allowed tools and scope boundaries. Under no circumstances can an unauthorized tool be executed by the gateway.

### Permission Mapping Table

| Agent ID | Allowed Tools | Disallowed Tools | Required Scopes | write_products Needed for Execution? | What if write_products is Missing? | Proposed Actions Allowed without write_products? | Execution Blocked? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `agent_catalog_health` | `catalog.insights.health`, `catalog.insights.missing_images`, `catalog.insights.missing_tags`, `catalog.products.propose_update` | Theme tools, order tools, status mutation tools | `read_products` | **Yes** | Displays "Mutations Blocked (Read-Only)" in approval queue. | **Yes** (Drafts & approvals can be created) | **Yes** |
| `agent_product_seo` | `catalog.insights.health`, `catalog.products.propose_update` | Theme tools, order tools, status mutation tools, SEO metafield tools | `read_products` | **Yes** | Execute commits are disabled. | **Yes** | **Yes** |
| `agent_catalog_cleanup`| `catalog.insights.vendor_summary`, `catalog.products.propose_update` | Theme tools, order tools, title proposal tools | `read_products` | **Yes** | Execute commits are disabled. | **Yes** | **Yes** |
| `agent_merchandising_insights`| `catalog.insights.vendor_summary` | `catalog.products.propose_update`, theme/order tools | `read_products` | **No** | Operates normally (insights scan). | **No** (Tool is disallowed) | **N/A** (Cannot execute mutations) |
| `agent_approval_operations`| Safe read-only audit/approvals/analytics summary query utilities | `catalog.products.propose_update`, all mutation/decide/execute tools | None | **No** | Operates normally (reads approvals/audits). | **No** | **N/A** |

---

## 8. UX Implications

To ensure ultimate merchant transparency, the frontend UIs in `AgentWorkspace.tsx` and `ApprovalQueue.tsx` will be refined:
1. **Agent Purpose & Persona Cards**: Display a clean grid listing the five initial agents. Each card badges its `Purpose`, `Risk Level` (Low/Medium/Read-Only), and current `Availability` based on store scopes.
2. **Access Gating & Banners**: 
   - If an agent requires `write_products` but the store connection lacks it, display an explicit **"Read-Only Insights Mode Active"** banner.
   - Re-authorize call-to-actions are displayed to help merchants provision the correct permissions easily.
3. **Execution Block Warnings**:
   - Instead of displaying a clickable commit button that later fails, the UI replaces the commit button with an amber-tinted **"Mutations Blocked"** warning badge.
   - Displays a tooltip: *"This store connection was authorized with read-only scopes. Real-store catalog updates are disabled. Please re-authorize Softify with write scopes to commit changes."*
4. **Status Change Guard**:
   - For proposed actions from the `Catalog Cleanup Agent` that transition a product's status, render a prominent orange banner in the list: `[Warning: Shifting Status to ARCHIVED/DRAFT will instantly hide this product from your storefront]`.
5. **Clear Action Statuses**: Every checklist item explicitly flags its capability profile: `[Insights Scanning]`, `[Proposal Only]`, `[Approval Gated Commit]`, or `[Operational Helper]`.

---

## 9. Security and Guardrail Preservation

We strictly enforce all architectural boundaries:
- **No direct AI-to-Shopify path**: AI providers never invoke writes directly.
- **No direct AI-to-tool execution path**: AI providers do not invoke tools directly. All tool access must pass through Softify’s controlled runtime / Tool Gateway boundaries. Mutation/proposal tools may only create proposed actions and approval-gated workflows. Read-only tools may return sanitized insights or operational summaries without creating approvals, provided they remain tenant-safe and do not expose raw payloads, secrets, prompts, provider output, model reasoning, tokens, or PII.
- **Stateless AI Engines**: AI models remain recommendation engines without storefront write capability.
- **Tenant Isolation Assertions**: Every route checks, locks, and asserts organization context. Mismatched tenant IDs trigger `403 Forbidden` early.
- **No Secrets Exposure**: Zero raw decrypted tokens, OAuth client secrets, raw tool arguments, prompts, or model reasoning are returned in APIs or logged audits.
- **No Forbidden Fields / Scopes**: Price, inventory, variants, media, descriptionHtml, and themes mutations remain absolutely blocked. Theme scopes (`read_themes`, `write_themes`) are forbidden.

---

## 10. Proposed Implementation Sequence

We break Phase 10.14 implementation into sequential, verifiable steps:

### Step 1: Update Agent Registry & Gating
- Modify `src/server/services/agent-registry.service.ts` to replace placeholder agents with the initial production-safe set (`agent_catalog_health`, `agent_product_seo`, `agent_catalog_cleanup`, `agent_merchandising_insights`, `agent_approval_operations`).
- Mark placeholder legacy agents disabled and filter them from display; **do not physically delete them**.
- Strictly enforce `agent.isLegacy` blocking in `POST /api/agent-runs` inside `src/server/routes/agents.routes.ts`.

### Step 2: Integrate UI Component Cards
- Update `src/components/AgentWorkspace.tsx` to read the new agent set dynamically and render tailored badges.
- Disable mutating actions and render re-authorization cta if missing `write_products` scope.

### Step 3: Refine Queue Blocked Warnings
- Update `src/components/ApprovalQueue.tsx` to disable buttons and display mutations blocked overlays.

### Step 4: Write Automated Pre-Deployment Checks
- Append Test 58 to `scripts/release-check.mjs` ensuring initial agent registries are correct and no forbidden theme scopes or price/inventory mutations are allowed.

### Step 5: Add Smoke Test Assertions
- Append Test X to `scripts/smoke-test.mjs` validating `/api/agents` and gating.

---

## 11. Proposed Release-Check Plan (Test 58)

Add static validation assertions in `release-check.mjs`:
- Confirm that the agent list in `agent-registry.service.ts` contains exactly the five approved initial agents.
- Assert that legacy/development agents are marked disabled and are hidden.
- Verify that the Product SEO Agent cannot propose `vendor` or `status` fields.
- Verify that the Catalog Cleanup Agent cannot propose `title` fields.
- Verify that the Merchandising Insights Agent possesses no proposal tool capability.
- Verify that the Approval Operations Agent is completely read-only.
- Confirm that all mutating agents map strictly to approved text mutation fields (`title`, `vendor`, `productType`, `status`, `tags`).
- Ensure no deferred agents are visible in the production agent catalog.
- **Hardening Assertions**: Statically verify that `src/server/index.ts`, `src/server/routes/agents.routes.ts`, and `src/server/routes/proposed-actions.routes.ts` contain absolutely NO test fixture strings or testing backdoors.

---

## 12. Proposed Smoke-Test Plan (Test X & Ephemeral Isolation)

Implement dynamic integration checks in `smoke-test.mjs`:
- **Module Imports Isolation**:
  - The script will import `src/server/app.ts` and repository provider/helpers.
  - It will **not** import `src/server/index.ts`, avoiding standard runtime bootstrap.
- **Dynamic Ephemeral In-Process Server (Memory Mode)**:
  - If in memory mode, boot the Express `app` directly in-process on an ephemeral port (`app.listen(0)`).
  - Dynamically read the port using `server.address().port` and update `baseUrl = "http://127.0.0.1:<assignedPort>"`.
  - Seed the database (mock connections, recovery approvals, and uniquely generated invalid proposed action fixtures) in-process using `getRepositories()`.
  - Clean up and shutdown the in-process server in a `finally` block.
- **Strict Firestore Seeding Guardrails**:
  - Seeding invalid test fixtures directly into Firestore is explicitly **opt-in** and strictly test-environment guarded.
  - To enable, require setting `SOFTIFY_ALLOW_FIRESTORE_SMOKE_FIXTURES=true`, checking that the target is a test sandbox, generating unique keys, and cleaning up in a `finally` block.
  - If these are not met, skip Firestore fixture seeding with a clean warning message.
- **Assertions**:
  - Verify that the Product SEO Agent proposal fails bridge validation when it includes `vendor` or `status`.
  - Verify that the Catalog Cleanup Agent proposal fails bridge validation when it includes `title`.
  - Verify that read-only agents proposed actions fail bridge validation.
  - Confirm that legacy agent run execution is blocked with 403.
  - Confirm that mismatched shop/org contexts return `403 Forbidden` on agent actions.

---

## 13. Documentation Plan

Post-implementation, the following verification and handoff documents will be completed or updated:
- `/docs/phases/phase-10.14/WALKTHROUGH.md` (Technical walk-through of initial agent catalog and workflows)
- `/docs/phases/phase-10.14/REVIEW_NOTES.md` (Security assertions and gatekeeper reviews)
- `/docs/phases/phase-10.14/VERIFICATION.md` (Test validation logs)
- `/docs/ai-handoff/SOFTIFY_PROJECT_STATE.md` (Increment Capabilities and test indices)
- `/docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md` (Transition Next Phase to Phase 10.15)
- `/docs/ai-handoff/NEXT_STEPS.md` (Transition milestone plan)
- `/docs/PHASE_INDEX.md` (Register Phase 10.14 as Completed)
