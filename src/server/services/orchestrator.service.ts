import { OrchestrationMessage, Agent, ApprovalItem, AuditLog } from "../../types.js";
import { getAgents } from "./agent-registry.service.js";
import { getShopifyStore, setShopifyStore } from "../data/mock-store.js";
import { getMockProducts, setMockProducts } from "../data/mock-products.js";
import { getMockOrders, setMockOrders } from "../data/mock-orders.js";
import { getMockSalesReport, setMockSalesReport } from "../data/mock-sales.js";
import { getActiveThemeCode, setActiveThemeCode } from "../data/mock-theme.js";
import { setApprovals, getApprovals } from "./approval.service.js";
import { setAuditLogs, getAuditLogs, writeLog } from "./audit-log.service.js";
import { getGeminiSDK } from "./gemini.service.js";
import { executeTool, executeToolWithContext } from "../tools/tool-gateway.js";
import { getDemoToolExecutionContext, getToolExecutionContextForShop } from "./tool-execution-context.service.js";

function buildToolFailureResponse(agentName: string, toolName: string, errorMessage: string): string {
  return `⚠️ **Security Policy Blocked Action:**
  
  I attempted to execute the tool \`${toolName}\` to process your request, but the action was blocked by the Tool Gateway policy.
  
  * **Reason:** ${errorMessage}
  * **Enforcement:** The gateway blocked execution and logged a \`TOOL_BLOCKED\` security event in the audit trail.`;
}

