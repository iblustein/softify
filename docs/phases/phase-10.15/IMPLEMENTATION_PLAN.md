# Implementation Plan — Phase 10.15: Production Deployment & Pilot Readiness Checklist (Refined)

This phase defines the comprehensive deployment validation procedures, environment audits, security checkmarks, and operational pilot-readiness go/no-go criteria to transition **Softify** safely into a production-ready pilot state. 

All steps in this phase are purely planning, validation, and documentation-focused. No runtime code changes, scope expansions, or AI provider swaps will be made.

---

## 1. Cloud Run Deployment Readiness

To ensure the automated CD pipeline is flawless and fully validated, we will verify the following workflow sequence in our CI/CD setups (e.g. GitHub Actions):

- **Continuous Integration (CI)**:
  - `npm ci`: Ensures clean, locked dependency installations.
  - `npm run lint` (`tsc --noEmit`): Confirms complete type safety.
  - `npm run build`: Packages both frontend React assets via Vite and compiles the Express backend via esbuild into `dist/server.cjs`.
  - `node scripts/release-check.mjs`: Statically asserts all 58 pre-deployment security guardrails.
- **Continuous Deployment (CD)**:
  - Deploys the service to **Google Cloud Run** using Google's source-based deployment workflow (automatically building the container serverless-side via Google Cloud Build).
  - Automatically executes dynamic integration smoke tests (`node scripts/smoke-test.mjs`) targeting the newly deployed Cloud Run URL.
- **Production Gating**:
  - Assert that the deployed service runs with `NODE_ENV=production`.
  - Assert that the deployed service runs with `REPOSITORY_BACKEND=firestore` (strictly verified by diagnostics `firestoreDatabaseConfigured: true` and `repositoryBackend: "firestore"` in the smoke test diagnostics preflight).

---

## 2. Firestore / In-Memory Backend Guardrail

We establish a strict, required operational release approval gate for persistence backends to protect storefront metadata integrity:

- **Sandbox/Testing Contexts Only**: The mock in-memory database (`REPOSITORY_BACKEND=memory`) is strictly reserved for local development and local smoke testing where explicitly intended.
- **Durable Production Persistence**: Google Cloud Run deployments, staging environments, and production pilot instances must **never** run with the in-memory backend.
- **Operational Release Approval Gate**:
  - The deployment pipeline and operational readiness review are structurally barred from final release approval if `REPOSITORY_BACKEND` is set to `memory` or if Firestore connectivity is diagnosed as unhealthy.
  - The local in-memory backend is **not** physically deleted, ensuring development sandbox testing remains fully functional.
  - No runtime persistence routing behavior will be altered in this phase.

---

## 3. Environment Variables and Secrets Readiness

We audit and document the precise set of environment variables and secrets required in GCP and Cloud Run configuration:

### A. Environment Variables (Cloud Run Configurations)
- `PORT`: Ephemeral port assigned by Cloud Run (defaults to `8080` in production).
- `NODE_ENV`: Must be strictly set to `"production"`.
- `REPOSITORY_BACKEND`: Must be strictly set to `"firestore"`.
- `SHOPIFY_API_KEY`: Client ID for the Shopify app (configured as a regular public environment variable, not stored in Secret Manager).
- `SOFTIFY_ALLOW_AGENT_DEV_BYPASS`: Must be strictly set to `"false"` (or left unset) by default in the production configuration. 
  > [!WARNING]
  > - **Smoke-Test Execution Only**: `SOFTIFY_ALLOW_AGENT_DEV_BYPASS="true"` is allowed *only* during controlled smoke-validation pipeline runs and must **never** be exposed in the default merchant pilot environment.
- `FIRESTORE_DATABASE_ID`: Identifies the target Firestore instance (`(default)` or dedicated sandbox).
- `SHOPIFY_APP_URL`: The fully qualified public HTTPS domain of the Softify Cloud Run service.

### B. GitHub Actions authentication via Workload Identity Federation
- **Workload Identity Federation (WIF)**: GitHub Actions authenticates securely to Google Cloud using short-lived tokens via OIDC (OpenID Connect). We **do not** use long-lived service account JSON keys (`GCP_SA_KEY`).
- Secrets configured in GitHub Actions:
  - `GCP_WORKLOAD_IDENTITY_PROVIDER`: The unique identifier of the Workload Identity Pool Provider.
  - `GCP_SERVICE_ACCOUNT`: The IAM service account email to impersonate.
  - `SOFTIFY_AGENT_DEV_BYPASS_SECRET`: Dev bypass token used strictly during the dynamic smoke-testing deployment step.

