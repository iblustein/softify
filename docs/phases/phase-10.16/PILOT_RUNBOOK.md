# Softify Pilot Runbook — Phase 10.16: MVP Pilot Launch & Onboarding

This runbook defines the operator-facing procedures to execute the **Softify** live MVP pilot under strict containment and safety constraints.

---

## 1. Pilot Purpose & Environment

### A. Purpose
To validate that the Softify SaaS agent workspace normalizes OAuth, synchronizes product metadata snapshots securely, and isolates diagnostics scans, approvals inbox queues, and trace telemetry audits under controlled sandbox connections without data pollution or security leaks.

### B. Allowed Pilot Environments
- **Primary Sandbox**: Designated Shopify Partner Sandbox / Development Stores (e.g., `yambasurf-co-il.myshopify.com` or dedicated sandbox stores).
- **Secondary (Real Store) Path**: Controlled real merchant Shopify store connection.
  - **Approval Gate**: Moving from a sandbox environment to a controlled real store requires **explicit, separate, and written authorization** from both the **Merchant Shop Owner** and the **Softify Security supervisor (ChatGPT)**.
  - **No Broad Rollouts**: No public merchant app store availability or uncontrolled storefront rollouts are allowed in Phase 10.16.

---

## 2. Required Preflight Confirmations

Before starting onboarding, the operator must verify the following preflight checks:

- [ ] **Release Verification**: Confirmed that `node scripts/release-check.mjs` executes and passes all 58 static checks.
- [ ] **Type Safety**: TypeScript linter completes with zero diagnostics compiler errors.
- [ ] **GCP environment verification**:
  - `NODE_ENV` is strictly set to `"production"`.
  - `REPOSITORY_BACKEND` is strictly set to `"firestore"`.
  - Firestore database check returns healthy diagnostics preflight status.
  - Public variables (`SHOPIFY_API_KEY`, `SHOPIFY_APP_URL`, `FIRESTORE_DATABASE_ID`) are bound.
  - Secret Manager binds `SHOPIFY_API_SECRET` and the cryptographically strong 32-byte `SHOPIFY_TOKEN_ENCRYPTION_KEY` version references correctly.
- [ ] **Dev Bypass Status**: Verified that `SOFTIFY_ALLOW_AGENT_DEV_BYPASS` is **disabled** (`"false"` or unset) in the production merchant configuration console, and remains acceptable solely during automated pipeline smoke testing.

---

## 3. Step-by-Step Pilot Flow

### Step 3.1: Initiating Connection & OAuth
1. Direct the pilot merchant to open the Softify workspace app URL.
2. Direct the merchant to complete the Shopify OAuth handshake screen.
3. Confirm that the default scopes are strictly gated to: `read_products`, `read_orders`, and `read_customers`.
4. Confirm that **no theme write scopes** (`read_themes` or `write_themes`) are requested.

### Step 3.2: Verifying Setup Readiness
1. Direct the merchant to load the embedded Softify dashboard panel.
2. Confirm the dashboard queries `GET /api/shop/readiness` successfully.
3. Verify that the Readiness Checklist displays:
   - Green connected status.
   - Verified read-only scopes.
   - Status badge: `Ready (Read-Only Insights)`.
   - **Amber mutation block panel** clearly explaining why write executions are disabled.

### Step 3.3: Verifying Product Metadata Sync
1. Direct the merchant to click "Synchronize Catalog Now" on the setup dashboard.
2. The UI triggers a `POST /api/catalog/products/sync` call.
3. In the console logs, verify the sync fetches products in chunks, formats snapshots cleanly, and upserts metadata snapshots securely into the `product_snapshots` Firestore collection.
4. Verify that the UI setup checklists update snapshot count totals (e.g. `Catalog Synchronized: 5 products`).

### Step 3.4: Verifying the Five Production-Safe Agents
1. Verify the workspace dashboard displays exactly the five catalog agents:
   - `Catalog Health`
   - `Product SEO`
   - `Catalog Cleanup`
   - `Merchandising Insights`
   - `Approval Operations`
2. Confirm that legacy development or unconfigured agents are completely omitted from display.

