import { AiProvider, AiProviderInput, AiProviderResponse } from "./ai-engine.types.js";

export class MockAiProvider implements AiProvider {
  name = 'mock' as const;

  async generate(input: AiProviderInput): Promise<AiProviderResponse> {
    const msg = (input.message || "").toLowerCase();

    // Simulation path for testing approvals and gateway write block
    if (msg.includes("simulate tool catalog.products.propose_update")) {
      let fields: any = { title: "Super Polished Tee" };
      if (msg.includes("fields:")) {
        try {
          const rawFields = msg.slice(msg.indexOf("fields:") + 7).trim();
          fields = JSON.parse(rawFields);
        } catch (_) {}
      }
      return {
        type: "tool_call",
        toolName: "catalog.products.propose_update",
        arguments: {
          productId: "101",
          fields,
          summary: "Overhaul metadata description copy"
        }
      };
    }

    // 1. Detect write/mutation intent FIRST (precedence over catalog/read intent)
    const writeKeywords = ["update", "change", "delete", "modify", "patch", "price", "title", "write", "create", "upsert"];
    const hasWriteIntent = writeKeywords.some(keyword => msg.includes(keyword) && !msg.includes("simulate"));

    if (hasWriteIntent) {
      return {
        type: "final",
        message: "I cannot perform this action because this agent only has read-only catalog access and no approved write tool is available."
      };
    }

    // 1.5. Detect specific catalog insight queries
    if (msg.includes("catalog health") || msg.includes("health of my catalog")) {
      const toolResult = input.toolResults?.find(r => r.toolName === "catalog.insights.health");
      if (toolResult) {
        const data = (toolResult.result as any)?.data || {};
        return {
          type: "final",
          message: `Your catalog health score is ${data.healthScore}/100. ${data.scoreExplanation}`
        };
      }
      return {
        type: "tool_call",
        toolName: "catalog.insights.health",
        arguments: { shop: input.shop }
      };
    }

    if (msg.includes("missing images")) {
      const toolResult = input.toolResults?.find(r => r.toolName === "catalog.insights.missing_images");
      if (toolResult) {
        const data = (toolResult.result as any)?.data || {};
        return {
          type: "final",
          message: `There are ${data.missingImagesCount} products missing images.`
        };
      }
      return {
        type: "tool_call",
        toolName: "catalog.insights.missing_images",
        arguments: { shop: input.shop }
      };
    }

    if (msg.includes("missing vendor")) {
      const toolResult = input.toolResults?.find(r => r.toolName === "catalog.insights.missing_vendor");
      if (toolResult) {
        const data = (toolResult.result as any)?.data || {};
        return {
          type: "final",
          message: `There are ${data.missingVendorCount} products missing vendor configurations.`
        };
      }
      return {
        type: "tool_call",
        toolName: "catalog.insights.missing_vendor",
        arguments: { shop: input.shop }
      };
    }

    if (msg.includes("missing product type")) {
      const toolResult = input.toolResults?.find(r => r.toolName === "catalog.insights.missing_product_type");
      if (toolResult) {
        const data = (toolResult.result as any)?.data || {};
        return {
          type: "final",
          message: `There are ${data.missingProductTypeCount} products missing product types.`
        };
      }
      return {
        type: "tool_call",
        toolName: "catalog.insights.missing_product_type",
        arguments: { shop: input.shop }
      };
    }

    if (msg.includes("top vendors") || msg.includes("vendor summary")) {
      const toolResult = input.toolResults?.find(r => r.toolName === "catalog.insights.vendor_summary");
      if (toolResult) {
        const data = (toolResult.result as any)?.data || {};
        const list = (data.topVendors || []).map((v: any) => `${v.vendor} (${v.count})`).join(", ");
        return {
          type: "final",
          message: `Top vendors in your catalog: ${list}`
        };
      }
      return {
        type: "tool_call",
        toolName: "catalog.insights.vendor_summary",
        arguments: { shop: input.shop }
      };
    }

    if (msg.includes("top product types") || msg.includes("product type summary")) {
      const toolResult = input.toolResults?.find(r => r.toolName === "catalog.insights.product_type_summary");
      if (toolResult) {
        const data = (toolResult.result as any)?.data || {};
        const list = (data.topProductTypes || []).map((t: any) => `${t.productType} (${t.count})`).join(", ");
        return {
          type: "final",
          message: `Top product types in your catalog: ${list}`
        };
      }
      return {
        type: "tool_call",
        toolName: "catalog.insights.product_type_summary",
        arguments: { shop: input.shop }
      };
    }

    if (msg.includes("stale snapshots") || msg.includes("sync freshness")) {
      const toolResult = input.toolResults?.find(r => r.toolName === "catalog.insights.stale_snapshots");
      if (toolResult) {
        const data = (toolResult.result as any)?.data || {};
        return {
          type: "final",
          message: `There are ${data.staleSnapshotsCount} stale snapshots synced older than ${data.staleThresholdHours} hours ago.`
        };
      }
      return {
        type: "tool_call",
        toolName: "catalog.insights.stale_snapshots",
        arguments: { shop: input.shop }
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
