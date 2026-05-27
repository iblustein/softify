import { AllowedProductProposalField } from "../domain/types.js";

const PRODUCTION_AGENTS = [
  "agent_catalog_health",
  "agent_product_seo",
  "agent_catalog_cleanup",
  "agent_merchandising_insights",
  "agent_approval_operations"
];

/**
 * Centrally enforces per-agent allowed product proposal fields.
 */
export function getAllowedFieldsForAgent(agentId: string): AllowedProductProposalField[] {
  switch (agentId) {
    case "agent_catalog_health":
      return ["title", "vendor", "productType", "tags"];
    case "agent_product_seo":
      return ["title", "productType", "tags"];
    case "agent_catalog_cleanup":
      return ["vendor", "productType", "status", "tags"];
    case "agent_merchandising_insights":
    case "agent_approval_operations":
    default:
      return [];
  }
}

/**
 * Returns true only for non-legacy, enabled production agents.
 */
export function isProductionAgentAllowed(agentId: string): boolean {
  return PRODUCTION_AGENTS.includes(agentId);
}
