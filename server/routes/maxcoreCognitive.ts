import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { logger } from "../logger.js";
import { requireAuthOnly } from "../middleware/auth.js";
import { MaxCoreAIClient } from "../services/maxcoreClient.js";
import type {
  CognitiveAgent,
  CognitiveContextPackage,
  CognitiveDepartment,
  CognitiveEntityType,
  CognitiveDocument,
  CognitiveEvent,
  CognitiveGoal,
  CognitiveKnowledgeNode,
  CognitiveMemory,
  CognitiveOrganization,
  CognitiveOrganizationResponse,
  CognitiveProject,
  CognitiveRelationship,
  CognitiveTask,
  CognitiveTool,
  CognitiveUser,
  CognitiveWorkflow,
} from "../../shared/maxcore-cognitive.js";
import {
  COGNITIVE_ENTITY_TYPES,
  CognitiveStoreError,
  cognitiveQuerySchema,
  createCognitiveEntity,
  createCognitiveRelationship,
  createUserProject,
  claimAgentTask,
  completeAgentTask,
  deleteCognitiveEntity,
  deleteCognitiveRelationship,
  failAgentTask,
  getCognitiveCapabilities,
  getCognitiveEntity,
  listCognitiveEntities,
  listCognitiveRelationships,
  searchUserProjects,
  searchCognitiveGraphContext,
  updateCognitiveEntity,
} from "../services/maxcoreCognitiveService.js";

const router = Router();
const entityId = z.string().uuid();
const entityType = z.enum(COGNITIVE_ENTITY_TYPES);
const listQuery = z.object({
  type: entityType.optional(),
  q: z.string().trim().min(2).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
const relationshipQuery = z.object({
  entityId: entityId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const executeTaskBody = z.object({
  retryBlocked: z.boolean().default(false),
}).strict();
const roleOf = (req: Request) => String(req.user?.role ?? "user");
const ownerOf = (req: Request) => req.user!.id;

router.use(requireAuthOnly);

type StoredCognitiveRow = {
  id: string;
  entityType: string;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  tags: string[] | null;
  metadata: unknown;
  payload: unknown;
};

function boundedRecord(value: unknown): Record<string, unknown> {
  const bounded = boundedContextValue(value);
  return bounded && typeof bounded === "object" && !Array.isArray(bounded)
    ? bounded as Record<string, unknown>
    : {};
}

function toCognitiveEntity<T extends object>(
  row: StoredCognitiveRow,
  relationships: CognitiveRelationship[],
): T {
  return {
    ...boundedRecord(row.payload),
    id: row.id,
    type: row.entityType as CognitiveEntityType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ownerId: row.ownerId,
    tags: row.tags ?? [],
    metadata: boundedRecord(row.metadata),
    relationships,
  } as T;
}

function projectStatus(value: unknown): CognitiveProject["status"] {
  return value === "planning" || value === "active" || value === "paused" ||
    value === "completed" || value === "draft"
    ? value
    : "unknown";
}

function sendError(res: Response, error: unknown, operation: string): void {
  if (error instanceof CognitiveStoreError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  // Do not log provider text, SQL text, or request payloads from persistence errors.
  logger.warn({ operation }, "MaxCore cognitive operation failed");
  res.status(503).json({
    error: "MaxCore cognitive storage is unavailable.",
    code: "COGNITIVE_STORAGE_UNAVAILABLE",
  });
}

function boundedContextValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.slice(0, 2_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth >= 4) return "[depth limit]";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => boundedContextValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => [key, boundedContextValue(item, depth + 1)]),
    );
  }
  return null;
}

async function createTypedEntity(
  req: Request,
  res: Response,
  type: z.infer<typeof entityType>,
): Promise<void> {
  try {
    const entity = await createCognitiveEntity(ownerOf(req), roleOf(req), {
      ...req.body,
      type,
    });
    res.status(201).json({
      entity,
      execution: type === "agent" ? "not_started" : undefined,
      delivery: type === "event" ? "stored_only" : undefined,
    });
  } catch (error) {
    sendError(res, error, `create-${type}`);
  }
}

router.get("/status", async (_req, res) => {
  const [capabilities, maxcoreModelReady] = await Promise.all([
    getCognitiveCapabilities(),
    MaxCoreAIClient.isAvailable(),
  ]);
  const agentExecutionReady = capabilities.agentExecution && maxcoreModelReady;
  const blockers = [
    ...(!capabilities.storageReady ? ["cognitive_storage_unavailable"] : []),
    ...(!maxcoreModelReady ? ["maxcore_model_or_awareness_not_ready"] : []),
  ];
  const ready = capabilities.storageReady && maxcoreModelReady;
  res.status(ready ? 200 : 503).json({
    service: "maxcore-cognitive-registry",
    ...capabilities,
    status: ready ? "ready" : "degraded",
    ready,
    maxcoreModelReady,
    agentExecutionReady,
    blockers,
  });
});

router.get("/identity", (req, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    type: "user",
    ownerId: user.id,
    createdAt: user.createdAt ?? null,
    updatedAt: user.createdAt ?? null,
    tags: [],
    metadata: {},
    data: {
      username: user.username ?? null,
      email: user.email,
      role: user.role ?? "user",
      preferences: user.preferences ?? {},
    },
  });
});

