# Softify Project State

This document provides a highly durable and centralized technical reference for the current state of the **Softify** platform.

## Project Context
- **Project Name**: Softify
- **Product Goal**: SaaS AI Agent platform for Shopify store management.
- **Repository**: [iblustein/softify](https://github.com/iblustein/softify)
- **Shopify Test Shop**: `yambasurf-co-il.myshopify.com`

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
- **CI/CD & Production Smoke Tests**: All static release checks (52 tests) and live local/deployed smoke tests (25 tests) pass cleanly.

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
