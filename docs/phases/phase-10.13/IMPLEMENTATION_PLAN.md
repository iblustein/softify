# Implementation Plan — Phase 10.13: Real-Store Product Readiness

This phase prepares **Softify** for safe, stable, and transparent use on a real Shopify store. Rather than introducing background automation, Phase 10.13 hardens operational readiness, permission check diagnostics, store connection status visibility, and bulk safety gates. All implementations are designed to support a clear "real-store readiness" posture and ensure we deliver a highly secure, reliable, and first production-ready product slice.

---

## 1. Current State Assessment

### Completed Platform Capabilities (Through Phase 10.12)
1. **OAuth Status & Synchronizations**: Basic OAuth connection flows, token storage, and REST/GraphQL product snaps.
2. **Stateless AI Provider**: Gemini and Mock AI providers that recommend metadata updates but have zero direct store access.
3. **Centralized Tool Gateway**: AUTHORITATIVE sandbox gating that checks agent definitions and sanitizes credentials/audits.
4. **Sanitized Firestore Audits**: Deep operational telemetry capturing agent chat requests, gateway decisions, and execution outcomes.
5. **Merchant-in-the-Loop Approvals**: Bridgeless gateway interceptions that register proposal tools as PENDING approvals.
6. **Authoritative GraphQL Executor**: Safe transactional storefront writes limited strictly to approved text attributes (`title`, `vendor`, `productType`, `status`, `tags`).
7. **Operator Stuck-Execution Recovery**: 15-minute stuck timeout limits and state-only recovery reset routes.
8. **Production Bulk Operations Foundation**: Dynamic preflight tenant isolation checks, 500ms safety throttle delays, sequential claim locks, and bulk decide/execute endpoints.

### Why Phase 10.13 Focuses on Real-Store Readiness
Softify is moving to a real Shopify store readiness environment. In real-store usage, we must guarantee that:
- Merchants understand *exactly* which operations are safe, pending, executing, or blocked.
- We do not run any silent modifications or auto-execution rules (preserving the manual merchant-in-the-loop posture).
- Any missing OAuth permissions (especially the crucial `write_products` scope) are handled gracefully as a safe blocked state instead of a generic system crash.

### Main Real-Store Readiness Risks
1. **Scope Deficiencies**: If a merchant connects a store with only `read_products` access, trying to trigger a GraphQL execute mutation will fail. We need a clear permission check layer to intercept this.
2. **Operational Ambiguity**: Merchants may feel anxious about what a bulk operation does. The UI must clearly articulate live write warnings and separate state decisions from storefront commits.
3. **Failed Snap Syncs**: Stale snapshot databases could cause recommended actions to modify outdated storefront parameters.

---

## 2. Store Readiness Model

We will build a dedicated **Store Readiness Dashboard Card / Checklist** in the frontend, supported by a sanitized, backend diagnostic status API `GET /api/shop/readiness`.

### Backend Diagnostic status API: `GET /api/shop/readiness`
To drive the frontend checklists, the backend will expose a read-only endpoint that returns **only** sanitized readiness indicators and user-safe status data. 

#### Sanitized API Response Contract
Under no circumstances shall the readiness endpoint expose raw credentials, decrypted access tokens, secrets, OAuth internal keys, raw Shopify HTTP response headers/bodies, or internal system metadata. 

The endpoint will return a clean, allowlisted JSON payload:
```json
{
  "hasReadProducts": true,
  "hasWriteProducts": false,
  "canRunInsights": true,
  "canExecuteMutations": false,
  "missingRequiredScopes": ["write_products"],
  "connectionStatus": "CONNECTED",
  "syncFreshness": "2026-05-27T12:00:00Z",
  "snapshotCount": 142,
  "agentReadiness": "READY"
}
```
*Note: Returning scope names like `read_products` or `write_products` is acceptable, but strictly as sanitized permission indicators.*

### Frontend Store Readiness Dashboard Card
The frontend will display a structured checklist panel utilizing the response from `GET /api/shop/readiness`:
- **Shop Domain**: Authoritative normalized URL (e.g. `glowthread-apparel.myshopify.com`).
- **OAuth Status**: Explicitly badges the connection based on `connectionStatus` as `Connected` or `Disconnected`.
- **Product Sync Freshness**: Timestamps showing `syncFreshness` along with a prominent warning if the last snapshot sync is older than 24 hours.
- **Catalog Snapshot Availability**: Reports the total count of product snapshots cached in Firestore (`snapshotCount`).
- **Agent Installation Readiness**: Verifies `agentReadiness` to ensure at least one agent is active and provisioned with authorized tools.
- **Approval/Execution Readiness**: A central master readiness indicator displaying:
  - `Ready (Full Access)`: Both `hasReadProducts` and `hasWriteProducts` are `true`.
  - `Ready (Read-Only Insights)`: `hasReadProducts` is `true` but `hasWriteProducts` is `false` (mutations disabled).
  - `Not Ready`: Disconnected or invalid connection.