router.get("/organization", async (req, res) => {
  const ownerId = ownerOf(req);
  const [entityResult, relationshipResult, projectResult, capabilityResult] =
    await Promise.allSettled([
      listCognitiveEntities(ownerId, { limit: 100 }),
      listCognitiveRelationships(ownerId, { limit: 100 }),
      searchUserProjects(ownerId, "", 10),
      getCognitiveCapabilities(),
    ]);

  const rows = entityResult.status === "fulfilled"
    ? entityResult.value as StoredCognitiveRow[]
    : [];
  const relationships = relationshipResult.status === "fulfilled"
    ? relationshipResult.value as CognitiveRelationship[]
    : [];
  const projects = projectResult.status === "fulfilled"
    ? projectResult.value
    : [];
  const capabilities = capabilityResult.status === "fulfilled"
    ? capabilityResult.value
    : {
        storageReady: false,
        productProjectContext: false,
        vectorSearch: false,
        agentExecution: false,
        toolExecution: false,
        eventBus: false,
        expansionManager: false,
        memorySharding: false,
      };
  const relationshipsFor = (id: string) =>
    relationships.filter((edge) => edge.sourceId === id || edge.targetId === id);
  const entitiesOf = <T extends object>(type: string) =>
    rows
      .filter((row) => row.entityType === type)
      .map((row) => toCognitiveEntity<T>(row, relationshipsFor(row.id)));
  const mappedProjects: CognitiveProject[] = projects.map((project) => ({
    id: project.id,
    type: "project",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    ownerId,
    tags: project.tags ?? [],
    metadata: { sourceOfTruth: "product_projects" },
    relationships: [],
    name: project.title,
    description: project.description ?? "",
    status: projectStatus(project.status),
    goals: [],
    agents: [],
    tasks: [],
    documents: [],
  }));
  const goals = entitiesOf<CognitiveGoal>("goal");
  const user = req.user!;
  const cognitiveUser: CognitiveUser = {
    id: ownerId,
    type: "user",
    createdAt: user.createdAt ?? null,
    updatedAt: user.createdAt ?? null,
    ownerId,
    tags: [],
    metadata: {},
    relationships: [],
    username: user.username ?? null,
    email: user.email,
    role: user.role ?? "user",
    preferences: boundedRecord(user.preferences),
    projects: mappedProjects.map((project) => project.id),
    goals: goals.map((goal) => goal.id),
  };
  const allSourcesAvailable =
    entityResult.status === "fulfilled" &&
    relationshipResult.status === "fulfilled" &&
    projectResult.status === "fulfilled" &&
    capabilityResult.status === "fulfilled" &&
    capabilities.storageReady &&
    capabilities.productProjectContext;
  const organization: CognitiveOrganization = {
    user: cognitiveUser,
    departments: entitiesOf<CognitiveDepartment>("department"),
    agents: entitiesOf<CognitiveAgent>("agent"),
    knowledgeGraph: entitiesOf<CognitiveKnowledgeNode>("knowledge_node"),
    memories: entitiesOf<CognitiveMemory>("memory"),
    workflows: entitiesOf<CognitiveWorkflow>("workflow"),
    tools: entitiesOf<CognitiveTool>("tool"),
    documents: entitiesOf<CognitiveDocument>("document"),
    events: entitiesOf<CognitiveEvent>("event"),
    projects: mappedProjects,
    goals,
    tasks: entitiesOf<CognitiveTask>("task"),
    relationships,
    capabilities: {
      vectorSearch: capabilities.vectorSearch,
      agentExecution: capabilities.agentExecution,
      toolExecution: capabilities.toolExecution,
      eventBus: capabilities.eventBus,
      expansionManager: capabilities.expansionManager,
      memorySharding: false,
    },
  };
  const response: CognitiveOrganizationResponse = {
    status: allSourcesAvailable ? "ok" : "degraded",
    organization,
    sourceStatuses: {
      productProjects: projectResult.status === "fulfilled" && capabilities.productProjectContext
        ? "available"
        : "unavailable",
      cognitiveEntities: entityResult.status === "fulfilled" && capabilities.storageReady
        ? "available"
        : "unavailable",
      relationships: relationshipResult.status === "fulfilled" && capabilities.storageReady
        ? "available"
        : "unavailable",
      capabilities: capabilityResult.status === "fulfilled" ? "available" : "unavailable",
    },
    bounds: {
      entities: 100,
      relationships: 100,
      projects: 10,
      truncated:
        rows.length === 100 || relationships.length === 100 || projects.length === 10,
    },
  };
  res.status(allSourcesAvailable ? 200 : 503).json(response);
});

