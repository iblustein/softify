# Phase 10.3 Review Notes — Agent Installations and Permission Policy Foundation

## ChatGPT Review Concerns
- **Type Duplications**: Avoid maintaining parallel type definitions across domain models and repository contracts.
- **Tenant Exposure**: The in-memory installation finder must never fallback to matching global active mock templates without checking domain arguments.
- **Runtime Fallbacks**: Disallow creating synthetic mock installations in the orchestrator runtime when a real installation is missing.

## Fixes Requested
- Imported `AgentInstallation` directly into contracts from `domain/types.ts`.
- Bound all in-memory mock queries to filter authoritatively by the requested `shopDomain` parameter.
- Removed runtime synthetic installation fallbacks inside `runAgentChat`, returning a strict error if missing.

## Final Approval Status
- **Status**: Approved.
