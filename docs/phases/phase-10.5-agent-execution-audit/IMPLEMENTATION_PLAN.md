# Phase 10.5 Implementation Plan — Agent Execution Audit Foundation

## Goal
Implement durable, sanitized, tenant-safe Firestore audit log persistence for agent runs, tool invocations, and Tool Gateway allow/block decisions.

---

## User Review Required
> [!IMPORTANT]
> **Audit Database Seeding & Scaling Strategy**:
> - We are introducing a concrete `agent_audit_logs` collection in Google Firestore.
> - Background fire-and-forget logging is utilized inside `writeLog` to preserve backward compatibility (keeping the signature synchronous), avoiding disruptive async/await refactoring across 25+ call sites.
> - Centralized recursive sanitization (`sanitizeAuditPayload`) ensures zero leakage of raw access tokens, API keys, customer PII, dev-bypass secrets, or raw user message parameters.

---

## Proposed Changes

### Component 1: Firestore Audit Repository

#### [NEW] [firestore-audit.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/firestore/firestore-audit.repository.ts)
- Implement `AuditRepository` contract matching [audit.repository.contract.ts](file:///c:/Projects/softify/softify/src/server/repositories/contracts/audit.repository.contract.ts).
- Expose methods: `getAuditEventById`, `getAuditEventsByOrganizationId`, `createAuditEvent`, `getAllAuditEvents`, and `clearAuditEvents`.
- Map documents securely to the `AuditEvent` domain model, generating custom time-based LOG identifiers if missing.

---

### Component 2: Repository Suite Provider

#### [MODIFY] [repository-provider.ts](file:///c:/Projects/softify/softify/src/server/repositories/repository-provider.ts)
- Import `firestore-audit.repository.ts`.
- Dynamically resolve the `audit` repository reference to Firestore when `isFirestoreConfigured()` is enabled, falling back to `in-memory-audit.repository.ts` otherwise.

---

### Component 3: Audit Sanitization & Logger Service

#### [MODIFY] [audit-log.service.ts](file:///c:/Projects/softify/softify/src/server/services/audit-log.service.ts)
- Replace/wrap `writeLog` to trigger `repos.audit.createAuditEvent(event)` in the background (fire-and-forget with error catching), ensuring backward compatibility.
- Extract `organizationId` and `storeConnectionId` from `metadata` to populate top-level database columns dynamically.
- Implement `sanitizeAuditPayload(obj)` performing recursive scrubbing:
  - Mask/remove sensitive key tokens (`accessToken`, `secret`, `apiKey`, `password`, `bearer`, etc.).
  - Mask/remove raw customer PII.
  - Mask/remove raw user message content or unsanitized gateway arguments.

---

### Component 4: Agent Runtime Events

#### [MODIFY] [agent-runtime.service.ts](file:///c:/Projects/softify/softify/src/server/services/agent-runtime.service.ts)
- Inject correct platform context arguments into `writeLog` metadata:
  - **AGENT_CHAT_REQUEST**: Log incoming requests securely (excluding raw text parameters to protect PII). Include `organizationId`, `storeConnectionId`, `agentId`, and `agentInstallationId`.
  - **PROVIDER_FINAL_RESPONSE**: Log final answers derived directly or after execution (including token/PII-scrubbed summaries).
  - **PROVIDER_TOOL_CALL_REQUEST**: Log tool invocations requested by the stateless AI provider.
  - **RUNTIME_ALLOWED_TOOLS_BLOCK**: Log block decisions when the provider suggests a tool outside the agent definition list.
  - **NESTED_TOOL_CALL_BLOCKED**: Log blocks on subsequent nested tool calls.

---

### Component 5: Tool Gateway Execution Decisions

#### [MODIFY] [tool-gateway.ts](file:///c:/Projects/softify/softify/src/server/tools/tool-gateway.ts)
- Record gateway decisions securely:
  - **GATEWAY_VALIDATION_ALLOWED** & **GATEWAY_VALIDATION_BLOCKED**: Log checks against installations, connection states, registration, and allowed tool subsets.
  - **GATEWAY_TOOL_EXECUTION_SUCCESS** & **GATEWAY_TOOL_EXECUTION_FAILURE**: Log result outcomes, ensuring recursively sanitized arguments and payloads.

---

### Component 6: Release and Smoke Tests Extensions

#### [MODIFY] [release-check.mjs](file:///c:/Projects/softify/softify/scripts/release-check.mjs)
- Extend static release verifications (adding Tests 33–36):
  - Verify Firestore audit repository imports successfully.
  - Verify repository provider exposes `audit` repository reference correctly.
  - Verify recursive audit sanitization removes credentials and raw user query messages.
  - Verify no token/secret exposure inside logged events.

#### [MODIFY] [smoke-test.mjs](file:///c:/Projects/softify/softify/scripts/smoke-test.mjs)
- Append new integration tests:
  - Query audit endpoints or retrieve logged events.
  - Validate that audit partitioning works safely by tenant domain.
  - Assert that no access tokens, bypass secrets, or PII exists inside any logged telemetry.

---

## Verification Plan

### Automated Tests
- Run `npm run lint` to verify clean TypeScript compilation.
- Run `npm run build` to verify clean production server packaging.
- Run `node scripts/release-check.mjs` to execute all static pre-deployment verification steps.
- Start the server on port 3000 and run `node scripts/smoke-test.mjs` to run live integration tests.
