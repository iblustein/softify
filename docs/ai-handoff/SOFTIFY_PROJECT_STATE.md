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
    - `merchant_approvals`: Blocked write tool mutations awaiting merchant review
    - `product_snapshot_catalogs`: Catalog snapshots matching database states

## Current Capabilities
- **Shopify OAuth**: Working connection flow, callback handling, and scope detection.
- **Reconnect & Diagnostics**: Status endpoint and diagnostics to verify active configurations.
- **Firestore Persistence**: Durable, tenant-isolated data storage for connections, snapshots, installations, audits, and merchant approvals.
- **Product Snapshots Sync**: manual and incremental product syncing from live Shopify REST/Admin API into Firestore.
- **AI Provider Abstraction**: Pluggable provider system with active Gemini AI and deterministic Mock AI provider configurations.
- **Tool Gateway**: A centralized SDK boundary that authoritatively checks definitions, tenant restrictions, dynamic permission subsets, recursively sanitizes sensitive fields, and intercepts mutation tools to convert them to pending approvals.
- **Platform Context Resolver**: Security resolver that checks dev-bypass credentials, Normalizes shops, verifies connected stores, and validates installed agents.
- **Agent Installations**: System to install/enable specific agents per store and provision subsets of `allowedTools`.
- **Read-Only Catalog Insights**: Structured calculations for catalog health scores (via clear comment deductions), missing images, missing vendors, missing types, and sync freshness.
- **Agent Execution Audit**: Durable, sanitized, tenant-safe Firestore audit logging (collection `agent_audit_logs`) tracking agent chat requests, tool invocations, and Gateway decisions (`allowed`, `blocked`, `completed`, `failed`) using centralized constants. Includes a recursive, allowlist-first sanitizer and strict cross-tenant endpoint query protection.
- **Merchant Approvals Pipeline**: Secure merchant-in-the-loop approvals gateway intercepting mutation tools (`catalog.products.update` and `theme.assets.patch`), registering them in `merchant_approvals`, enforcing strict tenant-scoping, committing mock updates to Firestore & local caches on approved decisions, and dispatching async transition audit records (`APPROVAL_CREATED`, `APPROVAL_APPROVED`, `APPROVAL_APPLIED`, `APPROVAL_REJECTED`).
- **CI/CD & Production Smoke Tests**: All static release checks (39 tests) and live local/deployed smoke tests (22 tests) pass cleanly.

## Current Non-Goals
- **No Direct Mutation Execution**: AI provider runtime may never invoke write tools directly on live stores without explicit merchant-in-the-loop review.
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
