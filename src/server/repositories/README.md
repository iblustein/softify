# Softify Repository Layer & Database Preparation (Phase 4)

This directory houses the persistence architecture of the Softify AI Agent platform. During this sandboxed prototype stage, all operations run on an in-memory data adapter to enable fluid prototyping without external DBMS or infrastructure dependencies.

## Architecture & Contract Pattern

To guarantee long-term maintainability and engine-agnostic persistence, the repository is designed using a **Clean Architecture Repository Pattern**:

1. **Contracts (`/contracts`)**: Structural TypeScript interfaces specifying the exact input/output contracts for every database operation (e.g., `UserRepository`, `StoreRepository`).
2. **In-Memory Namespace (`/in-memory`)**: An lightweight implementation of the contracts that acts as a local mock database.
3. **Thin Compatibility Wrappers**: The root repository files (e.g., `user.repository.ts`) acts as thin, direct re-export wrappers of the `/in-memory` implementations. This maintains absolute backward compatibility for existing services, orchestrators, and routing endpoints.
4. **Provider Gateway (`repository-provider.ts`)**: Exposes a unified `getRepositories()` entry point that maps returning objects directly to the contract interfaces.

---

## Production Persistence Roadmap

### Target DBMS & ORM
In production, this layer will transition to:
* **Database**: PostgreSQL (for robust relational consistency, transactions, and scaling properties).
* **ORM**: Prisma or Drizzle ORM to compile migrations and provide typed database query mapping.

### Strategic Transition Tasks (TODO Checklist)

#### 1. Tenant Isolation (Multi-Tenant Security)
* **Goal**: Prevent data leaks between Shopify merchants.
* **Implementation**: Enforce organization-level scoping.
  * *Logical Scoping*: Update DB queries to implicitly append `WHERE organizationId = x`.
  * *Row-Level Security (RLS)*: Configure PostgreSQL RLS policies ensuring database sessions cannot access rows belonging to other tenant organizations.

#### 2. Shopify Token Encryption
* **Goal**: Prevent unauthorized API access if database backups or tables are leaked.
* **Implementation**: Secure Shopify API credentials.
  * Encrypt access tokens using AES-256-GCM prior to database insertion.
  * Manage secret master keys in a Cloud Key Management Service (KMS) or secure environment vault.

#### 3. Audit Log Immutability
* **Goal**: Provide tamper-proof record logs of agent actions.
* **Implementation**: Secure historical trace data.
  * Set database tables as append-only (no UPDATE or DELETE privileges for the application database role).
  * Migrate high-volume audit logs to time-series optimized systems (e.g., TimescaleDB, ElasticSearch, AWS DynamoDB).

#### 4. Approval Workflow Consistency
* **Goal**: Guarantee human-in-the-loop actions cannot bypass verification gates.
* **Implementation**: Consistent transactional state loops.
  * Wrap approval creation, transition, and execution under transactional scopes (`transaction()` or `$transaction`).
  * Enforce role-based access checks (RBAC) to ensure only verified merchant administrators can sign off on queued modifications.
