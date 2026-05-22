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
  agentDefinitionId: string;
  enabled: boolean;
  customSettings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: string;
  requiredScope: string;
  riskLevel: 'Low' | 'Medium' | 'High';
}

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  storeConnectionId: string;
  agentInstallationId: string;
  agentName: string;
  actionType: 'PRODUCT_UPDATE' | 'THEME_PATCH';
  targetId: string;
  details: {
    title: string;
    before: string;
    after: string;
    summary: string;
    productId?: number;
    themeId?: string;
    fields?: any;
    patch?: string;
  };
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  storeConnectionId?: string;
  timestamp: string;
  initiator: string;
  event: string;
  description: string;
  metadata?: any;
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
  vendor?: string;
  productType?: string;
  tags: string[];
  variantsCount: number;
  imagesCount: number;
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
}