---

## 3. Scope and Permission Readiness

To ensure the highest level of security and architectural integrity, we enforce a strict separation between read-only diagnostics and live storefront execution:

### 1. Authoritative Execution Guardrails
- **`ApprovedProductMutationExecutorService` remains the sole, authoritative source of truth for all live Shopify execution checks.**
- The executor pipeline remains the exclusive gateway to communicate with Shopify's GraphQL API. It is solely responsible for performing:
  - `write_products` scope validation
  - Tenant and store validation
  - Sequential claim locking
  - Structured audit logging
  - Safe `BLOCKED` / `FAILED` state transitions
- **No execution preflight path will be introduced on the API routes that bypasses or duplicates these executor checks.** Bypassing `ApprovedProductMutationExecutorService` is strictly prohibited.

### 2. Improved Route Response Mapping
- The frontend readiness checks (e.g., `GET /api/shop/readiness`) may expose permission indicators to the frontend to warn the merchant or disable UI actions, but backend execution must still go through the executor pipeline.
- When `/execute` or `/batch-execute` is called, the executor service executes the mutation. If the executor encounters a missing `write_products` scope or throws an `EXECUTION_BLOCKED` error, the route handler maps this outcome in a sanitized, user-safe way to a `BLOCKED` state:
  ```json
  {
    "ok": false,
    "code": "EXECUTION_BLOCKED",
    "status": "BLOCKED",
    "error": "Store connection is missing write_products scope. Mutations are disabled for this connection."
  }
  ```

### 3. Absolute Scope Restrictions
- **No Forbidden Scopes**: Softify **must never** request, store, or reference `read_themes` or `write_themes`.
- **No Forbidden Mutation Fields**: Storefront mutations remain capped strictly to allowlisted text parameters: `title`, `vendor`, `productType`, `status`, `tags`. All other product mutations (e.g. prices, variants, inventory, media, HTML description) remain completely blocked inside `ApprovedProductMutationExecutorService`.

---

## 4. Merchant-Facing UX Readiness

We will refine `src/App.tsx`, `src/components/AgentWorkspace.tsx`, and `src/components/ApprovalQueue.tsx` to elevate merchant confidence and support our first production-ready product slice:

1. **Dashboard Onboarding Guide / Checklist**:
   - Render a premium visual checklist showing green checkmarks for completed setups (OAuth, Sync, Scopes) and yellow warnings for incomplete steps.
2. **Safe Blocked Execution UX**:
   - If `hasWriteProducts` is `false`, the Execute buttons in the Approval Queue are safely replaced with a premium, amber-tinted **"Mutations Blocked (Read-Only Mode)"** banner explaining that they can authorize decisions but commits are disabled due to missing write access.
3. **Clear CTA Hierarchy**:
   - Enhance visible contrast differences between safe actions ("Request Merchant Approval" / "Approve State") and storefront commit actions ("Execute Live Commit").
4. **No Technical Leakage**:
   - Strip all internal references (e.g., Firestore document references, raw JSON payloads, raw tool arguments) from merchant-facing lists, replacing them with formatted human-readable summaries.

---

## 5. Bulk Operations Real-Store Control

During the first real-store readiness deployment, we enforce high-impact safety controls:

1. **Bulk Execute Feature Flag / Toggle**:
   - **Frontend UX Gating**: Introduce a Vite environment variable `VITE_SOFTIFY_ALLOW_BULK_EXECUTE` to control the bulk execution UI features in the React frontend. If set to `false`, bulk execute checkboxes and actions are hidden or disabled.
   - **Backend Guard (Optional)**: If needed for global server-side staging, define a backend environment variable `SOFTIFY_ALLOW_BULK_EXECUTE`.
   - **Authoritative Boundary**: The frontend flag `VITE_SOFTIFY_ALLOW_BULK_EXECUTE` is strictly for UX-gating (UX controls only). It is **never** relied upon as a security boundary. The backend tenant isolation checks and authorized scope checks inside `ApprovedProductMutationExecutorService` remain the sole authoritative security boundary.
2. **No Decide-to-Execute Bypasses**:
   - Batch approvals decision (`/batch-decide`) must strictly remain in-memory and state-only. Auto-execution during bulk approvals remains strictly prohibited.
3. **Explicit Stepper Checklist Visibility**:
   - During batch executions, the stepper progress checklist must explicitly show each item's transition. If an item is blocked due to missing permissions, it must explicitly render `BLOCKED` with a warning message without crashing the remaining sequential executions.

---

## 6. Real-Store Safety Checklist

