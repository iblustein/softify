# Approved Phase 10.6 — Merchant Approvals & Mutation Tools Foundation

We are proposing the final architectural implementation plan for **Phase 10.6: Merchant Approvals & Mutation Tools Foundation**. This revision stops any direct mutation capabilities, removes theme patching, and confines the scope to proposal-only tools that securely queue proposals for review. Legacy fields are calculated dynamically in REST route responses only and are strictly excluded from Firestore persistence.

## User Review Required
> [!IMPORTANT]
> **Proposal-Only Intervention**: AI providers can never execute write/mutation tools directly. When a product update is proposed, the Tool Gateway intercepts it, persists a strictly sanitized `merchant_approvals` proposal item in the database, and returns a standard `requires_approval` blocked response.
> 
> **Zero Legacy Document Persistence**: No legacy raw fields (`beforeState`, `afterState`, `diff`, `details.before`, `details.after`, `details.fields`) are ever written to Firestore. If backward compatibility is required by legacy clients, these keys are computed dynamically inside Route Responses only.
> 
> **Zero Live/Mock Execution**: No live Shopify mutations, Firestore product snapshot writes, mock product updates, or theme CSS injections will be performed in Phase 10.6. Approved decisions strictly mark requests as `APPROVED` and defer actual application/execution to a future phase.
> 
> **Secrets & PII Containment**: All raw developer bypass secrets, Shopify access tokens, customer PII, raw tool arguments, and raw prompt texts are strictly blocked from being persisted in the approvals queue database.
> 
> **Decide Response Contract**: The decide REST endpoint will return `{ ok: true, status: "APPROVED", executionDeferred: true }` upon approvals, avoiding `APPLIED` or `FAILED` states.

---

## Proposed Changes

### Component 1: Redesigned Domain & Types
#### [MODIFY] [types.ts](file:///c:/Projects/softify/softify/src/server/domain/types.ts)
- Redesign `ApprovalRequest` to strictly persist only sanitized product proposal fields in Firestore:
  ```typescript
  export interface ApprovalRequest {
    id: string;
    organizationId: string;
    storeConnectionId: string;
    agentInstallationId: string;
    agentId: string;
    toolName: "catalog.products.propose_update";
    requestedBy: string; // Agent name
    requestedAt: string;
    decidedAt?: string;
    decidedBy?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    riskLevel: 'Low' | 'Medium' | 'High';
    targetType: 'PRODUCT_PROPOSAL';
    targetId: string;
    proposedChangesSummary: string;
    diffSummary: string;
    sanitizedPayload: {
      title?: string;
      vendor?: string;
      productType?: string;
      status?: string;
      tags?: string[];
    };
    allowedFields: AllowedProductProposalField[];
  }
  ```
- Change `ApprovalStatus` to strictly permit: `"PENDING" | "APPROVED" | "REJECTED"`.
- Centralize audited events: `APPROVAL_CREATED`, `APPROVAL_APPROVED`, `APPROVAL_REJECTED`. Remove `APPROVAL_APPLIED` and `APPROVAL_FAILED` events.

### Component 2: Corrected Registry & Scopes
#### [MODIFY] [tool-definitions.ts](file:///c:/Projects/softify/softify/src/server/tools/tool-definitions.ts)
- Completely remove `theme.assets.patch` definition.
- Rename `catalog.products.update` to `catalog.products.propose_update`.
- Change requiredScope of `catalog.products.propose_update` to `read_products` (do not require `write_products` in Phase 10.6).
- Update agent definitions (`src/server/agents/agent-definitions.ts`) and mock AI triggers (`src/server/ai/mock-ai.provider.ts`) to use `catalog.products.propose_update`.

### Component 3: Interceptor and telemetries sanitization
#### [MODIFY] [tool-gateway.ts](file:///c:/Projects/softify/softify/src/server/tools/tool-gateway.ts)
- Remove `theme.assets.patch` interception path entirely.
- Refactor `executeToolWithContextRaw` to intercept `"catalog.products.propose_update"`:
  - Sanitize the incoming `fields` arguments to match strictly: `title`, `vendor`, `productType`, `status`, `tags`. All other fields are filtered out.
  - Create the PENDING approval record with strict proposal fields.
  - Returns `requires_approval: true`, the new approval `id`, and a highly sanitized summary of arguments (`argsCount`, `targetId`, and `allowedFields` only) preventing raw `args` exposure in outcomes.
  - Dispatch a durable `APPROVAL_CREATED` event using the async `writeAuditEvent` framework.

### Component 4: Decoupled REST Deciders Router & Dynamic Legacy Mapping
#### [MODIFY] [approvals.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/approvals.routes.ts)
- Update GET `/api/approvals`:
  - Retain strict `organizationId` and `StoreRepository` tenant checks.
  - Map Firestore records to redesigned types with safe fallback mappings.
  - **Dynamic Legacy Mapper**: If the caller requires the legacy API contract, dynamically build and inject `beforeState`, `afterState`, `diff`, `actionType`, and `details` fields into the response payload on-the-fly, utilizing only the stored sanitized proposal attributes.
- Update POST `/api/approvals/:id/decide`:
  - Reject attempts to use mismatched `organizationId` values.
  - **On REJECT**:
    - Mark as `REJECTED`, audit `APPROVAL_REJECTED` via `writeAuditEvent`.
  - **On APPROVE**:
    - Mark as `APPROVED`, audit `APPROVAL_APPROVED` via `writeAuditEvent`.
    - Do NOT call `setMockProducts`, `setActiveThemeCode`, or `upsertProductSnapshot`.
    - Return response payload: `{ ok: true, status: "APPROVED", executionDeferred: true }`.

### Component 5: Firestore Indexes & Repositories
#### [MODIFY] [firestore.indexes.json](file:///c:/Projects/softify/softify/firestore.indexes.json)
- Add composite queries for the `merchant_approvals` collection:
  - `organizationId ASC`, `requestedAt DESC`
  - `organizationId ASC`, `storeConnectionId ASC`, `requestedAt DESC`
#### [MODIFY] [firestore-approval.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/firestore/firestore-approval.repository.ts)
- Adjust the document mappers `mapDocument` and CRUD signatures to match the redesigned, proposal-based `ApprovalRequest` type interface, ensuring zero legacy fields are retrieved or written.

---

## Verification Plan

### Automated Tests
- Run `npm run lint` and `npm run build` to confirm compilation resolves with redesigned interfaces.
- Run static checks `npm run verify:release` (Check 28 modified to allow only `catalog.products.propose_update` proposal-only mutation tools, Check 37-39 verified).
- Update `scripts/smoke-test.mjs` containing a corrected **Test O** proving:
  - Interception of `"catalog.products.propose_update"` returning `requires_approval: true` without returning raw tool args.
  - Verification that the pending approval records strictly sanitize payloads and hold only allowed fields.
  - Verification that decisions on `APPROVE` mark status as `APPROVED` only, do not mark as `APPLIED` or `FAILED`, do not invoke theme mutations or mock product updates, and defer execution.
  - Strict tenant scoping validation on reads/decides and robust telemetry scrubbing.
