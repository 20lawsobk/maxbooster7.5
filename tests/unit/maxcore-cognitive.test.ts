import express, { type NextFunction, type Request, type Response } from "express";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  createCognitiveEntity: vi.fn(),
  createUserProject: vi.fn(),
  listCognitiveEntities: vi.fn(),
  searchCognitiveGraphContext: vi.fn(),
  searchUserProjects: vi.fn(),
  getCognitiveEntity: vi.fn(),
  updateCognitiveEntity: vi.fn(),
  deleteCognitiveEntity: vi.fn(),
  createCognitiveRelationship: vi.fn(),
  listCognitiveRelationships: vi.fn(),
  deleteCognitiveRelationship: vi.fn(),
  getCognitiveCapabilities: vi.fn(),
  claimAgentTask: vi.fn(),
  completeAgentTask: vi.fn(),
  failAgentTask: vi.fn(),
  maxcoreIsAvailable: vi.fn(),
  maxcoreGenerate: vi.fn(),
}));

vi.mock("../../server/db.js", () => ({ db: {} }));
vi.mock("../../server/services/maxcoreClient.js", () => ({
  MaxCoreAIClient: {
    isAvailable: serviceMocks.maxcoreIsAvailable,
    generate: serviceMocks.maxcoreGenerate,
  },
}));

vi.mock("../../server/services/maxcoreCognitiveService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/services/maxcoreCognitiveService.js")>();
  return {
    ...actual,
    ...serviceMocks,
    createCognitiveEntity: async (ownerId: string, role: string, input: unknown) => {
      actual.parseCognitiveEntityInput(input, role);
      return serviceMocks.createCognitiveEntity(ownerId, role, input);
    },
  };
});

vi.mock("../../server/middleware/auth.js", () => ({
  requireAuthOnly: (req: Request, res: Response, next: NextFunction) => {
    const id = req.header("x-test-user");
    if (!id) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.user = {
      id,
      email: `${id}@example.test`,
      username: id,
      role: req.header("x-test-role") ?? "user",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      preferences: {},
    } as Express.User;
    req.isAuthenticated = (() => true) as Request["isAuthenticated"];
    next();
  },
}));

import router from "../../server/routes/maxcoreCognitive.js";
import {
  assertCognitiveEntityMutationAllowed,
  CognitiveStoreError,
  buildCognitiveSearchText,
  parseCognitiveEntityInput,
} from "../../server/services/maxcoreCognitiveService.js";

const app = express();
app.use(express.json());
app.use("/api/maxcore/cognitive", router);

const memoryBody = {
  data: {
    memoryType: "episodic",
    content: "Artist approved a release plan for the summer campaign.",
    confidence: 0.9,
    importance: 0.8,
    source: "owner_note",
  },
  tags: ["release", "campaign"],
  metadata: {},
};

