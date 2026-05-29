# Security Review & Trust Model — Phase 11.1: System AI Engines & Agent Engine Assignment

This document details the security reviews, safe execution bounds, threat models, trust boundaries, and scope constraints implemented in **Phase 11.1 — System AI Engines & Agent Engine Assignment**. It guarantees that system credentials are kept completely secure and no sensitive telemetry or keys leak to the client-side merchant interface.

---

## 1. Overview of Decoupled Key Management

AI engine connectivity is strictly managed at the Softify system level. Merchants do not enter API keys or see provider secrets. They only enable agents and choose which system-configured AI engine/model powers each agent. This ensures that:
- Merchants have no visibility or control over backend API keys.
- Developers configure AI provider credentials centrally via environment variables (`GEMINI_API_KEY`), keeping them isolated in the secure server context.

```
[ Shopify Merchant UI ]
         │
         ▼ (Sanitized requests & assignment selects)
[ Softify Backend Server ]  ◄─── (Secure System-Level Env) ───► [ GEMINI_API_KEY ]
         │
         ├─► [ Step A ] Validates shop tenant context
         ├─► [ Step B ] Restricts GET /settings/ai-engines to sanitized metadata
         ├─► [ Step C ] Decouples test triggers using harmless stateless probes
         ├─► [ Step D ] Restricts model updates to allowlisted supported lists
         │
         ▼ (Dynamic, merchant-safe GenAI execution)
[ Google Gemini AI Engine ]
```

---

## 2. Hardened Guardrail Implementations

### A. Sanitized Registry Metadata API
- **Endpoint**: `GET /api/settings/ai-engines`
- **Security Check**: This API returns only sanitized engine metadata: `engineId`, `provider`, `displayName`, `enabled`, `configured`, `defaultModel`, `supportedModels`, `lastTestedAt`, `lastTestStatus`, and `credentialSource`.
- **Zero Key Exposure**: The API completely redacts credentials and API keys. The browser client only sees if an engine is configured (`configured: true`) or not, with zero exposure to raw credentials.

### B. Decoupled Connection Test Probes
- **Endpoint**: `POST /api/settings/ai-engines/:engineId/test`
- **Security Check**: The connection test is completely sanitized. It triggers a minimal, harmless text probe `"Hello"` to the GenAI SDK.
- **Error Sanitization & Redaction**: The backend wraps the SDK call in a strict try-catch boundary. Any thrown exception (such as `404 Model Not Found` or authorization issues) is caught and sanitized. Internal stack traces, raw request payloads, authorization headers, or database configurations are completely redacted, returning only a safe, merchant-friendly error message.
- **Memory Telemetry Boundaries**: Connection test timestamps and statuses (`lastTestedAt`, `lastTestStatus`) are tracked in memory, preventing unauthorized persistent mutations.

### C. Strict Assignment Schema Validation
- **Endpoint**: `PATCH /api/settings/agents/:agentId`
- **Security Check**: The API validates all incoming assignment requests.
  - Rejects any selected `engineId` that is not registered and configured on the system level (returns `400 Bad Request` with code `INVALID_ENGINE`).
  - Rejects any selected `model` that is not on the registry's supported model allowlist (returns `400 Bad Request` with code `UNSUPPORTED_MODEL`).
- This prevents malicious actors from injecting arbitrary string parameters, pointing the agent to unconfigured providers, or executing unauthorized LLM endpoints.

### D. Safe Dynamic Chat Routing & SDK Boundaries
- **Dynamic Config Loading**: When a chat message is sent to `POST /api/agents/theme-editor/conversations/:conversationId/messages`, the route loads the persisted `AgentInstallation` record for the tenant store.
- **Assigned Resolution**: Resolves the active `engineId` and `model` configuration. If none is explicitly set, it falls back to the system default model safely.
- **Graceful Error Wrapping**: The route wraps all `@google/genai` calls in a safe try-catch boundary. If the API key is unconfigured or invalid, the request does **not** crash or leak raw SDK exceptions. Instead, it returns a friendly chat assistant warning bubble: `"Gemini is not configured yet. Configure the system AI engine before using this agent."`
- **Zero Token Leakage**: Standard preflight scans ensure that no Shopify store access tokens or merchant details leak to the AI SDK prompt context.

---

## 3. Scope Gating Rules

AI engine settings and assignments utilize minimum privileges:
- **Tenant Context Isolation**: All settings endpoints (`/api/settings/*`) and theme chat routes (`/api/agents/theme-editor/*`) enforce strict shop validation middleware. Access is blocked early if there is a tenant mismatch or if the store connection is disconnected.
- **Least-Privilege API Scopes**: Continues to enforce strict least-privilege Shopify scopes (`read_themes`, `write_themes`), completely blocking any customer-writing, product-mutating, or payment-overriding actions.
