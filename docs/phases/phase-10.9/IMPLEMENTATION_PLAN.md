# Implementation Plan — Phase 10.9: Multi-Agent Product Workspace Foundation

This phase introduces Softify's first **Multi-Agent Product Workspace** layer, enabling merchants to see available catalog agents, review their scopes/risk levels, execute secure tenant-scoped runs, review active diagnostic recommendations, inspect proposed draft updates, and safely bridge updates to the existing approvals queue without expanding dangerous mutation capabilities.

---

## User Review Required

> [!IMPORTANT]
> **Tool Execution & Mutation Boundaries**:
> - Agents **do not execute mutations directly**. AI providers only analyze and output suggestions.
> - The **Tool Gateway** remains the absolute execution boundary.
> - Product mutations proposed by agents (Content Agent, Product Intelligence Agent) are drafted as **Proposed Actions** with `status: 'DRAFT'`.
> - Merchants must explicitly trigger a "Request Approval" POST action. This action **must not bypass the existing hardened approval validation path**. It must pass through the existing approval creation flow or a dedicated bridge service enforcing the exact same tenant, permission, allowlisted fields, sanitization, and audit validation as the Tool Gateway proposal interception path.
> - Mutation field scope is strictly limited to the allowlisted fields: `title`, `vendor`, `productType`, `status`, and `tags`.
> - **Zero theme writes**, visual changes, price alterations, or variant updates are allowed.
> - **No theme tools, read_themes, write_themes, or Shopify Theme API integrations** are introduced.

> [!WARNING]
> **Data Scoping & Retention Boundaries**:
> - No raw Shopify API responses, raw prompt strings, raw tool arguments, secrets, tokens, or PII will be persisted in Firestore or memory fallbacks.
> - Agent runs store only sanitized telemetry, run statuses, duration, and metadata.

---

## Open Questions

- Should agent runs be stored locally in memory or Firestore?
  - **Proposed Answer**: Dynamically resolved. When Firestore is configured, runs, recommendations, and proposed actions persist in dedicated database collections; otherwise, they default to safe, isolated in-memory registry maps.

---

## Proposed Changes

```mermaid
graph TD
    A[Frontend: Agent Workspace] -->|POST /api/agent-runs| B[Backend Routing API]
    B -->|Resolve Tenant| C[Platform Context Resolver]
    B -->|Execute POC Run| D[Safe Deterministic Agent Workflows]
    D -->|Generate Suggestions| E[Repositories: Runs, Recommendations, Actions]
    A -->|POST /proposed-actions/:id/request-approval| F[Bridge: Approval Service Validation Path]
    F -->|Decide & Execute| G[Existing Approval Pipeline]
```

### Component 1: Data Contracts & Persistence Layer (Repositories)

We introduce three new domain records and their repository contracts under the existing provider model.

#### [NEW] [agent-run.repository.contract.ts](src/server/repositories/contracts/agent-run.repository.contract.ts)
Defines the structure and queries for tracking agent invocation sessions.
- **`AgentRun` Schema**:
  ```typescript
  export interface AgentRun {
    id: string;
    organizationId: string;
    storeConnectionId: string;
    agentId: string;
    agentVersion: string;
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
    scope: {
      type: 'SHOP' | 'PRODUCT' | 'COLLECTION' | 'PAGE' | 'TRAFFIC_PERIOD';
      resourceId?: string;
      filters?: Record<string, unknown>;
    };
    mode: 'RECOMMEND' | 'DRAFT';
    requestedBy: string;
    startedAt: string;
    finishedAt?: string;
    summary?: string;
    errorCode?: string;
    errorMessage?: string;
    recommendationCount: number;
    proposedActionCount: number;
    auditCorrelationId: string;
  }
  ```

  > [!NOTE]
  > Agent run `scope` must be thoroughly sanitized before persistence and must under no circumstances contain raw prompts, raw Shopify responses, raw tool args, tokens, secrets, or PII.

#### [NEW] [recommendation.repository.contract.ts](src/server/repositories/contracts/recommendation.repository.contract.ts)
Defines rules for merchant-facing diagnostic warnings.
- **`Recommendation` Schema**:
  ```typescript
  export interface Recommendation {
    id: string;
    organizationId: string;
    storeConnectionId: string;
    agentRunId: string;
    agentId: string;
    resourceType: string; // e.g. 'PRODUCT'
    resourceId: string; // Shopify GID
    recommendationType: string;
    title: string;
    summary: string;
    reasoningSummary: string;
    impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    confidence: number;
    status: 'OPEN' | 'DISMISSED' | 'CONVERTED_TO_ACTION' | 'SUPERSEDED';
    createdAt: string;
    updatedAt: string;
  }
  ```

