import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  maxcoreCognitiveEntities,
  maxcoreCognitiveRelationships,
  projects,
} from "@shared/schema";
import { db } from "../db.js";
import { storage } from "../storage.js";

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
      "goal_completed",
      "agent_spawned",
      "project_updated",
      "workflow_executed",
      "tool_completed",
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
  const parsedData = entityDataSchemas[envelope.data.type].safeParse(envelope.data.data);
  if (!parsedData.success) {
    throw new CognitiveStoreError("Entity data does not match its declared type.", 400, "INVALID_ENTITY_DATA");
  }
  const typedData = parsedData.data as Record<string, unknown>;
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

export async function createCognitiveEntity(
  ownerId: string,
  role: string,
  input: unknown,
) {
  const value = parseCognitiveEntityInput(input, role);
  try {
    const [entity] = await db
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
    return entity;
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
    const current = await getCognitiveEntity(ownerId, id);
    if (!current) return null;
    if (current.entityType === "event") {
      throw new CognitiveStoreError("Event records are append-only.", 409, "EVENT_IMMUTABLE");
    }
    const data = patch.data.data
      ? entityDataSchemas[current.entityType as CognitiveEntityType].safeParse(patch.data.data)
      : { success: true as const, data: current.payload };
    if (!data.success) {
      throw new CognitiveStoreError("Entity data does not match its declared type.", 400, "INVALID_ENTITY_DATA");
    }
    const typedData = data.data as Record<string, unknown>;
    if (
      current.entityType === "memory" &&
      typedData.memoryType === "system" &&
      role !== "admin"
    ) {
      throw new CognitiveStoreError("System memories require administrator access.", 403, "ADMIN_REQUIRED");
    }
    validateSize(typedData, entityPayloadSizeLimit, "Entity data");
    if (patch.data.metadata) validateSize(patch.data.metadata, metadataSizeLimit, "Metadata");
    const [updated] = await db
      .update(maxcoreCognitiveEntities)
      .set({
        ...(patch.data.data ? { payload: typedData } : {}),
        ...(patch.data.tags ? { tags: patch.data.tags } : {}),
        ...(patch.data.metadata ? { metadata: patch.data.metadata } : {}),
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
    return updated ?? null;
  } catch (error) {
    if (error instanceof CognitiveStoreError) throw error;
    return asUnavailable(error);
  }
}

export async function deleteCognitiveEntity(ownerId: string, id: string) {
  try {
    const current = await getCognitiveEntity(ownerId, id);
    if (!current) return false;
    if (current.entityType === "event") {
      throw new CognitiveStoreError("Event records are append-only.", 409, "EVENT_IMMUTABLE");
    }
    const deleted = await db
      .delete(maxcoreCognitiveEntities)
      .where(and(
        eq(maxcoreCognitiveEntities.ownerId, ownerId),
        eq(maxcoreCognitiveEntities.id, id),
      ))
      .returning({ id: maxcoreCognitiveEntities.id });
    return deleted.length > 0;
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
      agentExecution: false,
      toolExecution: false,
      eventBus: false,
      expansionManager: false,
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
