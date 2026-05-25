import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { writeAuditEvent } from "../services/audit-log.service.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { AuditEventNames, AgentRun, Recommendation, ProposedAction } from "../domain/types.js";

const router = Router();

export const AGENT_CATALOG = [
  {
    agentId: "product_intelligence_agent",
    name: "Product Intelligence Agent",
    description: "Scans your product catalog to identify metadata completeness warnings and proposes taxonomy cleanup drafts.",
    category: "Catalog Optimization",
    riskLevel: "Low",
    executionMode: "APPROVAL_REQUIRED" as const,
    supportedCapabilities: ["Taxonomy validation", "Missing metadata detection", "Metadata cleanup drafts"],
    requiredPermissions: ["read_products"],
    canRecommend: true,
    canDraft: true,
    canProposeActions: true,
    canExecuteActions: false,
    enabledByDefault: true,
    version: "1.0.0"
  },
  {
    agentId: "seo_aeo_agent",
    name: "SEO / AEO Agent",
    description: "Generates semantic recommendations for search engine optimization and AI answer engine readiness.",
    category: "SEO & Discovery",
    riskLevel: "Low",
    executionMode: "NOT_EXECUTABLE" as const,
    supportedCapabilities: ["SEO optimization", "Semantic analysis", "AI discovery readiness"],
    requiredPermissions: ["read_products"],
    canRecommend: true,
    canDraft: true,
    canProposeActions: true,
    canExecuteActions: false,
    enabledByDefault: true,
    version: "1.0.0"
  },
  {
    agentId: "content_agent",
    name: "Content Agent",
    description: "Optimizes titles, tags, and product categorization as draft updates for merchant approval.",
    category: "Content Creation",
    riskLevel: "Low",
    executionMode: "APPROVAL_REQUIRED" as const,
    supportedCapabilities: ["Title optimization", "Tag suggestions", "Promotional copy suggestions"],
    requiredPermissions: ["read_products"],
    canRecommend: true,
    canDraft: true,
    canProposeActions: true,
    canExecuteActions: false,
    enabledByDefault: true,
    version: "1.0.0"
  },
  {
    agentId: "design_review_agent",
    name: "Design Review Agent",
    description: "Heuristically reviews storefront layout cues and trust signals. Recommendation-only, no theme access.",
    category: "UX & Storefront Design",
    riskLevel: "Low/Medium",
    executionMode: "NOT_EXECUTABLE" as const,
    supportedCapabilities: ["Trust signal review", "Storefront layout heuristic check"],
    requiredPermissions: [],
    canRecommend: true,
    canDraft: false,
    canProposeActions: false,
    canExecuteActions: false,
    enabledByDefault: true,
    version: "1.0.0"
  }
];

router.get("/agents/catalog", async (req: any, res: any) => {
  res.json(AGENT_CATALOG);
});

