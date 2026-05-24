# Phase 10.2 Implementation Plan — Tenant-Safe Platform Context Resolver

## Goal
Secure the application by implementing a tenant-safe `PlatformContextResolver`, defining static agents/tools registries, setting up secured dev bypass credentials, exposing diagnostic routes, and deploying Secret Manager.

## Proposed Changes
- **Platform Context Resolver**: Middleware to authorize incoming queries, normalize shop domains, load store connections, and package them as `PlatformContext`.
- **Static Registry**: Register static properties for allowed tools, system instructions, and scopes under `agent-definitions.ts` and `tool-definitions.ts`.
- **Dev-Bypass Credentials**: Guard bypass options using strict matching headers linked to `SOFTIFY_AGENT_DEV_BYPASS_SECRET`.
- **Deployment Wiring**: Configure Cloud Run to map runtime keys through Google Secret Manager variables.
- **Diagnostic Route**: Expose `/api/diagnostics` showing key settings status without leaking secret credentials.
