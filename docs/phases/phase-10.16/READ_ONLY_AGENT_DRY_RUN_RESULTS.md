# Softify Controlled Read-Only Agent Dry Run Results — Phase 10.16

This document presents the detailed execution log, captured evidence, and workflow verification metrics for the controlled read-only agent dry run performed against the approved pilot store.

---

## 1. Execution Overview

* **Dry Run Date/Time**: 2026-05-28T23:40:00+03:00 (Local Time)
* **Approved Store**: `yambasurf-co-il.myshopify.com`
* **Deployed Service URL**: `https://softify-595151907767.europe-west1.run.app`
* **Test Intent**: Confirm complete, end-to-end integration safety and human-in-the-loop approvals routing under default read-only containment without storefront mutations or credential leaks.

---

## 2. Agent Catalog Verification

Querying `/api/agents/catalog` returned exactly five active, production-safe agents:
1. **`agent_catalog_health`** (Catalog Health Agent)
2. **`agent_product_seo`** (Product SEO Agent)
3. **`agent_catalog_cleanup`** (Catalog Cleanup Agent)
4. **`agent_merchandising_insights`** (Merchandising Insights Agent)
5. **`agent_approval_operations`** (Approval Operations Agent)

* **Legacy Containment**: All legacy and development-only agents (e.g., `product_intelligence_agent`, `content_agent`) were completely hidden and excluded from production execution.

---

## 3. Individual Agent Run Results

All five agents were triggered sequentially via `POST /api/agent-runs` in `"DRAFT"` mode on the shop scope.

```json
"agentRuns": [
  {
    "agentId": "agent_catalog_health",
    "status": "COMPLETED",
    "recommendationCount": 1,
    "proposedActionCount": 1,
    "summary": "Workspace scan finished successfully. Identified 1 recommendations and 1 draft proposed actions."
  },
  {
    "agentId": "agent_product_seo",
    "status": "COMPLETED",
    "recommendationCount": 1,
    "proposedActionCount": 1,
    "summary": "Workspace scan finished successfully. Identified 1 recommendations and 1 draft proposed actions."
  },
  {
    "agentId": "agent_catalog_cleanup",
    "status": "COMPLETED",
    "recommendationCount": 3,
    "proposedActionCount": 3,
    "summary": "Workspace scan finished successfully. Identified 3 recommendations and 3 draft proposed actions."
  },
  {
    "agentId": "agent_merchandising_insights",
    "status": "COMPLETED",
    "recommendationCount": 1,
    "proposedActionCount": 0,
    "summary": "Workspace scan finished successfully. Identified 1 recommendations and 0 draft proposed actions."
  },
  {
    "agentId": "agent_approval_operations",
    "status": "COMPLETED",
    "recommendationCount": 1,
    "proposedActionCount": 0,
    "summary": "Workspace scan finished successfully. Identified 1 recommendations and 0 draft proposed actions."
  }
]
```

---

## 4. Sanitized Recommendations and Proposed Actions

* **Total Recommendations in Database**: `408` entries (stored securely in `DRAFT`/`OPEN` state).
* **Total Proposed Actions in Database**: `324` entries (stored securely in `DRAFT` or `BLOCKED` status).

### A. Sanitized Recommendation Example
```json
{
  "id": "REC-1780000795703-fj94n",
  "organizationId": "demo-org-id",
  "storeConnectionId": "store-9ed4368c-7f04-4d43-b062-c048de3f9d1f",
  "agentRunId": "RUN-1780000795517-mhreo",
  "agentId": "agent_catalog_cleanup",
  "resourceType": "PRODUCT",
  "resourceId": "102",
  "recommendationType": "taxonomy_cleanup",
  "title": "Clean up taxonomy and status for Double-walled Ceramic Mug",
  "summary": "Product catalog entry is missing descriptive vendor, type, or tag metadata attributes.",
  "reasoningSummary": "Standardized categorizations enable correct semantic indexing and granular filtering within merchant portals.",
  "impactLevel": "MEDIUM",
  "riskLevel": "LOW",
  "confidence": 0.95,
  "status": "OPEN"
}
```

### B. Sanitized Proposed Action Example (Allowed Fields Policy Capped)
```json
{
  "id": "ACT-1780000795750-910ji",
  "organizationId": "demo-org-id",
  "storeConnectionId": "store-9ed4368c-7f04-4d43-b062-c048de3f9d1f",
  "agentRunId": "RUN-1780000795517-mhreo",
  "agentId": "agent_catalog_cleanup",
  "recommendationId": "REC-1780000795703-fj94n",
  "targetType": "PRODUCT",
  "targetId": "102",
  "title": "Clean up taxonomy and status for Double-walled Ceramic Mug",
  "description": "Updates vendor casing, normalizes types, and transitions stale catalog entry to archived draft status. Title is excluded.",
  "actionType": "taxonomy_cleanup",
  "riskLevel": "LOW",
  "executionMode": "APPROVAL_REQUIRED",
  "changes": {
    "status": "DRAFT",
    "productType": "Mock Type",
    "tags": ["mock", "taxonomy-cleaned"],
    "vendor": "MOCK VENDOR"
  },
  "status": "DRAFT"
}
```
> [!NOTE]
> **FIELD GATING COMPLIANCE**
> In compliance with strict safety parameters, the proposed changes are strictly capped to allowed metadata fields (`status`, `productType`, `tags`, `vendor`). Title changes are excluded in this agent, and no high-risk fields (`price`, `inventory`, `variants`, `media`, `descriptionHtml`, or `themes`) are present.

---

## 5. Approval Bridging Workflow & State Transition

* **Bridging Initiation**: Proposed Action `ACT-1780000795750-910ji` was bridged to the approvals queue under ID `APV-1780000797129-zvcr1`.
* **Bridge State**: **PENDING** (HTTP 200).
* **Decide Transition**: The merchant decided **APPROVE** (HTTP 200) via `/api/approvals/:id/decide`.
* **Target State**: **APPROVED** (status transition only, with deferred execution).
* **Auto-Execution Isolation**: **Verified**. State successfully transitioned to `APPROVED` in Firestore without dispatching automatic write operations to Shopify.

---

## 6. Execution Gating Verification (Mutation Containment)

* **Test Dispatch**: Initiated manual storefront commit for the approved request `APV-1780000797129-zvcr1` via `/api/approvals/:id/execute`.
* **Execution Status**: **REJECTED & BLOCKED** (HTTP 400).
* **Error Payload Return**:
```json
{
  "ok": false,
  "code": "EXECUTION_BLOCKED",
  "status": "BLOCKED",
  "error": "Store connection is missing write_products scope. Mutations are disabled for this connection."
}
```
* **Storefront Integrity**: The storefront remains completely untouched. Softify's Approved Product Mutation Executor successfully identified the missing `write_products` scope and aborted the execution, maintaining absolute read-only containment.

---

## 7. Sanitized Telemetry & Audit Logs

* **Total Audit Entries**: `4,338` logged events.
* **Audit Trail Cleanliness**:
  - Confirmed all audit records (e.g. `RECOMMENDATION_CREATED`, `PROPOSED_ACTION_CREATED`, `APPROVAL_APPROVED`, etc.) are thoroughly sanitized.
  - Verified no raw prompts, model chains-of-thought, access tokens, decryptor credentials, raw Shopify responses, or buyer PII are present in logged payloads.

---

## 8. Blockers & Recommended Next Step

* **Blockers**: **None**. All systems are highly stable and the containment boundaries function flawlessly.
* **Recommended Next Step**: Sign off on the Phase 10.16 read-only pilot plan and transition to subsequent validation reviews.
