# Security & Gatekeeper Review Notes — Phase 10.16: MVP Pilot Launch & Onboarding

> [!NOTE]
> **COMPLETED PLANNING & READ-ONLY DRY RUN REVIEW SIGN-OFF**
> This architecture and security review audits the Phase 10.16 planning package, connected-store discovery checks, and the controlled read-only agent dry run performed against the approved sandbox store connection.

---

## 1. Review Scope

This review represents a comprehensive security and architecture audit of the Phase 10.16 planning deliverables and mock execution gates.

### A. Items Evaluated under this Review:
* **Phase 10.16 Planning and Operational Documentation**: Inspected the implementation plan, operator runbooks, merchant onboarding checklists, and feedback templates.
* **Connected-Store Discovery**: Audited connection metadata, reachability parameters, and database states for the approved store connection.
* **Controlled Read-Only Agent Dry Run**: Evaluated the trigger mechanics, recommendations, approvals queue bridging, and execution blocked statuses for the five active agents.

### B. Out-of-Scope Items (NOT Reviewed under this Step):
* **Real Production Merchant Onboarding**: Active merchant-facing onboarding or live production storefront rollouts were **not** executed or reviewed.
* **Live `write_products` Storefront Mutations**: Commit executions of active Shopify API writes were **not** tested or reviewed.
* **Production Data Mutation**: Actual database state writes modifying storefront products or live catalog inventories were **not** executed.
* **AI Provider Expansion**: No integrations, migrations, or evaluations of external live model providers (e.g. Claude or OpenAI) were introduced.

---

## 2. Confirmed Environment Parameters

The active pilot environment was audited via read-only status and diagnostics endpoints, confirming the following parameters:
* **Approved Store Connection**: `yambasurf-co-il.myshopify.com`
* **Cloud Run Reachability**: Deployed service `softify` is fully reachable and responsive at `https://softify-595151907767.europe-west1.run.app`.
* **Runtime Config**:
  - `NODE_ENV`: `"production"`
  - `REPOSITORY_BACKEND`: `"firestore"`
  - `FIRESTORE_DATABASE_ID`: `"softify"`
* **Connection Status**: Decrypted connection is healthy (`connected: true` and `tokenValid: true`) without exposing raw tokens or API keys.
* **Product Snapshot Count**: `13` products are securely stored in Firestore.
* **Sync Behavior**: The product synchronization routine was **intentionally skipped** during this dry run, as 13 valid snapshots already existed in the database, preserving a clean test footprint.

---

## 3. Scope & Mutation Safety Guardrails

* **API Access Scopes**: No `write_products` scope is granted to the default connection.
* **Mutation Status**: `canExecuteMutations` is strictly evaluated as `false` by the readiness endpoint.
* **Theme Protection**: No `read_themes` or `write_themes` scopes are active or requested.
* **Execution Gating**: Triggering a storefront write commit on the approved item was rejected with a 400 response code and code `EXECUTION_BLOCKED`.
  - *No successful Shopify mutation was observed; execution was blocked before mutation because write_products is missing.*
* **Auto-Execution Isolation**: Bridging proposed actions to `APPROVED` status successfully updated Firestore records but did **not** dispatch automatic Shopify API write calls.

---

## 4. Agent Dry-Run Findings

All five active agents were executed sequentially in `"DRAFT"` mode on the shop scope, completing with a status of `COMPLETED`:

1. **`agent_catalog_health`**: Identified 1 recommendation and 1 proposed action.
2. **`agent_product_seo`**: Identified 1 recommendation and 1 proposed action.
3. **`agent_catalog_cleanup`**: Identified 3 recommendations and 3 proposed actions.
4. **`agent_merchandising_insights`**: Identified 1 recommendation and 0 proposed actions (strictly read-only).
5. **`agent_approval_operations`**: Identified 1 recommendation and 0 proposed actions (strictly read-only).

### Key Architectural Audits:
* **Legacy Containment**: All legacy and development-only agents remain completely hidden and excluded from production execution lists.
* **Read-Only Containment**: Merchandising Insights and Approvals Operations generated zero proposed actions or mutation drafts.
* **Field Capping Compliance**: Active scanning agents generated proposed actions strictly within their allowed per-agent schemas (e.g. `vendor`, `productType`, `status`, `tags`, and `title` only where permitted).
* **Forbidden Fields Omission**: No high-risk storefront fields (`price`, `inventory`, `variants`, `media`, `descriptionHtml`, or theme fields) were generated or accepted.

---

## 5. Approval & Execution Control

* **Bridging Verification**: The draft proposed action `ACT-1780000795750-910ji` was bridged transactionally to the approvals queue in a `PENDING` state under approval ID `APV-1780000797129-zvcr1`.
* **State Transition Control**: Deciding `APPROVE` on `APV-1780000797129-zvcr1` successfully changed the queue status to `APPROVED` with deferred execution, verifying that state changes are fully isolated.
* **Deferred Execution**: No auto-execution was triggered upon transition.
* **Execution Containment**: Calling manual execute returned `EXECUTION_BLOCKED` and aborted cleanly prior to dispatching any external API mutation, verifying the absolute safety of the read-only gating.

---

## 6. Telemetry & Privacy Audit

* **Audit Trailing**: The `agent_audit_logs` collection was queried and inspected.
* **Telemetry Privacy**: Sanitized telemetry/audit endpoint review did not expose tokens, secrets, raw prompts, raw provider output, raw Shopify payloads, or PII in the inspected results.
* **Review Caveat**: While inspected endpoint results and representative trace samples showed complete compliance, the entire historical audit corpus of 4,338 logs was not exhaustively analyzed.

---

## 7. Source-Code-Reviewed Only Items

The following safety structures were verified via repository inspection and code routing reviews only, and were **not** actively executed or invoked during this dry run:
* **Theme Tool Pathway / Forbidden Scopes**: Code audits confirmed that the Unified Tool Gateway contains zero pathways or tools associated with `read_themes` or `write_themes`.
* **Recovery Endpoint Behavior**: Code verification confirmed that `/api/approvals/:id/reset-failed` changes only the local database status to `FAILED` and does not query external live store APIs.

---

## 8. Residual Risks & Future Mitigations

Security and onboarding gatekeepers must monitor the following residual operational areas:
* **Real Merchant Exposure**: No real merchant onboarding or production storefront executions have been conducted.
* **Sandbox write_products Path**: The sandbox storefront mutation path remains untested under a live write scope.
* **Product Sync Freshness**: Catalog synchronization was not rerun during this dry run.
* **Full Telemetry Audit**: The telemetry logs corpus should remain under continuous automated audit to catch prompt or payload variations.
* **Dev Bypass Enforcement**: The setting `SOFTIFY_ALLOW_AGENT_DEV_BYPASS` must be disabled or completely isolated before merchant-facing pilot exposure.
* **Scope Posture Monitoring**: The store's scope posture (with 74 read-oriented scopes in sandbox) should continue to be monitored, even though the project owner confirmed that no write scopes are present.

---

## 9. Review Conclusion & Next Steps

### A. Review Verdict
The Phase 10.16 planning package, connected-store discovery checks, and read-only dry run are **APPROVED** for pilot readiness.
* **Status**: Phase 10.16 remains **open** and not completed yet. It should continue in this state unless the project owner decides to finalize and close it.

### B. Recommended Next Actions:
* **Option A**: Close Phase 10.16 as read-only pilot readiness completed, updating standard indexing paths.
* **Option B**: Proceed to a separately approved sandbox `write_products` execution dry run.
* **Option C**: Design and prepare a controlled real merchant onboarding operational plan.