#### [NEW] [proposed-action.repository.contract.ts](src/server/repositories/contracts/proposed-action.repository.contract.ts)
Defines rules for draft metadata modifications.
- **`ProposedAction` Schema**:
  ```typescript
  export interface ProposedAction {
    id: string;
    organizationId: string;
    storeConnectionId: string;
    agentRunId: string;
    agentId: string;
    recommendationId: string;
    targetType: 'PRODUCT';
    targetId: string; // Shopify Product GID
    title: string;
    description: string;
    actionType: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    executionMode: 'DRAFT_ONLY' | 'APPROVAL_REQUIRED' | 'NOT_EXECUTABLE';
    changes: {
      title?: string;
      vendor?: string;
      productType?: string;
      status?: string;
      tags?: string[];
    };
    approvalRequestId?: string;
    status: 'DRAFT' | 'APPROVAL_ELIGIBLE' | 'APPROVAL_REQUESTED' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'DISMISSED' | 'BLOCKED';
    createdAt: string;
    updatedAt: string;
  }
  ```

#### [NEW] [in-memory-agent-run.repository.ts](src/server/repositories/in-memory/in-memory-agent-run.repository.ts)
#### [NEW] [in-memory-recommendation.repository.ts](src/server/repositories/in-memory/in-memory-recommendation.repository.ts)
#### [NEW] [in-memory-proposed-action.repository.ts](src/server/repositories/in-memory/in-memory-proposed-action.repository.ts)
- Safe, sandboxed in-memory maps implementing the contracts with isolated tenant filtering.

#### [NEW] [firestore-agent-run.repository.ts](src/server/repositories/firestore/firestore-agent-run.repository.ts)
#### [NEW] [firestore-recommendation.repository.ts](src/server/repositories/firestore/firestore-recommendation.repository.ts)
#### [NEW] [firestore-proposed-action.repository.ts](src/server/repositories/firestore/firestore-proposed-action.repository.ts)
- Persistent collections (`agent_runs`, `recommendations`, `proposed_actions`) using Google Cloud Firestore, verifying tenant ownership on write.

#### [MODIFY] [repository-provider.ts](src/server/repositories/repository-provider.ts)
- Register and wire the three new repositories under `getRepositories()` to auto-resolve InMemory vs Firestore environments.

---

### Component 2: Multi-Agent Workspace Routing API

We introduce standard, tenant-scoped routes mapped under the pre-existing context resolver framework.

#### [MODIFY] [agents.routes.ts](src/server/routes/agents.routes.ts)
- Mount `GET /api/agents/catalog` listing the 4 available agents, their required scopes, risk levels, and descriptions.
- Mount **POST /api/agent-runs**, **GET /api/agent-runs**, and **GET /api/agent-runs/:id** using the context resolver to isolate runs.

#### [NEW] [recommendations.routes.ts](src/server/routes/recommendations.routes.ts)
- Mount `GET /api/recommendations`, `GET /api/recommendations/:id`, and `POST /api/recommendations/:id/dismiss`.

#### [NEW] [proposed-actions.routes.ts](src/server/routes/proposed-actions.routes.ts)
- Mount `GET /api/proposed-actions`, `GET /api/proposed-actions/:id`, `POST /api/proposed-actions/:id/dismiss`, and `POST /api/proposed-actions/:id/request-approval`.
- **Safe Bridging Pipeline**:
  - `POST /api/proposed-actions/:id/request-approval` loads the proposed action, asserts tenant matching, and updates the action's status.
  - To prevent bypassing the hardened validations, this endpoint **must not** write directly to the approvals repository. Instead, it must route through the `ApprovalService` creation workflow, applying the exact same payload sanitization, allowed field trimming, context checks, permission policies, and audit logging as proposal interceptions in the Tool Gateway.

#### [MODIFY] [app.ts](src/server/app.ts)
- Mount the new routes under `/api` properly.

---

### Component 3: Safe Deterministic Agent POC Workflows

To guarantee safety and performance, we implement deterministic POC runs for each agent type:

