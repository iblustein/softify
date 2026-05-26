export interface ShopifyStore {
  url: string;
  name: string;
  connected: boolean;
  connectedAt?: string;
  plan?: string;
  currency?: string;
  scopes: string[];
  status?: 'CONNECTED' | 'DISCONNECTED' | 'REAUTH_REQUIRED' | 'MISSING_SCOPES' | 'ERROR';
  message?: string;
}

export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface Agent {
  id: string;
  name: string;
  systemInstruction: string;
  allowedTools: string[];
  requiredScopes: string[];
  riskLevel: RiskLevel;
  enabled: boolean;
  avatarColor: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: string;
  requiredScope: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  initiator: string; // 'Orchestrator' | 'Store Setup Agent' | 'Shop Owner' | etc.
  event: string;      // 'ROUTE_REQUEST' | 'TOOL_CALL' | 'APPROVAL_CREATED' | 'APPROVAL_DECISION'
  description: string;
  metadata?: any;
}

export interface ApprovalItem {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  actionType: 'PRODUCT_UPDATE' | 'THEME_PATCH';
  targetId: string; // Product ID or Theme ID
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'APPLIED' | 'FAILED' | 'EXECUTED';
  decidedAt?: string;
}

export interface OrchestrationMessage {
  id: string;
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

export interface DashboardStats {
  connected: boolean;
  storeName: string;
  activeAgentsCount: number;
  pendingApprovalsCount: number;
  totalLogsCount: number;
  totalProductsCount: number;
  weeklyActionsCount: number;
}
