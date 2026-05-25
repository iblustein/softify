import { getRepositories } from "../repositories/repository-provider.js";
import { updateProductAllowedFields } from "./shopify-admin-client.service.js";
import { syncProductsForShop } from "./shopify-product-sync.service.js";
import { writeAuditEvent } from "./audit-log.service.js";
import { ApprovalRequest, AuditEventNames } from "../domain/types.js";

export class ApprovedProductMutationExecutorError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ApprovedProductMutationExecutorError";
  }
}

export async function executeApprovedProductMutation(
  approvalId: string,
  organizationId: string,
  performer: string
): Promise<ApprovalRequest> {
  const repos = getRepositories();

  // 1. Initial lookup and validation
  const approval = await repos.approvals.getApprovalById(approvalId);
  if (!approval) {
    throw new ApprovedProductMutationExecutorError("APPROVAL_NOT_FOUND", "Approval request not found.");
  }

  // Strict tenant scoping
  if (approval.organizationId !== organizationId) {
    throw new ApprovedProductMutationExecutorError(
      "TENANT_ISOLATION_VIOLATION",
      "Access denied. Approval request does not belong to this organization."
    );
  }

  // Lifecycle check
  if (approval.status !== "APPROVED") {
    throw new ApprovedProductMutationExecutorError(
      "INVALID_APPROVAL_STATE",
      `Cannot execute approval: expected APPROVED state, got ${approval.status}.`
    );
  }

  if (approval.toolName !== "catalog.products.propose_update" || approval.targetType !== "PRODUCT_PROPOSAL") {
    throw new ApprovedProductMutationExecutorError(
      "UNSUPPORTED_MUTATION_TOOL",
      `Unsupported tool/target configuration: ${approval.toolName}`
    );
  }

  // Resolve store connection
  const storeConn = await repos.stores.getStoreConnectionById(approval.storeConnectionId);
  if (!storeConn) {
    throw new ApprovedProductMutationExecutorError(
      "STORE_CONNECTION_NOT_FOUND",
      `Store connection '${approval.storeConnectionId}' not found.`
    );
  }

  // Verify connected status and write scope
  const hasWriteScope = storeConn.scopes.includes("write_products");
  if (storeConn.status !== "CONNECTED" || !hasWriteScope) {
    const reason = storeConn.status !== "CONNECTED" ? "store_disconnected" : "missing_write_products_scope";
    
    // Log validation block (degrades to BLOCKED, status kept as APPROVED)
    await writeAuditEvent({
      organizationId,
      storeConnectionId: approval.storeConnectionId,
      agentInstallationId: approval.agentInstallationId,
      agentId: approval.agentId,
      toolName: approval.toolName,
      initiator: performer,
      event: AuditEventNames.APPROVAL_EXECUTION_BLOCKED,
      description: `Execution blocked for approval '${approvalId}': ${reason}`,
      decision: "blocked",
      reason,
      metadata: {
        approvalId,
        reason,
        decision: "blocked"
      }
    });

    throw new ApprovedProductMutationExecutorError(
      "EXECUTION_BLOCKED",
      `Execution blocked: ${reason === "store_disconnected" ? "Store is disconnected." : "Store connection is missing write_products scope."}`
    );
  }

  // Audit execution started event
  await writeAuditEvent({
    organizationId,
    storeConnectionId: approval.storeConnectionId,
    agentInstallationId: approval.agentInstallationId,
    agentId: approval.agentId,
    toolName: approval.toolName,
    initiator: performer,
    event: AuditEventNames.APPROVAL_EXECUTION_STARTED,
    description: `Initiated execution for approval '${approvalId}'`,
    decision: "allowed",
    metadata: {
      approvalId,
      decision: "allowed"
    }
  });

  // 2. Perform Atomic Claim transaction
  let claimedApproval: ApprovalRequest;
  try {
    claimedApproval = await repos.approvals.claimApprovalForExecution(approvalId, organizationId);
  } catch (err: any) {
    throw new ApprovedProductMutationExecutorError(
      "CONCURRENCY_CONFLICT",
      `Failed to claim approval for execution: ${err.message}`
    );
  }

  // 3. String/Tag Validation & Sanitization
  const fields = claimedApproval.sanitizedPayload || {};
  const allowedKeys = ["title", "vendor", "productType", "status", "tags"];
  const incomingKeys = Object.keys(fields);
  
  if (incomingKeys.length === 0) {
    await markAsFailed(approvalId, organizationId, performer, "No fields provided in payload.", claimedApproval);
    throw new ApprovedProductMutationExecutorError("FIELD_VALIDATION_FAILED", "No fields provided in proposal payload.");
  }
  
  const hasUnsupported = incomingKeys.some(k => !allowedKeys.includes(k));
  if (hasUnsupported) {
    await markAsFailed(approvalId, organizationId, performer, "Unsupported fields in payload.", claimedApproval);
    throw new ApprovedProductMutationExecutorError("FIELD_VALIDATION_FAILED", "Unsupported fields detected in proposal payload.");
  }

  const sanitizedFields: any = {};
  try {
    if (fields.title !== undefined) {
      if (typeof fields.title !== "string") throw new Error("Title must be a string.");
      const val = fields.title.trim();
      if (val.length === 0) throw new Error("Title cannot be empty.");
      if (val.length > 255) throw new Error("Title exceeds max length of 255 characters.");
      sanitizedFields.title = val;
    }

    if (fields.vendor !== undefined) {
      if (typeof fields.vendor !== "string") throw new Error("Vendor must be a string.");
      const val = fields.vendor.trim();
      if (val.length > 255) throw new Error("Vendor exceeds max length of 255 characters.");
      sanitizedFields.vendor = val;
    }

    if (fields.productType !== undefined) {
      if (typeof fields.productType !== "string") throw new Error("ProductType must be a string.");
      const val = fields.productType.trim();
      if (val.length > 255) throw new Error("ProductType exceeds max length of 255 characters.");
      sanitizedFields.productType = val;
    }

    if (fields.status !== undefined) {
      if (typeof fields.status !== "string") throw new Error("Status must be a string.");
      const val = fields.status.trim().toUpperCase();
      if (!["ACTIVE", "ARCHIVED", "DRAFT"].includes(val)) {
        throw new Error(`Invalid status value: '${fields.status}'. Expected: ACTIVE, ARCHIVED, DRAFT.`);
      }
      sanitizedFields.status = val;
    }

    if (fields.tags !== undefined) {
      if (!Array.isArray(fields.tags)) throw new Error("Tags must be an array.");
      const normalizedTags = Array.from(
        new Set(
          fields.tags
            .map(t => String(t).trim().toLowerCase())
            .filter(t => t.length > 0)
        )
      );
      if (normalizedTags.length > 50) {
        throw new Error("Tags count exceeds maximum limit of 50.");
      }
      for (const tag of normalizedTags) {
        if (tag.length > 30) {
          throw new Error(`Tag '${tag}' exceeds maximum tag length of 30 characters.`);
        }
      }
      sanitizedFields.tags = normalizedTags;
    }
  } catch (valErr: any) {
    await markAsFailed(approvalId, organizationId, performer, `Field validation error: ${valErr.message}`, claimedApproval);
    throw new ApprovedProductMutationExecutorError("FIELD_VALIDATION_FAILED", valErr.message);
  }

  // 4. Dispatch GraphQL update product mutation via Shopify Client
  try {
    const result = await updateProductAllowedFields({
      organizationId,
      storeConnectionId: claimedApproval.storeConnectionId,
      productId: claimedApproval.targetId,
      fields: sanitizedFields
    });

    const now = new Date().toISOString();

    // Mark as APPLIED on success
    const finalApproval = await repos.approvals.updateApprovalRequest(approvalId, {
      status: "APPLIED",
      executedAt: now,
      executedBy: performer
    });

    // Audit success
    await writeAuditEvent({
      organizationId,
      storeConnectionId: claimedApproval.storeConnectionId,
      agentInstallationId: claimedApproval.agentInstallationId,
      agentId: claimedApproval.agentId,
      toolName: claimedApproval.toolName,
      initiator: performer,
      event: AuditEventNames.APPROVAL_APPLIED,
      description: `Successfully executed product catalog updates for approval '${approvalId}'`,
      decision: "completed",
      metadata: {
        approvalId,
        productId: result.productId,
        shopifyUpdatedAt: result.shopifyUpdatedAt,
        decision: "completed"
      }
    });

    // Trigger async read-based refresh sync only (never manually patch database snapshots)
    try {
      await syncProductsForShop(storeConn.storeUrl, 50);
    } catch (syncErr: any) {
      console.warn(`[EXECUTOR] Sync refresh failed post-execution: ${syncErr.message}`);
    }

    return finalApproval || claimedApproval;
  } catch (err: any) {
    // Audit and transition to FAILED for transient / GraphQL API errors
    const errorMessage = err.message || "Unknown error during Shopify execution.";
    const sanitizedError = errorMessage.replace(/X-Shopify-Access-Token:[^ \t\r\n]+/gi, "[REDACTED_HEADER]");
    
    await markAsFailed(approvalId, organizationId, performer, sanitizedError, claimedApproval);
    throw new ApprovedProductMutationExecutorError("SHOPIFY_API_EXECUTION_FAILED", sanitizedError);
  }
}

async function markAsFailed(
  approvalId: string,
  organizationId: string,
  performer: string,
  reason: string,
  claimed: ApprovalRequest
): Promise<void> {
  try {
    const repos = getRepositories();
    const now = new Date().toISOString();

    await repos.approvals.updateApprovalRequest(approvalId, {
      status: "FAILED",
      executedAt: now,
      executedBy: performer,
      failureReason: reason
    });

    await writeAuditEvent({
      organizationId,
      storeConnectionId: claimed.storeConnectionId,
      agentInstallationId: claimed.agentInstallationId,
      agentId: claimed.agentId,
      toolName: claimed.toolName,
      initiator: performer,
      event: AuditEventNames.APPROVAL_FAILED,
      description: `Execution failed for approval '${approvalId}': ${reason}`,
      decision: "failed",
      reason: "execution_error",
      metadata: {
        approvalId,
        failureReason: reason,
        decision: "failed"
      }
    });
  } catch (err: any) {
    console.error(`[EXECUTOR] Error marking status as FAILED: ${err.message}`);
  }
}
