import { ApprovalItem } from "../../types.js";
import { getMockProducts, setMockProducts } from "../data/mock-products.js";
import { getActiveThemeCode, setActiveThemeCode } from "../data/mock-theme.js";
import { writeLog } from "./audit-log.service.js";

// TODO: Replace with a persistent database (e.g., PostgreSQL or MongoDB) for production
// TODO: Migrate approvalQueue operations (createApproval, decideApproval) to ApprovalRepository under src/server/repositories/approval.repository.ts
export let approvalQueue: ApprovalItem[] = [
  {
    id: "APV-001",
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 mins ago
    agentId: "agent_content",
    agentName: "Content Agent",
    actionType: "PRODUCT_UPDATE",
    targetId: "102",
    details: {
      title: "Double-walled Ceramic Mug description overhaul",
      before: "Keeps drinks warm for up to 6 hours. Features structural matte stone finish and raw clay rim. Microwave and dishwasher safe.",
      after: "✨ **LUMINOUS RETENTION & MODERN FORM**\nExperience beverage perfection with this double-walled premium stone mug. Formulated with our signature matte finish, it maintains temperature for up to six hours while keeping the outer shell completely cool. Features a hand-brushed raw clay rim designed for sensory, tactile feedback. Microwave-safe and lightweight luxury.",
      summary: "Drafted high-conversion, sensory copy emphasizing thermo-conduction retention, premium tactile finishes, and user ease.",
      productId: 102,
      fields: {
        description: "✨ **LUMINOUS RETENTION & MODERN FORM**\nExperience beverage perfection with this double-walled premium stone mug. Formulated with our signature matte finish, it maintains temperature for up to six hours while keeping the outer shell completely cool. Features a hand-brushed raw clay rim designed for sensory, tactile feedback. Microwave-safe and lightweight luxury."
      }
    },
    status: "PENDING"
  },
  {
    id: "APV-002",
    timestamp: new Date(Date.now() - 50 * 60 * 1000).toISOString(), // 50 mins ago
    agentId: "agent_theme_dev",
    agentName: "Theme Development Agent",
    actionType: "THEME_PATCH",
    targetId: "main_theme",
    details: {
      title: "Optimize hero button responsive padding & color transitions",
      before: "/* Older padding setting */\n.btn-primary {\n  background-color: #008060;\n  color: white;\n  padding: 12px 24px;\n  border-radius: 4px;\n}",
      after: "/* Updated polished settings with smooth transition kinetics */\n.btn-primary {\n  background-color: #0d1b2a;\n  color: #f8f9fa;\n  padding: 14px 28px;\n  border-radius: 6px;\n  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);\n}\n.btn-primary:hover {\n  background-color: #1b263b;\n  transform: translateY(-1px);\n}",
      summary: "Patched theme code to update main CTA colors to dark graphite styling with active physical hover offsets.",
      themeId: "main_theme",
      patch: "/* Updated polished settings with smooth transition kinetics */\n.btn-primary {\n  background-color: #0d1b2a;\n  color: #f8f9fa;\n  padding: 14px 28px;\n  border-radius: 6px;\n  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);\n}\n.btn-primary:hover {\n  background-color: #1b263b;\n  transform: translateY(-1px);\n}"
    },
    status: "PENDING"
  }
];

export function getApprovals(): ApprovalItem[] {
  return approvalQueue;
}

export function createApproval(approval: Omit<ApprovalItem, 'id' | 'timestamp' | 'status'>): ApprovalItem {
  const approvalId = `APV-${String(approvalQueue.length + 1).padStart(3, '0')}`;
  const newItem: ApprovalItem = {
    ...approval,
    id: approvalId,
    timestamp: new Date().toISOString(),
    status: "PENDING"
  };
  approvalQueue.unshift(newItem);
  return newItem;
}

export function decideApproval(id: string, decision: "APPROVE" | "REJECT"): ApprovalItem {
  const itemIdx = approvalQueue.findIndex(item => item.id === id);
  if (itemIdx === -1) {
    throw new Error("Approval item not found");
  }

  const approvalItem = approvalQueue[itemIdx];
  if (approvalItem.status !== "PENDING") {
    throw new Error("Action is already finalized.");
  }

  if (decision === "APPROVE") {
    approvalQueue[itemIdx].status = "APPROVED";
    approvalQueue[itemIdx].decidedAt = new Date().toISOString();

    // Trigger true mock state execution
    if (approvalItem.actionType === "PRODUCT_UPDATE") {
      const prodId = approvalItem.details.productId;
      const fieldsToApply = approvalItem.details.fields;
      const products = getMockProducts();
      const prodIdx = products.findIndex(p => p.id === prodId);
      if (prodIdx !== -1) {
        products[prodIdx] = {
          ...products[prodIdx],
          ...fieldsToApply
        };
        setMockProducts(products);
      }
    } else if (approvalItem.actionType === "THEME_PATCH") {
      if (approvalItem.details.patch) {
        const currentThemeCode = getActiveThemeCode();
        setActiveThemeCode(currentThemeCode + "\n" + approvalItem.details.patch);
      }
    }

    writeLog(
      "Shop Owner",
      "APPROVAL_DECISION",
      `Approved and committed changes for '${approvalItem.details.title}' submitted by ${approvalItem.agentName}.`,
      { approvalId: id, result: "COMMITTED" }
    );
  } else {
    approvalQueue[itemIdx].status = "REJECTED";
    approvalQueue[itemIdx].decidedAt = new Date().toISOString();

    writeLog(
      "Shop Owner",
      "APPROVAL_DECISION",
      `Rejected modification proposed by ${approvalItem.agentName}: '${approvalItem.details.title}'`,
      { approvalId: id, result: "REJECTED" }
    );
  }

  return approvalQueue[itemIdx];
}

export function setApprovals(newQueue: ApprovalItem[]): void {
  approvalQueue = newQueue;
}
