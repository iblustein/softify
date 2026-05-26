# Phase 10.9 Walkthrough: Multi-Agent Product Workspace Foundation

This document summarizes the changes, design decisions, and implementation details for **Phase 10.9 — Multi-Agent Product Workspace Foundation**.

## Overview
Phase 10.9 introduces a multi-agent dashboard workspace, runs tracking, diagnostics recommendations, draft actions inbox, approval request bridging, and index automation pipelines. All changes comply strictly with tenant isolation, audit sanitization, and mutation scope guardrails (allowing text-only metadata updates like `title`, `vendor`, `productType`, `status`, and `tags`, while strictly prohibiting price, inventory, media, descriptionHtml, and theme updates).

## Key Components Implemented

### 1. Domain Types
Added new interfaces under `src/server/domain/types.ts` for tracking workspace activity:
* **`AgentRun`**: Represents a specific diagnostic run session including the scope, status, requested mode, and generated metrics counts.
* **`Recommendation`**: Represents a safe static diagnostic alert or optimization guideline.
* **`ProposedAction`**: Represents a safe metadata draft that can be bridged to the merchant approvals queue.

### 2. Repositories
Created contract definitions, in-memory repository fallbacks, and GCP Firestore configurations for all three entities:
* Contracts: `agent-run.repository.contract.ts`, `recommendation.repository.contract.ts`, `proposed-action.repository.contract.ts`
* In-Memory: `in-memory-agent-run.repository.ts`, `in-memory-recommendation.repository.ts`, `in-memory-proposed-action.repository.ts`
* Firestore: `firestore-agent-run.repository.ts`, `firestore-recommendation.repository.ts`, `firestore-proposed-action.repository.ts`
* Wired everything into `src/server/repositories/repository-provider.ts`.

### 3. Backend Routes & Controllers
Implemented REST routes with strict tenant-scoping validation (e.g. resolving connection contexts dynamic from shop/org parameters):
* **`GET /api/agents/catalog`**: Centralized registry for the four approved agents (`product_intelligence_agent`, `seo_aeo_agent`, `content_agent`, `design_review_agent`).
* **`GET /api/agent-runs` & `POST /api/agent-runs`**: Run tracking endpoint. Executes deterministic POC agent logic.
* **`GET /api/recommendations` & `POST /api/recommendations/:id/dismiss`**: Diagnostics inbox endpoints.
* **`GET /api/proposed-actions` & `POST /api/proposed-actions/:id/dismiss`**: Proposed actions inbox.
* **`POST /api/proposed-actions/:id/request-approval`**: Bridging endpoint. Reuses the standard `ApprovalService` / Tool Gateway request logic, performing strict tenant, store, and field checks, mapping the `riskLevel` seamlessly, and writing audit telemetry (`PROPOSED_ACTION_APPROVAL_REQUESTED`).

### 4. Glassmorphic Frontend Workspace
Implemented the `AgentWorkspace.tsx` dashboard component and embedded it into the merchant app `App.tsx`:
* **Agent Cards**: Display name, description, risk level, version, and capabilities.
* **Scan Controls**: Choose agent, select mode (`RECOMMEND` / `DRAFT`), and run a diagnostic.
* **Interactive Inbox**: Live panels to browse and dismiss recommendations or draft actions, and request merchant approval for eligible proposed actions.

### 5. GHA Pipeline & Cloud Run Indexes
Extended composite index rules in `firestore.indexes.json` and added conditional index setup steps to the deploy-cloud-run GHA workflow.

---

## File Changes
* [types.ts](../../../src/server/domain/types.ts)
* [repository-provider.ts](../../../src/server/repositories/repository-provider.ts)
* [app.ts](../../../src/server/app.ts)
* [agents.routes.ts](../../../src/server/routes/agents.routes.ts)
* [recommendations.routes.ts](../../../src/server/routes/recommendations.routes.ts)
* [proposed-actions.routes.ts](../../../src/server/routes/proposed-actions.routes.ts)
* [AgentWorkspace.tsx](../../../src/components/AgentWorkspace.tsx)
* [App.tsx](../../../src/App.tsx)
* [firestore.indexes.json](../../../firestore.indexes.json)
* [.github/workflows/deploy-cloud-run.yml](../../../.github/workflows/deploy-cloud-run.yml)
* [release-check.mjs](../../../scripts/release-check.mjs)
* [smoke-test.mjs](../../../scripts/smoke-test.mjs)
