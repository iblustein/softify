# Phase 10.5 Walkthrough — Agent Execution Audit Foundation

We have successfully implemented **Phase 10.5: Agent Execution Audit Foundation**. This establishes a durable, sanitized, and tenant-safe audit telemetry logging framework across the Softify runtime.

## Core Accomplishments

### 1. Centralized Domain Definitions & Constants
- Added a typed `AuditDecision` union in `src/server/domain/types.ts` restricting value states to `"allowed" | "blocked" | "completed" | "failed"`.
- Defined a centralized `AuditEventNames` object with typed `AuditEventType` union constraint to ensure no arbitrary strings are used for critical events.
- Extended the `AuditEvent` interface to include key execution fields: `agentId`, `agentDefinitionId`, `agentInstallationId`, `toolName`, `provider`, `decision`, `reason`, and `correlationId`.

### 2. Firestore & InMemory Telemetry Persistence
- Added `firestore-audit.repository.ts` implementing `AuditRepository` to store audit logs in the `agent_audit_logs` collection.
- Updated `in-memory-audit.repository.ts` to fully support optional time-series ID generations.
- Wired dynamically resolved `repos.audit` provider resolution under `repository-provider.ts`.

### 3. Allowlist-First Sanitization & Async Service
- Implemented `sanitizeAuditPayload` inside `audit-log.service.ts` to recursively scrub high-risk parameters (credentials, bypass secrets, merchant/customer PII, raw tool inputs/outputs, raw messages) and preserve safely allowlisted telemetry (lengths, counts, indicators, metadata).
- Created an awaited async `writeAuditEvent(...)` function guaranteeing persistence before response resolution for critical events, while leaving legacy `writeLog` as a backward-compatible background wrapper.
- Implemented tenant-isolated cache logic in `getAuditLogs(...)` to prevent exposing global state.

### 4. Authoritative Runtime & Tool Gateway Telemetry Integration
- Refactored `agent-runtime.service.ts` to await `writeAuditEvent` calls on critical turns (`AGENT_CHAT_REQUEST`, `PROVIDER_FINAL_RESPONSE`, `PROVIDER_TOOL_CALL`, `RUNTIME_ALLOWED_TOOLS_BLOCK`, `GATEWAY_TOOL_EXECUTION`, and `NESTED_TOOL_CALL_BLOCKED`).
- Refactored `tool-gateway.ts` to check and log allowed/blocked decisions (e.g. `GATEWAY_VALIDATION_ALLOWED`, `GATEWAY_VALIDATION_BLOCKED`, and `GATEWAY_TOOL_EXECUTION`) using safe metadata counts (e.g. `argsCount`) instead of raw variables.

### 5. Secure Scoping in Dashboard & Audit Endpoints
- Updated the GET `/api/audit-logs` endpoint in `audit.routes.ts` to strictly enforce `organizationId` parameter validation and verify shop ownership through `StoreRepository` before query execution, preventing cross-tenant exposures.
- Updated the dashboard services in `dashboard.service.ts` to fetch tenant-isolated, properly sanitized, and scoped audit telemetry logs instead of empty lists.

---

## Changes Made

### Files Created
- `[NEW]` [firestore-audit.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/firestore/firestore-audit.repository.ts)

### Files Modified
- `[MODIFY]` [types.ts](file:///c:/Projects/softify/softify/src/server/domain/types.ts)
- `[MODIFY]` [audit.repository.contract.ts](file:///c:/Projects/softify/softify/src/server/repositories/contracts/audit.repository.contract.ts)
- `[MODIFY]` [in-memory-audit.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/in-memory/in-memory-audit.repository.ts)
- `[MODIFY]` [audit-log.service.ts](file:///c:/Projects/softify/softify/src/server/services/audit-log.service.ts)
- `[MODIFY]` [agent-runtime.service.ts](file:///c:/Projects/softify/softify/src/server/services/agent-runtime.service.ts)
- `[MODIFY]` [tool-gateway.ts](file:///c:/Projects/softify/softify/src/server/tools/tool-gateway.ts)
- `[MODIFY]` [audit.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/audit.routes.ts)
- `[MODIFY]` [dashboard.service.ts](file:///c:/Projects/softify/softify/src/server/services/dashboard.service.ts)
- `[MODIFY]` [smoke-test.mjs](file:///c:/Projects/softify/softify/scripts/smoke-test.mjs)
