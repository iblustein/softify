# Architectural Review Notes — Phase 10.11

These notes provide security and architectural review parameters for the Lead Architect, verifying the strict preservation of system boundaries during Phase 10.11 implementation.

---

## Strict Architectural Bounds Preserved

### 1. Manual Execution & No Auto-Execution
- **Deferred Mutation Gating**: Deciding `APPROVE` on an approval request (`POST /api/approvals/:id/decide`) strictly updates the database state to `APPROVED` and returns a containment response. It **never** invokes any live Shopify mutation.
- **Explicit Execution Trigger**: Shopify storefront writes are solely initiated through an explicit manual trigger calling `POST /api/approvals/:id/execute` with appropriate actor credentials.

### 2. Capped Product Mutation Scope
- All agent product proposal writes remain strictly capped to approved text/array attributes: `title`, `vendor`, `productType`, `status`, and `tags`.
- No price mutations, variant updates, inventory edits, media uploads, or HTML description edits exist or are possible in the GraphQL client.

### 3. No New Shopify Mutation Paths
- The codebase continues to use the existing safe `productUpdate` GraphQL mutation inside `src/server/services/shopify-admin-client.service.ts` routed through the `ApprovedProductMutationExecutorService`. No custom GraphQL mutations or REST write paths were introduced.

### 4. Zero Direct AI Path / Unified Tool Gateway
- LLM providers remain sandboxed and cannot execute tools directly. The unified `Tool Gateway` is the single authoritative boundary for all tool dispatching.

### 5. Strictly State-Only Recovery
- The operator recovery endpoints `/api/approvals/:id/reset-failed` and `/api/approvals/:id/mark-execution-failed` perform strictly local database document state resets and **never** communicate with the live Shopify API.
- Re-entering execution from a failed state requires the merchant to explicitly click "Reset Failed Status", followed by clicking the "Execute Commit" CTA.

### 6. Read-Only GET-Only Analytics
- The operational analytics routes inside `src/server/routes/analytics.routes.ts` remain strictly read-only GET routes. No non-GET analytics endpoints exist, and any other HTTP verbs are blocked with a `405 Method Not Allowed` response.

---

## Security Scrutiny Assertions

### 1. Raw Payload & Secret Containment
- The `Changes Payload` raw JSON pre block was completely removed from the workspace UI.
- Allowlisted field rendering checks verify that only the sanitized fields are mapped side-by-side.
- No access tokens, bypass keys, raw Shopify GraphQL responses, prompts, model reasoning, or PII are exposed inside database logs, telemetry outputs, or frontend lists.

### 2. Tenant Context Scoping
- Mismatched request headers are securely rejected at the route boundaries with `403 Forbidden` responses.
- Every workspace fetch in `AgentWorkspace.tsx` successfully passes the normalized `shopQuery` query parameter, ensuring secure tenant isolation inside embedded Shopify iframe contexts.

---

## Follow-up Notes / Non-blocking Technical Debt

- `scripts/smoke-test.mjs` still uses `demo-org-id` as a smoke-test fixture. This is acceptable for Phase 10.11 because it is isolated to test code and no longer appears in production-facing frontend code.
- Before Phase 10.12, especially if Phase 10.12 introduces Bulk Operations, review whether tenant test fixtures should be centralized into named constants or test configuration, for example:
  - `TEST_ORGANIZATION_ID`
  - `TEST_SHOP`
  - `TEST_STORE_CONNECTION_ID`
- Goal: avoid confusion between test fixture tenant IDs and production tenant context, and reduce the risk of accidentally copying fixture tenant IDs into runtime frontend/backend code.
- This is non-blocking and does not require immediate code changes.