async function withServer<T>(run: (origin: string) => Promise<T>): Promise<T> {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function send(
  origin: string,
  path: string,
  options: {
    userId?: string;
    role?: string;
    method?: string;
    body?: unknown;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (options.userId) headers["x-test-user"] = options.userId;
  if (options.role) headers["x-test-role"] = options.role;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

describe("MaxCore cognitive persistence contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.createCognitiveEntity.mockResolvedValue({
      id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
      ownerId: "account-a",
      entityType: "memory",
      payload: memoryBody.data,
      tags: memoryBody.tags,
    });
    serviceMocks.maxcoreIsAvailable.mockResolvedValue(false);
    serviceMocks.maxcoreGenerate.mockReset();
    serviceMocks.claimAgentTask.mockResolvedValue({
      runId: "54e669f6-96f2-467a-a45f-276625e49561",
      ownerId: "account-a",
      taskId: "d14c561a-8464-4afc-83bb-4ea0ae797188",
      agentId: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
      title: "Draft an artist announcement",
      description: "Write a release announcement for the new single.",
      agentName: "Release Writer",
      specialty: "artist communications",
      objectives: ["Produce truthful release copy"],
    });
    serviceMocks.completeAgentTask.mockResolvedValue({
      task: { id: "d14c561a-8464-4afc-83bb-4ea0ae797188", status: "complete" },
      completedAt: "2026-11-09T12:00:00.000Z",
    });
    serviceMocks.failAgentTask.mockResolvedValue({
      taskId: "d14c561a-8464-4afc-83bb-4ea0ae797188",
      state: "blocked",
      errorCode: "MODEL_OUTPUT_UNVERIFIED",
    });
    serviceMocks.createUserProject.mockResolvedValue({
      id: "d14c561a-8464-4afc-83bb-4ea0ae797188",
      title: "My release project",
      userId: "account-a",
    });
    serviceMocks.listCognitiveEntities.mockResolvedValue([]);
    serviceMocks.searchCognitiveGraphContext.mockResolvedValue({
      matches: [],
      relationships: [],
      relatedEntities: [],
    });
    serviceMocks.searchUserProjects.mockResolvedValue([]);
    serviceMocks.getCognitiveEntity.mockResolvedValue(null);
    serviceMocks.updateCognitiveEntity.mockResolvedValue(null);
    serviceMocks.deleteCognitiveEntity.mockResolvedValue(false);
    serviceMocks.createCognitiveRelationship.mockResolvedValue({
      relationship: { id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce99" },
      created: true,
    });
    serviceMocks.listCognitiveRelationships.mockResolvedValue([]);
    serviceMocks.deleteCognitiveRelationship.mockResolvedValue(false);
    serviceMocks.getCognitiveCapabilities.mockResolvedValue({
      status: "degraded",
      storageReady: false,
      persistence: "postgres",
      graphStore: false,
      retrieval: "unavailable",
      vectorSearch: false,
      agentExecution: false,
      toolExecution: false,
      eventBus: false,
      expansionManager: false,
    });
  });

  it("requires authenticated identity before exposing cognitive data", async () => {
    await withServer(async (origin) => {
      const response = await send(origin, "/api/maxcore/cognitive/entities");
      expect(response.status).toBe(401);
      expect(serviceMocks.listCognitiveEntities).not.toHaveBeenCalled();
    });
  });

  it("lists only the authenticated owner's durable cognitive events", async () => {
    const event = {
      id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
      ownerId: "account-a",
      entityType: "event",
      payload: { eventType: "memory_created", sourceId: "memory-id", payload: {} },
    };
    serviceMocks.listCognitiveEntities.mockResolvedValueOnce([event]);
    await withServer(async (origin) => {
      const response = await send(
        origin,
        "/api/maxcore/cognitive/events?limit=10",
        { userId: "account-a" },
      );
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        count: 1,
        events: [event],
        delivery: "durable_postgres_log_with_optional_websocket_notification",
      });
      expect(serviceMocks.listCognitiveEntities).toHaveBeenCalledWith(
        "account-a",
        { type: "event", query: undefined, limit: 10 },
      );
    });
  });

  it("rejects client-authored event records so the runtime owns the ledger", async () => {
    await withServer(async (origin) => {
      const response = await send(origin, "/api/maxcore/cognitive/event", {
        userId: "account-a",
        body: { data: {}, tags: [], metadata: {} },
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("EVENT_SYSTEM_MANAGED");
      expect(serviceMocks.createCognitiveEntity).not.toHaveBeenCalled();
    });
  });

  it("uses the authenticated owner, not client-supplied ownership", async () => {
    await withServer(async (origin) => {
      const response = await send(origin, "/api/maxcore/cognitive/memory", {
        userId: "account-a",
        body: memoryBody,
      });
      expect(response.status).toBe(201);
      expect(serviceMocks.createCognitiveEntity).toHaveBeenCalledWith(
        "account-a",
        "user",
        { ...memoryBody, type: "memory" },
      );

      const forged = await send(origin, "/api/maxcore/cognitive/memory", {
        userId: "account-a",
        body: { ...memoryBody, ownerId: "account-b" },
      });
      expect(forged.status).toBe(400);
      expect(serviceMocks.createCognitiveEntity).toHaveBeenCalledTimes(1);
    });
  });

  it("creates a product project in the existing project source of truth", async () => {
    await withServer(async (origin) => {
      const response = await send(origin, "/api/maxcore/cognitive/project", {
        userId: "account-a",
        body: { title: "Single source project", genre: "indie pop" },
      });
      expect(response.status).toBe(201);
      expect(response.body.sourceOfTruth).toBe("product_projects");
      expect(serviceMocks.createUserProject).toHaveBeenCalledWith(
        "account-a",
        { title: "Single source project", genre: "indie pop" },
      );
      expect(serviceMocks.createCognitiveEntity).not.toHaveBeenCalled();
    });
  });

  it("scopes listing and context retrieval to the authenticated account", async () => {
    serviceMocks.searchCognitiveGraphContext.mockResolvedValueOnce({
      matches: [{
        id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
        entityType: "memory",
        payload: { content: "release campaign", source: "owner_note", confidence: 0.9 },
        metadata: {},
        createdAt: "2026-11-09T00:00:00.000Z",
      }],
      relationships: [{
        id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce99",
        sourceId: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
        targetId: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce97",
        relationType: "supports",
        createdAt: "2026-11-09T00:00:00.000Z",
      }],
      relatedEntities: [{
        id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce97",
        entityType: "goal",
        payload: { title: "Release campaign" },
      }],
    });
    serviceMocks.searchUserProjects.mockResolvedValueOnce([{
      id: "d14c561a-8464-4afc-83bb-4ea0ae797188",
      title: "Summer release",
      description: "Campaign project",
      genre: "indie pop",
      status: "active",
      updatedAt: "2026-11-09T00:00:00.000Z",
    }]);
    await withServer(async (origin) => {
      const listed = await send(
        origin,
        "/api/maxcore/cognitive/entities?type=memory&q=release&limit=4",
        { userId: "account-a" },
      );
      expect(listed.status).toBe(200);
      expect(serviceMocks.listCognitiveEntities).toHaveBeenCalledWith("account-a", {
        type: "memory",
        query: "release",
        limit: 4,
      });

      const context = await send(origin, "/api/maxcore/cognitive/context", {
        userId: "account-a",
        body: { query: "release campaign", limit: 4 },
      });
      expect(context.status).toBe(200);
      expect(serviceMocks.searchCognitiveGraphContext).toHaveBeenCalledWith(
        "account-a",
        "release campaign",
        4,
      );
      expect(serviceMocks.searchUserProjects).toHaveBeenCalledWith(
        "account-a",
        "release campaign",
        4,
      );
      expect(context.body.retrievalMethod).toBe(
        "postgres_full_text+bounded_product_project_ranking",
      );
      expect(context.body.capabilities.vectorSearch).toBe(false);
      expect(context.body.contextPackage.relevantMemory).toEqual([
        "maxcore://cognitive/memory/ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98 — release campaign",
      ]);
      expect(context.body.contextPackage.activeProjects).toEqual([
        "d14c561a-8464-4afc-83bb-4ea0ae797188",
      ]);
      expect(context.body.contextPackage.citations).toContain(
        "maxbooster://projects/d14c561a-8464-4afc-83bb-4ea0ae797188",
      );
      expect(context.body.projects[0]).toMatchObject({
        id: "d14c561a-8464-4afc-83bb-4ea0ae797188",
        citation: "maxbooster://projects/d14c561a-8464-4afc-83bb-4ea0ae797188",
        freshness: "persisted_project_state",
      });
      expect(context.body.graph.relationships[0].relationType).toBe("supports");
      expect(context.body.context[0].source).toBe("owner_note");

      const readContext = await send(
        origin,
        "/api/maxcore/cognitive/context?query=release&limit=2",
        { userId: "account-a" },
      );
      expect(readContext.status).toBe(200);
      expect(serviceMocks.searchCognitiveGraphContext).toHaveBeenLastCalledWith(
        "account-a",
        "release",
        2,
      );
    });
  });

  it("builds a bounded organization view from owner data and the product project store", async () => {
    const createdAt = "2026-11-01T00:00:00.000Z";
    const updatedAt = "2026-11-09T00:00:00.000Z";
    serviceMocks.listCognitiveEntities.mockResolvedValueOnce([
      {
        id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
        ownerId: "account-a",
        entityType: "goal",
        payload: { title: "Release", objective: "Complete release", priority: "high", progress: 40 },
        metadata: {},
        tags: ["music"],
        createdAt,
        updatedAt,
      },
      {
        id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce97",
        ownerId: "account-a",
        entityType: "agent",
        payload: { name: "Researcher", specialty: "music", status: "offline" },
        metadata: {},
        tags: [],
        createdAt,
        updatedAt,
      },
    ]);
    serviceMocks.listCognitiveRelationships.mockResolvedValueOnce([{
      id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce99",
      ownerId: "account-a",
      sourceId: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
      targetId: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce97",
      relationType: "assigned_to",
      createdAt: updatedAt,
    }]);
    serviceMocks.searchUserProjects.mockResolvedValueOnce([{
      id: "d14c561a-8464-4afc-83bb-4ea0ae797188",
      title: "Summer release",
      description: "Campaign project",
      status: "active",
      tags: ["release"],
      createdAt,
      updatedAt,
    }]);
    serviceMocks.getCognitiveCapabilities.mockResolvedValueOnce({
      status: "partial",
      storageReady: true,
      productProjectContext: true,
      persistence: "postgres",
      graphStore: true,
      retrieval: "postgres_full_text",
      vectorSearch: false,
      agentExecution: false,
      toolExecution: false,
      eventBus: false,
      expansionManager: false,
    });

    await withServer(async (origin) => {
      const response = await send(origin, "/api/maxcore/cognitive/organization", {
        userId: "account-a",
      });
      expect(response.status).toBe(200);
      expect(serviceMocks.listCognitiveEntities).toHaveBeenCalledWith(
        "account-a",
        { limit: 100 },
      );
      expect(serviceMocks.listCognitiveRelationships).toHaveBeenCalledWith(
        "account-a",
        { limit: 100 },
      );
      expect(serviceMocks.searchUserProjects).toHaveBeenCalledWith("account-a", "", 10);
      expect(response.body.status).toBe("ok");
      expect(response.body.organization.user.projects).toEqual([
        "d14c561a-8464-4afc-83bb-4ea0ae797188",
      ]);
      expect(response.body.organization.user.goals).toEqual([
        "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
      ]);
      expect(response.body.organization.projects[0].name).toBe("Summer release");
      expect(response.body.organization.agents[0].status).toBe("offline");
      expect(response.body.organization.relationships[0].relationType).toBe("assigned_to");
      expect(response.body.organization.capabilities.agentExecution).toBe(false);
    });
  });

  it("does not report stored agent definitions as spawned agents", async () => {
    serviceMocks.createCognitiveEntity.mockResolvedValueOnce({
      id: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
      entityType: "agent",
      payload: { name: "Researcher", status: "offline" },
    });
    await withServer(async (origin) => {
      const response = await send(origin, "/api/maxcore/cognitive/agent", {
        userId: "account-a",
        body: { data: { name: "Researcher", specialty: "music research" } },
      });
      expect(response.status).toBe(201);
      expect(response.body.execution).toBe("not_started");
    });
  });

  it("does not claim or mutate a task while MaxCore model readiness is false", async () => {
    await withServer(async (origin) => {
      const response = await send(
        origin,
        "/api/maxcore/cognitive/tasks/d14c561a-8464-4afc-83bb-4ea0ae797188/execute",
        { userId: "account-a", method: "POST", body: {} },
      );
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        code: "MAXCORE_NOT_READY",
        taskStateChanged: false,
      });
      expect(serviceMocks.claimAgentTask).not.toHaveBeenCalled();
      expect(serviceMocks.maxcoreGenerate).not.toHaveBeenCalled();
    });
  });

  it("completes an assigned task only from model-provenanced non-echo output", async () => {
    serviceMocks.maxcoreIsAvailable.mockResolvedValueOnce(true);
    serviceMocks.maxcoreGenerate.mockResolvedValueOnce({
      text: "Announcing the new single: a bright, forward-looking release arriving this Friday.",
      source: "ai_model",
      generation_contract: "documented-stack-v3",
    });
    await withServer(async (origin) => {
      const response = await send(
        origin,
        "/api/maxcore/cognitive/tasks/d14c561a-8464-4afc-83bb-4ea0ae797188/execute",
        { userId: "account-a", method: "POST", body: {} },
      );
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        task: { status: "complete" },
        runId: "54e669f6-96f2-467a-a45f-276625e49561",
        agentId: "ce6a2ec0-bfb2-4d8e-8bda-7cf1378cce98",
        model: { source: "ai_model", generationContract: "documented-stack-v3" },
        awareness: "included_by_maxcore_generation_gateway",
      });
      expect(serviceMocks.claimAgentTask).toHaveBeenCalledWith(
        "account-a",
        "d14c561a-8464-4afc-83bb-4ea0ae797188",
        false,
      );
      expect(serviceMocks.maxcoreGenerate).toHaveBeenCalledWith(
        "/api/generate/text",
        expect.objectContaining({
          mode: "content",
          topic: "Draft an artist announcement",
          prompt: expect.stringContaining("new single"),
        }),
        "account-a",
        600_000,
      );
      expect(serviceMocks.completeAgentTask).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: "account-a" }),
        response.body.output,
        { source: "ai_model", generationContract: "documented-stack-v3" },
      );
    });
  });

  it("blocks model output without provenance and does not report task completion", async () => {
    serviceMocks.maxcoreIsAvailable.mockResolvedValueOnce(true);
    serviceMocks.maxcoreGenerate.mockResolvedValueOnce({
      text: "This looks like a response but has no model provenance.",
    });
    await withServer(async (origin) => {
      const response = await send(
        origin,
        "/api/maxcore/cognitive/tasks/d14c561a-8464-4afc-83bb-4ea0ae797188/execute",
        { userId: "account-a", method: "POST", body: {} },
      );
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        code: "MODEL_OUTPUT_UNVERIFIED",
        taskState: "blocked",
      });
      expect(serviceMocks.failAgentTask).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: "account-a" }),
        "MODEL_OUTPUT_UNVERIFIED",
      );
      expect(serviceMocks.completeAgentTask).not.toHaveBeenCalled();
    });
  });

  it("reports unavailable execution and vector capabilities honestly", async () => {
    await withServer(async (origin) => {
      const response = await send(origin, "/api/maxcore/cognitive/status", {
        userId: "account-a",
      });
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        storageReady: false,
        vectorSearch: false,
        agentExecution: false,
        toolExecution: false,
        eventBus: false,
        expansionManager: false,
      });
    });
  });

  it("separates implemented task execution from current model readiness", async () => {
    serviceMocks.getCognitiveCapabilities.mockResolvedValueOnce({
      status: "partial",
      storageReady: true,
      persistence: "postgres",
      graphStore: true,
      retrieval: "postgres_full_text",
      vectorSearch: false,
      agentExecution: true,
      toolExecution: false,
      eventBus: false,
      expansionManager: false,
      memorySharding: false,
    });
    serviceMocks.maxcoreIsAvailable.mockResolvedValueOnce(false);
    await withServer(async (origin) => {
      const response = await send(origin, "/api/maxcore/cognitive/status", {
        userId: "account-a",
      });
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        ready: false,
        storageReady: true,
        agentExecution: true,
        agentExecutionReady: false,
        maxcoreModelReady: false,
        blockers: ["maxcore_model_or_awareness_not_ready"],
      });
    });
  });

  it("prevents edits and deletion from invalidating active task leases", () => {
    for (const operation of ["update", "delete"] as const) {
      let taskError: unknown;
      try {
        assertCognitiveEntityMutationAllowed(
          "task",
          { status: "active" },
          operation,
        );
      } catch (error) {
        taskError = error;
      }
      expect(taskError).toBeInstanceOf(CognitiveStoreError);
      expect(taskError).toMatchObject({
        statusCode: 409,
        code: "TASK_EXECUTION_IN_PROGRESS",
      });

      let agentError: unknown;
      try {
        assertCognitiveEntityMutationAllowed(
          "agent",
          { status: "offline" },
          operation,
          true,
        );
      } catch (error) {
        agentError = error;
      }
      expect(agentError).toBeInstanceOf(CognitiveStoreError);
      expect(agentError).toMatchObject({
        statusCode: 409,
        code: "AGENT_EXECUTION_IN_PROGRESS",
      });
    }
    expect(() => assertCognitiveEntityMutationAllowed(
      "task",
      { status: "pending" },
      "update",
    )).not.toThrow();
  });

  it("validates typed data and reserves system memory for admins", () => {
    expect(() => parseCognitiveEntityInput({
      type: "memory",
      data: { ...memoryBody.data, memoryType: "system" },
    }, "user")).toThrowError(CognitiveStoreError);
    expect(parseCognitiveEntityInput({
      type: "memory",
      data: { ...memoryBody.data, memoryType: "system" },
    }, "admin").type).toBe("memory");
    expect(() => parseCognitiveEntityInput({
      type: "agent",
      data: { name: "Agent", specialty: "QA", status: "active" },
    }, "admin")).toThrowError(CognitiveStoreError);
    expect(() => parseCognitiveEntityInput({
      type: "tool",
      data: { name: "terminal", category: "system", enabled: true },
    }, "admin")).toThrowError(CognitiveStoreError);
    expect(() => parseCognitiveEntityInput({
      type: "task",
      data: { title: "Forged complete task", status: "complete" },
      metadata: {},
    }, "user")).toThrowError(CognitiveStoreError);
    expect(() => parseCognitiveEntityInput({
      type: "memory",
      data: memoryBody.data,
      metadata: { maxcoreRuntime: { state: "complete" } },
    }, "user")).toThrowError(CognitiveStoreError);
  });

  it("builds retrieval text from entity content and tags only", () => {
    const searchable = buildCognitiveSearchText(
      "memory",
      { content: "approved release plan", confidence: 0.8 },
      ["release"],
    );
    expect(searchable).toContain("approved release plan");
    expect(searchable).toContain("release");
    expect(searchable).not.toContain("owner@example.test");
  });
});
