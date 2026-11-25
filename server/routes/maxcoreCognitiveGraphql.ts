import {
  buildSchema,
  execute,
  GraphQLError,
  GraphQLScalarType,
  Kind,
  parse,
  specifiedRules,
  validate,
  valueFromASTUntyped,
  type ValidationRule,
} from "graphql";
import { Router, type Request, type Response } from "express";
import { logger } from "../logger.js";
import { requireAuthOnly } from "../middleware/auth.js";
import { MaxCoreAIClient } from "../services/maxcoreClient.js";
import {
  CognitiveStoreError,
  createCognitiveEntity,
  createUserProject,
  getUserProject,
  getCognitiveCapabilities,
  getCognitiveEntity,
  listCognitiveRelationships,
} from "../services/maxcoreCognitiveService.js";

const MAX_QUERY_BYTES = 16 * 1024;
const MAX_VARIABLE_BYTES = 128 * 1024;
const MAX_FIELDS = 100;
const MAX_DEPTH = 8;

const schema = buildSchema(`
  scalar JSON

  type Relationship {
    id: ID!
    sourceId: ID!
    targetId: ID!
    relationType: String!
    createdAt: String!
  }

  type Project {
    id: ID!
    type: String!
    ownerId: ID!
    name: String!
    description: String!
    status: String!
    genre: String
    bpm: Int
    key: String
    createdAt: String
    updatedAt: String
    tags: [String!]!
    metadata: JSON!
    relationships: [Relationship!]!
    goals: [ID!]!
    agents: [ID!]!
    tasks: [ID!]!
    documents: [ID!]!
  }

  type Department {
    id: ID!
    type: String!
    ownerId: ID!
    name: String!
    leadAgent: ID
    members: [ID!]!
    objectives: [String!]!
    createdAt: String
    updatedAt: String
    tags: [String!]!
    metadata: JSON!
    relationships: [Relationship!]!
  }

  type Memory {
    id: ID!
    type: String!
    ownerId: ID!
    memoryType: String!
    content: String!
    embeddingId: ID
    confidence: Float!
    importance: Float!
    source: String!
    createdAt: String
    updatedAt: String
    tags: [String!]!
    metadata: JSON!
    relationships: [Relationship!]!
  }

  type Agent {
    id: ID!
    type: String!
    ownerId: ID!
    name: String!
    specialty: String!
    departmentId: ID
    status: String!
    tools: [String!]!
    memoryIds: [ID!]!
    childAgents: [ID!]!
    capabilities: [String!]!
    objectives: [String!]!
    createdAt: String
    updatedAt: String
    tags: [String!]!
    metadata: JSON!
    relationships: [Relationship!]!
  }

  type Task {
    id: ID!
    type: String!
    ownerId: ID!
    title: String!
    description: String
    status: String!
    assignedAgent: ID
    parentTask: ID
    dependencies: [ID!]!
    createdAt: String
    updatedAt: String
    tags: [String!]!
    metadata: JSON!
    relationships: [Relationship!]!
  }

  type Goal {
    id: ID!
    type: String!
    ownerId: ID!
    title: String!
    objective: String!
    priority: String!
    progress: Float!
    ownerAgent: ID
    createdAt: String
    updatedAt: String
    tags: [String!]!
    metadata: String!
    relationships: [Relationship!]!
  }

  type WorkflowStep {
    id: ID!
    action: String!
    agentId: ID
    toolId: ID
    verificationRequired: Boolean!
  }

  type Workflow {
    id: ID!
    type: String!
    ownerId: ID!
    name: String!
    trigger: String!
    status: String!
    steps: [WorkflowStep!]!
    createdAt: String
    updatedAt: String
    tags: [String!]!
    metadata: String!
    relationships: [Relationship!]!
  }

  type CognitiveStatus {
    ready: Boolean!
    maxcoreModelReady: Boolean!
    storageReady: Boolean!
    vectorSearch: Boolean!
    agentExecution: Boolean!
    toolExecution: Boolean!
    eventBus: Boolean!
    expansionManager: Boolean!
    memorySharding: Boolean!
    blockers: [String!]!
  }

  input CreateProjectInput {
    title: String!
    description: String
    genre: String
    bpm: Int
    key: String
    isStudioProject: Boolean
  }

  input CreateGoalInput {
    title: String!
    objective: String!
    priority: GoalPriority!
    progress: Float
    ownerAgent: ID
  }

  input CreateTaskInput {
    title: String!
    description: String
    assignedAgent: ID
    parentTask: ID
    dependencies: [ID!]
  }

  input SpawnAgentInput {
    name: String!
    specialty: String!
    departmentId: ID
    objectives: [String!]
    capabilities: [String!]
  }

  input CreateDepartmentInput {
    name: String!
    leadAgent: ID
    members: [ID!]
    objectives: [String!]
  }

  input AddMemoryInput {
    memoryType: MemoryType!
    content: String!
    confidence: Float
    importance: Float
    source: String!
  }

  input CreateWorkflowStepInput {
    id: String!
    action: String!
    agentId: ID
    toolId: ID
    verificationRequired: Boolean!
  }

  input CreateWorkflowInput {
    name: String!
    trigger: String!
    steps: [CreateWorkflowStepInput!]!
  }

  enum GoalPriority {
    low
    medium
    high
    critical
  }

  enum MemoryType {
    working
    episodic
    semantic
    project
    system
  }

  type Query {
    project(id: ID!): Project
    memory(id: ID!): Memory
    agent(id: ID!): Agent
    task(id: ID!): Task
    goal(id: ID!): Goal
    workflow(id: ID!): Workflow
    department(id: ID!): Department
    status: CognitiveStatus!
  }

  type Mutation {
    createProject(input: CreateProjectInput!): Project!
    createGoal(input: CreateGoalInput!): Goal!
    createTask(input: CreateTaskInput!): Task!
    spawnAgent(input: SpawnAgentInput!): Agent!
    createDepartment(input: CreateDepartmentInput!): Department!
    addMemory(input: AddMemoryInput!): Memory!
    createWorkflow(input: CreateWorkflowInput!): Workflow!
  }
`);

