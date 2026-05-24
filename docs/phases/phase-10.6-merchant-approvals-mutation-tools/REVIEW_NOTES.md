# Review Notes — Phase 10.6: Merchant Approvals & Mutation Tools Foundation

We have reviewed the architectural implementations and safety boundaries configured for **Phase 10.6: Merchant Approvals & Mutation Tools Foundation**.

---

## Architectural Review Items

### 1. Interception Strategy
- **Isolation**: AI engines remain stateless and are strictly forbidden from directly updating Shopify data. By implementing mutation interception inside `executeToolWithContextRaw`, we guarantee that no code path can trigger `shopify.products.update` or `theme.assets.patch` without routing through approvals.
- **Payload Sanitization**: The gateway ensures no access tokens, bypass secrets, or sensitive credentials leak into the `details` payload of the approval requests, preserving zero-PII leak safety parameters.

### 2. Double-Commit State Sync
- When an approval is accepted, the router commits mock catalog updates to the local mock products cache and simultaneously pushes to the Firestore `product_snapshots` collection (if database mode is configured). This ensures a consistent view across in-memory runs and persistent database clients alike.

### 3. Tenant Boundary Verification
- The GET `/api/approvals` and POST `/api/approvals/:id/decide` endpoints have been hardened to reject cross-tenant operations:
  - If a merchant attempts to query a shop belonging to a different organization, a `403 Forbidden` status is returned.
  - If a decide payload contains an `organizationId` different from the approval's parent tenant, the operation is blocked.

### 4. Telemetry and Audits
- Chronological approval actions (`APPROVAL_CREATED`, `APPROVAL_APPROVED`, `APPROVAL_APPLIED`, `APPROVAL_REJECTED`) are strictly audited via the async `writeAuditEvent` framework.
- The `agent_audit_logs` record the exact sequence of transitions, ensuring complete transparency and compliance.