router.post("/agent-runs", async (req: any, res: any) => {
  try {
    const { organizationId, shop } = req.query;
    const { agentId, mode, scope } = req.body;

    const repos = getRepositories();
    let resolvedOrgId: string | undefined = undefined;
    let storeConnectionId: string | undefined = undefined;
    let shopUrl: string = "";

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

      if (organizationId && typeof organizationId === "string") {
        if (storeConnection.organizationId !== organizationId) {
          return res.status(403).json({ ok: false, error: "Access denied. Store does not belong to this organization." });
        }
      }

      resolvedOrgId = storeConnection.organizationId;
      storeConnectionId = storeConnection.id;
      shopUrl = storeConnection.storeUrl;
    } else {
      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
      }
      resolvedOrgId = organizationId;
      const connections = await repos.stores.getStoreConnectionsByOrganizationId(resolvedOrgId);
      if (connections.length > 0) {
        storeConnectionId = connections[0].id;
        shopUrl = connections[0].storeUrl;
      }
    }

    if (!resolvedOrgId || !storeConnectionId) {
      return res.status(400).json({ ok: false, error: "Missing tenant or store connection context." });
    }

    const agent = AGENT_CATALOG.find(a => a.agentId === agentId);
    if (!agent) {
      return res.status(400).json({ ok: false, error: `Invalid agentId: ${agentId}` });
    }

    if (mode !== "RECOMMEND" && mode !== "DRAFT") {
      return res.status(400).json({ ok: false, error: "Invalid mode. Must be 'RECOMMEND' or 'DRAFT'." });
    }

    if (!scope || !scope.type || !["SHOP", "PRODUCT", "COLLECTION", "PAGE", "TRAFFIC_PERIOD"].includes(scope.type)) {
      return res.status(400).json({ ok: false, error: "Invalid or missing scope configuration." });
    }

    // Sanitization: clean raw properties from scope object
    const sanitizedScope = {
      type: scope.type as 'SHOP' | 'PRODUCT' | 'COLLECTION' | 'PAGE' | 'TRAFFIC_PERIOD',
      resourceId: typeof scope.resourceId === "string" ? scope.resourceId.substring(0, 100) : undefined,
      filters: scope.filters && typeof scope.filters === "object" ? {} : undefined
    };

    const runId = `RUN-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const auditCorrelationId = `CORR-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const initialRun: Omit<AgentRun, "recommendationCount" | "proposedActionCount"> = {
      id: runId,
      organizationId: resolvedOrgId,
      storeConnectionId: storeConnectionId,
      agentId: agent.agentId,
      agentVersion: agent.version,
      status: "RUNNING",
      scope: sanitizedScope,
      mode: mode,
      requestedBy: "Shop Owner",
      startedAt: now,
      summary: `Started dynamic diagnostic workspace run for ${agent.name}.`,
      auditCorrelationId
    };

    const savedRun = await repos.agentRuns.createAgentRun(initialRun);

    await writeAuditEvent({
      organizationId: resolvedOrgId,
      storeConnectionId: storeConnectionId,
      initiator: "Shop Owner",
      event: AuditEventNames.AGENT_RUN_STARTED,
      description: `Launched ${agent.name} diagnostic run session (#${runId})`,
      decision: "allowed",
      metadata: {
        agentId: agent.agentId,
        agentRunId: runId,
        status: "RUNNING",
        decision: "allowed"
      }
    });

    // Fetch store products for safe, deterministic analysis
    const products = await repos.products.listProductSnapshotsByShop(shopUrl);
    const targetProducts = products.slice(0, 3); // Analyze top 3 products deterministically

    let recommendationCount = 0;
    let proposedActionCount = 0;

    if (agentId === "product_intelligence_agent") {
      for (const p of targetProducts) {
        const isMissingMeta = !p.vendor || !p.productType || p.tags.length === 0;
        if (isMissingMeta) {
          recommendationCount++;
          const recId = `REC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const rec: Recommendation = {
            id: recId,
            organizationId: resolvedOrgId,
            storeConnectionId,
            agentRunId: runId,
            agentId,
            resourceType: "PRODUCT",
            resourceId: p.shopifyProductId,
            recommendationType: "taxonomy_warning",
            title: `Taxonomy Warning: ${p.title}`,
            summary: "Product catalog entry is missing descriptive vendor, type, or tag metadata attributes.",
            reasoningSummary: "Standardized categorizations enable correct semantic indexing and granular filtering within merchant portals.",
            impactLevel: "MEDIUM",
            riskLevel: "LOW",
            confidence: 0.95,
            status: "OPEN",
            createdAt: now,
            updatedAt: now
          };
          await repos.recommendations.createRecommendation(rec);
          await writeAuditEvent({
            organizationId: resolvedOrgId,
            storeConnectionId,
            initiator: agent.name,
            event: AuditEventNames.RECOMMENDATION_CREATED,
            description: `Generated taxonomy warning recommendation for product '${p.title}'`,
            decision: "allowed",
            metadata: {
              agentId,
              agentRunId: runId,
              recommendationId: recId,
              status: "OPEN",
              decision: "allowed"
            }
          });

          if (mode === "DRAFT") {
            proposedActionCount++;
            const actId = `ACT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const action: ProposedAction = {
              id: actId,
              organizationId: resolvedOrgId,
              storeConnectionId,
              agentRunId: runId,
              agentId,
              recommendationId: recId,
              targetType: "PRODUCT",
              targetId: p.shopifyProductId,
              title: `Clean up tags and vendor for ${p.title}`,
              description: "Appends compliance tags and sets default taxonomy settings to resolve store alerts.",
              actionType: "taxonomy_cleanup",
              riskLevel: "LOW",
              executionMode: "APPROVAL_REQUIRED",
              changes: {
                vendor: p.vendor || "Standardized Vendor",
                productType: p.productType || "Standardized Type",
                tags: Array.from(new Set([...p.tags, "compliance-fixed"]))
              },
              status: "DRAFT",
              createdAt: now,
              updatedAt: now
            };
            await repos.proposedActions.createProposedAction(action);
            await writeAuditEvent({
              organizationId: resolvedOrgId,
              storeConnectionId,
              initiator: agent.name,
              event: AuditEventNames.PROPOSED_ACTION_CREATED,
              description: `Drafted taxonomy cleanup proposed action for product '${p.title}'`,
              decision: "allowed",
              metadata: {
                agentId,
                agentRunId: runId,
                recommendationId: recId,
                proposedActionId: actId,
                status: "DRAFT",
                actionType: "taxonomy_cleanup",
                decision: "allowed"
              }
            });
          }
        }
      }
    } else if (agentId === "seo_aeo_agent") {
      for (const p of targetProducts) {
        if (p.title.length < 15) {
          recommendationCount++;
          const recId = `REC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const rec: Recommendation = {
            id: recId,
            organizationId: resolvedOrgId,
            storeConnectionId,
            agentRunId: runId,
            agentId,
            resourceType: "PRODUCT",
            resourceId: p.shopifyProductId,
            recommendationType: "seo_warning",
            title: `Short Title Optimization: ${p.title}`,
            summary: "Product title length is under 15 characters, hurting organic search performance.",
            reasoningSummary: "Highly descriptive titles improve visibility in semantic discovery systems and AI answer generators.",
            impactLevel: "HIGH",
            riskLevel: "LOW",
            confidence: 0.88,
            status: "OPEN",
            createdAt: now,
            updatedAt: now
          };
          await repos.recommendations.createRecommendation(rec);
          await writeAuditEvent({
            organizationId: resolvedOrgId,
            storeConnectionId,
            initiator: agent.name,
            event: AuditEventNames.RECOMMENDATION_CREATED,
            description: `Generated SEO title optimization warning for product '${p.title}'`,
            decision: "allowed",
            metadata: {
              agentId,
              agentRunId: runId,
              recommendationId: recId,
              status: "OPEN",
              decision: "allowed"
            }
          });

          if (mode === "DRAFT") {
            proposedActionCount++;
            const actId = `ACT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const action: ProposedAction = {
              id: actId,
              organizationId: resolvedOrgId,
              storeConnectionId,
              agentRunId: runId,
              agentId,
              recommendationId: recId,
              targetType: "PRODUCT",
              targetId: p.shopifyProductId,
              title: `Draft SEO Optimization: ${p.title}`,
              description: "Suggests descriptive keyword enhancements. SEO agent actions are strictly informational.",
              actionType: "seo_draft",
              riskLevel: "LOW",
              executionMode: "NOT_EXECUTABLE",
              changes: {},
              status: "BLOCKED",
              createdAt: now,
              updatedAt: now
            };
            await repos.proposedActions.createProposedAction(action);
            await writeAuditEvent({
              organizationId: resolvedOrgId,
              storeConnectionId,
              initiator: agent.name,
              event: AuditEventNames.PROPOSED_ACTION_CREATED,
              description: `Drafted non-executable SEO proposed action for product '${p.title}'`,
              decision: "allowed",
              metadata: {
                agentId,
                agentRunId: runId,
                recommendationId: recId,
                proposedActionId: actId,
                status: "BLOCKED",
                actionType: "seo_draft",
                decision: "allowed"
              }
            });
          }
        }
      }
    } else if (agentId === "content_agent") {
      for (const p of targetProducts) {
        recommendationCount++;
        const recId = `REC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const rec: Recommendation = {
          id: recId,
          organizationId: resolvedOrgId,
          storeConnectionId,
          agentRunId: runId,
          agentId,
          resourceType: "PRODUCT",
          resourceId: p.shopifyProductId,
          recommendationType: "content_suggestion",
          title: `Enhance Marketing Title for ${p.title}`,
          summary: "Title could benefit from premium keyword hooks and category tagging.",
          reasoningSummary: "Product positioning is improved when descriptive qualifiers are integrated dynamically into visible metadata.",
          impactLevel: "MEDIUM",
          riskLevel: "LOW",
          confidence: 0.9,
          status: "OPEN",
          createdAt: now,
          updatedAt: now
        };
        await repos.recommendations.createRecommendation(rec);
        await writeAuditEvent({
          organizationId: resolvedOrgId,
          storeConnectionId,
          initiator: agent.name,
          event: AuditEventNames.RECOMMENDATION_CREATED,
          description: `Generated marketing copy suggestions for product '${p.title}'`,
          decision: "allowed",
          metadata: {
            agentId,
            agentRunId: runId,
            recommendationId: recId,
            status: "OPEN",
            decision: "allowed"
          }
        });

        if (mode === "DRAFT") {
          proposedActionCount++;
          const actId = `ACT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const action: ProposedAction = {
            id: actId,
            organizationId: resolvedOrgId,
            storeConnectionId,
            agentRunId: runId,
            agentId,
            recommendationId: recId,
            targetType: "PRODUCT",
            targetId: p.shopifyProductId,
            title: `Enhance title & tags for ${p.title}`,
            description: "Updates product title suffix and adds promotional categorization tags.",
            actionType: "content_optimization",
            riskLevel: "LOW",
            executionMode: "APPROVAL_REQUIRED",
            changes: {
              title: `${p.title} - Premium Edition`,
              tags: Array.from(new Set([...p.tags, "premium"]))
            },
            status: "DRAFT",
            createdAt: now,
            updatedAt: now
          };
          await repos.proposedActions.createProposedAction(action);
          await writeAuditEvent({
            organizationId: resolvedOrgId,
            storeConnectionId,
            initiator: agent.name,
            event: AuditEventNames.PROPOSED_ACTION_CREATED,
            description: `Drafted marketing enhancement proposed action for product '${p.title}'`,
            decision: "allowed",
            metadata: {
              agentId,
              agentRunId: runId,
              recommendationId: recId,
              proposedActionId: actId,
              status: "DRAFT",
              actionType: "content_optimization",
              decision: "allowed"
            }
          });
        }
      }
    } else if (agentId === "design_review_agent") {
      // Recommendation-only based on heuristic check, zero theme read/writes
      recommendationCount++;
      const recId = `REC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const rec: Recommendation = {
        id: recId,
        organizationId: resolvedOrgId,
        storeConnectionId,
        agentRunId: runId,
        agentId,
        resourceType: "STOREFRONT",
        resourceId: "main-layout",
        recommendationType: "design_warning",
        title: "Trust Signals Review",
        summary: "Product landing layout displays no visible return guidelines or buyer trust signals.",
        reasoningSummary: "Clear accessibility disclosures build direct customer confidence and optimize storefront conversion rates.",
        impactLevel: "HIGH",
        riskLevel: "LOW",
        confidence: 0.85,
        status: "OPEN",
        createdAt: now,
        updatedAt: now
      };
      await repos.recommendations.createRecommendation(rec);
      await writeAuditEvent({
        organizationId: resolvedOrgId,
        storeConnectionId,
        initiator: agent.name,
        event: AuditEventNames.RECOMMENDATION_CREATED,
        description: "Generated static layout trust signal recommendation for storefront checkout flow",
        decision: "allowed",
        metadata: {
          agentId,
          agentRunId: runId,
          recommendationId: recId,
          status: "OPEN",
          decision: "allowed"
        }
      });
    }

    const updatedRun = await repos.agentRuns.updateAgentRun(runId, {
      status: "COMPLETED",
      finishedAt: new Date().toISOString(),
      summary: `Workspace scan finished successfully. Identified ${recommendationCount} recommendations and ${proposedActionCount} draft proposed actions.`,
      recommendationCount,
      proposedActionCount
    });

    await writeAuditEvent({
      organizationId: resolvedOrgId,
      storeConnectionId,
      initiator: "System",
      event: AuditEventNames.AGENT_RUN_COMPLETED,
      description: `Completed ${agent.name} diagnostic run session (#${runId})`,
      decision: "allowed",
      metadata: {
        agentId: agent.agentId,
        agentRunId: runId,
        status: "COMPLETED",
        decision: "allowed"
      }
    });

    res.json(updatedRun || savedRun);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/agent-runs", async (req: any, res: any) => {
  try {
    const { organizationId, shop, agentId, status } = req.query;

    const repos = getRepositories();
    let resolvedOrgId: string | undefined = undefined;
    let storeConnectionId: string | undefined = undefined;

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

      if (organizationId && typeof organizationId === "string") {
        if (storeConnection.organizationId !== organizationId) {
          return res.status(403).json({ ok: false, error: "Access denied. Store does not belong to this organization." });
        }
      }

      resolvedOrgId = storeConnection.organizationId;
      storeConnectionId = storeConnection.id;
    } else {
      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
      }
      resolvedOrgId = organizationId;
    }

    if (!resolvedOrgId) {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    let runsList = await repos.agentRuns.getAgentRunsByOrganizationId(resolvedOrgId);

    if (storeConnectionId) {
      runsList = runsList.filter(r => r.storeConnectionId === storeConnectionId);
    }
    if (agentId) {
      runsList = runsList.filter(r => r.agentId === agentId);
    }
    if (status) {
      runsList = runsList.filter(r => r.status === status);
    }

    res.json(runsList);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/agent-runs/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { organizationId, shop } = req.query;

    const repos = getRepositories();
    let resolvedOrgId: string | undefined = undefined;
    let storeConnectionId: string | undefined = undefined;

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

      if (organizationId && typeof organizationId === "string") {
        if (storeConnection.organizationId !== organizationId) {
          return res.status(403).json({ ok: false, error: "Access denied. Store does not belong to this organization." });
        }
      }

      resolvedOrgId = storeConnection.organizationId;
      storeConnectionId = storeConnection.id;
    } else {
      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
      }
      resolvedOrgId = organizationId;
    }

    if (!resolvedOrgId) {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    const run = await repos.agentRuns.getAgentRunById(id);
    if (!run) {
      return res.status(404).json({ ok: false, error: "Agent run not found." });
    }

    if (run.organizationId !== resolvedOrgId) {
      return res.status(403).json({ ok: false, error: "Access denied. Agent run does not belong to this organization." });
    }

    if (storeConnectionId && run.storeConnectionId !== storeConnectionId) {
      return res.status(400).json({ ok: false, error: "Store connection context mismatch." });
    }

    res.json(run);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
