# Technical Walkthrough — Phase 11.1: System AI Engines & Agent Engine Assignment

This document details the implementation of Phase 11.1, focusing on building a system-managed AI engine registry layer so Softify can centrally configure AI providers, and the existing Theme Editor AI Agent can be connected and assigned to Gemini through this system engine configuration.

---

## 1. System AI Engine Registry (`ai-engine.service.ts`)

Instead of each merchant entering API keys or seeing provider secrets, AI engine connectivity is strictly managed at the Softify system level.
We built a centralized system AI engine registry:
- **Sanitized Metadata API**: We registered `gemini` as a system AI engine. The service `getSystemAiEngines` returns metadata detailing provider identity, configuration states, credential sources, dynamic defaults (`process.env.GEMINI_MODEL`), and supported models (`gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.5-flash`, `gemini-2.5-pro`). No credentials or raw secrets are ever returned to the client.
- **Harmless Connection Test Probes**: We implemented `testAiEngineConnection(engineId)` performing a minimal, safe connectivity test (sending prompt `"Hello"`) to verify the environment's `GEMINI_API_KEY` configuration. The test catches and sanitizes all errors cleanly to return safe status messages without exposing internal stack traces, API keys, or raw payloads. Connection outcomes (`lastTestedAt`, `lastTestStatus`) are tracked in memory.

---

## 2. generic Agent Assignment & Persistence Schema

We extended the `AgentInstallation` database domain model to persist engine-to-agent mapping selections per shop domain:
- **Extended Types**: Added `engineId?: string` and `model?: string` optional parameters to `AgentInstallation` in `types.ts`.
- **Repository Adapters**: Updated `mapDocument` and `upsertInstallation` inside `firestore-agent-installation.repository.ts` to cleanly parse and store `engineId` and `model` in Google Firestore documents while preserving legacy fields for non-destructive read compatibility.

---

## 3. Secure API Router Layer

We updated the Express router namespace to support dynamic configuration management and assignment:
- **`GET /api/settings/ai-engines`**: Tenant-validated, sanitized registry query API returning available system engines.
- **`POST /api/settings/ai-engines/:engineId/test`**: Securely executes the connection test using server-level credentials and returns the sanitized result.
- **`GET /api/settings/agents`**: Extends the response to return the active `engineId` and `model` settings per agent installation.
- **`PATCH /api/settings/agents/:agentId`**: Validates the selected system engine ID (rejects invalid engines with `INVALID_ENGINE`) and validates that the selected model is supported by the registry (rejects unsupported models with `UNSUPPORTED_MODEL`), persisting updates in the database.
- **`POST /api/agents/theme-editor/conversations/:conversationId/messages`**:
  - Dynamically loads the `AgentInstallation` settings.
  - Resolves the active `engineId` and `model` (defaulting to the system-configured `gemini` environment default).
  - Routes message generation calls dynamically through the assigned model.
  - Wraps SDK calls in a safe, merchant-friendly try-catch boundary. If API keys are missing or invalid, it returns a friendly chat assistant warning bubble rather than crashing.

---

## 4. Premium React Settings UX (`Settings.tsx`)

We redesigned the Settings control board to give merchants visual control over their AI assignments:
- **System AI Engines Panel**: A premium, glassmorphic card on the right column displaying active system engines (Gemini AI Engine), credentials source descriptions, and current status ("Configured" vs "Not Configured").
- **Interactive Connection Testing**: Triggered in real-time with visual loaders and beautiful, colored success/fail banner callouts reporting the sanitised test outcome.
- **Agent Configuration Selectors**: Custom inline dropdown select boxes enabling merchants to assign their Theme Editor AI Agent to a specific engine and choose from a dynamically loaded list of supported models.
- **Secure Visual Disclaimers**: Displays clear instructions and security boundary warnings:
  - *“Softify manages AI engine connections at the system level. Your team only chooses which enabled engine powers each agent. API keys are never shown in the merchant interface.”*

---

## 5. Automated Verification Milestones

We integrated comprehensive test coverage in the smoke test suite to guarantee reliability:
- **Test Case `AA` added in `scripts/smoke-test.mjs`**:
  - Validates `GET /api/settings/ai-engines` returns clean Gemini metadata.
  - Validates `POST /api/settings/ai-engines/gemini/test` completes successfully with a sanitized status payload.
  - Asserts that invalid `engineId` assignments (e.g. `openai-gpt4`) are rejected with `400 Bad Request` and `INVALID_ENGINE`.
  - Asserts that valid engine/model assignment changes successfully persist via `PATCH`.
  - Verifies that subsequent Theme Editor Chat conversations load and route messages dynamically through the newly assigned model configuration.
- **Perfect Test Results**:
  - **Local Smoke Integration Suite (`smoke:integration`)**: 34/34 Passed.
  - **Production Smoke Diagnostics (`smoke:prod`)**: 10/10 Passed.
  - **Static Release Suit (`verify:release`)**: 59/59 Passed.
  - **TypeScript Linter Check (`lint`)**: 100% Green, 0 errors.
  - **Vite & Esbuild Bundler Check (`build`)**: Compiled successfully.
