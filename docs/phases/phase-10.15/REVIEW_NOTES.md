# Security & Gatekeeper Review Notes — Phase 10.15: Production Deployment & Pilot Readiness Checklist (DRAFT)

> [!WARNING]
> **DRAFT / PENDING ARCHITECTURE & SECURITY REVIEW**
> This security review document is currently in a **DRAFT** state and is pending formal audit, validation, and approval by the external Architecture Supervisor & Security Gatekeeper (ChatGPT) prior to final pilot sign-off.

This document serves as the draft Security Review and Audit Report for **Phase 10.15: Production Deployment & Pilot Readiness Checklist**. It outlines the strict security guardrails, sandbox containment strategies, zero-trust cloud configuration, and tenant-safe isolation checks configured prior to Softify's live production pilot launch.

---

## 1. Zero-Trust Access & Workflow Security

To protect live Shopify stores and internal metadata integrity, Softify restricts access paths and avoids credential longevity entirely.

### A. Workload Identity Federation (WIF)
- **Elimination of Long-Lived Service Account Keys**: In GCP, we have decommissioned static JSON keys (`GCP_SA_KEY`). Static keys represent high-risk exposure if leaked from developer machines or workflow logs.
- **Short-Lived OIDC Authentication**: GitHub Actions leverages OpenID Connect (OIDC) to exchange a dynamic GitHub JWT with Google's Security Token Service (STS) dynamically.
- **Minimum IAM Permissions**: The impersonated Service Account is strictly restricted to Cloud Build uploads and Cloud Run deployment management, lacking broad organization or project permissions.

### B. Shopify API Access Scope Gating
- **Strict Minimum Principle**: Softify requests only three standard read-only scopes during merchant installation/handshake:
  - `read_products`
  - `read_orders`
  - `read_customers`
- **Theme and Layout Asset Immunity**: Zero references to theme scopes (`read_themes`, `write_themes`) or theme-patching endpoints (`theme.assets.patch`) in the active production codebase.
- **Authoritative Internal Gating**: Even if the Shopify installation provides broader write scopes (e.g. `write_products`), all storefront mutation commands are rigorously parsed, validated, and restricted inside Softify's internal Tool Gateway and Approved Product Mutation Executor.

---

## 2. Secrets Separation & Safe Persistence Routing

### A. Environment Configuration Hygiene
- **Public Variables**: Non-secret configurations such as `SHOPIFY_API_KEY`, `FIRESTORE_DATABASE_ID`, `SHOPIFY_APP_URL`, and `PORT` are declared directly in public deployment files or Cloud Run console environment maps.
- **Secret Manager Mapping**: High-security values such as `SHOPIFY_API_SECRET` and the `SHOPIFY_TOKEN_ENCRYPTION_KEY` are provisioned strictly via Secret Manager and bound dynamically to Cloud Run container variables.
- **Cryptographically Strong Keys**: The token encryption key is a cryptographically strong 32-byte AES-256-GCM key.
  - **No Rotations Allowed**: Under no circumstances should this key be rotated during active pilot phases, as rotation will break existing encrypted tokens.

### B. Persistent Database Guardrails
- **Operational Release Approval Gate**: Release approval is strictly withheld if the environment variable `REPOSITORY_BACKEND` is set to `"memory"`, or if Firestore database checks return unhealthy diagnostics in production.
- **Mock DB Sandbox Isolation**: The local in-memory database configuration is physically preserved but strictly restricted to development environments and dynamic testing environments.

---

## 3. Sandboxed Verification Containment

To avoid polluting live Firestore tables or database instances during verification, the release and smoke test workflows enforce complete isolation:

- **Dynamic Local Ephemeral Server**: During automated memory-mode smoke testing, the server is initialized on port `0` (`app.listen(0)`). The test runner dynamically resolves the assigned ephemeral port and terminates the server immediately upon completion, preventing dev server port collisions.
- **Firestore Sandbox Scope**: In Firestore-mode integration testing, verification is guarded by `SOFTIFY_ALLOW_FIRESTORE_SMOKE_FIXTURES=true`, target sandbox checking, and unique run IDs. All seeded test fixtures are deleted in a `finally` block.
- **Zero Startup Fixtures**: The production-ready codebase contains absolutely no mock seeding branches or test backdoor routes. The 58 static checks enforce the absence of test-fixture keywords (`test-invalid-seo-action`, `ACT-TEST`, etc.) inside the production source.

---

## 4. Operational Safety Matrix

| Threat / Risk | Mitigating Security Architecture | Verification Method |
| :--- | :--- | :--- |
| **Credential/Secret Leaks** | Secrets loaded via GCP Secret Manager; tokens encrypted at rest via AES-256-GCM; recursive trace log filters. | release-check.mjs (Tests 18, 19, 20, 35, 36) |
| **Unauthorized Shopify Mutation** | Strict manual Merchant Approvals queue; auto-execution is disabled; mutation writes capped at text fields. | smoke-test.mjs (Tests O, P, U, V) |
| **Cross-Tenant Escalation** | Tenant organization context verified on every API request. Mismatched contexts yield `403 Forbidden`. | smoke-test.mjs (Tests K, L, M, N) |
| **Legacy Agent Backdoor Execution** | Legacy agent registry excluded from UI; execution attempts blocked by Express routes with a `403`. | release-check.mjs (Test 58) & smoke-test.mjs (Test X) |
| **Database Pollution** | In-process ephemeral server instances; sandboxed tables; strict `finally` block teardown. | smoke-test.mjs (Test Suite cleanup) |