| Agent Type | Required Scopes | Risk Level | Execution Outputs |
| :--- | :--- | :--- | :--- |
| **Product Intelligence Agent** | `read_products` | Low | Generates diagnostic warnings (e.g. missing tags, missing vendor names) and proposes meta cleanup drafts. |
| **SEO / AEO Agent** | `read_products` | Low | Outputs search keywords & semantic structure compliance recommendations-only. Zero mutations or proposed writes. |
| **Content Agent** | `read_products` | Low | Analyzes titles/descriptions and drafts optimized titles/tags as approval-eligible Proposed Actions. No `descriptionHtml` writes. |
| **Design Review Agent** | None | Low/Medium | Recommends storefront layout alignment fixes based on safe heuristic/static workspace signals only. No theme writes, no theme tools, no `write_themes` scope, and no `read_themes` scope. |

---

### Component 4: Unified Admin Workspace Frontend UI

We introduce a premium, visual workspace dashboard that productizes the multi-agent layers.

> [!NOTE]
> Phase 10.9 is strictly restricted to adding a diagnostic workspace UI. It will **not** implement any agent installation, settings, or permission management UI workflows.

#### [NEW] [AgentWorkspace.tsx](src/components/AgentWorkspace.tsx)
A premium, glassmorphic layout displaying:
- **Registry Catalog Grid**: Modular card cards detailing each agent's description, required scopes, risk badges, and a "Manage Agent Workspace" action.
- **Run Monitor Panel**: Interactive console to launch a "New Workspace Diagnostic Run" with streaming log messages (e.g. "Scanning SEO guidelines...").
- **Recommendations Center**: Responsive info-alert blocks showing active diagnostics with an instant "Dismiss" mechanism.
- **Proposed Actions Inbox**: Grid showing draft product changes. Merchants can click "Request Merchant Approval" to queue the changes, or "Dismiss" to discard.

#### [MODIFY] [App.tsx](src/App.tsx)
- Embed the `AgentWorkspace` tab into the lateral navigation sidebar.
- Propagate the safe, centralized `buildShopQuery()` parameter to all new workspace requests to prevent tenant lockouts.

---

### Component 5: CI/CD Index Automation & Test Coverages

We resolve Firestore query indexing requirements and automate index deployment in GitHub Actions safely.

#### [MODIFY] [firestore.indexes.json](firestore.indexes.json)
Define new composite query indexes:
- Collection: `agent_runs` -> `organizationId` ASC, `startedAt` DESC
- Collection: `agent_runs` -> `organizationId` ASC, `storeConnectionId` ASC, `startedAt` DESC
- Collection: `recommendations` -> `organizationId` ASC, `status` ASC, `createdAt` DESC
- Collection: `proposed_actions` -> `organizationId` ASC, `status` ASC, `createdAt` DESC

#### [MODIFY] [.github/workflows/deploy-cloud-run.yml](.github/workflows/deploy-cloud-run.yml)
- Automate Firestore index deployment after authentication and before deployment.
- To prevent PR/local or missing-credential workflow failures, this step is protected with a conditional secret check and set to gracefully proceed if errors occur:
  ```yaml
        - name: Deploy Firestore Composite Indexes
          if: ${{ secrets.GCP_PROJECT_ID != '' }}
          continue-on-error: true
          run: |
            echo "Deploying Firestore composite indexes..."
            gcloud firestore indexes import firestore.indexes.json --project="${{ secrets.GCP_PROJECT_ID }}" --database="softify"
  ```

---

## Verification Plan

### Automated Tests

#### 1. Static Release Coverages (`release-check.mjs`)
Add validations verifying:
- The 4 agents exist in catalog.
- No `write_themes` or `read_themes` is registered.
- Mismatched tenant contexts return HTTP 403.
- Under no circumstances does the server expose raw prompts, secrets, or raw Shopify responses.

#### 2. Integration Smoke Suite (`smoke-test.mjs`)
Extend the smoke tests with Test S:
- `GET /api/agents/catalog` returns 200.
- `POST /api/agent-runs` initializes a secure run session and resolves `shop` parameters cleanly.
- `GET /api/recommendations` and `GET /api/proposed-actions` retrieve items mapped to the shop.
- `GET /api/recommendations/:id` and `GET /api/proposed-actions/:id` retrieve detail shapes successfully.
- Assert mismatched shop + organizationId yields HTTP 403.
- Assert missing parameters yields HTTP 400.

### Manual Verification
- Run local server CJS bundle and review that the Workspace navigation tab displays the agent catalog grid cleanly.
- Trigger diagnostic runs and confirm that recommendations can be dismissed explicitly by user action and that their status changes to DISMISSED.
- Confirm draft proposals correctly populate the approvals queue.
