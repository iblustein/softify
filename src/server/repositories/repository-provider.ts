import { UserRepository } from "./contracts/user.repository.contract.js";
import { OrganizationRepository } from "./contracts/organization.repository.contract.js";
import { StoreRepository } from "./contracts/store.repository.contract.js";
import { AgentInstallationRepository } from "./contracts/agent-installation.repository.contract.js";
import { ApprovalRepository } from "./contracts/approval.repository.contract.js";
import { AuditRepository } from "./contracts/audit.repository.contract.js";
import { ConversationRepository } from "./contracts/conversation.repository.contract.js";
import { ProductRepository } from "./contracts/product.repository.contract.js";

import * as inMemoryUsers from "./in-memory/in-memory-user.repository.js";
import * as inMemoryOrganizations from "./in-memory/in-memory-organization.repository.js";
import * as inMemoryStores from "./in-memory/in-memory-store.repository.js";
import * as inMemoryAgentInstallations from "./in-memory/in-memory-agent-installation.repository.js";
import * as inMemoryApprovals from "./in-memory/in-memory-approval.repository.js";
import * as inMemoryAudits from "./in-memory/in-memory-audit.repository.js";
import * as inMemoryConversations from "./in-memory/in-memory-conversation.repository.js";
import * as inMemoryProducts from "./in-memory/in-memory-product.repository.js";

import { isFirestoreConfigured, getFirestoreConfig } from "../config/firestore.config.js";
import * as firestoreStores from "./firestore/firestore-store.repository.js";
import * as firestoreProducts from "./firestore/firestore-product.repository.js";
import * as firestoreAgentInstallations from "./firestore/firestore-agent-installation.repository.js";

export interface Repositories {
  users: UserRepository;
  organizations: OrganizationRepository;
  stores: StoreRepository;
  agentInstallations: AgentInstallationRepository;
  approvals: ApprovalRepository;
  audit: AuditRepository;
  conversations: ConversationRepository;
  products: ProductRepository;
}

/**
 * Retrieve the active persistence repository suite.
 * Dynamically resolves Firestore strategy for Shopify store connection details if configured,
 * falling back safely to sandboxed in-memory mocks for all other schemas.
 */
export function getRepositories(): Repositories {
  // TODO: Future milestones:
  // 1. tenant-aware filtering: automatically inject tenant filters into other repositories
  // 2. transaction support: implement cross-repository transactions using Firestore batch/transaction runs
  // 3. full repository backend migration: transition remaining in-memory repositories to durable database engines
  // 4. Firestore security rules / IAM enforcement: configure tight IAM controls for Cloud Run runtime service account
  // 5. Cloud KMS token encryption: migrate from AES-256-GCM TokenCryptoService to GCP Cloud Key Management Service
  
  const isConfigured = isFirestoreConfigured();
  if (isConfigured) {
    // Validate config at startup/repository provider initialization
    getFirestoreConfig();
  }
  const storesRepo = isConfigured ? firestoreStores : inMemoryStores;
  const productsRepo = isConfigured ? firestoreProducts : inMemoryProducts;
  const agentInstallationsRepo = isConfigured ? firestoreAgentInstallations : inMemoryAgentInstallations;

  return {
    users: inMemoryUsers,
    organizations: inMemoryOrganizations,
    stores: storesRepo,
    agentInstallations: agentInstallationsRepo,
    approvals: inMemoryApprovals,
    audit: inMemoryAudits,
    conversations: inMemoryConversations,
    products: productsRepo
  };
}
