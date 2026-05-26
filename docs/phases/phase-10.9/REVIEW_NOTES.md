# Phase 10.9 Review Notes: Multi-Agent Product Workspace Foundation

This document details key architecture decisions, verification checks, and security guardrails for **Phase 10.9 — Multi-Agent Product Workspace Foundation**.

## Key Security Gateways

### 1. Zero Direct Execution Pathway
None of the registry agents (`product_intelligence_agent`, `seo_aeo_agent`, `content_agent`, `design_review_agent`) have direct tool execution or live mutator scopes:
* **Product Intelligence Agent**: Diagnostic insights with optional text-only metadata cleanup recommendations.
* **SEO / AEO Agent**: Read-only diagnostics (missing SEO details/meta descriptions). No executable actions.
* **Content Agent**: Text-only product metadata suggestions.
* **Design Review Agent**: Recommendation-only with zero theme API access or write credentials.

### 2. Payload Bridging and Titlecase Mapping
The `POST /api/proposed-actions/:id/request-approval` router guarantees:
* Secure retrieval of active store connection mapping the raw shop URL via the target agent ID context.
* Hardened sanitization allowlist enforcing only valid metadata fields: `title`, `vendor`, `productType`, `status`, `tags`.
* Risk Level Titlecase mapping (`LOW`/`MEDIUM`/`HIGH` -> `Low`/`Medium`/`High`) matching the approval schema requirement.
* Strict transactional isolation (reusing `ApprovalService` request flow).

### 3. Telemetry and Scanned Scrubbing
All repository models sanitize prompt queries, secrets, and raw Shopify response envelopes before persisting details in DB, guaranteeing complete privacy and zero token leaks.

## Firestore Composite Index Tie-Breakers
During live integration testing on GCP, Firestore queries sorting by timestamp/creation fields (`startedAt`, `createdAt`) with equality filters on `organizationId` require an explicit index that defines the tie-breaker `__name__` order. 

We updated `firestore.indexes.json` to define:
* `agent_runs`: `organizationId` ASC, `startedAt` DESC, `__name__` DESC
* `recommendations`: `organizationId` ASC, `status` ASC, `createdAt` DESC, `__name__` DESC
* `proposed_actions`: `organizationId` ASC, `status` ASC, `createdAt` DESC, `__name__` DESC

We also hardened the GitHub Actions workflow index deployment step to fall back to the Firebase CLI if the standard `gcloud` composite command fails or skips, avoiding blocked PR/local runs while guaranteeing clear logs.