### Step 3.5: Reviewing Recommendations & Bridging Approvals
1. Direct the merchant to launch a diagnostic scan using the `Catalog Health` or `Product SEO` agent.
2. The UI calls `POST /api/agent-runs`. Confirm in logs the stateless mock AI provider executes.
3. Verify that diagnostic recommendations populate the merchant inbox in `DRAFT` state.
4. Direct the merchant to click **"Request Approval"** on a proposed draft tags or product type revision.
5. In Firestore, confirm that the action is validated against per-agent allowed field schemas and bridged transactionally into the `merchant_approvals` queue in `PENDING` state.

### Step 3.6: Testing Approvals Without Auto-Execution
1. Direct the merchant to open the approvals list drawer.
2. Direct the merchant to approve the pending product change.
3. In the database, confirm that the approval transitions to `APPROVED` status.
4. **Auto-Execution Isolation Check**: Verify that the storefront remains completely unmodified. Softify must perform **zero automatic storefront updates**.

### Step 3.7: Handling Read-Only Execution Gating
1. Direct the merchant to click "Execute Commit" inside the approved drawer.
2. Verify that Softify's `ApprovedProductMutationExecutorService` blocks the mutation, returns `EXECUTION_BLOCKED` status, and logs a clean rejected state.
3. Confirm that the UI replaces execute CTA controls with a prominent amber-tinted **"Mutations Blocked (Read-Only Mode)"** badge explaining why writes are blocked on read-only scope connections.

---

## 4. Separately Approved Sandbox write_products Path

If the merchant has explicitly approved sandbox mutation testing, execute the following *separately approved* sequence:

> [!WARNING]
> **SEPARATELY APPROVED PATH ONLY**
> Do not request or enable the write scope by default. This path is permitted solely for sandboxed, developer-validated test environments after explicit pilot authorization.

1. Configure the sandbox store connection to request the expanded `write_products` scope during OAuth.
2. Confirm the Readiness status badge updates to `Ready (Full Access)`.
3. Approve a proposed SEO product type update (`APPROVED` state).
4. Click "Execute Commit".
5. Verify that the Approved Product Mutation Executor resolves the token, formats the Admin GraphQL write payload strictly capped to allowed fields (`title`, `vendor`, `productType`, `status`, `tags`), and commits the write to Shopify.
6. Verify that variant, price, variant inventories, media, or descriptionHtml mutations are **completely skipped/ignored** by the executor.
7. Confirm that the approvals item transitions cleanly to `APPLIED` status.

---

## 5. Stop / Rollback Procedure

> [!CAUTION]
> **IMMEDIATE SUSPENSION GATES**
> Trigger immediate rollback and suspend the pilot operations if any of the following conditions are encountered:

- **Isolation Mismatch**: Mismatched organization headers or tenant context leaks.
- **Secrets Exposure**: Access tokens, secret manager values, or bypass keys visible in logs or client payloads.
- **Raw Telemetry Leak**: Raw prompt strings or raw provider reasoning traces visible in public analytics steppers or logs.
- **Misgated mutation**: Any automated write attempt, write trigger without explicit merchant dispatch, or mutation targeting high-risk variant/price fields.
- **GCP configuration error**: In-memory database (`REPOSITORY_BACKEND=memory`) detected inside production Cloud Run containers.

### Rollback Execution Steps:
1. Access the Google Cloud Platform Console.
2. Navigate to Cloud Run revision dashboards.
3. Locate the previous, stable, pre-deployment revision.
4. Click **"Route 100% of traffic to this revision"** to instantly restore the preceding container state.
5. Disable the pilot store connection in Secret Manager/IAM environments if required to prevent unauthorized routing.

---

## 6. Escalation & Evidence Capture

### A. Escalation Path
- **Level 1 (Operator)**: Initial logs observation and error parsing.
- **Level 2 (Lead Architect)**: Code containment analysis and Secret Manager audit.
- **Level 3 (Security Supervisor)**: ChatGPT Gatekeeper final rollback and sandbox containment sign-off.

### B. Evidence to Capture
During the pilot, operators must capture and record:
1. Deployed `/api/diagnostics` JSON response payload.
2. `/api/shop/readiness` connection scopes array.
3. Sanitized audit record sample from Firestore collection `agent_audit_logs`.
4. Gateway decision metadata trace showing allowlisted field filter logs.
5. UI screenshot of the amber blocked execution banner.
