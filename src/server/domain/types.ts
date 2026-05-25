export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyStoreConnection {
  id: string;
  organizationId: string;
  storeUrl: string;
  accessTokenEncrypted?: string;
  scopes: string[];
  connectedAt: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'REAUTH_REQUIRED';
  plan: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  allowedTools: string[];
  requiredScopes: string[];
  riskLevel: 'Low' | 'Medium' | 'High';
  avatarColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentInstallation {
  id: string;
  organizationId: string;
  storeConnectionId: string;
  shopDomain?: string;
  agentId?: string;
  allowedTools?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  // Legacy fields for read compatibility
  agentDefinitionId?: string;
  customSettings?: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: string;
  requiredScope: string;
  riskLevel: 'Low' | 'Medium' | 'High';
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTING" | "APPLIED" | "FAILED";

export type AllowedProductProposalField =
  | "title"
  | "vendor"
  | "productType"
  | "status"
  | "tags";

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  storeConnectionId: string;
  agentInstallationId: string;
  agentId: string;
  toolName: "catalog.products.propose_update";
  requestedBy: string; // Agent name
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  executedAt?: string;
  executedBy?: string;
  failureReason?: string;
  status: ApprovalStatus;
  riskLevel: 'Low' | 'Medium' | 'High';
  targetType: 'PRODUCT_PROPOSAL';
  targetId: string;
  proposedChangesSummary: string;
  diffSummary: string;
  sanitizedPayload: {
    title?: string;
    vendor?: string;
    productType?: string;
    status?: string;
    tags?: string[];
  };
  allowedFields: AllowedProductProposalField[];
}

export type AuditDecision = "allowed" | "blocked" | "completed" | "failed";

export const AuditEventNames = {
  SHOP_CONNECTED: "SHOP_CONNECTED",
  SHOP_DISCONNECTED: "SHOP_DISCONNECTED",
  TOOL_CALL: "TOOL_CALL",
  APPROVAL_CREATED: "APPROVAL_CREATED",
  APPROVAL_DECISION: "APPROVAL_DECISION",
  APPROVAL_APPROVED: "APPROVAL_APPROVED",
  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  APPROVAL_EXECUTION_STARTED: "APPROVAL_EXECUTION_STARTED",
  APPROVAL_EXECUTION_BLOCKED: "APPROVAL_EXECUTION_BLOCKED",
  APPROVAL_APPLIED: "APPROVAL_APPLIED",
  APPROVAL_FAILED: "APPROVAL_FAILED",
  AGENT_CHAT_REQUEST: "AGENT_CHAT_REQUEST",
  PROVIDER_FINAL_RESPONSE: "PROVIDER_FINAL_RESPONSE",
  RUNTIME_ALLOWED_TOOLS_BLOCK: "RUNTIME_ALLOWED_TOOLS_BLOCK",
  PROVIDER_TOOL_CALL: "PROVIDER_TOOL_CALL",
  GATEWAY_TOOL_EXECUTION: "GATEWAY_TOOL_EXECUTION",
  GATEWAY_VALIDATION_BLOCKED: "GATEWAY_VALIDATION_BLOCKED",
  GATEWAY_VALIDATION_ALLOWED: "GATEWAY_VALIDATION_ALLOWED",
  NESTED_TOOL_CALL_BLOCKED: "NESTED_TOOL_CALL_BLOCKED",
} as const;

export type AuditEventType = keyof typeof AuditEventNames;

export interface AuditEvent {
  id: string;
  organizationId: string;
  storeConnectionId?: string;
  timestamp: string;
  initiator: string;
  event: AuditEventType | string;
  description: string;
  metadata?: any;
  // Structured fields for Phase 10.5
  agentId?: string;
  agentDefinitionId?: string;
  agentInstallationId?: string;
  toolName?: string;
  provider?: string;
  decision?: AuditDecision;
  reason?: string;
  correlationId?: string;
}

export interface Conversation {
  id: string;
  organizationId: string;
  storeConnectionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  sender: 'user' | 'orchestrator' | 'agent' | 'system';
  agentId?: string;
  agentName?: string;
  text: string;
  timestamp: string;
  toolInvocations?: {
    toolName: string;
    args: any;
    status: 'success' | 'pending' | 'failed' | 'requires_approval';
    result?: any;
    approvalId?: string;
  }[];
}

export interface ProductSnapshot {
  id: string;
  organizationId: string;
  storeConnectionId: string;
  shopDomain: string;
  shopifyProductId: string;
  title: string;
  handle: string;
  status: string;
  vendor?: string | null;
  productType?: string | null;
  tags: string[];
  variantsCount: number;
  imagesCount: number;
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
}

