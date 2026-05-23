import { AiProvider, AiProviderInput, AiProviderResponse } from "./ai-engine.types.js";
import { GoogleGenAI } from "@google/genai";

export class GeminiAiProvider implements AiProvider {
  name = 'gemini' as const;

  async generate(input: AiProviderInput): Promise<AiProviderResponse> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_PROVIDER_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API key is not configured. Please set GEMINI_API_KEY environment variable.");
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    // 1. Detect write/mutation intent BEFORE calling the model (precedence & security guardrail)
    const msg = (input.message || "").toLowerCase();
    const writeKeywords = ["update", "change", "delete", "modify", "patch", "price", "title", "write", "create", "upsert"];
    const hasWriteIntent = writeKeywords.some(keyword => msg.includes(keyword));

    if (hasWriteIntent) {
      return {
        type: "final",
        message: "I cannot perform this action because this agent only has read-only catalog access and no approved write tool is available."
      };
    }

    // Initialize GoogleGenAI using the configured key
    const ai = new GoogleGenAI({ apiKey });

    try {
      if (!input.toolResults || input.toolResults.length === 0) {
        const systemPrompt = `You are a read-only Product Intelligence Agent. You only have access to read-only tools: ${input.allowedTools.join(", ")}.
If the user asks about products, catalog snapshots, sync status, or summary, you should call the tool 'catalog.products.summary'.
Respond in JSON format only matching one of these shapes:
{"type": "tool_call", "toolName": "catalog.products.summary", "arguments": {"shop": "${input.shop}"}}
or
{"type": "final", "message": "Your text answer here"}`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: input.message,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json"
          }
        });

        const text = response.text || "";
        const parsed = JSON.parse(text.trim());
        if (parsed.type === "tool_call" || parsed.type === "final") {
          return parsed as AiProviderResponse;
        }
      } else {
        const toolResult = input.toolResults[0];
        const resultString = JSON.stringify(toolResult.result);
        const prompt = `Formulate a clean, professional, and friendly response answering the merchant's question: "${input.message}" based on the tool result for "${toolResult.toolName}": ${resultString}. Return the response in JSON matching: {"type": "final", "message": "Your text answer here"}`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json"
          }
        });

        const text = response.text || "";
        const parsed = JSON.parse(text.trim());
        if (parsed.type === "final") {
          return parsed as AiProviderResponse;
        }
      }
    } catch (err: any) {
      throw new Error(`Gemini AI execution failed: ${err.message}`);
    }

    return {
      type: "final",
      message: "I am a Product Intelligence Agent. You can ask me catalog questions, such as asking for a product summary."
    };
  }
}
