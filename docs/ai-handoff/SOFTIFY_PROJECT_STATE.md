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
- **CI/CD & Production Smoke Tests**: All static release checks (58 tests) and live local/deployed smoke tests (31 tests) pass cleanly.
- **Production Deployment & Pilot Readiness (In Review)**: Formally drafted compiled serverless source-based Cloud Run deployment architectures, zero-trust OIDC Workload Identity Federation (WIF) OIDC authentication (using auth@v3), public/secret environment variables separation, and required operational database release gates. Verification Pending for final CI/CD pipeline run.

## Next Recommended Phase
- **Phase 10.15 — Production Deployment & Pilot Readiness Checklist (Pending Review/Approval)**: Complete formal review of the deployment architecture, merge code to main to execute GitHub Actions deployed smoke validation, and finalize pilot readiness logs.

## Current Non-Goals
- **No Theme Patching / Theme Tools**: Theme layout/CSS patching is entirely out-of-scope and disabled. No theme tools or read/write theme scopes may be used.
- **No write_themes**: The `write_themes` scope remains strictly unauthorized and forbidden.
- **No Direct AI Mutations**: AI provider runtime may never invoke write tools directly on live stores; mutations must go through the merchant proposal and approval execution pipelines.
- **No Price, Variant, Media, DescriptionHtml, or Inventory Mutations**: Excluded (only catalog text updates like `title`, `vendor`, `productType`, `status`, `tags` are authorized).
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
