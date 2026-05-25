# Review Notes — Phase 10.6: Merchant Approvals & Mutation Tools Foundation (Containment Fix)

We have reviewed the technical layout and security safety parameters configured for **Phase 10.6: Merchant Approvals & Mutation Tools Foundation** to ensure complete containment.

---

## Architectural Review Items

### 1. Proposal-Only Scope Enforcement
- **Gateway Boundary**: The Tool Gateway intercepts `"catalog.products.propose_update"` strictly. Any attempt by the agent runtime to execute theme mutations or direct catalog writes fails authorization since these capabilities are absent from definitions.
- **Zero Mutative Code execution**: The POST decide router does not execute, commit, or sync any Shopify metadata or local state changes. Decisions strictly record merchant consensus and transition status flags inside the proposals catalog.

### 2. Dynamic Route Projection (Client Layer Separation)
- The legacy attributes (`details.title`, `details.fields`, `details.before`, etc.) are constructed entirely inside Express router responses on-the-fly. They are completely absent from Firestore collections. This effectively isolates the backend repository databases from storing raw developer prompt arguments, secrets, tokens, or PII metadata, while providing 100% backward compatibility for visual client layouts.

### 3. Dynamic Telemetry Scrubbing
- Gateways filter incoming properties strictly against an allowlist (`title`, `vendor`, `productType`, `status`, `tags`). Unpermitted arguments are discarded immediately at execution entry.
- Raw tool arguments are filtered out from the outcome response payloads, returning a summarized shape instead (`argsCount`, `targetId`, `allowedFields`).