router.post("/entities", (req, res) => {
  const parsedType = entityType.safeParse(req.body?.type);
  if (!parsedType.success) {
    res.status(400).json({ error: "A valid entity type is required.", code: "INVALID_ENTITY_TYPE" });
    return;
  }
  if (parsedType.data === "project") {
    res.status(409).json({
      error: "Use the product project endpoint so MaxCore and studio share the same project record.",
      code: "USE_PRODUCT_PROJECT_ENDPOINT",
    });
    return;
  }
  return createTypedEntity(req, res, parsedType.data);
});
router.post("/memory", (req, res) => createTypedEntity(req, res, "memory"));
router.post("/project", async (req, res) => {
  try {
    const project = await createUserProject(ownerOf(req), req.body);
    res.status(201).json({ project, sourceOfTruth: "product_projects" });
  } catch (error) {
    sendError(res, error, "create-product-project");
  }
});
router.post("/goal", (req, res) => createTypedEntity(req, res, "goal"));
router.post("/task", (req, res) => createTypedEntity(req, res, "task"));
router.post("/agent", (req, res) => createTypedEntity(req, res, "agent"));
router.post("/department", (req, res) => createTypedEntity(req, res, "department"));
router.post("/tool", (req, res) => createTypedEntity(req, res, "tool"));
router.post("/workflow", (req, res) => createTypedEntity(req, res, "workflow"));
router.post("/document", (req, res) => createTypedEntity(req, res, "document"));
router.post("/knowledge-node", (req, res) => createTypedEntity(req, res, "knowledge_node"));
router.post("/event", (req, res) => createTypedEntity(req, res, "event"));

function extractVerifiedModelText(value: unknown): {
  output: string;
  source: string;
  generationContract: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  const outputs = Array.isArray(response.outputs) ? response.outputs : [];
  const firstOutput = outputs[0] && typeof outputs[0] === "object"
    ? outputs[0] as Record<string, unknown>
    : {};
  const output = [
    response.text,
    response.content,
    response.script,
    firstOutput.text,
    firstOutput.content,
  ].find((item): item is string => typeof item === "string" && item.trim().length > 0);
  const source = response.source;
  const generationContract = response.generation_contract;
  if (
    !output ||
    typeof source !== "string" ||
    !["ai_model", "model", "model_composed"].includes(source) ||
    typeof generationContract !== "string" ||
    !generationContract.trim()
  ) return null;
  return { output: output.trim().slice(0, 12_000), source, generationContract };
}