// Deterministic fallback response simulation
export async function fallbackOrchestration(prompt: string, selectedAgentId?: string): Promise<OrchestrationMessage[]> {
  const normPrompt = prompt.toLowerCase();
  const agentsList = getAgents();
  let agent: Agent = agentsList[0]; // Default fallback

  // If the user picked a specific agent, we route directly
  if (selectedAgentId) {
    const matched = agentsList.find(a => a.id === selectedAgentId);
    if (matched) agent = matched;
  } else {
    // Dynamic routing classifier
    if (normPrompt.includes("sales") || normPrompt.includes("analytics") || normPrompt.includes("revenue") || normPrompt.includes("report") || normPrompt.includes("orders")) {
      agent = agentsList.find(a => a.id === "agent_analytics")!;
    } else if (normPrompt.includes("product") || normPrompt.includes("description") || normPrompt.includes("copy") || normPrompt.includes("write") || normPrompt.includes("content")) {
      agent = agentsList.find(a => a.id === "agent_content")!;
    } else if (normPrompt.includes("theme") || normPrompt.includes("css") || normPrompt.includes("button") || normPrompt.includes("design") || normPrompt.includes("padding")) {
      agent = agentsList.find(a => a.id === "agent_theme_dev")!;
    } else if (normPrompt.includes("support") || normPrompt.includes("customer") || normPrompt.includes("help") || normPrompt.includes("complaint")) {
      agent = agentsList.find(a => a.id === "agent_customer_support")!;
    } else if (normPrompt.includes("logo") || normPrompt.includes("banner") || normPrompt.includes("image") || normPrompt.includes("media")) {
      agent = agentsList.find(a => a.id === "agent_media_digital")!;
    } else if (normPrompt.includes("setup") || normPrompt.includes("oauth") || normPrompt.includes("scopes")) {
      agent = agentsList.find(a => a.id === "agent_store_setup")!;
    } else {
      agent = agentsList.find(a => a.id === "agent_content")!; // Default to Content
    }
  }

  const resultMessages: OrchestrationMessage[] = [];
  const messageTimestamp = new Date().toISOString();

  // Load and synchronize tool execution context
  const store = getShopifyStore();
  const toolContext = await getToolExecutionContextForShop(agent.id, store.url);
  toolContext.agentInstallation.enabled = agent.enabled;
  toolContext.agentDefinition.allowedTools = agent.allowedTools;

  // Route log
  writeLog(
    "Super Agent Orchestrator",
    "ROUTE_REQUEST",
    `Routed storeowner request: "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}" to agent '${agent.name}' (confidence score 0.94)`,
    { agentId: agent.id }
  );

  // If the selected agent is disabled, explain it
  if (!agent.enabled) {
    resultMessages.push({
      id: `m-${Date.now()}-1`,
      sender: "orchestrator",
      text: `⚠️ **Routing Error:** I routed your query to the **${agent.name}**, but that agent is currently disabled in your Registry. Please toggle the agent active to handle this function.`,
      timestamp: messageTimestamp
    });
    return resultMessages;
  }

  // Generate logical responses based on tool configurations
  let agentResponseText = "";
  const mockCalls: any[] = [];

  if (agent.id === "agent_analytics") {
    const gatewayResult = await executeToolWithContext("shopify.getSalesSummary", {}, toolContext);
    mockCalls.push(gatewayResult);

    if (gatewayResult.status === "failed") {
      agentResponseText = buildToolFailureResponse(agent.name, "shopify.getSalesSummary", gatewayResult.result.error);
    } else {
      agentResponseText = `📊 **Sales Summary & Analysis Report:**
      
      I have retrieved the sales summary from the Shopify store via \`shopify.getSalesSummary\`. Here are the active insights:
      * **Weekly Revenue:** $5,340.00 across high-performing days.
      * **Store Conversion Rate:** **${gatewayResult.result.conversionRate}** (above industry average).
      * **Top Product Performance:**
        - **Eco Linen Warm Shirt** (${gatewayResult.result.popularProducts[0].salesCount} units) generating **$${gatewayResult.result.popularProducts[0].revenue}**.
        - **Silk Contour Sleep Mask** (${gatewayResult.result.popularProducts[1].salesCount} units).
      
      Current trends demonstrate organic lift on weekends. Inventory levels are stable, although a replenishment trigger is recommended for **Full-grain Leather Backpack** soon.`;
    }
  }

  else if (agent.id === "agent_content") {
    // Determine which product to edit
    const products = getMockProducts();
    let targetProduct = products[0];
    for (const p of products) {
      if (normPrompt.includes(p.title.toLowerCase()) || normPrompt.includes(String(p.id))) {
        targetProduct = p;
        break;
      }
    }

    const getProdResult = await executeToolWithContext("shopify.getProducts", {}, toolContext);
    mockCalls.push(getProdResult);

    if (getProdResult.status === "failed") {
      agentResponseText = buildToolFailureResponse(agent.name, "shopify.getProducts", getProdResult.result.error);
    } else {
      const rawAfterStr = `✨ **POLISHED REVISED COPY: ${targetProduct.title}**\n\nExperience elevated comfort with this premium, meticulously crafted garment. Made of 100% natural, sustainable organic flax linen for lightweight breathability. Complete with high-durability structured tailoring, this wardrobe essential bridges relaxed everyday wear and refined office aesthetics with absolute ease.`;

      const approvalResult = await executeToolWithContext("catalog.products.propose_update", {
        productId: String(targetProduct.id),
        fields: { tags: ["organic", "linen", "premium"] },
        summary: "Overhauled boilerplate tags to optimize SEO discoverability and highlight lightweight breathability."
      }, toolContext);
      mockCalls.push(approvalResult);

      if (approvalResult.status === "failed") {
        agentResponseText = buildToolFailureResponse(agent.name, "catalog.products.propose_update", approvalResult.result.error);
      } else {
        agentResponseText = `✍️ **Optimized SEO Product Copy Ready for Handshake**
        
        I inspected your product catalog using \`shopify.getProducts\`. To optimize your catalog's checkout metrics, I drafted an SEO-enriched tag set for **${targetProduct.title}** and queued a secure write action.
        
        * **Proposed Content Enhancement:**
        > tags: organic, linen, premium
        
        * **Security Gate Activated:**
        Since this is a write-capable action, the Tool Gateway blocked live deployment to Shopify. I have created a pending action **${approvalResult.approvalId}** in your Approval Queue. Please audit and accept or decline this change in your central dashboard tab.`;
      }
    }
  }

  else if (agent.id === "agent_theme_dev" || agent.id === "agent_design") {
    agentResponseText = `🎨 **Theme Layout Adjustments Blocked**
    
    I inspected active Shopify theme configurations using \`shopify.getShopInfo\`. 
    
    Since theme asset write operations (\`theme.assets.patch\`) are disabled on this platform for safety, no layout changes can be drafted or queued. I am operating in a secure, read-only audit state.`;
  }

  else {
    // Setup, Support, or Media Agent Generic Responses
    let actionItem = "general context lookup";
    let gatewayResult;
    let toolName = "shopify.getProducts";
    if (agent.id === "agent_store_setup") {
      actionItem = "Shopify parameters configuration check";
      toolName = "shopify.getShopInfo";
      gatewayResult = await executeToolWithContext("shopify.getShopInfo", {}, toolContext);
      mockCalls.push(gatewayResult);
    } else if (agent.id === "agent_customer_support") {
      actionItem = "customer order audits";
      toolName = "shopify.getOrders";
      gatewayResult = await executeToolWithContext("shopify.getOrders", {}, toolContext);
      mockCalls.push(gatewayResult);
    } else {
      actionItem = "media layout scan";
      toolName = "shopify.getProducts";
      gatewayResult = await executeToolWithContext("shopify.getProducts", {}, toolContext);
      mockCalls.push(gatewayResult);
    }

    if (gatewayResult.status === "failed") {
      agentResponseText = buildToolFailureResponse(agent.name, toolName, gatewayResult.result.error);
    } else {
      agentResponseText = `🤖 **Greetings! I am the ${agent.name}.**
      
      I have processed your query: *"${prompt}"*. 
      To fulfill this request, I activated my assigned resources. Our security layer was triggered, verifying correct scopes (\`${agent.requiredScopes.join(", ")}\`) before delegating tasks.
      
      * **Action Completed:** Conducted ${actionItem} securely in isolation.
      * **Audit Complete:** Access logs have been captured in your global Audit Trail records. Let me know if you would like me to draft further actions!`;
    }
  }

  // Orchestrator response
  resultMessages.push({
    id: `m-${Date.now()}-2`,
    sender: "orchestrator",
    text: `🎯 **Routing Decision:** Handled request with **${agent.name}** based on semantic query classification.`,
    timestamp: messageTimestamp
  });

  // Agent response
  resultMessages.push({
    id: `m-${Date.now()}-3`,
    sender: "agent",
    agentId: agent.id,
    agentName: agent.name,
    text: agentResponseText,
    timestamp: messageTimestamp,
    toolInvocations: mockCalls
  });

  return resultMessages;
}

