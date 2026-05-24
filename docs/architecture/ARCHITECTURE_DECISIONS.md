# Architectural Decisions

This document outlines the core architectural patterns, guardrails, and design decisions of **Softify**. All developers and AI engines must strictly adhere to these decisions when modifying the codebase.

---

## 1. System Boundaries & Ownership
- **Softify Core Responsibility**: Softify strictly owns and governs the runtime execution engine, tool gateway, permission models, tenant isolation, audit logging, human-in-the-loop approvals, and Shopify/Firestore database integrations.
- **Pluggable AI Providers**: AI Engines/LLMs are treated as stateless providers pluggable through the `AiProvider` interface. The application logic, database access, and tool executions must remain completely outside the AI engine layer.

## 2. Secure Tool Gateway Boundary
- **No Direct LLM Tool Execution**: The AI provider/engine **never** executes tools directly. It only proposed tool calls or final answers.
- **Authoritative Tool Gateway**: The `ToolGateway` (`src/server/tools/tool-gateway.ts`) is the **only** path to execute tools. Every tool execution passes through this gate to guarantee parameter enforcement, tenant isolation, and security checks.
- **Recursive Sanitization**: The Tool Gateway must perform recursive sanitization on the output of all tools to strip out sensitive secrets, tokens, credentials, or PII before returning any data.
- **No Write Tools Without Audit/Approval**: Do not add write, update, delete, create, publish, or mutation tools until the agent execution audit foundation (10.5) and approval queue are fully established.

## 3. Runtime Permissions & Context
- **Resolved Platform Context**: Agent execution requires an authoritatively resolved `PlatformContext` containing store connection details, organization IDs, and user profiles.
- **Agent Installations**: An agent can only execute if it is explicitly installed and enabled for the target store connection.
- **Dual Permission Checks**: Allowed tools are checked at two separate levels:
  - **Static Agent Definition**: Hard constraints on what tools are authoritatively available to the agent type.
  - **Store-Level Agent Installation**: Custom tools allowed for the specific merchant's installation.
- **Final Enforcement**: The Tool Gateway is the final permission enforcement layer, verifying tool names against both the static agent definition and the store-level installation before running any logic.

## 4. Secret & Configuration Strategy
- **Google Secret Manager**: Production runtime secrets (Shopify API secret, token encryption key, dev-bypass secret) are stored and managed via Google Secret Manager and dynamically wired into Cloud Run using `--set-secrets`.
- **Environment Separation**: GitHub Actions validate pipeline/GCP deployment parameters, but do not require production database/runtime secrets.
- **Mock AI Provider as CI Default**: A deterministic `MockAiProvider` is utilized in tests and CI environments to ensure robust, predictable testing and low latencies.
