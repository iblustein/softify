# Softify Merchant Onboarding Checklist — Phase 10.16: MVP Pilot Launch

This checklist guides pilot merchants and onboarding operators through the onboarding sequence to connect, configure, and validate a pilot store safely.

---

## 1. Onboarding Checklist

### A. Initial Connection & Scopes
- [ ] **Step 1: Install Shopify App**
  - Trigger installation via the Softify workspace app URL.
  - Confirm the Shopify Partner app dashboard registers the installation request.
- [ ] **Step 2: Complete OAuth Redirections**
  - Accept redirections and complete the OAuth authentication loops.
  - Confirm that the store connection is persisted and can be resolved securely by the backend.
- [ ] **Step 3: Verify Minimum Scopes Gating**
  - Check the OAuth handshake list and confirm scopes are strictly read-only:
    - `read_products` (Required to fetch catalog metadata snapshots)
    - `read_orders` (Required to fetch read-only merchandising metrics)
    - `read_customers` (Required to fetch read-only buyer diagnostics)
  - Verify that **no theme scopes** (`read_themes` or `write_themes`) are requested.

### B. Readiness & Workspace Verification
- [ ] **Step 4: Check Store Setup Readiness**
  - Open the embedded Softify app inside Shopify Admin.
  - Confirm that the Setup Readiness Checklist panel loads at the top of the dashboard.
  - Verify that the card displays the green **CONNECTED** status and a `Ready (Read-Only Insights)` access badge.
- [ ] **Step 5: Run Initial Product Snapshot Synchronization**
  - Click "Synchronize Catalog Now" on the readiness checklist.
  - Confirm that product synchronization completes and updates snapshot totals cleanly.
- [ ] **Step 6: Confirm Workspace Dashboard Loading**
  - Confirm that the catalog grid workspace (`AgentWorkspace.tsx`) loads with dynamic components and no infinite spinners.
- [ ] **Step 7: Confirm Agent Catalog Provisioning**
  - Confirm that the catalog grid shows exactly five active production-safe agents:
    - `Catalog Health`
    - `Product SEO`
    - `Catalog Cleanup`
    - `Merchandising Insights`
    - `Approval Operations`
- [ ] **Step 8: Confirm Analytics and Telemetry Visibility**
  - Open the workspace analytics drawer and verify chronological timeline traces and funnels load under strictly sanitized read-only metrics.

---

## 2. What Softify Can and Cannot Do During the Pilot

To ensure absolute security and storefront containment, please review the pilot capabilities:

### What Softify CAN Do:
- **Fetch Products Read-Only**: Safely sync product text metadata (titles, vendors, tags, types, statuses) into Firestore snapshot collections.
- **Compute Catalog Insights**: Calculate overall catalog health scores, missing descriptions, missing vendors, and type distributions.
- **Generate Recommendations**: Offer draft proposed revisions inside the recommendations inbox.
- **Queue Merchant Approvals**: Bridge actions from draft state to a secure merchant approvals list.
- **Provide Audit Visibility**: Record sanitized trace logging trails mapping agent execution paths.

### What Softify CANNOT Do (Authoritative Guardrails):
- **No Theme Mutating**: Softify possesses zero theme scopes and cannot modify theme assets, layouts, styles, or templates.
- **No High-Risk Mutations**: Softify cannot mutate prices, inventory counts, variant details, product media, or product `descriptionHtml`.
- **No Auto-Execution**: Softify contains absolutely **no automatic execution pathways**. Approving a proposal *only* changes its status in the approvals database; it will **never** commit updates to Shopify automatically.
- **No Direct AI Writes**: AI providers function purely as stateless advisors and have no access to token decryptors, databases, or live store write APIs.
- **No Misgated Writes**: All manual execution commits remain strictly blocked with a prominent amber **"Mutations Blocked (Read-Only Mode)"** banner unless the store connection is separately approved and scoped with `write_products` permissions.
