import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { logger } from "../logger.js";
import {
  maxcoreCognitiveEntities,
  maxcoreCognitiveRelationships,
  projects,
} from "@shared/schema";
import { db } from "../db.js";
import { storage } from "../storage.js";
import {
  isReady as isRealtimePubSubReady,
  publishUserNotification,
} from "../realtime/redisPubSub.js";

export const COGNITIVE_ENTITY_TYPES = [
  "project",
  "goal",
  "task",
  "agent",
  "department",
  "memory",
  "tool",
  "workflow",
  "document",
  "knowledge_node",
  "event",
] as const;

export const COGNITIVE_RELATION_TYPES = [
  "depends_on",
  "created_by",
  "assigned_to",
  "related_to",
  "improves",
  "blocks",
  "supports",
  "owns",
  "contains",
] as const;

export type CognitiveEntityType = (typeof COGNITIVE_ENTITY_TYPES)[number];
export type CognitiveRelationType = (typeof COGNITIVE_RELATION_TYPES)[number];

const shortText = (max: number) => z.string().trim().min(1).max(max);
const ids = z.array(z.string().uuid()).max(200);
const optionalId = z.string().uuid().optional();
const percent = z.number().finite().min(0).max(100);
const score = z.number().finite().min(0).max(1);
const objectData = z.record(z.string(), z.unknown());
const RUNTIME_METADATA_KEY = "maxcoreRuntime";
const EXPANSION_METADATA_KEY = "maxcoreExpansion";
const AGENT_TASK_LEASE_MS = 11 * 60 * 1_000;
const TASK_BACKLOG_EXPANSION_RULE = "pending-task-load-v1";
const TASK_BACKLOG_EXPANSION_THRESHOLD = 50;
const MAX_AUTO_EXPANSION_AGENTS = 8;

const entityDataSchemas: Record<CognitiveEntityType, z.ZodTypeAny> = {
  project: z.object({
    name: shortText(160),
    description: z.string().max(4000).optional(),
    status: z.enum(["planning", "active", "paused", "completed"]),
    goals: ids.default([]),
    agents: ids.default([]),
    tasks: ids.default([]),
    documents: ids.default([]),
  }).strict(),
  goal: z.object({
    title: shortText(160),
    objective: shortText(2000),
    priority: z.enum(["low", "medium", "high", "critical"]),
    progress: percent.default(0),
    ownerAgent: optionalId,
  }).strict(),
  task: z.object({
    title: shortText(160),
    description: z.string().max(4000).optional(),
    status: z.enum(["pending", "active", "blocked", "complete"]),
    assignedAgent: optionalId,
    parentTask: optionalId,
    dependencies: ids.default([]),
  }).strict(),
  // Records are not execution: until a real isolated agent runtime is wired,
  // newly registered agents must remain offline.
  agent: z.object({
    name: shortText(120),
    specialty: shortText(160),
    departmentId: optionalId,
    status: z.literal("offline").default("offline"),
    tools: z.array(shortText(80)).max(40).default([]),
    memoryIds: ids.default([]),
    childAgents: ids.default([]),
    capabilities: z.array(shortText(120)).max(60).default([]),
    objectives: z.array(shortText(300)).max(30).default([]),
  }).strict(),
  department: z.object({
    name: shortText(160),
    leadAgent: optionalId,
    members: ids.default([]),
    objectives: z.array(shortText(300)).max(50).default([]),
  }).strict(),
  memory: z.object({
    memoryType: z.enum(["working", "episodic", "semantic", "project", "system"]),
    content: shortText(20_000),
    // The current app has no verified embedding model/index. Null is explicit.
    embeddingId: z.null().default(null),
    confidence: score.default(0.5),
    importance: score.default(0.5),
    source: shortText(200),
  }).strict(),
  tool: z.object({
    name: z.enum([
      "filesystem",
      "web_search",
      "code_execution",
      "project_editor",
      "database",
      "terminal",
      "document_reader",
    ]),
    category: shortText(100),
    permissions: z.array(shortText(80)).max(30).default([]),
    // Merely registering an arbitrary tool does not make it safe to execute.
    enabled: z.literal(false).default(false),
  }).strict(),
  workflow: z.object({
    name: shortText(160),
    trigger: shortText(300),
    steps: z.array(z.object({
      id: shortText(80),
      action: shortText(160),
      agentId: optionalId,
      toolId: optionalId,
      verificationRequired: z.boolean(),
    }).strict()).max(100),
    status: z.literal("draft").default("draft"),
  }).strict(),
  document: z.object({
    title: shortText(240),
    contentType: shortText(120),
    storageRef: shortText(512),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  }).strict(),
  knowledge_node: z.object({
    title: shortText(240),
    content: shortText(20_000),
    category: shortText(120),
    confidence: score.default(0.5),
  }).strict(),
  event: z.object({
    eventType: z.enum([
      "memory_created",
      "task_created",
      "task_execution_started",
      "task_execution_recovered",
      "task_execution_completed",
      "task_execution_failed",
      "goal_completed",
      "agent_spawned",
      "agent_registered",
      "project_updated",
      "workflow_executed",
      "tool_completed",
      "cognitive_entity_created",
      "cognitive_entity_updated",
    ]),
    sourceId: z.string().uuid(),
    targetId: optionalId,
    payload: objectData,
  }).strict(),
};

const createEnvelope = z.object({
  type: z.enum(COGNITIVE_ENTITY_TYPES),
  data: objectData,
  tags: z.array(shortText(64)).max(30).default([]),
  metadata: objectData.default({}),
}).strict();

const updateEnvelope = z.object({
  data: objectData.optional(),
  tags: z.array(shortText(64)).max(30).optional(),
  metadata: objectData.optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be updated.",
);

const relationshipEnvelope = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  relationType: z.enum(COGNITIVE_RELATION_TYPES),
  metadata: objectData.default({}),
}).strict().refine((value) => value.sourceId !== value.targetId, {
  message: "An entity cannot relate to itself.",
  path: ["targetId"],
});
const productProjectInput = z.object({
  title: shortText(160),
  description: z.string().max(4000).default(""),
  genre: z.string().trim().max(80).optional(),
  bpm: z.number().int().min(40).max(300).optional(),
  key: z.string().trim().max(12).optional(),
  isStudioProject: z.boolean().default(false),
  metadata: objectData.default({}),
}).strict();

const metadataSizeLimit = 8 * 1024;
const entityPayloadSizeLimit = 48 * 1024;

export class CognitiveStoreError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "CognitiveStoreError";
  }
}

function serializedSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function validateSize(value: unknown, maxBytes: number, label: string): void {
  let size: number;
  try {
    size = serializedSize(value);
  } catch {
    throw new CognitiveStoreError(`${label} must be JSON serializable.`, 400, "INVALID_JSON");
  }
  if (size > maxBytes) {
    throw new CognitiveStoreError(`${label} exceeds the ${maxBytes}-byte limit.`, 413, "PAYLOAD_TOO_LARGE");
  }
}

export function parseCognitiveEntityInput(input: unknown, role: string) {
  const envelope = createEnvelope.safeParse(input);
  if (!envelope.success) {
    throw new CognitiveStoreError("Invalid cognitive entity.", 400, "INVALID_ENTITY");
  }
  if (envelope.data.type === "event") {
    throw new CognitiveStoreError(
      "Event records are emitted by the MaxCore runtime and are not client-writable.",
      403,
      "EVENT_SYSTEM_MANAGED",
    );
  }
  const parsedData = entityDataSchemas[envelope.data.type].safeParse(envelope.data.data);
  if (!parsedData.success) {
    throw new CognitiveStoreError("Entity data does not match its declared type.", 400, "INVALID_ENTITY_DATA");
  }
  const typedData = parsedData.data as Record<string, unknown>;
  if (
    Object.hasOwn(envelope.data.metadata, RUNTIME_METADATA_KEY) ||
    Object.hasOwn(envelope.data.metadata, EXPANSION_METADATA_KEY)
  ) {
    throw new CognitiveStoreError(
      "Runtime-managed metadata cannot be supplied by clients.",
      400,
      "RESERVED_METADATA",
    );
  }
  if (envelope.data.type === "task" && typedData.status !== "pending") {
    throw new CognitiveStoreError(
      "New tasks must start pending; execution status is runtime-managed.",
      400,
      "TASK_STATUS_RUNTIME_MANAGED",
    );
  }
  if (
    envelope.data.type === "memory" &&
    typedData.memoryType === "system" &&
    role !== "admin"
  ) {
    throw new CognitiveStoreError("System memories require administrator access.", 403, "ADMIN_REQUIRED");
  }
  validateSize(parsedData.data, entityPayloadSizeLimit, "Entity data");
  validateSize(envelope.data.metadata, metadataSizeLimit, "Metadata");
  return {
    ...envelope.data,
    data: typedData,
  };
}

export function desiredAutoAgentCount(openTaskCount: number): number {
  if (!Number.isSafeInteger(openTaskCount) || openTaskCount <= TASK_BACKLOG_EXPANSION_THRESHOLD) {
    return 0;
  }
  return Math.min(
    MAX_AUTO_EXPANSION_AGENTS,
    Math.ceil((openTaskCount - TASK_BACKLOG_EXPANSION_THRESHOLD) / TASK_BACKLOG_EXPANSION_THRESHOLD),
  );
}

export function buildCognitiveSearchText(
  type: CognitiveEntityType,
  data: Record<string, unknown>,
  tags: string[],
): string {
  const parts = [type, ...tags];
  let characters = parts.reduce((total, part) => total + part.length, 0);
  const visit = (value: unknown, depth: number): void => {
    if (depth > 5 || characters >= 20_000) return;
    if (typeof value === "string") {
      const part = value.slice(0, Math.max(0, 20_000 - characters));
      parts.push(part);
      characters += part.length;
    }
    else if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1));
    else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach((item) => visit(item, depth + 1));
    }
  };
  visit(data, 0);
  return parts.join(" ").slice(0, 20_000);
}

function isMissingRegistry(error: unknown): boolean {
  return !!error && typeof error === "object" &&
    "code" in error && (error as { code?: unknown }).code === "42P01";
}

function asUnavailable(error: unknown): never {
  if (isMissingRegistry(error)) {
    throw new CognitiveStoreError(
      "MaxCore cognitive storage migration is required.",
      503,
      "COGNITIVE_SCHEMA_NOT_READY",
    );
  }
  throw new CognitiveStoreError(
    "MaxCore cognitive storage is unavailable.",
    503,
    "COGNITIVE_STORAGE_UNAVAILABLE",
  );
}

function lifecycleEventType(entityType: CognitiveEntityType): string {
  switch (entityType) {
    case "memory": return "memory_created";
    case "task": return "task_created";
    case "agent": return "agent_registered";
    case "goal": return "goal_created";
    case "project": return "project_updated";
    case "workflow": return "workflow_created";
    case "department": return "department_created";
    case "tool": return "tool_registered";
    case "document": return "document_created";
    case "knowledge_node": return "knowledge_created";
    case "event": return "event_created";
  }
}

async function notifyCognitiveEvent(
  ownerId: string,
  eventId: string,
  eventType: string,
): Promise<void> {
  if (!isRealtimePubSubReady()) return;
  try {
    await publishUserNotification(ownerId, {
      type: "maxcore_cognitive_event",
      eventId,
      eventType,
    });
  } catch (error) {
    logger.warn(
      {
        eventType,
        errorClass: error instanceof Error ? error.name : "unknown",
      },
      "MaxCore event is durable; realtime notification delivery failed",
    );
  }
}

