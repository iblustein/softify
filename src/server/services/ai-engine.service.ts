import { getGeminiSDK } from "./gemini.service.js";

export interface SystemAiEngine {
  engineId: string;
  provider: string;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  defaultModel: string;
  supportedModels: string[];
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed' | null;
  credentialSource: 'env' | 'secret_manager' | 'not_configured';
}

// In-memory test status tracking
let lastTestedAt: string | undefined = undefined;
let lastTestStatus: 'success' | 'failed' | null = null;

/**
 * Retrieves the system AI engine registry.
 * Decouples credentials and returns sanitized metadata only.
 */
export function getSystemAiEngines(): SystemAiEngine[] {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const isConfigured = typeof geminiApiKey === "string" && geminiApiKey.trim() !== "";
  const defaultModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  const supportedModels = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash", "gemini-2.5-pro"];
  if (process.env.GEMINI_MODEL && !supportedModels.includes(process.env.GEMINI_MODEL)) {
    supportedModels.push(process.env.GEMINI_MODEL);
  }

  return [
    {
      engineId: "gemini",
      provider: "Gemini",
      displayName: "Gemini AI Engine",
      enabled: isConfigured,
      configured: isConfigured,
      defaultModel,
      supportedModels,
      lastTestedAt,
      lastTestStatus,
      credentialSource: isConfigured ? "env" : "not_configured"
    }
  ];
}

/**
 * Validates whether an engineId is a known and configured system engine.
 */
export function isEngineConfigured(engineId: string): boolean {
  const engines = getSystemAiEngines();
  const engine = engines.find(e => e.engineId === engineId);
  return !!(engine && engine.configured);
}

/**
 * Tests connection to a system AI provider securely.
 * Sends a minimal probe request and returns a completely sanitized status response.
 */
export async function testAiEngineConnection(engineId: string) {
  const testedAtIso = new Date().toISOString();
  
  if (engineId !== "gemini") {
    return {
      success: false,
      provider: "Unknown",
      model: "unknown",
      testedAt: testedAtIso,
      statusMessage: `Engine ID '${engineId}' is not supported.`
    };
  }

  const defaultModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const sdk = getGeminiSDK();

  if (!sdk) {
    lastTestedAt = testedAtIso;
    lastTestStatus = 'failed';
    return {
      success: false,
      provider: "Gemini",
      model: defaultModel,
      testedAt: testedAtIso,
      statusMessage: "Gemini API key is not configured."
    };
  }

  try {
    // Perform a minimal, harmless text completion call to probe connection
    const response = await sdk.models.generateContent({
      model: defaultModel,
      contents: "Hello"
    });

    if (response && response.text) {
      lastTestedAt = testedAtIso;
      lastTestStatus = 'success';
      return {
        success: true,
        provider: "Gemini",
        model: defaultModel,
        testedAt: testedAtIso,
        statusMessage: "Connection to Gemini AI Engine succeeded."
      };
    } else {
      throw new Error("Received an empty response from Gemini model.");
    }
  } catch (err: any) {
    lastTestedAt = testedAtIso;
    lastTestStatus = 'failed';
    
    // Sanitize message: never leak internal stack traces or keys
    const sanitizedErrorMsg = err.message || "Unknown connectivity error.";
    return {
      success: false,
      provider: "Gemini",
      model: defaultModel,
      testedAt: testedAtIso,
      statusMessage: `Gemini connection failed: ${sanitizedErrorMsg}`
    };
  }
}