router.post("/tasks/:id/execute", async (req, res) => {
  if (!entityId.safeParse(req.params.id).success) {
    res.status(404).json({ error: "Task not found.", code: "TASK_NOT_FOUND" });
    return;
  }
  const parsed = executeTaskBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid task execution options.", code: "INVALID_EXECUTION_OPTIONS" });
    return;
  }
  if (!await MaxCoreAIClient.isAvailable()) {
    res.status(503).json({
      error: "MaxCore's serving model and awareness are not ready; task state was not changed.",
      code: "MAXCORE_NOT_READY",
      taskStateChanged: false,
    });
    return;
  }

  let claim: Awaited<ReturnType<typeof claimAgentTask>> | undefined;
  try {
    claim = await claimAgentTask(ownerOf(req), req.params.id, parsed.data.retryBlocked);
    const taskPrompt = [claim.title, claim.description].filter(Boolean).join("\n\n");
    const modelResponse = await MaxCoreAIClient.generate<Record<string, unknown>>(
      "/api/generate/text",
      {
        mode: "content",
        topic: claim.title,
        prompt: taskPrompt,
        intent: `Complete this assigned ${claim.specialty} task. Return the work product, not a plan to do the work.`,
        platform: "general",
        tone: "clear, factual, task-focused",
        extra_context: JSON.stringify({
          agent: {
            name: claim.agentName,
            specialty: claim.specialty,
            objectives: claim.objectives,
          },
          task: {
            title: claim.title,
            description: claim.description,
          },
          outputRequirements: [
            "Use the attached MaxCore awareness and account context only as relevant, cited context.",
            "Do not claim actions, tool calls, tests, or external work that were not performed.",
            "Return a concise, directly usable result.",
          ],
        }),
      },
      ownerOf(req),
      600_000,
    );
    const verified = extractVerifiedModelText(modelResponse);
    if (!verified) {
      await failAgentTask(claim, "MODEL_OUTPUT_UNVERIFIED");
      res.status(503).json({
        error: "MaxCore did not return output with verified model provenance.",
        code: "MODEL_OUTPUT_UNVERIFIED",
        runId: claim.runId,
        taskState: "blocked",
      });
      return;
    }
    const originalPrompt = taskPrompt.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
    const normalizedOutput = verified.output.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
    if (verified.output.length < 8 || normalizedOutput === originalPrompt) {
      await failAgentTask(claim, "MODEL_OUTPUT_NOT_SUBSTANTIVE");
      res.status(503).json({
        error: "MaxCore output was empty, too short, or only echoed the task prompt.",
        code: "MODEL_OUTPUT_NOT_SUBSTANTIVE",
        runId: claim.runId,
        taskState: "blocked",
      });
      return;
    }
    const completion = await completeAgentTask(claim, verified.output, {
      source: verified.source,
      generationContract: verified.generationContract,
    });
    res.json({
      ...completion,
      runId: claim.runId,
      agentId: claim.agentId,
      output: verified.output,
      model: {
        source: verified.source,
        generationContract: verified.generationContract,
      },
      awareness: "included_by_maxcore_generation_gateway",
    });
  } catch (error) {
    if (claim) {
      const code = error && typeof error === "object" &&
        "statusCode" in error && typeof error.statusCode === "number"
        ? `MAXCORE_HTTP_${error.statusCode}`
        : "MAXCORE_GENERATION_FAILED";
      let taskFailurePersisted = false;
      try {
        await failAgentTask(claim, code);
        taskFailurePersisted = true;
      } catch {
        logger.warn(
          { operation: "execute-cognitive-task", runId: claim.runId },
          "Task failure could not be persisted",
        );
      }
      res.status(503).json({
        error: "MaxCore agent execution did not complete successfully.",
        code: "AGENT_EXECUTION_FAILED",
        failureCode: code,
        runId: claim.runId,
        taskState: taskFailurePersisted ? "blocked" : "unknown",
      });
      return;
    }
    sendError(res, error, "execute-cognitive-task");
  }
});

router.get("/events", async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid event query.", code: "INVALID_QUERY" });
    return;
  }
  try {
    const events = await listCognitiveEntities(ownerOf(req), {
      type: "event",
      query: parsed.data.q,
      limit: parsed.data.limit,
    });
    res.json({
      events,
      count: events.length,
      delivery: "durable_postgres_log_with_optional_websocket_notification",
    });
  } catch (error) {
    sendError(res, error, "list-cognitive-events");
  }
});

router.get("/entities", async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid entity query.", code: "INVALID_QUERY" });
    return;
  }
  try {
    const entities = await listCognitiveEntities(ownerOf(req), {
      type: parsed.data.type,
      query: parsed.data.q,
      limit: parsed.data.limit,
    });
    res.json({ entities, count: entities.length });
  } catch (error) {
    sendError(res, error, "list-entities");
  }
});

router.get("/entities/:id", async (req, res) => {
  if (!entityId.safeParse(req.params.id).success) {
    res.status(404).json({ error: "Entity not found.", code: "ENTITY_NOT_FOUND" });
    return;
  }
  try {
    const entity = await getCognitiveEntity(ownerOf(req), req.params.id);
    if (!entity) {
      res.status(404).json({ error: "Entity not found.", code: "ENTITY_NOT_FOUND" });
      return;
    }
    res.json({ entity });
  } catch (error) {
    sendError(res, error, "get-entity");
  }
});

