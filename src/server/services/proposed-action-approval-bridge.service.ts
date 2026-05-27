import { getRepositories } from "../repositories/repository-provider.js";
import { writeAuditEvent } from "./audit-log.service.js";
import { AuditEventNames, ProposedAction, AllowedProductProposalField } from "../domain/types.js";
import { getAllowedFieldsForAgent } from "./agent-policy.service.js";

export interface RequestApprovalBridgeInput {
  proposedActionId: string;
  organizationId: string;
  storeConnectionId: string;
}

/**
 * Proposed Action Approval Bridge Service
 * 
 * Bridges a safe Workspace ProposedAction into the merchant approvals queue
 * by creating a pending merchant approval request after validating all tenant, 
 * store, agent, and schema field rules.
 */
export async function requestProposedActionApprovalBridge(input: RequestApprovalBridgeInput): Promise<ProposedAction> {
  const { proposedActionId: id, organizationId: resolvedOrgId, storeConnectionId } = input;
  const repos = getRepositories();

  const act = await repos.proposedActions.getProposedActionById(id);
  if (!act) {
    throw new Error("Proposed action not found.");
  }

  if (act.organizationId !== resolvedOrgId) {
    throw new Error("Access denied. Proposed action does not belong to this organization.");
  }

  if (act.storeConnectionId !== storeConnectionId) {
    throw new Error("Store connection context mismatch.");
  }

  if (act.status !== "DRAFT" && act.status !== "APPROVAL_ELIGIBLE") {
    throw new Error(`Proposed action is not in draft or approval eligible status. Current status: ${act.status}`);
  }

  if (act.executionMode !== "APPROVAL_REQUIRED") {
    throw new Error(`Proposed action is not eligible for execution/approval. Current mode: ${act.executionMode}`);
  }

  // Retrieve active installation context
  const storeConnection = await repos.stores.getStoreConnectionById(storeConnectionId);
  let agentInstallationId = "inst-mock";
  if (storeConnection) {
    const installation = await repos.agentInstallations.getByShopAndAgent(storeConnection.storeUrl, act.agentId);
    if (installation) {
      agentInstallationId = installation.id;
    }
  }

  // Strict sanitization payload bridging (allowed taxonomy fields only)
  const allowedFieldsList = getAllowedFieldsForAgent(act.agentId);
  if (allowedFieldsList.length === 0) {
    throw new Error("Agent has no proposal permissions.");
  }

  const incomingFields = act.changes || {};
  const sanitizedPayload: {
    title?: string;
    vendor?: string;
    productType?: string;
    status?: string;
    tags?: string[];
  } = {};

  if (allowedFieldsList.includes("title") && typeof incomingFields.title === "string") sanitizedPayload.title = incomingFields.title;
  if (allowedFieldsList.includes("vendor") && typeof incomingFields.vendor === "string") sanitizedPayload.vendor = incomingFields.vendor;
  if (allowedFieldsList.includes("productType") && typeof incomingFields.productType === "string") sanitizedPayload.productType = incomingFields.productType;
  if (allowedFieldsList.includes("status") && typeof incomingFields.status === "string") sanitizedPayload.status = incomingFields.status;
  if (allowedFieldsList.includes("tags") && Array.isArray(incomingFields.tags)) {
    sanitizedPayload.tags = incomingFields.tags.map((t: any) => String(t));
  }

  // Block if no allowed changes are supplied or if any forbidden properties are present
  const payloadKeys = Object.keys(incomingFields);
  const hasForbidden = payloadKeys.some(k => !allowedFieldsList.includes(k as any));
  if (hasForbidden || Object.keys(sanitizedPayload).length === 0) {
    throw new Error("Action contains forbidden fields or empty updates.");
  }

  const approvalId = `APV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Invoke the existing approved createApprovalRequest model
  await repos.approvals.createApprovalRequest({
    id: approvalId,
    organizationId: resolvedOrgId,
    storeConnectionId: storeConnectionId,
    agentInstallationId,
    agentId: act.agentId,
    toolName: "catalog.products.propose_update",
    requestedBy: act.agentId,
    status: "PENDING",
    riskLevel: act.riskLevel === "HIGH" ? "High" : act.riskLevel === "MEDIUM" ? "Medium" : "Low",
    targetType: "PRODUCT_PROPOSAL",
    targetId: act.targetId,
    proposedChangesSummary: act.title,
    diffSummary: Object.keys(sanitizedPayload).map(k => `${k}: proposed change`).join(", ") || "Taxonomy optimization",
    sanitizedPayload,
    allowedFields: allowedFieldsList
  });

  const updated = await repos.proposedActions.updateProposedAction(id, {
    status: "APPROVAL_REQUESTED",
    approvalRequestId: approvalId
  });

  // Write audit logs
  await writeAuditEvent({
    organizationId: resolvedOrgId,
    storeConnectionId,
    initiator: "Shop Owner",
    event: AuditEventNames.PROPOSED_ACTION_APPROVAL_REQUESTED,
    description: `Requested merchant approval for proposed action: '${act.title}' (#${id})`,
    decision: "allowed",
    metadata: {
      agentId: act.agentId,
      agentRunId: act.agentRunId,
      recommendationId: act.recommendationId,
      proposedActionId: id,
      approvalId: approvalId,
      status: "APPROVAL_REQUESTED",
      decision: "allowed"
    }
  });

  await writeAuditEvent({
    organizationId: resolvedOrgId,
    storeConnectionId,
    agentInstallationId,
    agentId: act.agentId,
    toolName: "catalog.products.propose_update",
    initiator: act.agentId,
    event: AuditEventNames.APPROVAL_CREATED,
    description: `Created approval request '${approvalId}' for tool 'catalog.products.propose_update' via workspace bridge`,
    decision: "blocked",
    reason: "requires_merchant_approval",
    metadata: {
      organizationId: resolvedOrgId,
      storeConnectionId,
      agentInstallationId,
      agentId: act.agentId,
      toolName: "catalog.products.propose_update",
      approvalId,
      decision: "blocked",
      reason: "requires_merchant_approval"
    }
  });

  return updated || act;
}