const jsonScalar = schema.getType("JSON");
if (!(jsonScalar instanceof GraphQLScalarType)) {
  throw new Error("MaxCore GraphQL JSON scalar failed to initialize.");
}
jsonScalar.serialize = (value) => value;
jsonScalar.parseValue = (value) => value;
jsonScalar.parseLiteral = (node) =>
  node.kind === Kind.NULL ? null : valueFromASTUntyped(node);

type GraphqlContext = {
  ownerId: string;
  role: string;
};

type CognitiveRow = {
  id: string;
  ownerId: string;
  entityType: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

function json(value: unknown): unknown {
  return value ?? {};
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

function omitNullInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null),
  );
}

async function mapEntity(
  ownerId: string,
  id: string,
  expectedType: string,
): Promise<Record<string, unknown> | null> {
  const row = await getCognitiveEntity(ownerId, id) as CognitiveRow | null;
  if (!row || row.entityType !== expectedType) return null;
  const relationships = await listCognitiveRelationships(ownerId, {
    entityId: id,
    limit: 50,
  });
  return {
    ...(row.payload ?? {}),
    id: row.id,
    type: row.entityType,
    ownerId: row.ownerId,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
    tags: row.tags ?? [],
    metadata: json(row.metadata),
    relationships,
  };
}

function mapProject(ownerId: string, project: Record<string, unknown>): Record<string, unknown> {
  return {
    id: project.id,
    type: "project",
    ownerId,
    name: project.title,
    description: project.description ?? "",
    status: project.status ?? "unknown",
    genre: project.genre ?? null,
    bpm: project.bpm ?? null,
    key: project.key ?? null,
    createdAt: isoDate(project.createdAt),
    updatedAt: isoDate(project.updatedAt),
    tags: project.tags ?? [],
    metadata: json(project.metadata),
    relationships: [],
    goals: [],
    agents: [],
    tasks: [],
    documents: [],
  };
}

function safeResolver<TArgs extends Record<string, unknown>>(
  operation: string,
  resolve: (args: TArgs, context: GraphqlContext) => Promise<unknown>,
) {
  return async (args: TArgs, context: GraphqlContext) => {
    try {
      return await resolve(args, context);
    } catch (error) {
      if (error instanceof CognitiveStoreError) {
        throw new GraphQLError(error.message, {
          extensions: { code: error.code, httpStatus: error.statusCode },
        });
      }
      logger.warn(
        {
          operation,
          errorClass: error instanceof Error ? error.name : "unknown",
        },
        "MaxCore GraphQL operation failed",
      );
      throw new GraphQLError("MaxCore cognitive operation is unavailable.", {
        extensions: { code: "COGNITIVE_STORAGE_UNAVAILABLE", httpStatus: 503 },
      });
    }
  };
}

