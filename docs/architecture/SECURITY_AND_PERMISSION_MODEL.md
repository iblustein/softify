# Security and Permission Model

This document outlines the security architecture and permission enforcement strategy of the **Softify** platform.

---

## 1. Tenant Isolation
- **Partitioning by Shop Domain**: All customer data, configuration states, and snapshot records are authoritatively partitioned by `shopDomain`.
- **Context Enforcement**: The `PlatformContextResolver` resolves and binds the store connection details using the merchant's host domain.
- **Authoritative Arguments Overriding**: The agent runtime automatically overrides any shop parameters suggested by the LLM with the resolver's authenticated `shopDomain`, preventing cross-tenant data requests.
- **Repository Isolation**: Both in-memory and Firestore repository queries strictly require shop filtering parameters to prevent accidental broad catalog reads.

## 2. Token & Credential Safety
- **No Token Exposure**: Raw API access tokens, decryption keys, and private client credentials must never be exposed to the client or the AI Provider.
- **Payload Sanitization**: The Tool Gateway recursively scrubs the outputs of all tool executions using `sanitizeResult` to drop all fields resembling secrets (e.g., matching keywords like token, secret, apiKey, credentials, bearer, password).
- **Secure Persistence**: Firestore stores encrypted OAuth access tokens utilizing AES-256-GCM. The token encryption key is injected securely at runtime.

## 3. Secured Development Bypass
- **dev-bypass Verification**: A development bypass authorization header (`X-Softify-Dev-Bypass`) allows testing endpoints securely.
- **Production Guard**: The bypass is active only when `SOFTIFY_ALLOW_AGENT_DEV_BYPASS=true` is explicitly enabled and the request header matches the `SOFTIFY_AGENT_DEV_BYPASS_SECRET` injected at runtime from Secret Manager.

## 4. Permission Enforcements
- **Pluggable AI Sandbox**: AI engines proposed tool calls are restricted to the agent definition's `allowedTools`. Proposing outside this subset triggers direct runtime refusion.
- **Static AllowedTools**: Defines the maximum boundary of tools a specific agent type is authoritatively capable of calling.
- **Installation AllowedTools**: Defines the specific permissions activated by the merchant during store-level agent installations.
- **Tool Gateway Final Gate**: The Tool Gateway performs the final validation before execution, rejecting any request if the target tool is missing from the static definition or the active store installation allowed lists.
- **Strict Read-Only Constraints**: The Product Intelligence Agent `agent_product_intelligence` operates strictly with read-only catalog statistics and summary tools. No write, update, delete, pricing, inventory, or publishing tools are registered or allowed to execute.
