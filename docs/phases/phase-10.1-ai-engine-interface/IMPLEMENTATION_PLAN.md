# Phase 10.1 Implementation Plan — AI Engine Interface and Catalog Agent POC

## Goal
Establish the core AI Provider interface, mock/gemini providers, agent runtime, catalog tools, Product Intelligence Agent POC, and `/api/agents/chat` endpoint.

## Proposed Changes
- **Core AI Provider Layer**: Define a uniform `AiProvider` interface with stateless turn-taking capabilities.
- **Provider Models**: Create a `MockAiProvider` for local testing/CI and a `GeminiAiProvider` integrating the Google Gemini SDK.
- **Agent Runtime**: Build an orchestrator runtime inside `agent-runtime.service.ts` to manage prompt formulation, tool calls detection, and execution routing.
- **Catalog Sync Mocks**: Register the initial set of product catalog tools:
  - `catalog.products.status`
  - `catalog.products.summary`
  - `catalog.products.read`
  - `catalog.products.list`
