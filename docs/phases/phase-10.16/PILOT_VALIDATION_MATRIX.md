# Softify Pilot Validation Matrix — Phase 10.16

This matrix defines the structured testing checklist, expected outcomes, and evidence requirements to formally validate the pilot workspace connection.

| Area | Test / Validation | Expected Result | Evidence to Capture | Pass / Fail | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cloud Run Health** | Check container boot-up and runtime status. | `NODE_ENV=production` active; Firestore database checks complete with no timeouts. | Container startup log output. | [ ] Pass / Fail | Checked in console |
| **Firestore Backend** | Check repository connection status. | `REPOSITORY_BACKEND=firestore` active; in-memory database blocked in production. | diagnostics `/api/diagnostics` JSON response. | [ ] Pass / Fail | Required release gate |
| **Store Connection** | Complete Shopify OAuth callback logic. | Store connections stored in `shopify_store_connections` collection in Firestore. | Firestore document sample with Connection status. | [ ] Pass / Fail | AES decrypted safely |
| **Readiness Endpoint** | Query GET `/api/shop/readiness`. | Returns `CONNECTED` status, snapshot count, and read-only scopes. | JSON response schema check. | [ ] Pass / Fail | Sanitized of secrets |
| **Product Sync** | Trigger POST `/api/catalog/products/sync`. | Product snapshots synchronised and stored securely in Firestore database. | Firestore product snap counts. | [ ] Pass / Fail | Trimmed schemas |
| **Agent Catalog** | Query GET `/api/agents/catalog`. | Exactly five active production-safe agents returned. Legacy agents hidden. | Agent grid UI screenshot. | [ ] Pass / Fail | Catalog Health, etc. |
| **agent_catalog_health** | Run health diagnostics scan. | Returns health scores by deducting points based on catalog missing fields. | Recommendation inbox sample. | [ ] Pass / Fail | Safe constants |
| **agent_product_seo** | Run SEO optimization scan. | Generates draft proposed actions strictly capped to SEO allowed fields. | Proposal database changes. | [ ] Pass / Fail | Capped metadata |
| **agent_catalog_cleanup** | Run cleanup diagnostic scan. | Generates draft proposed actions for inactive, duplicate, or stale titles. | Proposal database changes. | [ ] Pass / Fail | Capped metadata |
| **agent_merchandising** | Run merchandising insights scan. | Returns read-only metrics. Proposal and mutation tools completely blocked. | Gateway allowed/blocked logs. | [ ] Pass / Fail | Zero write access |
| **agent_approval_ops** | Run approvals workspace scan. | Returns read-only approvals overview counts and Funnel statistics. | Analytics overview UI. | [ ] Pass / Fail | Zero write access |
| **Recommendations** | Review diagnostic recommendations inbox. | Recommendations saved cleanly in DRAFT state. No direct storefront mutations. | UI recommendations inbox. | [ ] Pass / Fail | Tenant isolated |
| **Proposed Actions** | Check draft proposed actions creation. | ProposedAction registered in Firestore collection with risk mapping details. | UI compare changes compare card. | [ ] Pass / Fail | Tenant isolated |
| **Approval Request** | Bridge draft actions to approvals list. | Action validated against per-agent allowed fields and bridged to PENDING queue. | Firestore approvals queue state. | [ ] Pass / Fail | Dynamic field gating |
| **Approve / Reject** | Merchant decides on pending approval list. | Item transitions transactionally to APPROVED or REJECTED. Transition logs created. | Transition audit log sample. | [ ] Pass / Fail | Concurrency claim locks |
| **No Auto-Execution** | Approve a pending proposed action. | Item status set to APPROVED. Storefront remains strictly unchanged. | Shopify product page check. | [ ] Pass / Fail | Gated deferred execution |
| **Read-Only Gating** | Click execute commit on read-only store. | Executor blocks write, returns EXECUTION_BLOCKED. UI shows amber banner. | Amber warning UI screenshot. | [ ] Pass / Fail | write_products missing |
| **Telemetry Security** | Check agent chat and gateway logs. | Log entries scrubbed of access tokens, client secrets, prompts, or reasoning. | Sample `agent_audit_logs` document. | [ ] Pass / Fail | Central sanitizer |
| **Tenant Isolation** | Pass mismatched organizationId in headers. | Routes return clean `403 Forbidden` early. No database writes or side effects. | Express 403 response payload. | [ ] Pass / Fail | Resolved via platform context |
| **Forbidden Fields** | Submit proposal containing vendor changes to SEO agent. | Tool Gateway blocks proposal dynamically, rejecting the forbidden inputs. | Gatekeeper bridge rejection log. | [ ] Pass / Fail | Strict per-agent gate |
| **Forbidden Scopes** | Inject theme tools execution call. | Tool Gateway rejects execution early; theme scopes remain completely unauthorized. | Audit block log entry. | [ ] Pass / Fail | No read/write themes |
| **Recovery Endpoints** | Trigger operator recovery reset-failed endpoint. | Endpoint remains state-only; changes status to FAILED. Never calls Shopify. | API JSON response schema check. | [ ] Pass / Fail | Containment constraint |
| **Analytics Drawer** | Open analytics metrics drawer. | Timelines load read-only. Metrics scrubbed of developer prompts/PII. | Timeline trace UI screenshots. | [ ] Pass / Fail | Strict allowlist mappers |