### C. GCP Secret Manager Secrets
- `SHOPIFY_API_SECRET`: Client secret used for OAuth code exchanges.
- `SHOPIFY_TOKEN_ENCRYPTION_KEY`: A cryptographically strong 32-byte AES-256-GCM key for encrypting Shopify access tokens.
  > [!IMPORTANT]
  > - **Do NOT rotate** the `SHOPIFY_TOKEN_ENCRYPTION_KEY` during this phase, as rotation will break existing encrypted tokens.
  - **No commits or logs**: Shopify API secrets and encryption keys must **never** be committed to Git or printed in application/pipeline logs.

---

## 4. Shopify Store Connection and Scopes

We validate that the Shopify OAuth handshake and scope boundaries remain tightly locked and secure:

- **OAuth Flow Validation**: Verify the OAuth redirection and code exchange against a controlled Shopify Partner sandbox store or a safe, real development store.
- **Readiness Integration**: Validate the readiness endpoint (`GET /api/shop/readiness`) behavior, asserting it safely parses store connections, flags sync gaps, and returns sanitized payloads free of PII or credentials.
- **Product Sync Validation**: Assert that the background synchronizer retrieves and upserts storefront metadata successfully into Firestore.
- **Scope Gating**:
  - The default Shopify scopes requested during the OAuth handshake are strictly configured to: `read_products`, `read_orders`, and `read_customers`.
  - Controlled sandbox execution testing is permitted to use `write_products` **only if** explicitly approved by the merchant.
  - No broad Shopify scopes (such as `read_themes` or `write_themes`) will be added in this phase.
  - **Internal Authority**: Even if Softify later receives broader scopes from Shopify, all storefront mutations will be Authoritatively restricted, gated, and filtered inside Softify’s internal security layers (Tool Gateway, Agent Field Policies, and Approved Mutation Executor Service).

---

## 5. Merchant Workspace Validation Checklist

We outline the exact operational checklist to validate that the pilot workspace behaves as expected:

1. **Readiness Dashboard**:
   - Displays correct green `CONNECTED` status when OAuth scopes are resolved.
   - Shows correct amber warnings if Shopify sync has not run within 24 hours.
   - Blocks execution CTAs dynamically if the store lacks `write_products` scopes.
2. **Agent Catalog**:
   - Displays exactly the five active production-safe agents (`Catalog Health`, `Product SEO`, `Catalog Cleanup`, `Merchandising Insights`, `Approval Operations`).
   - Legacy agents are omitted from display.
3. **Product Synchronization**:
   - `POST /api/catalog/products/sync` correctly triggers sync and returns snapshot totals without exposing token keys.
4. **Agent Diagnostics & Scans**:
   - Launching a diagnostic scan maps correctly to the agent's safe read-only tools.
   - Agent generates accurate draft recommendations.
5. **Proposed Actions Management**:
   - Proposed actions are successfully saved in DRAFT state.
   - Dynamic status warning badges are rendered next to status-altering updates.
   - Clicking "Request Approval" transitions actions to the `PENDING` queue.
6. **Approvals Gating**:
   - Merchants can approve or reject pending items inside the detail drawer.
   - The queue displays a prominent orange alert and confirmation overlays for status mutations.
   - **No Auto-Execution**: Safe default ensures no mutations are committed without manual, explicit merchant triggers.
   - **Blocked Mutation Overlay**: If `write_products` is missing, the approve/execute buttons are replaced with a clear amber "Mutations Blocked" badge.
7. **Read-Only Workspace Analytics**:
   - Dashboard counts, charts, and chronological audit timelines load successfully in read-only mode without any write requests.

---

## 6. Security and Negative-Path Validation

We define a rigorous validation matrix to verify that the application rejects malicious or unauthorized operations:

- **Legacy Agent Execution Block**: Querying `POST /api/agent-runs` with hidden/legacy agent IDs (e.g. `product_intelligence_agent`) must fail with a `403 Forbidden` and the exact gated message.
- **Registry Hiding**: Legacy agents do not appear in the catalog JSON returned by the public API.
- **Read-Only Gating**:
  - `agent_merchandising_insights` and `agent_approval_operations` do not possess any proposal tools and cannot create `ProposedAction` objects.
  - Direct execution requests or decision entries targeting read-only scopes are blocked.
