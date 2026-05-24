# Phase 10.3 Implementation Plan — Agent Installations and Permission Policy Foundation

## Goal
Implement agent installations, secure installation-level dynamic allowed tools enforcement, tenant-isolated lookups, and strip token references from endpoints.

## Proposed Changes
- **AgentInstallation Model**: Define structural fields (`shopDomain`, `agentId`, `allowedTools`, `enabled`) in TS.
- **Repository Strategy**: Implement Firestore and mock databases to query agent installation entities.
- **Installation API**: Expose `/api/agents/install` and `/api/agents/installations/status` validating connecting scopes and normalizations.
- **Tool Gateway Integration**: Add checks verifying target tool execution parameters against the installation's allowed tools list.
- **Tenant Isolation**: Secure memory lookups to guarantee zero tenant leaks.
