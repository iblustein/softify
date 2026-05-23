import { AiProvider } from "./ai-engine.types.js";
import { MockAiProvider } from "./mock-ai.provider.js";
import { GeminiAiProvider } from "./gemini-ai.provider.js";

export function getAiProvider(providerName?: string): AiProvider {
  const selected = providerName || process.env.AI_PROVIDER || "mock";

  switch (selected.toLowerCase()) {
    case "mock":
      return new MockAiProvider();
    case "gemini":
      return new GeminiAiProvider();
    default:
      throw new Error(`Configuration Error: Unknown AI provider '${selected}' configured.`);
  }
}
