import { AiProvider, AiProviderInput, AiProviderResponse } from "./ai-engine.types.js";

export class MockAiProvider implements AiProvider {
  name = 'mock' as const;

  async generate(input: AiProviderInput): Promise<AiProviderResponse> {
    const msg = (input.message || "").toLowerCase();

    // 1. Detect write/mutation intent FIRST (precedence over catalog/read intent)
    const writeKeywords = ["update", "change", "delete", "modify", "patch", "price", "title", "write", "create", "upsert"];
    const hasWriteIntent = writeKeywords.some(keyword => msg.includes(keyword));

    if (hasWriteIntent) {
      return {
        type: "final",
        message: "I cannot perform this action because this agent only has read-only catalog access and no approved write tool is available."
      };
    }

    // 2. Detect catalog/read/summary intent
    const readKeywords = ["product", "catalog", "synced", "status", "summary", "count"];
    const hasReadIntent = readKeywords.some(keyword => msg.includes(keyword));

    if (hasReadIntent) {
      // Check if we already have tool results for catalog.products.summary
      const summaryResult = input.toolResults?.find(r => r.toolName === "catalog.products.summary");
      if (summaryResult) {
        const resultData = summaryResult.result as any;
        const count = resultData?.syncedProductCount !== undefined 
          ? resultData.syncedProductCount 
          : (resultData?.count !== undefined ? resultData.count : 0);
        
        return {
          type: "final",
          message: `The catalog currently has ${count} synced products.`
        };
      }

      // Otherwise, request the catalog.products.summary tool call
      return {
        type: "tool_call",
        toolName: "catalog.products.summary",
        arguments: {
          shop: input.shop
        }
      };
    }

    // 3. Default final response
    return {
      type: "final",
      message: "I am a Product Intelligence Agent. You can ask me catalog questions, such as asking for a product summary."
    };
  }
}