router.patch("/entities/:id", async (req, res) => {
  if (!entityId.safeParse(req.params.id).success) {
    res.status(404).json({ error: "Entity not found.", code: "ENTITY_NOT_FOUND" });
    return;
  }
  try {
    const entity = await updateCognitiveEntity(ownerOf(req), roleOf(req), req.params.id, req.body);
    if (!entity) {
      res.status(404).json({ error: "Entity not found.", code: "ENTITY_NOT_FOUND" });
      return;
    }
    res.json({ entity });
  } catch (error) {
    sendError(res, error, "update-entity");
  }
});

router.delete("/entities/:id", async (req, res) => {
  if (!entityId.safeParse(req.params.id).success) {
    res.status(404).json({ error: "Entity not found.", code: "ENTITY_NOT_FOUND" });
    return;
  }
  try {
    const deleted = await deleteCognitiveEntity(ownerOf(req), req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Entity not found.", code: "ENTITY_NOT_FOUND" });
      return;
    }
    res.json({ deleted: true });
  } catch (error) {
    sendError(res, error, "delete-entity");
  }
});

router.post("/relationships", async (req, res) => {
  try {
    const result = await createCognitiveRelationship(ownerOf(req), req.body);
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    sendError(res, error, "create-relationship");
  }
});

router.get("/relationships", async (req, res) => {
  const parsed = relationshipQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid relationship query.", code: "INVALID_QUERY" });
    return;
  }
  try {
    const relationships = await listCognitiveRelationships(ownerOf(req), parsed.data);
    res.json({ relationships, count: relationships.length });
  } catch (error) {
    sendError(res, error, "list-relationships");
  }
});

router.delete("/relationships/:id", async (req, res) => {
  if (!entityId.safeParse(req.params.id).success) {
    res.status(404).json({ error: "Relationship not found.", code: "RELATIONSHIP_NOT_FOUND" });
    return;
  }
  try {
    const deleted = await deleteCognitiveRelationship(ownerOf(req), req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Relationship not found.", code: "RELATIONSHIP_NOT_FOUND" });
      return;
    }
    res.json({ deleted: true });
  } catch (error) {
    sendError(res, error, "delete-relationship");
  }
});