const rootValue = {
  project: safeResolver<{ id: string }>("graphql-project", async ({ id }, context) => {
    const project = await getUserProject(context.ownerId, id);
    return project ? mapProject(context.ownerId, project as unknown as Record<string, unknown>) : null;
  }),
  memory: safeResolver<{ id: string }>("graphql-memory", ({ id }, context) =>
    mapEntity(context.ownerId, id, "memory")),
  agent: safeResolver<{ id: string }>("graphql-agent", ({ id }, context) =>
    mapEntity(context.ownerId, id, "agent")),
  task: safeResolver<{ id: string }>("graphql-task", ({ id }, context) =>
    mapEntity(context.ownerId, id, "task")),
  goal: safeResolver<{ id: string }>("graphql-goal", ({ id }, context) =>
    mapEntity(context.ownerId, id, "goal")),
  workflow: safeResolver<{ id: string }>("graphql-workflow", ({ id }, context) =>
    mapEntity(context.ownerId, id, "workflow")),
  department: safeResolver<{ id: string }>("graphql-department", ({ id }, context) =>
    mapEntity(context.ownerId, id, "department")),
  status: safeResolver<Record<string, never>>("graphql-status", async (_args, _context) => {
    const [capabilities, maxcoreModelReady] = await Promise.all([
      getCognitiveCapabilities(),
      MaxCoreAIClient.isAvailable(),
    ]);
    return {
      ready: capabilities.storageReady && maxcoreModelReady,
      maxcoreModelReady,
      storageReady: capabilities.storageReady,
      vectorSearch: capabilities.vectorSearch,
      agentExecution: capabilities.agentExecution && maxcoreModelReady,
      toolExecution: capabilities.toolExecution,
      eventBus: capabilities.eventBus,
      expansionManager: capabilities.expansionManager,
      memorySharding: capabilities.memorySharding,
      blockers: [
        ...(!capabilities.storageReady ? ["cognitive_storage_unavailable"] : []),
        ...(!maxcoreModelReady ? ["maxcore_model_or_awareness_not_ready"] : []),
      ],
    };
  }),
  createProject: safeResolver<{ input: Record<string, unknown> }>(
    "graphql-create-project",
    async ({ input }, context) => {
      const project = await createUserProject(context.ownerId, omitNullInput(input));
      return mapProject(context.ownerId, project as unknown as Record<string, unknown>);
    },
  ),
  createGoal: safeResolver<{ input: Record<string, unknown> }>(
    "graphql-create-goal",
    async ({ input }, context) => {
      const row = await createCognitiveEntity(context.ownerId, context.role, {
        type: "goal",
        data: omitNullInput(input),
      }) as CognitiveRow;
      return mapEntity(context.ownerId, row.id, "goal");
    },
  ),
  createTask: safeResolver<{ input: Record<string, unknown> }>(
    "graphql-create-task",
    async ({ input }, context) => {
      const row = await createCognitiveEntity(context.ownerId, context.role, {
        type: "task",
        data: { status: "pending", ...omitNullInput(input) },
      }) as CognitiveRow;
      return mapEntity(context.ownerId, row.id, "task");
    },
  ),
  spawnAgent: safeResolver<{ input: Record<string, unknown> }>(
    "graphql-spawn-agent",
    async ({ input }, context) => {
      const row = await createCognitiveEntity(context.ownerId, context.role, {
        type: "agent",
        data: {
          ...omitNullInput(input),
          status: "offline",
          tools: [],
          memoryIds: [],
          childAgents: [],
        },
      }) as CognitiveRow;
      return mapEntity(context.ownerId, row.id, "agent");
    },
  ),
  createDepartment: safeResolver<{ input: Record<string, unknown> }>(
    "graphql-create-department",
    async ({ input }, context) => {
      const row = await createCognitiveEntity(context.ownerId, context.role, {
        type: "department",
        data: omitNullInput(input),
      }) as CognitiveRow;
      return mapEntity(context.ownerId, row.id, "department");
    },
  ),
  addMemory: safeResolver<{ input: Record<string, unknown> }>(
    "graphql-add-memory",
    async ({ input }, context) => {
      const row = await createCognitiveEntity(context.ownerId, context.role, {
        type: "memory",
        data: omitNullInput(input),
      }) as CognitiveRow;
      return mapEntity(context.ownerId, row.id, "memory");
    },
  ),
  createWorkflow: safeResolver<{ input: Record<string, unknown> }>(
    "graphql-create-workflow",
    async ({ input }, context) => {
      const row = await createCognitiveEntity(context.ownerId, context.role, {
        type: "workflow",
        data: omitNullInput(input),
      }) as CognitiveRow;
      return mapEntity(context.ownerId, row.id, "workflow");
    },
  ),
};

