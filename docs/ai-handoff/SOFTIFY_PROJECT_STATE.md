# Softify Project State

This document provides a highly durable and centralized technical reference for the current state of the **Softify** platform.

## Project Context
- **Project Name**: Softify
- **Product Goal**: SaaS AI Agent platform for Shopify store management.
- **Repository**: [iblustein/softify](https://github.com/iblustein/softify)
- **Shopify Test Shop**: `yambasurf-co-il.myshopify.com`

## Project Operating Model
- The user defines business vision, priorities, and final approval.
- ChatGPT provides architecture supervision, best-practice guidance, implementation-plan review, guardrail enforcement, and read-only verification.
- Antigravity performs implementation, file changes, commands, commits, and pushes.
- ChatGPT should proactively verify repository state and planning details when needed, without asking for separate permission for read-only checks.
- Implementation changes remain Antigravity’s responsibility unless the user explicitly instructs otherwise.

## Infrastructure & Databases
- **Deployment**:
  - **Google Cloud Run Service**: `softify`
  - **Region**: `europe-west1`
  - **Project**: `softify-dev`
- **Google Firestore**:
  - **Database ID**: `softify`
  - **Collections**:
    - `shopify_store_connections`: Shopify OAuth access credentials and scopes
    - `product_snapshots`: Synced merchant product metadata
    - `agent_installations`: Store-level agent installation statuses and tool authorizations
    - `agent_audit_logs`: Authoritative, sanitized security and execution trails
    - `merchant_approvals`: Durable merchant-approved update proposals tracking state transitions (`PENDING`, `APPROVED`, `REJECTED`, `EXECUTING`, `APPLIED`, `FAILED`) and execution timelines (`executedAt`, `executedBy`, `failureReason`)
    - `product_snapshot_catalogs`: Catalog snapshots matching database states
    - `agent_runs`: Scoped agent diagnostic execution runs registry
    - `recommendations`: Scoped agent diagnostic recommendations inbox
    - `proposed_actions`: Scoped agent-suggested draft action proposals queue

## Current Capabilities
- **Shopify OAuth**: Working connection flow, callback handling, and scope detection.
- **Reconnect & Diagnostics**: Status endpoint and diagnostics to verify active configurations.
- **Firestore Persistence**: Durable, tenant-isolated data storage for connections, snapshots, installations, audits, and merchant approvals.
- **Product Snapshots Sync**: Manual and incremental product syncing from live Shopify REST/Admin API into Firestore.
- **AI Provider Abstraction**: Pluggable provider system with active Gemini AI and deterministic Mock AI provider configurations.
- **Tool Gateway**: A centralized SDK boundary that authoritatively checks definitions, tenant restrictions, dynamic permission subsets, recursively sanitizes sensitive fields, and intercepts proposal tools to convert them to pending approvals.
- **Platform Context Resolver**: Security resolver that checks dev-bypass credentials, normalizes shops, verifies connected stores, and validates installed agents.
- **Agent Installations**: System to install/enable specific agents per store and provision subsets of `allowedTools`.
- **Read-Only Catalog Insights**: Structured calculations for catalog health scores (via clear comment deductions), missing images, missing vendors, missing types, and sync freshness.
- **Agent Execution Audit**: Durable, sanitized, tenant-safe Firestore audit logging (collection `agent_audit_logs`) tracking agent chat requests, tool invocations, and Gateway decisions (`allowed`, `blocked`, `completed`, `failed`) using centralized constants. Includes a recursive, allowlist-first sanitizer and strict cross-tenant endpoint query protection.
- **Merchant Approvals Pipeline**: Secure merchant-in-the-loop approvals gateway intercepting proposal tools (`catalog.products.propose_update`), registering strictly-sanitized proposal shapes in `merchant_approvals`, enforcing strict tenant-scoping, dynamically mapping legacy UI parameters on-the-fly in router responses, and dispatching async transition audit records (`APPROVAL_CREATED`, `APPROVAL_APPROVED`, `APPROVAL_REJECTED`).
- **Safe Product Mutation Execution Pipeline**: An explicitly approved request can be securely executed via the `POST /api/approvals/:id/execute` endpoint. Integrates a secure Shopify Admin GraphQL `productUpdate` write mutator, fully private token resolution, strict payload length-capping and tag-deduplication, transactional concurrency state claim locks (`APPROVED` -> `EXECUTING`), incremental sync refreshes on success, and graceful failure transitions.
- **Approval Execution Operations & Recovery**: Telemetry session tracking metrics, `APPROVAL_EXECUTION_STARTED` race-safe audits, stuck execution timeout configurations, state-only reset recovery API (`POST /api/approvals/:id/reset-failed`), and operator stuck-marked failed API (`POST /api/approvals/:id/mark-execution-failed`) under strict trimmed actor limits.
- **Embedded Admin Tenant Context Regression Fix**: Seamless backend shop-based dynamic context resolution for audit, approvals list, and approvals decide API endpoints. Frontend shop context persistence across url-redirection cleanups (preserving shop context and discarding only transient signatures), and premium visual sync warning recovery cards preventing infinite loaders.
- **Multi-Agent Product Workspace Foundation**: A centralized agent catalog (`GET /api/agents/catalog`) exposing available agents. Scoped domain models (`AgentRun`, `Recommendation`, `ProposedAction`) in in-memory and GCP Firestore repository layers. REST routes with strict tenantcontext resolution and audit integrations, proposed action approval bridge with titlecase risk mapping, and a glassmorphic dashboard component `AgentWorkspace.tsx` integrated in the merchant app.
- **Multi-Agent Workspace Analytics & Operational Visibility**: Strictly read-only, non-mutating operational analytics endpoints (`/api/workspace/analytics/*`) returning aggregated metric summaries, run trends, recommendation distributions, proposed action types, approval conversion funnels, and chronological trace timelines. Enforces clean `403 Forbidden` tenant mismatch responses with zero side effects or database writes, and strips all developer/internal metadata (such as raw prompts or reasoning) via a strictly-controlled allowlist-only timeline mapper.
- **MVP End-to-End Merchant Workflow Hardening**: Complete, robust merchant optimization pipeline (Select Agent → Scan → Propose Revision → Request Approval → Approve → Explicit execution → Live catalog refresh) fully hardened with premium spinner state masks, allowlisted comparison cards, dedicated error recoveries, and dynamic local synchronization.
- **Production Bulk Operations Foundation**: Multi-select bulk workflows on proposed actions (batch request-approval, batch dismiss) and merchant approvals (batch-decide, batch-execute). Implements strict Phase 1 preflight tenant assertions, 500ms safety throttle delays, sequential dispatch via ApprovedProductMutationExecutorService, individual claim locks, and live sequential progress checklist stepper UX.
- **Real-Store Product Readiness**: A sanitized, read-only connection diagnostics & readiness API (`GET /api/shop/readiness`), premium store setup readiness dashboard card (`AgentWorkspace.tsx`), explicit execute button overrides and amber-tinted "Mutations Blocked" banners on write scope deficiency (`ApprovalQueue.tsx`), and frontend UX bulk execute gating via `VITE_SOFTIFY_ALLOW_BULK_EXECUTE`.
- **Initial Agent Set & Merchant Workflows**: Formally defined and configured the initial active production-safe multi-agent catalog (`agent_catalog_health`, `agent_product_seo`, `agent_catalog_cleanup`, `agent_merchandising_insights`, `agent_approval_operations`), enforcing strict allowed fields, hiding legacy development agents from public display, rendering prominent status change warnings inside left-card badges and drawer panels.
- **Merchant Onboarding UX & Read-Only Pilot Polish**: Formally resolved the pilot allowlist/readiness regression, verified that `/api/pilot/readiness` allowlist checking returns true for approved pilot shops, integrated Guided Onboarding Checklist step-by-step progress cards, mounted an explicit Trust & Safety Panel, polished empty analytics states, rebranded proposed change cards to use non-jargon fields, collapsed developer tools (`Super Agent Chat`, `Tool Gateway`) under warning tags, and verified all static release checks and smoke tests pass (32/32 smoke tests passed!).
- **Simplified Merchant UI & Theme Editor AI Agent MVP**: Product direction pivot around the Theme Editor AI Agent MVP. Lateral sidebar navigation simplified to Settings and dynamic Your Team list (driven by enabled state). Built premium Theme Editor Chat (dropdown theme selector, safe development theme targets, live storefront warning checkboxes, apply changes trigger) and SaaS Settings UI. Mounted secure backend theme-editing controller routes under `/api` Express namespace. Confirmed all pre-deployment compile and release verification checks passed (58/58 passed), and smoke test suites passed cleanly (32/32 passed).
- **CI/CD & Production Smoke Tests**: Full verification suite passed cleanly. Static release checks passed 58/58, local in-process smoke tests passed 32/32, and actual deployed Cloud Run smoke tests passed 32/32.
- **Production Deployment & Pilot Readiness**: Phase 10.15 is completed and approved. Formally validated compiled serverless source-based Cloud Run deployment architectures, zero-trust OIDC Workload Identity Federation (WIF) OIDC authentication (using auth@v3), environment secrets mapping (`SHOPIFY_API_SECRET`, `SHOPIFY_TOKEN_ENCRYPTION_KEY`, `SOFTIFY_AGENT_DEV_BYPASS_SECRET`), and required operational database gates. GitHub Actions Run ID [26598640767](https://github.com/iblustein/softify/actions/runs/26598640767) succeeded.
  - **Service Name**: `softify`
  - **Deployment Region**: `europe-west1`
  - **Target Project ID**: `softify-dev`
  - **Firestore Persistent Backend**: Confirmed and active.
  - **Production Environment**: Confirmed and active.
- **MVP Pilot Launch & Merchant Onboarding Plan**: Phase 10.16 is completed and approved. Formally drafted and finalized the merchant onboarding checklists, operator runbooks, pilot validation matrices, and qualitative feedback questionnaires.
  - **Development Store**: `yambasurf-co-il.myshopify.com`
  - **Cloud Run service**: Remained deployed, responsive, and reachable.
  - **Firestore Backend & DB ID**: Confirmed and active (`softify` database).
  - **Store Connection**: Verified and healthy connection decrypted safely (`tokenValid: true`).
  - **Product Snapshot Count**: `13` products stored in the `product_snapshots` collection.
  - **Sync Behavior**: Synchronizing catalog products was intentionally skipped to keep a clean test footprint.
  - **Dry Run Verification**: All five production-safe agents (`agent_catalog_health`, `agent_product_seo`, `agent_catalog_cleanup`, `agent_merchandising_insights`, `agent_approval_operations`) ran successfully in a dry run without exposing legacy agents.
  - **Capped Fields Compliance**: Proposed actions generated stayed strictly within per-agent allowed metadata lists (with read-only agents producing zero proposed actions). No price, variant, media, descriptionHtml, or inventory fields appeared.
  - **Approvals & Auto-Execution**: The approvals bridge workflow successfully queued proposals in a `PENDING` state and transitioned them to `APPROVED` upon merchant decision, verifying that approvals change database state only and do **not** trigger auto-execution on Shopify.
  - **Execution Containment**: Initiating manual execution commits was blocked with HTTP 400 (`EXECUTION_BLOCKED`) due to the missing `write_products` scope. *No successful Shopify mutation was observed, and no write_products path was tested on live stores.*
  - *No real production merchant onboarding or live production storefront migrations were executed during this phase.*

## Next Recommended Phase
- **Phase 11.1 — Theme Editor AI Agent Pilot Launch**: Focuses on launching the live merchant pilot program specifically for the Theme Editor AI Agent MVP, gathering qualitative merchant feedback, and evaluating onboarding checklist flows.

## Current Non-Goals
- **No Unrelated Write Scopes**: Scopes like `write_products`, `write_customers`, etc. are strictly forbidden; only theme editing scopes (`read_themes`, `write_themes`) are authorized for the Theme Editor context.
- **No Direct AI Mutations**: AI provider runtime may never invoke write tools directly on live stores; mutations must go through the merchant proposal and approval execution pipelines.
- **No Price, Variant, Media, DescriptionHtml, or Inventory Mutations**: Excluded (only theme file asset updates and product text updates are authorized).
- **No Auto-Execution**: Automatic execution on approval is strictly prohibited. Approved proposals must wait for explicit execution dispatches.
- **Recovery Endpoints Shopify Containment**: Recovery reset/marking endpoints must remain state-only and are strictly forbidden from calling live Shopify APIs.
- **No Agent Management UI**: Front-end visual dashboard for installing agents is deferred.
- **No Agent Frameworks**: Avoid importing third-party frameworks like LangChain, CrewAI, or LangGraph.
- **No Cross-Store Bulk Approvals**: Multi-store/bulk approval decision lists are deferred.

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