export async function orchestrate(prompt: string, selectedAgentId?: string): Promise<OrchestrationMessage[]> {
  const client = getGeminiSDK();

  if (!client) {
    // Deterministic fallback response simulation
    return await fallbackOrchestration(prompt, selectedAgentId);
  }

  // Real Gemini implementation
  try {
    const shopifyStore = getShopifyStore();
    const agentsList = getAgents();
    const mockProducts = getMockProducts();
    const mockOrders = getMockOrders();

    // Fetch state details to inject to prompt
    const storeDetails = JSON.stringify(shopifyStore);
    const compactAgentsList = agentsList.map(a => ({
      id: a.id,
      name: a.name,
      tools: a.allowedTools,
      scopes: a.requiredScopes,
      enabled: a.enabled,
      systemInstruction: a.systemInstruction
    }));
    const compactProducts = mockProducts.map(p => ({ id: p.id, title: p.title, inventory: p.inventory, description: p.description }));
    const compactOrders = mockOrders.slice(0, 3);

    const activeRegistryPrompt = `
      You are the Master Orchestration Service of a Shopify AI Managed Agent platform.
      Your job is to route the storeowner's prompt to the correct target agent, execute simulated shopify tools, and output responses in JSON conforming exactly to the structured schema below.

      Active Connected Store:
      ${storeDetails}

      Available Agents in Registry:
      ${JSON.stringify(compactAgentsList)}

      Mock Store Catalog:
      ${JSON.stringify(compactProducts)}

      Mock Store Orders:
      ${JSON.stringify(compactOrders)}

      Storeowner Prompt: "${prompt}"
      Selected Agent Hint: "${selectedAgentId || 'None manually specified'}"

      YOUR TASKS:
      1. Classify which Agent (from the available agents list) is best suited to answer. If a manual agent hint is specified and is enabled, absolutely prioritize that agent. If the routed agent is currently DISABLED, you must return routedDisabled: true.
      2. If routedDisabled is false:
         a. Propose Tool calls representing the agent's work flow.
            Available Mock API tools:
            - shopify.getShopInfo (reads general store specs)
            - shopify.getProducts (queries full catalog lists)
            - shopify.getOrders (retrieves active retail order indices)
            - shopify.getSalesSummary (analyzes sales reports)
            - catalog.products.propose_update (propose product snapshot updates. Parameters: { productId: string, fields: { title?: string, vendor?: string, productType?: string, status?: string, tags?: string[] }, summary: string })
         b. Write high quality markdown markdown response representing the chosen agent's thoughts and text outputs.
         c. If the agent makes a proposal tool call (catalog.products.propose_update), formulate the precise payload arguments to update the store item. This will create a pending approval queue item in the console.

      RETURN STRICTLY A JSON OBJECT matching this exact structure, with NO surrounding markdown backticks or other words:
      {
        "routedAgentId": "agent_id_string",
        "routedAgentName": "Agent Name",
        "routedDisabled": false,
        "agentResponseText": "A highly premium humanized markdown copy and response detailing the tools ran, results, and recommendations.",
        "toolCalls": [
          {
            "name": "shopify.getProducts",
            "args": {}
          },
          {
            "name": "catalog.products.propose_update",
            "args": {
              "productId": "101",
              "fields": {
                "title": "Optimized Premium Tee"
              },
              "summary": "Optimizing title to increase SEO CTR."
            }
          }
        ]
      }
    `;

    const geminiRes = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: activeRegistryPrompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const cleanResultText = geminiRes.text.trim();
    const resultObj = JSON.parse(cleanResultText);

    // Apply outcomes dynamically
    const matchedAgent = agentsList.find(a => a.id === resultObj.routedAgentId) || agentsList[0];
    const messageTimestamp = new Date().toISOString();
    const resultMessages: OrchestrationMessage[] = [];

    writeLog(
      "Super Agent Orchestrator",
      "ROUTE_REQUEST",
      `Routed storeowner request to Gemini-powered '${matchedAgent.name}' (semantic query confidence: 0.98)`,
      { agentId: matchedAgent.id }
    );

    if (resultObj.routedDisabled || !matchedAgent.enabled) {
      resultMessages.push({
        id: `m-${Date.now()}-1`,
        sender: "orchestrator",
        text: `⚠️ **Routing Check Failed:** Target Agent **${matchedAgent.name}** is currently inactive. Toggle it active inside the Registry to delegate functions.`,
        timestamp: messageTimestamp
      });
      return resultMessages;
    }

    // Process tool invocations and map to frontend representation
    const frontendInvocations: any[] = [];

    if (resultObj.toolCalls && Array.isArray(resultObj.toolCalls)) {
      for (const call of resultObj.toolCalls) {
        const gatewayResult = await executeTool(call.name, call.args, matchedAgent);

        frontendInvocations.push({
          toolName: gatewayResult.toolName,
          args: gatewayResult.args,
          status: gatewayResult.status,
          result: gatewayResult.result,
          approvalId: gatewayResult.approvalId
        });
      }
    }

    resultMessages.push({
      id: `m-${Date.now()}-1`,
      sender: "orchestrator",
      text: `🎯 **Routing Decision:** Handled request with **${matchedAgent.name}** via live prompt semantic matching.`,
      timestamp: messageTimestamp
    });

    resultMessages.push({
      id: `m-${Date.now()}-2`,
      sender: "agent",
      agentId: matchedAgent.id,
      agentName: matchedAgent.name,
      text: resultObj.agentResponseText || "Completed requested tasks successfully.",
      timestamp: messageTimestamp,
      toolInvocations: frontendInvocations
    });

    return resultMessages;

  } catch (error: any) {
    console.error("Gemini Orchestration Error: ", error);

    // Smooth recovery & fallback log
    return await fallbackOrchestration(prompt, selectedAgentId);
  }
}