const boundedOperationRule: ValidationRule = (context) => {
  let fieldCount = 0;
  let fieldDepth = 0;
  let fieldLimitReported = false;
  let depthLimitReported = false;
  const fragmentsReported = new Set<string>();
  return {
    OperationDefinition(node) {
      if (node.operation === "mutation" && node.selectionSet.selections.length > 1) {
        context.reportError(new GraphQLError(
          "A GraphQL mutation may contain only one top-level write.",
          { nodes: node },
        ));
      }
    },
    Field: {
      enter(node) {
        fieldCount += 1;
        fieldDepth += 1;
        if (fieldCount > MAX_FIELDS && !fieldLimitReported) {
          fieldLimitReported = true;
          context.reportError(new GraphQLError(
            `GraphQL operation exceeds the ${MAX_FIELDS}-field limit.`,
            { nodes: node },
          ));
        }
        if (fieldDepth > MAX_DEPTH && !depthLimitReported) {
          depthLimitReported = true;
          context.reportError(new GraphQLError(
            `GraphQL operation exceeds the ${MAX_DEPTH}-level depth limit.`,
            { nodes: node },
          ));
        }
      },
      leave() {
        fieldDepth -= 1;
      },
    },
    FragmentDefinition(node) {
      if (!fragmentsReported.has(node.name.value)) {
        fragmentsReported.add(node.name.value);
        context.reportError(new GraphQLError(
          "GraphQL fragments are not supported by this bounded API.",
          { nodes: node },
        ));
      }
    },
    FragmentSpread(node) {
      context.reportError(new GraphQLError(
        "GraphQL fragments are not supported by this bounded API.",
        { nodes: node },
      ));
    },
  };
};

const router = Router();
router.use(requireAuthOnly);

router.post("/", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ errors: [{ message: "A GraphQL request object is required." }] });
    return;
  }
  if (typeof body.query !== "string" || !body.query.trim()) {
    res.status(400).json({ errors: [{ message: "A GraphQL query is required." }] });
    return;
  }
  if (Buffer.byteLength(body.query, "utf8") > MAX_QUERY_BYTES) {
    res.status(413).json({ errors: [{ message: `GraphQL query exceeds ${MAX_QUERY_BYTES} bytes.` }] });
    return;
  }
  if (
    body.variables !== undefined &&
    (!body.variables || typeof body.variables !== "object" || Array.isArray(body.variables))
  ) {
    res.status(400).json({ errors: [{ message: "GraphQL variables must be an object." }] });
    return;
  }
  if (body.variables !== undefined &&
      Buffer.byteLength(JSON.stringify(body.variables), "utf8") > MAX_VARIABLE_BYTES) {
    res.status(413).json({ errors: [{ message: `GraphQL variables exceed ${MAX_VARIABLE_BYTES} bytes.` }] });
    return;
  }
  if (
    body.operationName !== undefined &&
    (typeof body.operationName !== "string" || body.operationName.length > 128)
  ) {
    res.status(400).json({ errors: [{ message: "Invalid GraphQL operation name." }] });
    return;
  }

  try {
    const document = parse(body.query);
    const validationErrors = validate(schema, document, [
      ...specifiedRules,
      boundedOperationRule,
    ]);
    if (validationErrors.length > 0) {
      res.status(400).json({ errors: validationErrors.map((error) => ({
        message: error.message,
        ...(error.locations ? { locations: error.locations } : {}),
      })) });
      return;
    }
    const result = await execute({
      schema,
      document,
      rootValue,
      contextValue: {
        ownerId: req.user!.id,
        role: String(req.user!.role ?? "user"),
      } satisfies GraphqlContext,
      variableValues: body.variables as Record<string, unknown> | undefined,
      operationName: body.operationName as string | undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof GraphQLError) {
      res.status(400).json({ errors: [{ message: error.message }] });
      return;
    }
    logger.warn(
      { operation: "maxcore-cognitive-graphql", errorClass: error instanceof Error ? error.name : "unknown" },
      "MaxCore GraphQL request could not be processed",
    );
    res.status(400).json({ errors: [{ message: "Invalid GraphQL request." }] });
  }
});

export default router;