Execution of any storefront mutation must go through the unified `ApprovedProductMutationExecutorService` pipeline, which enforces the following authoritative checklist:
- [ ] **Auth Active**: Shopify OAuth connection status is verified as `CONNECTED`.
- [ ] **Scopes Verified**: `read_products` scope is authorized (and `write_products` for execution commits).
- [ ] **Fresh Data**: Product snapshots have been successfully synced within the last 24 hours.
- [ ] **Snapshot Present**: At least one product record exists in the local snapshot collection.
- [ ] **Agent Ready**: At least one agent is enabled per store connection.
- [ ] **Approval Valid**: The approval target matches the correct, active product snapshot ID in Firestore.
- [ ] **Tenant Scopes Equal**: Verified that `organizationId` and `storeConnectionId` share authoritative tenant bounds.
- [ ] **Zero Secrets Leakage**: Telemetry and payload logs undergo strict recursive sanitization checks.

---

## 7. Operational Readiness

For system operators and Cloud Run administrators, we introduce comprehensive visibility:
1. **Readiness Logs**:
   - Startup and connection logs print active domains, database configurations, and active scopes.
2. **Missing Scopes Alerts**:
   - The backend logs specific warning streams (`[READINESS WARNING] Connected store 'X' is missing 'write_products'. Mutations disabled.`) during OAuth handshakes.
3. **Clear Recovery Traces**:
   - Failed executions are clearly captured in the audit logs (`APPROVAL_FAILED` with clean failure metadata).
   - Operators can safely use `/reset-failed` to restore an execution back to `APPROVED` for merchant retries.

---

## 8. Security and Guardrail Preservation

We strictly preserve all established architectural guardrails at all times:
- **No Auto-Execution**: Automatic optimization or background execution of proposals is strictly prohibited. All storefront commits require explicit, manual merchant execution.
- **No New Mutation Scope**: Allowed product mutation fields remain strictly capped at `title`, `vendor`, `productType`, `status`, and `tags`.
- **No Theme Tools**: No theme-related tools or read/write pathways are permitted.
- **No `read_themes` / `write_themes`**: Theme authorization scopes are completely blocked.
- **No Forbidden Field Mutations**: No mutations to price, inventory, variants, media, or `descriptionHtml` are allowed.
- **No Direct AI-to-Shopify Path**: AI models/providers have zero access to storefront APIs or raw mutations.
- **No Direct AI-to-Tool Execution Path**: Tool execution goes through a centralized gateway that converts mutations into merchant approval requests.
- **Recovery Endpoints Remain State-Only**: Operator recovery pathways (e.g., `/reset-failed`) only alter database state and never invoke storefront writes.
- **Analytics Remain Read-Only**: Analytical features remain strictly read-only and cannot trigger mutation workflows.
- **Tenant Isolation**: Every API endpoint asserts and locks tenant context via authoritative shop domain lookups.
- **Scrubbed Logs**: Zero raw prompts, token decryption keys, or raw JSON payloads are exposed in telemetry or database audits.

---

## 9. Proposed Release-Check Plan

We will add a new test check (**Test 57**) to `scripts/release-check.mjs` verifying:
1. **Naming Consistency**: Asserts that all instances of the next recommended phase are labeled as `"Real-Store Product Readiness"` (no leftover auto-optimization naming).
2. **Permission Safety Bounds**: Statically validates that no new forbidden scopes (`read_themes`, `write_themes`) or fields (`price`, `inventory`, `variants`) have been added.
3. **Execution Block Gating**: Asserts that approvals execution routes have logic handling `EXECUTION_BLOCKED` states when missing the `write_products` scope.

---

## 10. Proposed Smoke-Test Plan

We will add a new integration check (**Test W**) inside `scripts/smoke-test.mjs` simulating:
1. **Readiness API Verification**:
   - GET `/api/shop/readiness` with authoritative shop context returns valid status, connection details, and scope listings.
2. **Safe Blocked Scope Gating**:
   - Attempts a batch or single execution using a mocked connection that is intentionally missing the `write_products` scope.
   - Verifies the response returns a HTTP `400 Bad Request` with status `"BLOCKED"` and `error` explaining scope issues without crashing the database state.
3. **Read-Only Capability Retention**:
   - Asserts that diagnostic scan runs and approvals queue decisions still work flawlessly even on a store lacking the write scope.
4. **Tenant Validation Isolation**:
   - Confirms that passing mismatched tenant keys returns a `403 Forbidden` early reject.

---

## 11. Documentation Plan

Post-implementation, the following files will be created or updated:
- `docs/phases/phase-10.13/WALKTHROUGH.md`
- `docs/phases/phase-10.13/REVIEW_NOTES.md`
- `docs/phases/phase-10.13/VERIFICATION.md`
- `docs/ai-handoff/SOFTIFY_PROJECT_STATE.md` (Update completion metrics)
- `docs/ai-handoff/CHATGPT_HANDOFF_PROMPT.md` (Update completed milestones)
- `docs/ai-handoff/NEXT_STEPS.md` (Transition milestone to Phase 10.14)
- `docs/PHASE_INDEX.md` (Mark Phase 10.13 as Completed)
