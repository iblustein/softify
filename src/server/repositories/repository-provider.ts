import { UserRepository } from "./contracts/user.repository.contract.js";
import { OrganizationRepository } from "./contracts/organization.repository.contract.js";
import { StoreRepository } from "./contracts/store.repository.contract.js";
import { AgentInstallationRepository } from "./contracts/agent-installation.repository.contract.js";
import { ApprovalRepository } from "./contracts/approval.repository.contract.js";
import { AuditRepository } from "./contracts/audit.repository.contract.js";
import { ConversationRepository } from "./contracts/conversation.repository.contract.js";

import * as inMemoryUsers from "./in-memory/in-memory-user.repository.js";
import * as inMemoryOrganizations from "./in-memory/in-memory-organization.repository.js";
import * as inMemoryStores from "./in-memory/in-memory-store.repository.js";
import * as inMemoryAgentInstallations from "./in-memory/in-memory-agent-installation.repository.js";
import * as inMemoryApprovals from "./in-memory/in-memory-approval.repository.js";
import * as inMemoryAudits from "./in-memory/in-memory-audit.repository.js";
import * as inMemoryConversations from "./in-memory/in-memory-conversation.repository.js";

export interface Repositories {
  users: UserRepository;
  organizations: OrganizationRepository;
  stores: StoreRepository;
  agentInstallations: AgentInstallationRepository;
  approvals: ApprovalRepository;
  audit: AuditRepository;
  conversations: ConversationRepository;
}

/**
 * Retrieve the active persistence repository suite.
 * Currently, returns the sandboxed in-memory mocks.
 */
export function getRepositories(): Repositories {
  // TODO: In production, dynamically resolve persistence strategies:
  // - Prisma/PostgreSQL or Drizzle environment-based repository selection
  // - Test environment repository mocking / mock repository injection
  // - Transaction handling and query context injection (e.g. passing Prisma transactions through repositories)
  // - Tenant-aware query enforcement (automatically appending organizationId parameters to queries)
  
  return {
    users: inMemoryUsers,
    organizations: inMemoryOrganizations,
    stores: inMemoryStores,
    agentInstallations: inMemoryAgentInstallations,
    approvals: inMemoryApprovals,
    audit: inMemoryAudits,
    conversations: inMemoryConversations
  };
}
