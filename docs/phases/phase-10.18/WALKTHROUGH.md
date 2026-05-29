# Walkthrough — Phase 10.18: Merchant Onboarding UX & Read-Only Pilot Polish

This document provides a comprehensive walkthrough of the changes implemented during **Phase 10.18 — Merchant Onboarding UX & Read-Only Pilot Polish** to resolve the readiness allowlist regression and polish the read-only pilot merchant experience.

---

## 1. Scope Pruning in Environment Configuration

To satisfy strict project guardrails, we reviewed and pruned `SHOPIFY_SCOPES` across committed configurations to remove unnecessary and potentially high-risk permissions:
- **Removed scopes**: Stripped `read_themes`, `write_themes`, `read_customers`, and `read_content` entirely.
- **Configured Scopes**: `SHOPIFY_SCOPES="read_products,read_orders"`.
- **Committed files updated**:
  - [`.env.example`](file:///c:/Projects/softify/softify/.env.example)
  - [`cloudrun-firestore.env.yaml`](file:///c:/Projects/softify/softify/cloudrun-firestore.env.yaml)
  - [`src/server/config/shopify.config.ts`](file:///c:/Projects/softify/softify/src/server/config/shopify.config.ts)

---

## 2. Dynamic Readiness Gating in Approval Queue

To enforce absolute read-only containment in the UI:
1. **Endpoint Alignment**: Configured `ApprovalQueue.tsx` to fetch the authoritative pilot readiness endpoint (`/api/pilot/readiness`) instead of `/api/shop/readiness`.
2. **Strict UI Gating**: Replaced all `hasWriteProducts` gates for showing/enabling live execution buttons with `readiness.canExecuteMutations === true`.
3. **Execution Block Disclaimer**:
   - If a merchant connection has write scopes but `canExecuteMutations` remains false, the queue renders:
     `"Write scope detected — execution is still blocked by read-only pilot policy. This suggested change has been approved and staged in Softify. Softify will not write product changes to Shopify during this read-only pilot."`
   - In Phase 10.18, all live storefront writes remain strictly disabled, and approved suggestions are staged cleanly inside Softify.

---

## 3. Visual Wording Audit & Jargon Elimination

We audited all merchant-facing text to eliminate internal technical jargon and replace it with user-friendly terms:

### A. Dashboard Overview
- Swapped *“Successfully authenticated using Managed Agents OAuth API”* for **“Shopify store connection is active.”**
- Swapped *“Specialized Gemini Agent workers require additional permissions to invoke tools in the Tool Gateway...”* for **“Your store connection is missing required permissions for this pilot. Please reconnect your store.”**
- Swapped *“Connect Store via Simulated OAuth”* for **“Demo Store Connection (Admin/Dev Only)”**.
- Swapped *“No real credentials required. Handshake simulates Shopify REST Admin credentials injection.”* for **“Admin/Dev demo connection only. Real merchant installs must use Shopify OAuth.”**
- Swapped *“Requested Scopes (Required capabilities for Agent tool gateways)”* for **“Requested permissions for this pilot”**.

### B. Agent Workspace
- Swapped *“Product Multi-Agent Workspace”* for **“Product Review Workspace”**.
- Swapped *“Analyze catalog compliance warnings and review safe product metadata suggestions in a sandbox environment.”* for **“Analyze synced catalog data and review suggested product improvements in safe read-only mode.”**
- Swapped *“Diagnostic Scanner Active”* and *“Scanner Settings”* for **“Product Analysis Active”** and **“Analysis Settings”**.
- Swapped *“Launch Diagnostic Scan”* console and button labels for **“Run Product Analysis”**.
- Removed all *“sandbox environment”* and *“mutation”* phrasing from connected-store context.

### C. Approval Queue & Final Copy Cleanup Pass
- Swapped live-store committing buttons for staged status tags:
  - Swapped *“Save Change to Shopify”* for **“Safe Mode Active (Staged)”**.
  - Swapped *“Saving Change to Shopify”* for **“Staging Change in Softify”**.
  - Swapped *“Changes Applied Successfully”* for **“Changes Staged Successfully”**.
  - Swapped batch *“Execute Commits”* for **“Save Batch”** (which remains safely disabled).
- **Batch Approval Confirmation**: Removed any instruction to execute approved items afterwards. Now strictly states: *“Approving is state-only and records your decision inside Softify. During this read-only pilot, approved suggestions remain staged in Softify and will not be written to Shopify.”*
- **Failure States**: Re-branded all internal technical failure and retry messages:
  - Swapped *“Save Attempt Failed”* for **“Staging Attempt Failed”**.
  - Swapped *“Retry Saving Change”* for **“Retry Staging”**.
  - Swapped raw connection details errors for staging verification-focused guidance: *“Product changes are not written to Shopify during this read-only pilot. This suggestion could not be staged or verified inside Softify.”*
- **Strict Fail-Closed Gating**: Hardened bulk execution actions, function calls, and the confirmation button inside the modal to be strictly fail-closed, ensuring that actions remain disabled if readiness is not loaded or `canExecuteMutations` is not explicitly `true`. Renders status-aware tooltips like *“Readiness status loading — changes are blocked”* during preflights.

---

## 4. Verification Highlights

- **Static Release Check Verification**: Passed all 58 safety rules and module validations successfully.
- **Dynamic Smoke Integration Suite**: Passed all 32 integration test suites cleanly (including allowlist access, scope stripping, and error blocks on Test Y).
- **Target Store Validation**: `yambasurf-co-il.myshopify.com` connection state and snapshots verify successfully.
- **Git Safety**: Checked that the local `.env` remains completely untracked and git-ignored.
- **No Expanded Scopes**: Verified that no `write_products`, `read_themes`, or `write_themes` were requested.
- **No Shopify writes occurred**: Verified storefront mutations remain strictly blocked.