async function serveCognitiveContext(
  req: Request,
  res: Response,
  input: unknown,
): Promise<void> {
  const parsed = cognitiveQuerySchema.safeParse(input);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a valid context query.", code: "INVALID_QUERY" });
    return;
  }
  try {
    const [graphResult, projectsResult, capabilityResult] = await Promise.allSettled([
      searchCognitiveGraphContext(ownerOf(req), parsed.data.query, parsed.data.limit),
      searchUserProjects(ownerOf(req), parsed.data.query, parsed.data.limit),
      getCognitiveCapabilities(),
    ]);
    if (graphResult.status === "rejected" && projectsResult.status === "rejected") {
      sendError(res, graphResult.reason, "build-context");
      return;
    }
    if (
      graphResult.status === "rejected" ||
      projectsResult.status === "rejected" ||
      capabilityResult.status === "rejected"
    ) {
      logger.warn(
        {
          operation: "build-context",
          degradedSources: [
            ...(graphResult.status === "rejected" ? ["cognitive_registry"] : []),
            ...(projectsResult.status === "rejected" ? ["product_projects"] : []),
            ...(capabilityResult.status === "rejected" ? ["capabilities"] : []),
          ],
        },
        "MaxCore context is partially available",
      );
    }
    const graph = graphResult.status === "fulfilled"
      ? graphResult.value
      : { matches: [], relationships: [], relatedEntities: [] };
    const productProjects = projectsResult.status === "fulfilled" ? projectsResult.value : [];
    const capabilities = capabilityResult.status === "fulfilled"
      ? capabilityResult.value
      : {
          storageReady: false,
          productProjectContext: false,
          vectorSearch: false,
          agentExecution: false,
          toolExecution: false,
          eventBus: false,
          expansionManager: false,
          memorySharding: false,
        };
    const retrievalMethod: CognitiveContextPackage["retrievalMethod"] =
      graphResult.status === "fulfilled" && projectsResult.status === "fulfilled"
        ? "postgres_full_text+bounded_product_project_ranking"
        : graphResult.status === "fulfilled"
          ? "postgres_full_text"
          : "bounded_product_project_ranking";
    const retrievedAt = new Date().toISOString();
    const allMatchedEntities = [...graph.matches, ...graph.relatedEntities];
    const memoryCitations = graph.matches
      .filter((entity) => entity.entityType === "memory")
      .flatMap((entity) => {
        const content = entity.payload.content;
        return typeof content === "string"
          ? [`maxcore://cognitive/memory/${entity.id} — ${content.slice(0, 2_000)}`]
          : [];
      });
    const projectCitations = productProjects.map(
      (project) => `maxbooster://projects/${project.id}`,
    );
    const citations = [...new Set([
      ...graph.matches.map((entity) => `maxcore://cognitive/${entity.entityType}/${entity.id}`),
      ...graph.relatedEntities.map((entity) => `maxcore://cognitive/${entity.entityType}/${entity.id}`),
      ...projectCitations,
    ])];
    const contextPackage: CognitiveContextPackage = {
      query: parsed.data.query,
      relevantMemory: memoryCitations,
      activeProjects: productProjects
        .filter((project) => project.status === "active")
        .map((project) => project.id),
      activeGoals: allMatchedEntities
        .filter((entity) => {
          const progress = entity.payload.progress;
          return entity.entityType === "goal" &&
            typeof progress === "number" &&
            progress >= 0 &&
            progress < 100;
        })
        .map((entity) => entity.id),
      activeAgents: allMatchedEntities
        .filter((entity) =>
          entity.entityType === "agent" &&
          (entity.payload.status === "active" || entity.payload.status === "busy"),
        )
        .map((entity) => entity.id),
      knowledgeNodes: allMatchedEntities
        .filter((entity) => entity.entityType === "knowledge_node")
        .map((entity) => entity.id),
      citations,
      retrievedAt,
      retrievalMethod,
    };
    res.json({
      status: graphResult.status === "fulfilled" &&
        projectsResult.status === "fulfilled" &&
        capabilityResult.status === "fulfilled" &&
        capabilities.storageReady
        ? "ok"
        : "degraded",
      query: parsed.data.query,
      retrievedAt,
      retrievalMethod,
      contextPackage,
      context: graph.matches.map((entity) => ({
        id: entity.id,
        type: entity.entityType,
        payload: boundedContextValue(entity.payload),
        source: entity.payload.source ?? entity.metadata.source ?? null,
        confidence: entity.payload.confidence ?? null,
        freshness: "persisted_history",
        createdAt: entity.createdAt,
        citation: `maxcore://cognitive/${entity.entityType}/${entity.id}`,
      })),
      graph: {
        relationships: graph.relationships.map((relationship) => ({
          id: relationship.id,
          sourceId: relationship.sourceId,
          targetId: relationship.targetId,
          relationType: relationship.relationType,
          createdAt: relationship.createdAt,
        })),
        relatedEntities: graph.relatedEntities.map((entity) => ({
          id: entity.id,
          type: entity.entityType,
          payload: boundedContextValue(entity.payload),
          citation: `maxcore://cognitive/${entity.entityType}/${entity.id}`,
        })),
      },
      projects: productProjects.map((project) => ({
        id: project.id,
        type: "project",
        title: project.title,
        description: project.description,
        genre: project.genre,
        bpm: project.bpm,
        key: project.key,
        status: project.status,
        workflowStage: project.workflowStage,
        tags: project.tags,
        source: "product_projects",
        freshness: "persisted_project_state",
        updatedAt: project.updatedAt,
        citation: `maxbooster://projects/${project.id}`,
      })),
      sourceStatuses: {
        cognitiveRegistry: graphResult.status === "fulfilled" ? "available" : "unavailable",
        productProjects: projectsResult.status === "fulfilled" ? "available" : "unavailable",
        capabilities: capabilityResult.status === "fulfilled" ? "available" : "unavailable",
      },
      capabilities: {
        vectorSearch: capabilities.vectorSearch,
        agentExecution: capabilities.agentExecution,
        toolExecution: capabilities.toolExecution,
        eventBus: capabilities.eventBus,
        expansionManager: capabilities.expansionManager,
        historicalRanking: false,
      },
    });
  } catch (error) {
    sendError(res, error, "build-context");
  }
}

router.get("/context", (req, res) => serveCognitiveContext(req, res, req.query));
router.post("/context", (req, res) => serveCognitiveContext(req, res, req.body));

export default router;