- **Per-Agent Schema Compliance**:
  - `Product SEO` proposed actions containing `vendor` or `status` are blocked at bridge time and batch approval routes.
  - `Catalog Cleanup` proposed actions containing `title` are blocked.
- **Tenant Context Isolation**:
  - Passing mismatched `organizationId` or `shop` parameters in headers or query parameters yields an early `403 Forbidden`.
  - Audits, approvals, and product snapshot queries check tenant ownership strictly.
- **Durable Recovery Boundaries**:
  - The stuck-execution recovery and state-reset routes (`/api/approvals/:id/reset-failed`) must remain state-only and **never** perform direct Shopify API mutation calls.
- **Exclusion of High-Risk Scopes**:
  - Zero references to theme tools (`theme.assets.patch` etc.) or theme scopes (`read_themes`, `write_themes`) in active production code.
  - Zero price, inventory, variant, media, or `descriptionHtml` mutations allowed in the Approved Product Mutation Executor Service.
- **Data Leak Prevention**:
  - No raw user prompts, model reasoning, raw provider output, raw tool arguments, raw Shopify payloads, access tokens, client secrets, or PII are exposed in public endpoints, client payloads, or audit logs.

---

## 7. AI Provider Extensibility Guardrail

While we preserve the current stateless mock and Gemini provider implementations in this phase, we strictly ensure that all current architectures remain **AI-neutral** and open to future routing capabilities:

- **Stateless Advice Framework**: AI providers function solely as stateless recommendation advisors. They are completely decoupled from active database writes or direct tool dispatch.
- **Stateless Interface**: The AI provider abstraction interface (`AiProvider`) will remain provider-neutral. It takes an agent definition, user query, and allowed tools, and outputs either a final message or a tool-call request.
- **Neutral Execution Boundary**: The AI provider does **not** execute tools directly. All tool dispatch, permission checks, and approvals are handled natively by Softify’s Tool Gateway and Approved Product Mutation Executor.
- **Future Routing Readiness**: Ensure that no Phase 10.15 configuration or deployment mapping hard-codes settings in a way that prevents future per-agent or per-tenant AI provider selection (e.g. routing specific tasks to Gemini, OpenAI, Claude, or local heuristics).

---

## 8. Pilot Go/No-Go Criteria

We establish formal gates that must be satisfied before the pilot is formally cleared for launch:

| Category | Go Criteria | No-Go Criteria |
| :--- | :--- | :--- |
| **Deployment Readiness** | Continuous integration passes all 58 pre-deployment static release checks. | Deployment pipeline fails static release-checks, type-safety, or lint checks. |
| **Shopify Connection** | OAuth code exchange and normalized store readiness diagnostics return `CONNECTED` and synced. | OAuth redirect loops, missing scopes, or readiness failures. |
| **Firestore Persistence** | `REPOSITORY_BACKEND=firestore` is active. All store connections and product snapshots load correctly. | Cloud Run starts with memory backend or Firestore connections timeout. |
| **Scope Gating** | Default Shopify scopes are configured strictly to `read_products`, `read_orders`, and `read_customers`. | Unauthorised scopes (`read_themes`, `write_themes`) requested during OAuth. |
| **Merchant Safety** | `canExecuteActions` is `false` for mutating agents. Merchant manual approval required for execution. | Auto-execution active or background storefront mutation leaks. |
| **Telemetry & Audit** | Chronological audit logs are successfully created and sanitized of credentials, messages, or args. | Sensitive fields, access tokens, or raw prompts leak in audit logs. |
| **Rollback / Stop** | Immediate rollback capability to previous Cloud Run revisions enabled via GCP Console. | Missing active revision backup or locked deployment configurations. |

---

## 9. Documentation Maintenance

Following the successful validation and verification of the deployment, the following files will be fully updated to reflect the pilot-ready state:

- `docs/phases/phase-10.15/WALKTHROUGH.md`: Architectural walk-through of the deployment pipeline and pilot validations.
- `docs/phases/phase-10.15/REVIEW_NOTES.md`: Security review assertions and sandbox containment notes.
- `docs/phases/phase-10.15/VERIFICATION.md`: Verification logs from Cloud Run preflights and smoke-test runs.
- `docs/ai-handoff/SOFTIFY_PROJECT_STATE.md`: Standardize overall project status and validation logs.
- `docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md`: Formulate transfer protocols for the next phase.
- `docs/ai-handoff/NEXT_STEPS.md`: Detail the milestone transition tasks.
- `docs/PHASE_INDEX.md`: Register Phase 10.15 as Completed.
