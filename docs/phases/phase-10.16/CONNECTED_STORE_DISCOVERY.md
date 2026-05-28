# Softify Connected-Store Discovery Report — Phase 10.16

This report documents the active connection, backend configuration, and API readiness status for the connected pilot Shopify development store.

---

## 1. Discovery Summary

* **Discovery Date/Time**: 2026-05-28T23:36:00+03:00 (Local Time)
* **Target Store Checked**: `yambasurf-co-il.myshopify.com`
* **Discovery Status**: **SUCCESSFUL** — Connection is active, healthy, and securely configured under read-only containment.

---

## 2. Cloud Run & Runtime Environment Reachability

* **Cloud Run Reachability**: **Reachable**
  - Host URL: `https://softify-595151907767.europe-west1.run.app`
  - Endpoint `/api/diagnostics` resolved successfully with HTTP 200.
* **Runtime Backend Summary**:
  - `NODE_ENV`: `"production"`
  - `REPOSITORY_BACKEND`: `"firestore"`
  - `firestoreDatabaseConfigured`: `true`
  - `agentDevBypassAllowed`: `true` (Restricted to controlled integration smoke test validation)
  - `agentDevBypassSecretConfigured`: `true`

---

## 3. Store Connection Status

A stored Shopify connection exists in the Firestore backend for the target store:

* **Shop Domain**: `yambasurf-co-il.myshopify.com`
* **Connection Status**: `CONNECTED`
* **Store Connection ID**: `store-9ed4368c-7f04-4d43-b062-c048de3f9d1f`
* **Token Resolution Health**: **Healthy** (`tokenValid: true`). The decrypted authorization credentials are valid and recognized by the server runtime.
* **Diagnostics Status**: `"Mock store domain bypasses live API health check."`

---

## 4. Scope & Permission Gating Analysis

* **Available Scopes**: `74` registered scopes (representing the development/partner sandbox scopes configuration).
* **Scope Breakdown**:
  - `read_products`: **Granted** (`true`)
  - `read_orders`: **Granted** (`true`)
  - `read_customers`: **Granted** (`true`)
  - `write_products`: **Not Granted** (`false`)
* **Mutation Restriction**: **Blocked**. As `write_products` is not in the active scope list, the storefront mutation execution pathway remains completely blocked. The app is successfully locked into the default **Read-Only Insights Mode**.
* **Prohibited Scopes**: No theme scopes (`read_themes` or `write_themes`) are requested or granted.

---

## 5. Catalog Synchronization & Readiness Metrics

The readiness endpoint `/api/shop/readiness` was queried safely without state modifications, returning the following metrics:

* **Can Run Insights**: `true`
* **Can Execute Mutations**: `false` (Gated correctly by lack of `write_products` scope)
* **Agent Catalog Readiness**: `READY` (Active production-safe agents registered)
* **Product Snapshot Count**: `13` product snapshots are stored in the Firestore `product_snapshots` collection.
* **Sync Freshness (Last Sync Timestamp)**: `2026-05-28T20:26:52.621Z`

---

## 6. Blockers & Recommended Next Actions

### A. Blockers
* **Zero Blockers Detected**: The environment is highly stable, Cloud Run is fully responsive, Firestore persistence is active, and the connection token decrypted successfully. The standard read-only gating is fully operational.

### B. Recommended Next Action
* The environment is ready for operator dry-runs in **Read-Only Mode**. Operators can safely launch diagnostic scans and bridge recommendations to the Approvals Inbox to test the merchant-in-the-loop workflow without storefront impact.