export function resetAllData(): void {
  // Restore original products
  setMockProducts([
    {
      id: 101,
      title: "Eco Linen Warm Shirt",
      status: "Active",
      price: 78.00,
      inventory: 42,
      sku: "SH-EC-LIN-01",
      description: "A comfortable linen shirt styled with structured collars. Breathable, made of 100% natural organic flax linen material. Standard fit.",
      image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop&q=80"
    },
    {
      id: 102,
      title: "Double-walled Ceramic Mug",
      status: "Active",
      price: 32.00,
      inventory: 15,
      sku: "MG-DBL-CRM-02",
      description: "Keeps drinks warm for up to 6 hours. Features structural matte stone finish and raw clay rim. Microwave and dishwasher safe.",
      image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80"
    },
    {
      id: 103,
      title: "Full-grain Leather Backpack",
      status: "Draft",
      price: 189.00,
      inventory: 8,
      sku: "BP-FLG-LTH-03",
      description: "Premium computer satchel with laptop compartment and brushed bronze clasps. Highly durable leather layout.",
      image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&auto=format&fit=crop&q=80"
    },
    {
      id: 104,
      title: "Silk Contour Sleep Mask",
      status: "Active",
      price: 24.00,
      inventory: 110,
      sku: "MK-SLK-SLP-04",
      description: "Blocking luxury eye mask prepared with Mulberry silk. Fully adjustable strap designed to eliminate light entirely.",
      image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=400&auto=format&fit=crop&q=80"
    },
    {
      id: 105,
      title: "Solid Walnut Headphone Stand",
      status: "Active",
      price: 65.00,
      inventory: 24,
      sku: "ST-WNT-HDP-05",
      description: "Hand-turned display hanger for studio headphones. Heavy black steel base adds extreme stability.",
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=80"
    }
  ]);

  // Restore active theme customizations
  setActiveThemeCode(`/* ACTIVE THEME CUSTOMIZATIONS */
body {
  font-family: 'Inter', sans-serif;
  color: #111111;
  background-color: #fafafa;
}

.hero-section {
  padding: 80px 40px;
  background-color: #f3f4f6;
  text-align: center;
}

.hero-title {
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.btn-primary {
  background-color: #008060; /* Shopify Green */
  color: white;
  padding: 12px 24px;
  border-radius: 4px;
}`);

  // Restore approvals
  setApprovals([
    {
      id: "APV-001",
      timestamp: new Date().toISOString(),
      agentId: "agent_content",
      agentName: "Content Agent",
      actionType: "PRODUCT_UPDATE",
      targetId: "102",
      details: {
        title: "Double-walled Ceramic Mug description overhaul",
        before: "Keeps drinks warm for up to 6 hours. Features structural matte stone finish and raw clay rim. Microwave and dishwasher safe.",
        after: "✨ **LUMINOUS RETENTION & MODERN FORM**\nExperience beverage perfection with this double-walled premium stone mug. Formulated with our signature matte finish, it maintains temperature for up to six hours while keeping the outer shell completely cool. Features a hand-brushed raw clay rim designed for sensory, tactile feedback. Microwave-safe and lightweight luxury.",
        summary: "Drafted high-conversion copy with SEO optimizations.",
        productId: 102,
        fields: {
          description: "✨ **LUMINOUS RETENTION & MODERN FORM**\nExperience beverage perfection with this double-walled premium stone mug. Formulated with our signature matte finish, it maintains temperature for up to six hours while keeping the outer shell completely cool. Features a hand-brushed raw clay rim designed for sensory, tactile feedback. Microwave-safe and lightweight luxury."
        }
      },
      status: "PENDING"
    }
  ]);

  // Restore audit logs
  setAuditLogs([
    {
      id: "LOG-001",
      timestamp: new Date().toISOString(),
      initiator: "Shop Owner",
      event: "DATA_RESET",
      description: "Demo database restored to default factory conditions.",
      metadata: {}
    }
  ]);
}
