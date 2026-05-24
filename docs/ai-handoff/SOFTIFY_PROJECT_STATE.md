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

## Current Capabilities
- **Shopify OAuth**: Working connection flow, callback handling, and scope detection.
- **Reconnect & Diagnostics**: Status endpoint and diagnostics to verify active configurations.
- **Firestore Persistence**: Durable, tenant-isolated data storage for connections, snapshots, and installations.
- **Product Snapshots Sync**: manual and incremental product syncing from live Shopify REST/Admin API into Firestore.
- **AI Provider Abstraction**: Pluggable provider system with active Gemini AI and deterministic Mock AI provider configurations.
- **Tool Gateway**: A centralized SDK boundary that authoritatively checks definitions, tenant restrictions, dynamic permission subsets, and recursively sanitizes sensitive fields.
- **Platform Context Resolver**: Security resolver that checks dev-bypass credentials, Normalizes shops, verifies connected stores, and validates installed agents.
- **Agent Installations**: System to install/enable specific agents per store and provision subsets of `allowedTools`.
- **Read-Only Catalog Insights**: Structured calculations for catalog health scores (via clear comment deductions), missing images, missing vendors, missing types, and sync freshness.
- **CI/CD & Production Smoke Tests**: All static release checks (32 tests) and live local/deployed smoke tests (20 tests) pass cleanly.

## Current Non-Goals
- **No Write Tools**: No tools or endpoints to create/modify catalog elements.
- **No Product Updates**: No direct Shopify product updates allowed in the current phase.
- **No Inventory/Price Mutation**: Absolutely no pricing or inventory level modifications.
- **No Approval Flow**: Merchant-in-the-loop verification pipeline is deferred.
- **No Agent Management UI**: Front-end visual dashboard for installing agents is deferred.
- **No Agent Frameworks**: Avoid importing third-party frameworks like LangChain, CrewAI, or LangGraph.

---

### Maintenance Rule
After every completed phase, update:
- `/docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`
- `/docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md`
- `/docs/ai-handoff/NEXT_STEPS.md`
- `/docs/PHASE_INDEX.md`
- the relevant `/docs/phases/phase-*/` files.
