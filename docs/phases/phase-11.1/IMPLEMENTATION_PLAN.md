# Phase 11.1 Implementation Plan — System AI Engines & Agent Engine Assignment

This plan outlines the architecture, design, and step-by-step changes to implement a system-managed AI engine registry in Softify. This allows settings-level selection and testing of Gemini connections while cleanly decoupling credentials and routing logic.

---

## User Review Required

> [!IMPORTANT]
> - **System-Level Control**: Connectivity is strictly managed at the system level. Merchants do not enter API keys or see provider secrets.
> - **Generic Configuration**: The assignment schema is generic, supporting future additions (e.g. OpenAI/Claude engines) without breaking the DB structure or settings UI.
> - **Safe Connection Test**: The Gemini connectivity check is completely sanitized. Raw Gemini payloads, tokens, stack traces, and credentials are never returned or logged.

---

## Proposed Changes

### Domain & Repository Layer

#### [MODIFY] [types.ts](file:///c:/Projects/softify/softify/src/server/domain/types.ts)
Extend `AgentInstallation` to support optional assignment fields:
*   `engineId?: string;`
*   `model?: string;`

#### [MODIFY] [firestore-agent-installation.repository.ts](file:///c:/Projects/softify/softify/src/server/repositories/firestore/firestore-agent-installation.repository.ts)
Update `mapDocument` and `upsertInstallation` to map and persist `engineId` and `model` correctly.

---

### Core Services

#### [NEW] [ai-engine.service.ts](file:///c:/Projects/softify/softify/src/server/services/ai-engine.service.ts)
Implement system-level AI engine definitions, validation, and safe connection checks:
*   Expose a registry containing the `gemini` engine config.
*   Expose `getSystemAiEngines(shopDomain?: string)` returning sanitized engine metadata (`engineId`, `provider`, `displayName`, `enabled`, `configured`, `defaultModel`, `supportedModels`, `lastTestedAt`, `lastTestStatus`, `credentialSource`).
*   Expose `testAiEngineConnection(engineId: string)`:
*   For `gemini`, verify `process.env.GEMINI_API_KEY` is present.
*   Perform a minimal, harmless test call to Google GenAI SDK (e.g., prompt `"ping"` or `"hello"`).
*   Return a clean, sanitized connection status payload: `{ success: boolean, provider: string, model: string, testedAt: string, statusMessage: string }`.
*   Catch errors cleanly and return safe, merchant-friendly status messages without stack traces.
*   Update static/in-memory registry state tracking for `lastTestedAt` and `lastTestStatus` so the next metadata query returns current status.

---

### API Router Layer

#### [MODIFY] [settings.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/settings.routes.ts)
*   **[NEW] `GET /api/settings/ai-engines`**: Returns the list of registered system AI engines with sanitized metadata (calling `ai-engine.service.ts`).
*   **[NEW] `POST /api/settings/ai-engines/:engineId/test`**: Securely executes the connection test using server-level credentials and returns the sanitized result.
*   **`GET /api/settings/agents`**: Extend the returned payload to include the assigned `engineId` and `model` (defaulting to `"gemini"` and system default model if not explicitly set in the database).
*   **`PATCH /api/settings/agents/:agentId`**: Allow updating `engineId` and `model` alongside `enabled`. Validate that:
    *   The `engineId` is registered and configured.
    *   The `model` is supported by the engine.

#### [MODIFY] [theme-chat.routes.ts](file:///c:/Projects/softify/softify/src/server/routes/theme-chat.routes.ts)
*   Update `POST /api/agents/theme-editor/conversations/:conversationId/messages`:
    *   Load the active `AgentInstallation` record for the shop.
    *   Resolve the assigned `engineId` and `model`. If none exists, default to `gemini` if configured.
    *   Check if the assigned engine is configured and enabled on the system level. If not, fail safely with a user-friendly setup-required warning message: `"Gemini is not configured yet. Configure the system AI engine before using this agent."`
    *   Route generated content prompts using the assigned model dynamically.
    *   Verify no Shopify tokens or credentials leak to the AI SDK context.

---

### React UI Layer

#### [MODIFY] [Settings.tsx](file:///c:/Projects/softify/softify/src/components/Settings.tsx)
Update the settings screen with beautiful, modern Tailwind CSS elements:
*   **System AI Engines Panel**:
    *   Display registered AI engines (Gemini).
    *   Show current status (Configured vs Not Configured), model, and credential source disclaimer.
    *   Include a "Test Connection" button with real-time feedback (success/fail status message).
*   **Agent Configuration Panel**:
    *   Add a dropdown selector to choose the assigned AI Engine (Gemini).
    *   Add a dropdown selector to choose the Model (dynamically loaded from supported models list).
    *   Display active configuration alerts (e.g. Warn if the assigned engine is not configured).
    *   Enforce a "Save Assignment" save mechanism or auto-save PATCH update on dropdown change.
    *   Render clear developer-disclaimer: *“Softify manages AI engine connections at the system level. Your team only chooses which enabled engine powers each agent. API keys are never shown in the merchant interface.”*

---

## Verification Plan

### Automated Verification
Add Test cases to `scripts/smoke-test.mjs` checking Phase 11.1 compliance:
*   `GET /api/settings/ai-engines` returns sanitized metadata.
*   `POST /api/settings/ai-engines/gemini/test` completes with sanitized success status.
*   `PATCH /api/settings/agents/theme_editor_ai_agent` successfully assigns `engineId` and `model` in memory.
*   Theme Editor AI Agent reads and executes using the assigned settings.
*   Invalid engineId/agentId are cleanly rejected with a 400.
*   If `GEMINI_API_KEY` is cleared, connection test fails safely and chat returns configuration-missing alerts.

Run full local verification checks:
```bash
npm run lint
npm run build
npm run verify:release
npm run smoke:integration
npm run smoke:prod
```
