# Phase 10.4 Implementation Plan — Product Intelligence Agent v2 — Read-Only Catalog Insights

## Goal
Implement rich, capped, and deterministic read-only catalog insights, 7 new insight tools, mock provider mappings, extended static checks, and end-to-end integration tests.

## Proposed Changes
- **Catalog Insights Service**: Build `catalog-insights.service.ts` featuring health scoring deduction equations and freshness metrics.
- **Bounded Constraints**: Capped snapshots array at `MAX_INSIGHT_PRODUCTS = 1000` with samples limited to `SAMPLE_LIMIT = 5` and summaries to `SUMMARY_LIMIT = 10`. Return `capped` booleans.
- **Tool Registrations**: Register 7 new `catalog.insights.*` read-only tools and route execution inside `ToolGateway`.
- **Installations Sync**: Ensure POST `/api/agents/install` updates `allowedTools` to match the latest static agent definition.
- **Mock Mappings**: Map chat insight inputs deterministic inside `MockAiProvider`.
- **Test Suites**: Extend static checks to 32 tests and smoke tests to 20 tests.
