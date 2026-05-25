# Verification Report — Phase 10.6: Merchant Approvals & Mutation Tools Foundation (Containment Fix)

We have verified the robust behavior, tenant isolation, and strict containment attributes of **Phase 10.6: Merchant Approvals & Mutation Tools Foundation**.

---

## 1. Automated Pre-Deployment Verification

The validation suite `scripts/release-check.mjs` was executed and completed successfully.

- **Check 37 (Firestore approvals contract verification)**: Passed
- **Check 38 (Repository provider approvals reference exposure)**: Passed
- **Check 39 (Tool definitions proposal-only registration check)**: Passed
  - Asserts that only `catalog.products.propose_update` is registered with `read_products` scope and `Medium` risk.
  - Proves that `theme.assets.patch` is not registered.
- **Check 40 (Verify legacy theme patching is absent)**: Passed
  - Ensures `theme.assets.patch` and `shopify.prepareThemePatch` are not registered in definitions or referenced in the gateway.
- **Check 41 (Verify legacy prepareProductUpdate is disabled)**: Passed
  - Confirms `shopify.prepareProductUpdate` is not enabled and does not have case blocks in the gateway.
- **Check 42 (Verify unreachable decide routes capabilities)**: Passed
  - Confirms `setMockProducts`, `setActiveThemeCode`, and `upsertProductSnapshot` are completely unreachable from decide routes.

```bash
> node scripts/release-check.mjs

=== SOFTIFY SAAS PRE-DEPLOYMENT RELEASE VERIFICATION ===
...
Verifying: 40. theme.assets.patch and shopify.prepareThemePatch must not be registered or executed...
✓ PASS
Verifying: 41. shopify.prepareProductUpdate must not be enabled or create legacy approvals...
✓ PASS
Verifying: 42. setMockProducts, setActiveThemeCode, and upsertProductSnapshot must be unreachable from approvals decide routes...
✓ PASS

Results: 42 passed, 0 failed, total 42
RELEASE VERIFICATION PASSED SUCCESSFULLY!
```

---

## 2. Integration Smoke Testing (Test O)

A comprehensive integration smoke test (`Test O`) was run on the Express server in memory fallback mode, verifying complete mutation containment:

```bash
Running: O. Merchant Approvals & Mutation Tools Foundation validation...
   [APPROVAL TESTS] Successfully intercepted proposal tool catalog.products.propose_update, validated sanitized containment shapes, verified zero mutation execution, and confirmed deferred execution approvals.
✓ PASS

=== SMOKE TEST SUMMARY ===
...
 ✓ N. Audit log tenant safety, scoping, and sanitization validation: PASS
 ✓ O. Merchant Approvals & Mutation Tools Foundation validation: PASS

Results: 22 passed, 0 failed, total 22
SMOKE TEST COMPLETED SUCCESSFULLY!
```

### Confirmed Containment Qualities in Test O
1. **Proposal Interception**: Simulating a query for `catalog.products.propose_update` successfully triggers gateway interception, blocks provider executions, registers a `PENDING` proposal request, and returns `requires_approval: true`.
2. **Arguments Masking**: Raw tool arguments are filtered out from the outcome response payloads, returning a summarized shape instead (`argsCount`, `targetId`, `allowedFields`).
3. **Payload Sanitization**: The pending request strictly sanitizes incoming fields, containing only permitted attributes (`title`, `vendor`, `productType`, `status`, `tags`).
4. **Deferred Execution Deciders**:
   - Approving the request changes status to `"APPROVED"` only.
   - Bypasses any catalog, database snapshot, local cache, or theme CSS updates (product 101 title remains original and is NOT modified to `"Super Polished Tee"`).
   - Bypasses `"APPLIED"` or `"FAILED"` states, returning `{ ok: true, status: "APPROVED", executionDeferred: true }`.
5. **Sanitized Audits Trail**: chronological audit logs are persisted strictly for `APPROVAL_CREATED` and `APPROVAL_APPROVED`. Verified that no `APPROVAL_APPLIED` event was created.
6. **Scoping Scans**: approvals queries without `organizationId` or cross-tenant decider attempts fail with `400 Bad Request` and `403 Forbidden` status codes.
7. **PII Telemetry Protection**: Confirmed that zero sensitive access tokens or bypass secrets leak into approvals queue documents.