export async function createCognitiveEntity(
  ownerId: string,
  role: string,
  input: unknown,
) {
  const value = parseCognitiveEntityInput(input, role);
  try {
    const created = await db.transaction(async (tx) => {
      const [entity] = await tx
        .insert(maxcoreCognitiveEntities)
        .values({
          ownerId,
          entityType: value.type,
          payload: value.data,
          tags: value.tags,
          metadata: value.metadata,
          searchText: buildCognitiveSearchText(value.type, value.data, value.tags),
        })
        .returning();
      if (!entity) asUnavailable(new Error("insert returned no row"));
      const eventType = lifecycleEventType(value.type);
      const eventId = await appendEvent(tx, ownerId, eventType, entity.id, undefined, {
        entityType: value.type,
      });
      const notifications = [{ eventId, eventType }];
      let resultEntity = entity;

      if (value.type === "task") {
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(hashtextextended(${`maxcore-expansion:${ownerId}`}, 0))
        `);
        const [backlogRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(maxcoreCognitiveEntities)
          .where(and(
            eq(maxcoreCognitiveEntities.ownerId, ownerId),
            eq(maxcoreCognitiveEntities.entityType, "task"),
            sql`${maxcoreCognitiveEntities.payload}->>'status' IN ('pending', 'blocked')`,
          ));
        const backlog = Number(backlogRow?.count ?? 0);
        const [autoAgents, desiredCount] = await Promise.all([
          tx
            .select({ id: maxcoreCognitiveEntities.id })
            .from(maxcoreCognitiveEntities)
            .where(and(
              eq(maxcoreCognitiveEntities.ownerId, ownerId),
              eq(maxcoreCognitiveEntities.entityType, "agent"),
              sql`${maxcoreCognitiveEntities.metadata}->'maxcoreExpansion'->>'ruleId' = ${TASK_BACKLOG_EXPANSION_RULE}`,
            )),
          Promise.resolve(desiredAutoAgentCount(backlog)),
        ]);
        const spawnCount = Math.max(0, desiredCount - autoAgents.length);
        const spawnedAgentIds: string[] = [];
        for (let index = 0; index < spawnCount; index += 1) {
          const ordinal = autoAgents.length + index + 1;
          const agentPayload = {
            name: `Task Queue Specialist ${ordinal}`,
            specialty: "maxcore_task_queue",
            departmentId: null,
            status: "offline",
            tools: [],
            memoryIds: [],
            childAgents: [],
            capabilities: ["maxcore_text_task_execution"],
            objectives: ["Complete owner-assigned pending MaxCore tasks using verified serving capabilities."],
          };
          const agentMetadata = {
            [EXPANSION_METADATA_KEY]: {
              ruleId: TASK_BACKLOG_EXPANSION_RULE,
              ordinal,
              triggerBacklog: backlog,
              createdAt: new Date().toISOString(),
            },
          };
          const [agent] = await tx
            .insert(maxcoreCognitiveEntities)
            .values({
              ownerId,
              entityType: "agent",
              payload: agentPayload,
              tags: ["auto-expanded", "task-queue"],
              metadata: agentMetadata,
              searchText: buildCognitiveSearchText("agent", agentPayload, ["auto-expanded", "task-queue"]),
            })
            .returning({ id: maxcoreCognitiveEntities.id });
          if (!agent) asUnavailable(new Error("expanded agent insert returned no row"));
          spawnedAgentIds.push(agent.id);
          const spawnedEventId = await appendEvent(
            tx,
            ownerId,
            "agent_spawned",
            entity.id,
            agent.id,
            {
              ruleId: TASK_BACKLOG_EXPANSION_RULE,
              backlog,
              ordinal,
              executionState: "offline",
            },
          );
          notifications.push({ eventId: spawnedEventId, eventType: "agent_spawned" });
        }
        if (spawnedAgentIds.length > 0) {
          const metadata = {
            ...recordValue(entity.metadata),
            [EXPANSION_METADATA_KEY]: {
              ruleId: TASK_BACKLOG_EXPANSION_RULE,
              backlog,
              spawnedAgentIds,
              createdAt: new Date().toISOString(),
            },
          };
          const [updatedTask] = await tx
            .update(maxcoreCognitiveEntities)
            .set({ metadata, updatedAt: new Date() })
            .where(and(
              eq(maxcoreCognitiveEntities.ownerId, ownerId),
              eq(maxcoreCognitiveEntities.id, entity.id),
            ))
            .returning();
          if (!updatedTask) asUnavailable(new Error("expanded task metadata update returned no row"));
          resultEntity = updatedTask;
        }
      }
      return { entity: resultEntity, notifications };
    });
    for (const notification of created.notifications) {
      await notifyCognitiveEvent(ownerId, notification.eventId, notification.eventType);
    }
    return created.entity;
  } catch (error) {
    if (error instanceof CognitiveStoreError) throw error;
    return asUnavailable(error);
  }
}

type AgentTaskClaim = {
  runId: string;
  ownerId: string;
  taskId: string;
  agentId: string;
  title: string;
  description: string;
  agentName: string;
  specialty: string;
  objectives: string[];
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function assertCognitiveEntityMutationAllowed(
  entityType: CognitiveEntityType,
  payload: unknown,
  operation: "update" | "delete",
  hasActiveTaskAssignments = false,
): void {
  const data = recordValue(payload);
  if (entityType === "event") {
    throw new CognitiveStoreError("Event records are append-only.", 409, "EVENT_IMMUTABLE");
  }
  if (entityType === "task" && data.status === "active") {
    throw new CognitiveStoreError(
      operation === "update"
        ? "Running tasks cannot be changed until execution settles."
        : "Running tasks cannot be deleted until execution settles.",
      409,
      "TASK_EXECUTION_IN_PROGRESS",
    );
  }
  if (
    entityType === "agent" &&
    (data.status === "busy" || hasActiveTaskAssignments)
  ) {
    throw new CognitiveStoreError(
      operation === "update"
        ? "Agents assigned to running tasks cannot be changed."
        : "Agents assigned to running tasks cannot be deleted.",
      409,
      "AGENT_EXECUTION_IN_PROGRESS",
    );
  }
}

async function appendEvent(
  executor: Pick<typeof db, "insert">,
  ownerId: string,
  eventType: string,
  sourceId: string,
  targetId: string | undefined,
  payload: Record<string, unknown>,
): Promise<string> {
  const eventData = { eventType, sourceId, ...(targetId ? { targetId } : {}), payload };
  const [event] = await executor
    .insert(maxcoreCognitiveEntities)
    .values({
      ownerId,
      entityType: "event",
      payload: eventData,
      tags: [],
      metadata: {},
      searchText: buildCognitiveSearchText("event", eventData, []),
    })
    .returning({ id: maxcoreCognitiveEntities.id });
  if (!event) asUnavailable(new Error("event insert returned no row"));
  return event.id;
}

export async function claimAgentTask(
  ownerId: string,
  taskId: string,
  retryBlocked: boolean,
): Promise<AgentTaskClaim> {
  const now = new Date();
  const runId = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + AGENT_TASK_LEASE_MS);
  try {
    return await db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, ownerId),
          eq(maxcoreCognitiveEntities.id, taskId),
          eq(maxcoreCognitiveEntities.entityType, "task"),
        ))
        .limit(1)
        .for("update");
      if (!task) {
        throw new CognitiveStoreError("Task not found.", 404, "TASK_NOT_FOUND");
      }
      const taskData = recordValue(task.payload);
      const taskStatus = taskData.status;
      const currentRuntime = recordValue(recordValue(task.metadata)[RUNTIME_METADATA_KEY]);
      const currentLease = typeof currentRuntime.leaseExpiresAt === "string"
        ? Date.parse(currentRuntime.leaseExpiresAt)
        : Number.NaN;
      const taskUpdatedAt = task.updatedAt instanceof Date
        ? task.updatedAt.getTime()
        : Date.parse(String(task.updatedAt));
      const expiredActiveRun = taskStatus === "active" &&
        (
          (Number.isFinite(currentLease) && currentLease <= now.getTime()) ||
          (!Number.isFinite(currentLease) && Number.isFinite(taskUpdatedAt) &&
            taskUpdatedAt + AGENT_TASK_LEASE_MS <= now.getTime())
        );
      if (taskStatus === "complete") {
        throw new CognitiveStoreError("Completed tasks cannot be re-executed.", 409, "TASK_ALREADY_COMPLETE");
      }
      if (taskStatus === "active" && !expiredActiveRun) {
        throw new CognitiveStoreError("Task execution is already in progress.", 409, "TASK_ALREADY_RUNNING");
      }
      if (taskStatus === "blocked" && !retryBlocked) {
        throw new CognitiveStoreError(
          "Blocked tasks require an explicit retry.",
          409,
          "TASK_RETRY_REQUIRED",
        );
      }
      if (taskStatus !== "pending" && taskStatus !== "blocked" && !expiredActiveRun) {
        throw new CognitiveStoreError("Task is not in an executable state.", 409, "TASK_NOT_EXECUTABLE");
      }

      const assignedAgent = taskData.assignedAgent;
      if (typeof assignedAgent !== "string") {
        throw new CognitiveStoreError("Assign an agent before executing this task.", 409, "TASK_AGENT_REQUIRED");
      }
      const [agent] = await tx
        .select()
        .from(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, ownerId),
          eq(maxcoreCognitiveEntities.id, assignedAgent),
          eq(maxcoreCognitiveEntities.entityType, "agent"),
        ))
        .limit(1)
        .for("update");
      if (!agent) {
        throw new CognitiveStoreError("Assigned agent not found.", 409, "TASK_AGENT_NOT_FOUND");
      }

      const dependencies = Array.isArray(taskData.dependencies)
        ? taskData.dependencies.filter((id): id is string => typeof id === "string")
        : [];
      if (dependencies.length) {
        const dependencyRows = await tx
          .select({ id: maxcoreCognitiveEntities.id, payload: maxcoreCognitiveEntities.payload })
          .from(maxcoreCognitiveEntities)
          .where(and(
            eq(maxcoreCognitiveEntities.ownerId, ownerId),
            eq(maxcoreCognitiveEntities.entityType, "task"),
            inArray(maxcoreCognitiveEntities.id, dependencies),
          ));
        if (dependencyRows.length !== dependencies.length) {
          throw new CognitiveStoreError(
            "One or more task dependencies are missing or not owned by this account.",
            409,
            "TASK_DEPENDENCY_NOT_FOUND",
          );
        }
        if (dependencyRows.some((row) => recordValue(row.payload).status !== "complete")) {
          throw new CognitiveStoreError(
            "All task dependencies must complete before execution.",
            409,
            "TASK_DEPENDENCIES_INCOMPLETE",
          );
        }
      }

      if (typeof taskData.parentTask === "string") {
        const [parent] = await tx
          .select({ id: maxcoreCognitiveEntities.id })
          .from(maxcoreCognitiveEntities)
          .where(and(
            eq(maxcoreCognitiveEntities.ownerId, ownerId),
            eq(maxcoreCognitiveEntities.id, taskData.parentTask),
            eq(maxcoreCognitiveEntities.entityType, "task"),
          ))
          .limit(1);
        if (!parent) {
          throw new CognitiveStoreError("Parent task not found.", 409, "TASK_PARENT_NOT_FOUND");
        }
      }

      const concurrentAgentTasks = await tx
        .select({ id: maxcoreCognitiveEntities.id })
        .from(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, ownerId),
          eq(maxcoreCognitiveEntities.entityType, "task"),
          sql`${maxcoreCognitiveEntities.payload}->>'assignedAgent' = ${assignedAgent}`,
          sql`${maxcoreCognitiveEntities.payload}->>'status' = 'active'`,
          sql`${maxcoreCognitiveEntities.id} <> ${taskId}`,
        ))
        .limit(1);
      if (concurrentAgentTasks.length) {
        throw new CognitiveStoreError("Assigned agent is busy with another task.", 409, "AGENT_BUSY");
      }

      const nextTaskPayload = { ...taskData, status: "active" };
      const attempt = Number(currentRuntime.attempt ?? 0) + 1;
      const nextTaskMetadata = {
        ...recordValue(task.metadata),
        [RUNTIME_METADATA_KEY]: {
          runId,
          attempt,
          startedAt: now.toISOString(),
          leaseExpiresAt: leaseExpiresAt.toISOString(),
          state: "running",
        },
      };
      await tx
        .update(maxcoreCognitiveEntities)
        .set({
          payload: nextTaskPayload,
          metadata: nextTaskMetadata,
          searchText: buildCognitiveSearchText("task", nextTaskPayload, task.tags ?? []),
          updatedAt: now,
        })
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, ownerId),
          eq(maxcoreCognitiveEntities.id, taskId),
        ));

      const agentData = { ...recordValue(agent.payload), status: "busy" };
      await tx
        .update(maxcoreCognitiveEntities)
        .set({
          payload: agentData,
          searchText: buildCognitiveSearchText("agent", agentData, agent.tags ?? []),
          updatedAt: now,
        })
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, ownerId),
          eq(maxcoreCognitiveEntities.id, agent.id),
        ));

      await appendEvent(
        tx,
        ownerId,
        expiredActiveRun ? "task_execution_recovered" : "task_execution_started",
        agent.id,
        taskId,
        {
          runId,
          attempt,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
        },
      );

      return {
        runId,
        ownerId,
        taskId,
        agentId: agent.id,
        title: String(taskData.title ?? ""),
        description: String(taskData.description ?? ""),
        agentName: String(recordValue(agent.payload).name ?? ""),
        specialty: String(recordValue(agent.payload).specialty ?? ""),
        objectives: Array.isArray(recordValue(agent.payload).objectives)
          ? (recordValue(agent.payload).objectives as unknown[]).filter(
              (item): item is string => typeof item === "string",
            ).slice(0, 20)
          : [],
      };
    });
  } catch (error) {
    if (error instanceof CognitiveStoreError) throw error;
    return asUnavailable(error);
  }
}

export async function completeAgentTask(
  claim: AgentTaskClaim,
  output: string,
  modelProvenance: { source: string; generationContract: string },
) {
  if (!output.trim() || output.length > 12_000) {
    throw new CognitiveStoreError("Agent task output is invalid or too large.", 422, "INVALID_AGENT_OUTPUT");
  }
  const completedAt = new Date();
  const outputHash = createHash("sha256").update(output).digest("hex");
  try {
    return await db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, claim.ownerId),
          eq(maxcoreCognitiveEntities.id, claim.taskId),
          eq(maxcoreCognitiveEntities.entityType, "task"),
        ))
        .limit(1)
        .for("update");
      if (!task) throw new CognitiveStoreError("Task not found.", 404, "TASK_NOT_FOUND");
      const runtime = recordValue(recordValue(task.metadata)[RUNTIME_METADATA_KEY]);
      if (runtime.runId !== claim.runId || recordValue(task.payload).status !== "active") {
        throw new CognitiveStoreError("Task execution lease is no longer current.", 409, "TASK_LEASE_LOST");
      }
      const resultPayload = {
        memoryType: "episodic",
        content: output,
        embeddingId: null,
        confidence: 0.5,
        importance: 0.5,
        source: "agent_task_execution",
      };
      validateSize(resultPayload, entityPayloadSizeLimit, "Agent result");
      const resultMetadata = {
        taskId: claim.taskId,
        agentId: claim.agentId,
        runId: claim.runId,
        model: modelProvenance,
      };
      validateSize(resultMetadata, metadataSizeLimit, "Agent result metadata");
      const [resultMemory] = await tx
        .insert(maxcoreCognitiveEntities)
        .values({
          ownerId: claim.ownerId,
          entityType: "memory",
          payload: resultPayload,
          tags: ["agent-result", "task-execution"],
          metadata: resultMetadata,
          searchText: buildCognitiveSearchText("memory", resultPayload, ["agent-result", "task-execution"]),
        })
        .returning({ id: maxcoreCognitiveEntities.id });
      if (!resultMemory) asUnavailable(new Error("agent result insert returned no row"));
      const taskPayload = { ...recordValue(task.payload), status: "complete" };
      const taskMetadata = {
        ...recordValue(task.metadata),
        [RUNTIME_METADATA_KEY]: {
          ...runtime,
          state: "complete",
          completedAt: completedAt.toISOString(),
          leaseExpiresAt: null,
          resultMemoryId: resultMemory.id,
          outputSha256: outputHash,
          outputLength: output.length,
          model: modelProvenance,
        },
      };
      await tx
        .update(maxcoreCognitiveEntities)
        .set({
          payload: taskPayload,
          metadata: taskMetadata,
          searchText: buildCognitiveSearchText("task", taskPayload, task.tags ?? []),
          updatedAt: completedAt,
        })
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, claim.ownerId),
          eq(maxcoreCognitiveEntities.id, claim.taskId),
        ));
      await tx
        .insert(maxcoreCognitiveRelationships)
        .values({
          ownerId: claim.ownerId,
          sourceId: resultMemory.id,
          targetId: claim.taskId,
          relationType: "supports",
          metadata: { runId: claim.runId },
        })
        .onConflictDoNothing();
      const [agent] = await tx
        .select()
        .from(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, claim.ownerId),
          eq(maxcoreCognitiveEntities.id, claim.agentId),
          eq(maxcoreCognitiveEntities.entityType, "agent"),
        ))
        .limit(1)
        .for("update");
      if (agent) {
        const agentPayload = { ...recordValue(agent.payload), status: "offline" };
        await tx
          .update(maxcoreCognitiveEntities)
          .set({
            payload: agentPayload,
            searchText: buildCognitiveSearchText("agent", agentPayload, agent.tags ?? []),
            updatedAt: completedAt,
          })
          .where(and(
            eq(maxcoreCognitiveEntities.ownerId, claim.ownerId),
            eq(maxcoreCognitiveEntities.id, claim.agentId),
          ));
      }
      await appendEvent(
        tx,
        claim.ownerId,
        "task_execution_completed",
        claim.agentId,
        claim.taskId,
        {
          runId: claim.runId,
          resultMemoryId: resultMemory.id,
          outputSha256: outputHash,
          outputLength: output.length,
          model: modelProvenance,
        },
      );
      return {
        task: { ...taskPayload, id: task.id },
        resultMemoryId: resultMemory.id,
        completedAt: completedAt.toISOString(),
      };
    });
  } catch (error) {
    if (error instanceof CognitiveStoreError) throw error;
    return asUnavailable(error);
  }
}

export async function failAgentTask(claim: AgentTaskClaim, errorCode: string) {
  const failedAt = new Date();
  const safeErrorCode = /^[A-Z0-9_]{1,64}$/.test(errorCode) ? errorCode : "AGENT_EXECUTION_FAILED";
  try {
    return await db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, claim.ownerId),
          eq(maxcoreCognitiveEntities.id, claim.taskId),
          eq(maxcoreCognitiveEntities.entityType, "task"),
        ))
        .limit(1)
        .for("update");
      if (!task) throw new CognitiveStoreError("Task not found.", 404, "TASK_NOT_FOUND");
      const runtime = recordValue(recordValue(task.metadata)[RUNTIME_METADATA_KEY]);
      if (runtime.runId !== claim.runId || recordValue(task.payload).status !== "active") {
        throw new CognitiveStoreError("Task execution lease is no longer current.", 409, "TASK_LEASE_LOST");
      }
      const taskPayload = { ...recordValue(task.payload), status: "blocked" };
      const taskMetadata = {
        ...recordValue(task.metadata),
        [RUNTIME_METADATA_KEY]: {
          ...runtime,
          state: "failed",
          failedAt: failedAt.toISOString(),
          leaseExpiresAt: null,
          errorCode: safeErrorCode,
        },
      };
      await tx
        .update(maxcoreCognitiveEntities)
        .set({
          payload: taskPayload,
          metadata: taskMetadata,
          searchText: buildCognitiveSearchText("task", taskPayload, task.tags ?? []),
          updatedAt: failedAt,
        })
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, claim.ownerId),
          eq(maxcoreCognitiveEntities.id, claim.taskId),
        ));
      const [agent] = await tx
        .select()
        .from(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, claim.ownerId),
          eq(maxcoreCognitiveEntities.id, claim.agentId),
          eq(maxcoreCognitiveEntities.entityType, "agent"),
        ))
        .limit(1)
        .for("update");
      if (agent) {
        const agentPayload = { ...recordValue(agent.payload), status: "offline" };
        await tx
          .update(maxcoreCognitiveEntities)
          .set({
            payload: agentPayload,
            searchText: buildCognitiveSearchText("agent", agentPayload, agent.tags ?? []),
            updatedAt: failedAt,
          })
          .where(and(
            eq(maxcoreCognitiveEntities.ownerId, claim.ownerId),
            eq(maxcoreCognitiveEntities.id, claim.agentId),
          ));
      }
      await appendEvent(
        tx,
        claim.ownerId,
        "task_execution_failed",
        claim.agentId,
        claim.taskId,
        { runId: claim.runId, errorCode: safeErrorCode },
      );
      return { taskId: claim.taskId, state: "blocked" as const, errorCode: safeErrorCode };
    });
  } catch (error) {
    if (error instanceof CognitiveStoreError) throw error;
    return asUnavailable(error);
  }
}

export async function createUserProject(ownerId: string, input: unknown) {
  const parsed = productProjectInput.safeParse(input);
  if (!parsed.success) {
    throw new CognitiveStoreError("Invalid project data.", 400, "INVALID_PROJECT");
  }
  validateSize(parsed.data.metadata, metadataSizeLimit, "Project metadata");
  try {
    return await storage.createProject({
      userId: ownerId,
      title: parsed.data.title,
      description: parsed.data.description,
      ...(parsed.data.genre ? { genre: parsed.data.genre } : {}),
      ...(parsed.data.bpm === undefined ? {} : { bpm: parsed.data.bpm }),
      ...(parsed.data.key ? { key: parsed.data.key } : {}),
      status: "draft",
      isStudioProject: parsed.data.isStudioProject,
      metadata: parsed.data.metadata,
    });
  } catch (error) {
    return asUnavailable(error);
  }
}

export async function searchUserProjects(
  ownerId: string,
  query: string,
  limit: number,
) {
  try {
    const recent = await db
      .select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        createdAt: projects.createdAt,
        genre: projects.genre,
        bpm: projects.bpm,
        key: projects.key,
        status: projects.status,
        workflowStage: projects.workflowStage,
        tags: projects.tags,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.userId, ownerId))
      .orderBy(desc(projects.updatedAt))
      .limit(100);
    const terms = query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const ranked = recent
      .map((project, position) => {
        const searchable = [
          project.title,
          project.description ?? "",
          project.genre ?? "",
          project.status ?? "",
          project.workflowStage ?? "",
          ...(project.tags ?? []),
        ].join(" ").toLocaleLowerCase();
        const relevance = terms.reduce(
          (total, term) => total + (searchable.includes(term) ? 1 : 0),
          0,
        );
        return { project, relevance, position };
      })
      .filter((item) => terms.length === 0 || item.relevance > 0)
      .sort((left, right) =>
        right.relevance - left.relevance || left.position - right.position,
      )
      .slice(0, Math.min(limit, 10));
    return ranked.map(({ project }) => project);
  } catch (error) {
    return asUnavailable(error);
  }
}

export async function listCognitiveEntities(
  ownerId: string,
  filters: { type?: CognitiveEntityType; query?: string; limit: number },
) {
  const conditions = [eq(maxcoreCognitiveEntities.ownerId, ownerId)];
  if (filters.type) {
    conditions.push(eq(maxcoreCognitiveEntities.entityType, filters.type));
  }
  const query = filters.query?.trim();
  const vector = sql`to_tsvector('simple', ${maxcoreCognitiveEntities.searchText})`;
  const queryTerms = query
    ? sql`websearch_to_tsquery('simple', ${query})`
    : null;
  if (query && queryTerms) conditions.push(sql`${vector} @@ ${queryTerms}`);

  try {
    const builder = db
      .select()
      .from(maxcoreCognitiveEntities)
      .where(and(...conditions));
    if (query && queryTerms) {
      return await builder
        .orderBy(
          sql`ts_rank_cd(${vector}, ${queryTerms}) DESC`,
          desc(maxcoreCognitiveEntities.updatedAt),
        )
        .limit(filters.limit);
    }
    return await builder
      .orderBy(desc(maxcoreCognitiveEntities.updatedAt))
      .limit(filters.limit);
  } catch (error) {
    return asUnavailable(error);
  }
}

export async function searchCognitiveGraphContext(
  ownerId: string,
  query: string,
  limit: number,
) {
  const matches = await listCognitiveEntities(ownerId, { query, limit });
  if (matches.length === 0) {
    return { matches, relationships: [], relatedEntities: [] };
  }
  try {
    const matchIds = matches.map((entity) => entity.id);
    const relationships = await db
      .select({
        id: maxcoreCognitiveRelationships.id,
        sourceId: maxcoreCognitiveRelationships.sourceId,
        targetId: maxcoreCognitiveRelationships.targetId,
        relationType: maxcoreCognitiveRelationships.relationType,
        createdAt: maxcoreCognitiveRelationships.createdAt,
      })
      .from(maxcoreCognitiveRelationships)
      .where(and(
        eq(maxcoreCognitiveRelationships.ownerId, ownerId),
        or(
          inArray(maxcoreCognitiveRelationships.sourceId, matchIds),
          inArray(maxcoreCognitiveRelationships.targetId, matchIds),
        ),
      ))
      .orderBy(desc(maxcoreCognitiveRelationships.createdAt))
      .limit(50);
    const matchedIds = new Set(matchIds);
    const relatedIds = [...new Set(
      relationships
        .flatMap((relationship) => [relationship.sourceId, relationship.targetId])
        .filter((id) => !matchedIds.has(id)),
    )].slice(0, 10);
    const relatedEntities = relatedIds.length
      ? await db
          .select()
          .from(maxcoreCognitiveEntities)
          .where(and(
            eq(maxcoreCognitiveEntities.ownerId, ownerId),
            inArray(maxcoreCognitiveEntities.id, relatedIds),
          ))
          .limit(10)
      : [];
    return { matches, relationships, relatedEntities };
  } catch (error) {
    return asUnavailable(error);
  }
}

export async function getCognitiveEntity(ownerId: string, id: string) {
  try {
    const [entity] = await db
      .select()
      .from(maxcoreCognitiveEntities)
      .where(and(
        eq(maxcoreCognitiveEntities.ownerId, ownerId),
        eq(maxcoreCognitiveEntities.id, id),
      ))
      .limit(1);
    return entity ?? null;
  } catch (error) {
    return asUnavailable(error);
  }
}

export async function updateCognitiveEntity(
  ownerId: string,
  role: string,
  id: string,
  input: unknown,
) {
  const patch = updateEnvelope.safeParse(input);
  if (!patch.success) {
    throw new CognitiveStoreError("Invalid cognitive entity update.", 400, "INVALID_ENTITY_UPDATE");
  }
  try {
    const updatedResult = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, ownerId),
          eq(maxcoreCognitiveEntities.id, id),
        ))
        .limit(1)
        .for("update");
      if (!current) return null;
      assertCognitiveEntityMutationAllowed(
        current.entityType as CognitiveEntityType,
        current.payload,
        "update",
      );
      const data = patch.data.data
        ? entityDataSchemas[current.entityType as CognitiveEntityType].safeParse(patch.data.data)
        : { success: true as const, data: current.payload };
      if (!data.success) {
        throw new CognitiveStoreError("Entity data does not match its declared type.", 400, "INVALID_ENTITY_DATA");
      }
      const typedData = data.data as Record<string, unknown>;
      if (
        current.entityType === "task" &&
        typedData.status !== recordValue(current.payload).status
      ) {
        throw new CognitiveStoreError(
          "Task execution status is controlled by the agent runtime.",
          409,
          "TASK_STATUS_RUNTIME_MANAGED",
        );
      }
      if (
        patch.data.metadata &&
        (
          Object.hasOwn(patch.data.metadata, RUNTIME_METADATA_KEY) ||
          Object.hasOwn(patch.data.metadata, EXPANSION_METADATA_KEY)
        )
      ) {
        throw new CognitiveStoreError(
          "Runtime-managed metadata cannot be changed by clients.",
          400,
          "RESERVED_METADATA",
        );
      }
      if (
        current.entityType === "memory" &&
        typedData.memoryType === "system" &&
        role !== "admin"
      ) {
        throw new CognitiveStoreError("System memories require administrator access.", 403, "ADMIN_REQUIRED");
      }
      validateSize(typedData, entityPayloadSizeLimit, "Entity data");
      if (patch.data.metadata) validateSize(patch.data.metadata, metadataSizeLimit, "Metadata");
      const [updated] = await tx
        .update(maxcoreCognitiveEntities)
        .set({
          ...(patch.data.data ? { payload: typedData } : {}),
          ...(patch.data.tags ? { tags: patch.data.tags } : {}),
          ...(patch.data.metadata
            ? {
                metadata: {
                  ...recordValue(current.metadata),
                  ...patch.data.metadata,
                  ...(Object.hasOwn(recordValue(current.metadata), RUNTIME_METADATA_KEY)
                    ? { [RUNTIME_METADATA_KEY]: recordValue(current.metadata)[RUNTIME_METADATA_KEY] }
                    : {}),
                },
              }
            : {}),
          searchText: buildCognitiveSearchText(
            current.entityType as CognitiveEntityType,
            typedData,
            patch.data.tags ?? current.tags,
          ),
          updatedAt: new Date(),
        })
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, ownerId),
          eq(maxcoreCognitiveEntities.id, id),
        ))
        .returning();
      if (!updated) return null;
      const eventType = current.entityType === "project"
        ? "project_updated"
        : "cognitive_entity_updated";
      const eventId = await appendEvent(tx, ownerId, eventType, id, undefined, {
        entityType: current.entityType,
      });
      return { entity: updated, eventId, eventType };
    });
    if (!updatedResult) return null;
    await notifyCognitiveEvent(ownerId, updatedResult.eventId, updatedResult.eventType);
    return updatedResult.entity;
  } catch (error) {
    if (error instanceof CognitiveStoreError) throw error;
    return asUnavailable(error);
  }
}

export async function deleteCognitiveEntity(ownerId: string, id: string) {
  try {
    const deletion = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, ownerId),
          eq(maxcoreCognitiveEntities.id, id),
        ))
        .limit(1)
        .for("update");
      if (!current) return false;
      const [activeTask] = current.entityType === "agent"
        ? await tx
            .select({ id: maxcoreCognitiveEntities.id })
            .from(maxcoreCognitiveEntities)
            .where(and(
              eq(maxcoreCognitiveEntities.ownerId, ownerId),
              eq(maxcoreCognitiveEntities.entityType, "task"),
              sql`${maxcoreCognitiveEntities.payload}->>'status' = 'active'`,
              sql`${maxcoreCognitiveEntities.payload}->>'assignedAgent' = ${id}`,
            ))
            .limit(1)
        : [];
      assertCognitiveEntityMutationAllowed(
        current.entityType as CognitiveEntityType,
        current.payload,
        "delete",
        Boolean(activeTask),
      );
      const deleted = await tx
        .delete(maxcoreCognitiveEntities)
        .where(and(
          eq(maxcoreCognitiveEntities.ownerId, ownerId),
          eq(maxcoreCognitiveEntities.id, id),
        ))
        .returning({ id: maxcoreCognitiveEntities.id });
      if (deleted.length === 0) return null;
      const eventId = await appendEvent(
        tx,
        ownerId,
        "cognitive_entity_deleted",
        id,
        undefined,
        { entityType: current.entityType },
      );
      return { eventId };
    });
    if (!deletion) return false;
    await notifyCognitiveEvent(ownerId, deletion.eventId, "cognitive_entity_deleted");
    return true;
  } catch (error) {
    if (error instanceof CognitiveStoreError) throw error;
    return asUnavailable(error);
  }
}

export async function createCognitiveRelationship(ownerId: string, input: unknown) {
  const parsed = relationshipEnvelope.safeParse(input);
  if (!parsed.success) {
    throw new CognitiveStoreError("Invalid cognitive relationship.", 400, "INVALID_RELATIONSHIP");
  }
  validateSize(parsed.data.metadata, 4 * 1024, "Relationship metadata");
  try {
    const ownedEndpoints = await db
      .select({ id: maxcoreCognitiveEntities.id })
      .from(maxcoreCognitiveEntities)
      .where(and(
        eq(maxcoreCognitiveEntities.ownerId, ownerId),
        inArray(maxcoreCognitiveEntities.id, [parsed.data.sourceId, parsed.data.targetId]),
      ));
    if (ownedEndpoints.length !== 2) {
      throw new CognitiveStoreError(
        "Both relationship endpoints must belong to this account.",
        404,
        "RELATIONSHIP_ENDPOINT_NOT_FOUND",
      );
    }
    const [created] = await db
      .insert(maxcoreCognitiveRelationships)
      .values({ ownerId, ...parsed.data })
      .onConflictDoNothing()
      .returning();
    if (created) return { relationship: created, created: true };
    const [existing] = await db
      .select()
      .from(maxcoreCognitiveRelationships)
      .where(and(
        eq(maxcoreCognitiveRelationships.ownerId, ownerId),
        eq(maxcoreCognitiveRelationships.sourceId, parsed.data.sourceId),
        eq(maxcoreCognitiveRelationships.targetId, parsed.data.targetId),
        eq(maxcoreCognitiveRelationships.relationType, parsed.data.relationType),
      ))
      .limit(1);
    if (!existing) asUnavailable(new Error("relationship insert returned no row"));
    return { relationship: existing, created: false };
  } catch (error) {
    if (error instanceof CognitiveStoreError) throw error;
    return asUnavailable(error);
  }
}

export async function listCognitiveRelationships(
  ownerId: string,
  filters: { entityId?: string; limit: number },
) {
  const conditions = [eq(maxcoreCognitiveRelationships.ownerId, ownerId)];
  if (filters.entityId) {
    conditions.push(sql`(
      ${maxcoreCognitiveRelationships.sourceId} = ${filters.entityId}
      OR ${maxcoreCognitiveRelationships.targetId} = ${filters.entityId}
    )`);
  }
  try {
    return await db
      .select()
      .from(maxcoreCognitiveRelationships)
      .where(and(...conditions))
      .orderBy(desc(maxcoreCognitiveRelationships.createdAt))
      .limit(filters.limit);
  } catch (error) {
    return asUnavailable(error);
  }
}

export async function deleteCognitiveRelationship(ownerId: string, id: string) {
  try {
    const deleted = await db
      .delete(maxcoreCognitiveRelationships)
      .where(and(
        eq(maxcoreCognitiveRelationships.ownerId, ownerId),
        eq(maxcoreCognitiveRelationships.id, id),
      ))
      .returning({ id: maxcoreCognitiveRelationships.id });
    return deleted.length > 0;
  } catch (error) {
    return asUnavailable(error);
  }
}

export async function executeCognitiveTool(
  ownerId: string,
  toolId: string,
  input: unknown,
) {
  if (toolId !== "database") {
    throw new CognitiveStoreError("Cognitive tool is not registered.", 404, "TOOL_NOT_FOUND");
  }
  const query = cognitiveQuerySchema.safeParse(input);
  if (!query.success) {
    throw new CognitiveStoreError("Invalid read-only search request.", 400, "INVALID_TOOL_INPUT");
  }

  const [entities, projects] = await Promise.all([
    listCognitiveEntities(ownerId, { query: query.data.query, limit: 100 }),
    searchUserProjects(ownerId, query.data.query, query.data.limit),
  ]);
  const readableEntityTypes = new Set([
    "memory",
    "goal",
    "task",
    "agent",
    "department",
    "document",
    "knowledge_node",
    "workflow",
  ]);
  const entityResults = entities
    .filter((entity) => entity.ownerId === ownerId && readableEntityTypes.has(entity.entityType))
    .slice(0, query.data.limit)
    .map((entity) => {
      const data = recordValue(entity.payload);
      const summary = [
        data.title,
        data.name,
        data.content,
        data.objective,
        data.description,
      ].find((value) => typeof value === "string" && value.trim());
      return {
        id: entity.id,
        kind: entity.entityType,
        summary: typeof summary === "string" ? summary.trim().slice(0, 1_200) : "",
        updatedAt: entity.updatedAt,
        citation: `maxcore://cognitive/${entity.entityType}/${entity.id}`,
      };
    });
  const projectResults = projects.map((project) => ({
    id: project.id,
    kind: "project",
    summary: [project.title, project.description, project.genre]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join(" — ")
      .slice(0, 1_200),
    updatedAt: project.updatedAt,
    citation: `maxbooster://projects/${project.id}`,
  }));
  const results = [...projectResults, ...entityResults].slice(0, query.data.limit);
  if (results.some((result) => !result.citation || !result.id)) {
    throw new CognitiveStoreError("Tool result verification failed.", 500, "TOOL_RESULT_UNVERIFIED");
  }

  const runId = randomUUID();
  const queryHash = createHash("sha256").update(query.data.query).digest("hex");
  try {
    const eventId = await db.transaction((tx) =>
      appendEvent(tx, ownerId, "tool_completed", "tool:database", undefined, {
        runId,
        querySha256: queryHash,
        resultCount: results.length,
        effect: "read_only",
      }),
    );
    await notifyCognitiveEvent(ownerId, eventId, "tool_completed");
  } catch (error) {
    if (error instanceof CognitiveStoreError) throw error;
    return asUnavailable(error);
  }

  return {
    runId,
    toolId,
    toolName: "database",
    operation: "owner_scoped_search",
    results,
    verification: {
      ownerScoped: true,
      citationsPresent: results.every((result) => result.citation.length > 0),
      sideEffects: "none",
      rollback: "not_applicable_read_only",
    },
  };
}

export async function getCognitiveExpansionStatus(ownerId: string) {
  try {
    const result = await db.execute(sql`
      SELECT
        count(*) FILTER (
          WHERE entity_type = 'task'
            AND payload->>'status' IN ('pending', 'blocked')
        )::int AS pending_task_count,
        count(*) FILTER (
          WHERE entity_type = 'agent'
            AND metadata->'maxcoreExpansion'->>'ruleId' = ${TASK_BACKLOG_EXPANSION_RULE}
        )::int AS auto_agent_count
      FROM maxcore_cognitive_entities
      WHERE owner_id = ${ownerId}
    `);
    const row = result.rows[0] as {
      pending_task_count?: number | string;
      auto_agent_count?: number | string;
    } | undefined;
    const openTaskCount = Number(row?.pending_task_count ?? 0);
    const autoAgentCount = Number(row?.auto_agent_count ?? 0);
    const desiredCount = desiredAutoAgentCount(openTaskCount);
    return {
      status: "available" as const,
      rule: {
        id: TASK_BACKLOG_EXPANSION_RULE,
        triggerType: "task_load" as const,
        threshold: TASK_BACKLOG_EXPANSION_THRESHOLD,
        action: "spawn_agent" as const,
        schedule: "on_task_creation",
        maximumAgents: MAX_AUTO_EXPANSION_AGENTS,
      },
      openTaskCount,
      autoAgentCount,
      desiredAutoAgentCount: desiredCount,
      expansionNeeded: autoAgentCount < desiredCount,
      executionModel: "offline_agent_records_require_explicit_task_assignment",
    };
  } catch (error) {
    return asUnavailable(error);
  }
}

export async function getCognitiveCapabilities() {
  try {
    const result = await db.execute(sql`
      SELECT
        to_regclass('public.maxcore_cognitive_entities') IS NOT NULL AS entity_store,
        to_regclass('public.maxcore_cognitive_relationships') IS NOT NULL AS graph_store,
        to_regclass('public.projects') IS NOT NULL AS product_projects
    `);
    const row = result.rows[0] as {
      entity_store?: boolean;
      graph_store?: boolean;
      product_projects?: boolean;
    } | undefined;
    const storageReady = row?.entity_store === true && row?.graph_store === true;
    return {
      status: storageReady ? "partial" : "degraded",
      storageReady,
      productProjectContext: row?.product_projects === true,
      persistence: "postgres",
      graphStore: storageReady,
      retrieval: storageReady ? "postgres_full_text" : "unavailable",
      vectorSearch: false,
      agentExecution: storageReady,
      toolExecution: storageReady,
      eventBus: storageReady && isRealtimePubSubReady(),
      expansionManager: storageReady,
      memorySharding: false,
    };
  } catch {
    return {
      status: "degraded",
      storageReady: false,
      productProjectContext: false,
      persistence: "postgres",
      graphStore: false,
      retrieval: "unavailable",
      vectorSearch: false,
      agentExecution: false,
      toolExecution: false,
      eventBus: false,
      expansionManager: false,
      memorySharding: false,
    };
  }
}

export const cognitiveQuerySchema = z.object({
  query: shortText(256),
  limit: z.coerce.number().int().min(1).max(10).default(8),
}).strict();
