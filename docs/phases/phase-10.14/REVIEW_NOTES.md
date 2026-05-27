# Security & Gatekeeper Review Notes — Phase 10.14

This document serves as the formal Security Review for **Phase 10.14: Initial Agent Set & Merchant Workflows**. It outlines the strict enforcement of security guardrails, tenant containment, and field policies within the Softify runtime.

---

## 1. Security Gatekeeper Assertions

### A. Containment of Write / Mutation Scopes
- **Text Fields Only**: Mutating capabilities remain strictly limited to the five safe product text fields: `title`, `vendor`, `productType`, `tags`, and `status`.
- **Blocked Write Fields**: Variants, prices, inventory adjustments, and media binary uploads remain completely blocked.
- **Per-Agent Hardening**: Allowed mutation fields are further gated at the agent level:
  - **Catalog Health**: Allowed: `title`, `vendor`, `productType`, `tags`. Forbidden: `status`.
  - **Product SEO**: Allowed: `title`, `productType`, `tags`. Forbidden: `vendor`, `status`, SEO metafields, handles, `descriptionHtml`.
  - **Catalog Cleanup**: Allowed: `vendor`, `productType`, `status`, `tags`. Forbidden: `title`.
  - **Insights & Operations**: Forbidden: All storefront write mutations and proposal generation tools.

### B. Prevention of Auto-Execution and Silent Writes
- **Manual Initiations Only**: Zero auto-execution pathways exist. Every proposed modification must be initiated by the merchant and approved inside the **Merchant Approval Safeguards Queue** before execution.
- **Audit Trails**: Every action (agent run creation, proposal generation, approval decison, explicit commit execution, stuck timer reset) generates a permanent audit event, securing historical compliance logs.

### C. Zero Secrets Exposure
- Decrypted tokens, client secrets, OAuth internals, prompts, reasoning traces, and PII are strictly excluded from API outputs and logs.

---

## 2. Tenant Isolation Enforcement

- **Strict Mismatch Checks**: Mismatched organization context on agent runs and approvals endpoints immediately rejects execution with `403 Forbidden`.
- **Shop Validation**: Shop domains are dynamically normalized and verified against store connections; mismatches trigger `403 Forbidden` early.
