# Phase 10.5 Implementation Plan — Agent Execution Audit Foundation

## Goal
Implement durable, sanitized, tenant-safe Firestore audit log persistence for agent runs, tool invocations, and Tool Gateway allow/block decisions.

---

## User Review Required
> [!IMPORTANT]
> **Audit Design & Security Guardrails**:
> - **Explicit Asynchronous Path**: We introduce an explicit async `writeAuditEvent(...)` function inside `audit-log.service.ts` for critical audits, keeping legacy `writeLog` as fire-and-forget logging.
> - **Centralized Allowlist-First Sanitizer**: We implement an allowlist-first `sanitizeAuditPayload` function that recursively strips all customer PII, raw access tokens, API keys, dev-bypass secrets, raw Shopify responses, customer/order objects, raw tool arguments, raw tool results, and raw user messages.
> - **Exposing Filtered Audits Only**: The GET `/api/audit-logs` endpoint requires `organizationId` or `shop` querying to enforce tenant-isolated access, with no global `getAllAuditEvents` exposure.

### Approved Refinements
- **Typed Decision Union**: `decision` field is constrained to `"allowed" | "blocked" | "completed" | "failed"`.
- **Centralized Event Names**: Centralized TS union/constants for all new audit events.
- **Mandatory Organization Scoping**: `organizationId` is strictly mandatory for all critical audits. `storeConnectionId` and `agentInstallationId` are logged whenever available.
- **Shop Ownership Scope Validation**: The GET `/api/audit-logs` endpoint validates that any queried `shop` is resolved through `StoreRepository` and authoritatively scopes to the provided `organizationId`.
- **Tenant-Filtered InMemory Cache**: The `getAuditLogs()` caching utility strictly filters logs by the requesting tenant's `organizationId` and never exposes a global log state.

---

## Proposed Changes

### Component 1: Domain & Contract Updates

#### [MODIFY] [types.ts](file:///c:/Projects/softify/softify/src/server/domain/types.ts)
- Define `AuditDecision = "allowed" | "blocked" | "completed" | "failed"`.
- Define `AuditEventType` constants union.
- Extend the `AuditEvent` interface to include optional structured fields:
  - `agentId?: string`
  - `agentDefinitionId?: string`
  - `agentInstallationId?: string`
  - `toolName?: string`
  - `provider?: string`
  - `decision?: AuditDecision`
  - `reason?: string`
  - `correlationId?: string`

#### [MODIFY] [audit.repository.contract.ts](file:///c:/Projects/softify/softify/src/server/repositories/contracts/audit.repository.contract.ts)
- Update the contract definition of `createAuditEvent` to support repository-generated IDs:
  ```typescript
  createAuditEvent(event: Omit<AuditEvent, "id" | "timestamp"> & { id?: string }): Promise<AuditEvent>;
  ```

---

### Component 2: Firestore & In-Memory Audit Repositories

#### [NEW] [firestore-audit.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/firestore/firestore-audit.repository.ts)
- Create the Firestore implementation of the `AuditRepository` contract.
- Support `createAuditEvent` by storing events inside the `agent_audit_logs` collection, generating custom ID strings if not supplied.
- Order all event lists by `timestamp` descending.

#### [MODIFY] [in-memory-audit.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/in-memory/in-memory-audit.repository.ts)
- Update implementation of `createAuditEvent` to align with the new signature allowing optional `id` parameter.

#### [MODIFY] [repository-provider.ts](file:///c:/Projects/softify/softify/src/server/repositories/repository-provider.ts)
- Dynamically resolve `repos.audit` to the Firestore audit repository when Firestore configuration is detected, otherwise falling back to the in-memory repository.

---

### Component 3: Audit Sanitization & Logger Service

#### [MODIFY] [audit-log.service.ts](file:///c:/Projects/softify/softify/src/server/services/audit-log.service.ts)
- **Centralized Allowlist Sanitizer**: Implement `sanitizeAuditPayload` allowing only safe metadata keys (e.g., IDs, metadata summaries, counts, and indicators), recursively masking all other values.
- **Asynchronous `writeAuditEvent` Path**: Introduce the async path:
  ```typescript
  export async function writeAuditEvent(event: Omit<AuditEvent, "id" | "timestamp"> & { id?: string }): Promise<AuditEvent>
  ```
  This function awaits repository writes before resolving, performs centralized sanitization, and appends to in-memory cache lists for client synchronization.
- **Tenant-Filtered InMemory Cache**: The `getAuditLogs()` caching utility strictly filters logs by the requesting tenant's `organizationId` and never exposes a global log state.
- **Backward-Compatible `writeLog`**: Keep `writeLog` as a legacy, fire-and-forget logging utility for non-critical telemetry runs.

---

### Component 4: Agent Runtime Integrations

#### [MODIFY] [agent-runtime.service.ts](file:///c:/Projects/softify/softify/src/server/services/agent-runtime.service.ts)
- Call the async `writeAuditEvent` inside critical agent turns, providing platform context details:
  - **AGENT_CHAT_REQUEST**: Include parsed message metadata summaries.
  - **PROVIDER_FINAL_RESPONSE**: Record AI Provider's response details.
  - **PROVIDER_TOOL_CALL_REQUEST**: Log stateless tool calls requested by provider.
  - **RUNTIME_ALLOWED_TOOLS_BLOCK**: Log block decisions when tools suggested are not allowed.

---

### Component 5: SDK Tool Gateway Refinements

#### [MODIFY] [tool-gateway.ts](file:///c:/Projects/softify/softify/src/server/tools/tool-gateway.ts)
- Replace direct logging of raw arguments and outputs with summarized metadata (e.g. `argsCount`).
- Record critical Gateway decisions securely via the async `writeAuditEvent` path:
  - **GATEWAY_VALIDATION_ALLOWED** & **GATEWAY_VALIDATION_BLOCKED**
  - **GATEWAY_TOOL_EXECUTION_SUCCESS** & **GATEWAY_TOOL_EXECUTION_FAILURE**

---

### Component 6: Audit Routing

#### [MODIFY] [audit.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/audit.routes.ts)
- Update GET `/api/audit-logs` controller to make it async.
- Require `organizationId` or `shop` domain parameters.
- Resolve the connection context and fetch tenant-filtered events securely using `repos.audit.getAuditEventsByOrganizationId(organizationId)`.
- Never expose the global `getAllAuditEvents()` function to a public router.

---

### Component 7: Test & Verification Suites

#### [MODIFY] [release-check.mjs](file:///c:/Projects/softify/softify/scripts/release-check.mjs)
- Extend pre-deployment release checks (Tests 33–36):
  - Verify Firestore audit repository imports successfully.
  - Verify repository provider exposes `audit` reference correctly.
  - Verify that `sanitizeAuditPayload` recursively filters credentials, secrets, raw Shopify details, and raw query messages.

#### [MODIFY] [smoke-test.mjs](file:///c:/Projects/softify/softify/scripts/smoke-test.mjs)
- Implement end-to-end integration verifications proving:
  - Blocked and allowed Tool Gateway decisions are persisted securely.
  - `organizationId` and `storeConnectionId` parameters are verified.
  - No cross-tenant leak is possible via the `/api/audit-logs` endpoint.
  - No access tokens, bypass secrets, raw message texts, or merchant PII fields are persisted or exposed.

---

## Verification Plan

### Automated Tests
- Run `npm run lint` for type verification.
- Run `npm run build` to verify bundles.
- Run `node scripts/release-check.mjs` to execute all pre-deployment checks.
- Run local server in background and execute `node scripts/smoke-test.mjs` to verify integration health.
