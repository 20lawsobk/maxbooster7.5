import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { and, eq, getTableColumns, getTableName, sql } from "drizzle-orm";
import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
import * as schema from "../../shared/schema";
import { deleteLockedOwnedProject } from "../../server/services/projectOwnedDeletionCleanup";

const source = readFileSync("server/routes/studio.ts", "utf8");
const file = ts.createSourceFile("studio.ts", source, ts.ScriptTarget.Latest, true);
const tableNames = [
  "projects", "studioProjects", "studioTracks", "audioClips", "midiClips",
  "midiNotes", "markers", "pluginInstances", "warpMarkers", "takeGroups",
  "takeLanes", "takeSegments", "compVersions", "stemExports",
  "studioRecentFiles", "projectRoyaltySplits",
] as const;
const tables = Object.fromEntries(tableNames.map(name => [name, schema[name]]));
const names = new Map(Object.entries(tables).map(([name, table]) => [table, name]));

function compile(text: string, dependencies: Record<string, unknown>) {
  const result = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  // eslint-disable-next-line no-new-func -- Execute only repository-owned, transpiled AST fixtures with injected test dependencies; no untrusted input.
  return new Function(...Object.keys(dependencies), result.outputText)(...Object.values(dependencies));
}

// Execute the actual route bodies and Zod schemas, not a second implementation
// of the endpoints. Import neither the router nor server/db (no connections).
function handler(method: "patch" | "delete", db: unknown) {
  let route: ts.ArrowFunction | undefined;
  const definitions: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) &&
        ["projectMutationVersionSchema", "updateProjectSchema"].includes(node.name.getText(file))) {
      definitions.push(`const ${node.getText(file)};`);
    }
    if (ts.isCallExpression(node) && node.expression.getText(file) === `router.${method}` &&
        ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/projects/:projectId") {
      route = node.arguments.at(-1) as ts.ArrowFunction;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!route) throw new Error(`Missing ${method} route`);
  return compile(`${definitions.join("\n")}\nreturn ${route.getText(file)};`, {
    ...tables, db, z, logger: { warn: vi.fn() }, drizzleSql: sql,
    eq, and, deleteLockedOwnedProject,
  });
}

function queuedDeleteHandler() {
  const source = readFileSync("server/routes/sync.ts", "utf8");
  const file = ts.createSourceFile("sync.ts", source, ts.ScriptTarget.Latest, true);
  let expression: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === '"project.delete"') {
      expression = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!expression) throw new Error("Queued project.delete handler not found");
  return compile(`return ${expression.getText(file)};`, {
    z, eq, and, ...tables, deleteLockedOwnedProject,
  });
}

function receiptRepository(database: unknown) {
  // Execute the actual repository factory/fingerprinting implementation without
  // importing its runtime server/db dependency or substituting a fake receipt.
  const source = readFileSync("server/repositories/clientSyncReceipts.ts", "utf8");
  const file = ts.createSourceFile("receipts.ts", source, ts.ScriptTarget.Latest, true);
  const definitions = file.statements.filter(statement => ts.isFunctionDeclaration(statement))
    .map(statement => statement.getText(file).replace(/^export /, "")).join("\n");
  return compile(`${definitions}\nreturn createReceiptRepository(database);`, { database, sql, createHash });
}

type Row = Record<string, any>;
type State = Record<string, Row[]>;
const version = "2026-01-02T03:04:05.000Z";

function initialState(updatedAt: Date | null = new Date(version)): State {
  const state: State = Object.fromEntries(tableNames.map(name => [name, []]));
  state.clientSyncReceipts = [];
  state.projects = [
    { id: "p1", userId: "owner", title: "Original", bpm: 120, updatedAt },
    { id: "other", userId: "someone-else", title: "Other", updatedAt: new Date(version) },
  ];
  state.studioProjects = [{ id: "p1", userId: "intruder" }];
  for (const name of ["studioTracks", "audioClips", "midiClips", "markers", "pluginInstances",
    "takeGroups", "compVersions", "stemExports", "studioRecentFiles", "projectRoyaltySplits"]) {
    state[name] = [{ id: `${name}-p1`, projectId: "p1" }, { id: `${name}-other`, projectId: "other" }];
  }
  state.midiNotes = [{ id: "note1", clipId: "midiClips-p1" }, { id: "note2", clipId: "midiClips-other" }];
  state.warpMarkers = [{ id: "warp1", clipId: "audioClips-p1" }, { id: "warp2", clipId: "audioClips-other" }];
  state.takeSegments = [{ id: "segment1", takeGroupId: "takeGroups-p1" }, { id: "segment2", takeGroupId: "takeGroups-other" }];
  state.takeLanes = [{ id: "lane1", takeGroupId: "takeGroups-p1" }, { id: "lane2", takeGroupId: "takeGroups-other" }];
  return state;
}

// Deliberately small transaction double. Real schema columns are used, so a
// guessed/nonexistent field fails here. Snapshot rollback models atomicity; it
// is NOT evidence of PostgreSQL lock scheduling or driver rollback behavior.
function database(state = initialState(), failAt?: string) {
  const events: string[] = [];
  const writes: { table: string; values?: Row; condition: any }[] = [];
  function field(tableName: string, columnName: string) {
    const table = Object.values(tables).find(candidate => getTableName(candidate) === tableName);
    if (!table) throw new Error(`Unknown table ${tableName}`);
    const entry = Object.entries(getTableColumns(table)).find(([, candidate]) => candidate.name === columnName);
    if (!entry) throw new Error(`Unknown schema column ${tableName}.${columnName}`);
    return entry[0];
  }
  function matches(row: Row, condition: any, working: State): boolean {
    // Compile REAL Drizzle predicates/subqueries from the imported production
    // helper. This intentionally supports only this cleanup's equality/AND/IN
    // SQL; any new query shape fails instead of silently matching every row.
    const query = new PgDialect().sqlToQuery(condition);
    const leaf = query.sql.match(/^"(\w+)"\."(\w+)" in \(select "id" from "(\w+)" where "(\w+)"\."(\w+)" = \$(\d+)\)$/);
    if (leaf) {
      const [, leafTable, leafColumn, parentTable, predicateTable, parentColumn, parameter] = leaf;
      const parent = Object.entries(tables).find(([, table]) => getTableName(table) === parentTable)?.[0];
      if (!parent || predicateTable !== parentTable) throw new Error("Unexpected subquery shape");
      const values = working[parent]
        .filter(candidate => candidate[field(parentTable, parentColumn)] === query.params[Number(parameter) - 1])
        .map(candidate => candidate.id);
      return values.includes(row[field(leafTable, leafColumn)]);
    }
    const equality = /"(\w+)"\."(\w+)" = \$(\d+)/g;
    const clauses = [...query.sql.matchAll(equality)];
    if (!clauses.length || query.sql.replace(equality, "").replace(/[()\s]|and/g, "") !== "") {
      throw new Error(`Unexpected predicate ${query.sql}`);
    }
    return clauses.every(([, tableName, columnName, parameter]) =>
      row[field(tableName, columnName)] === query.params[Number(parameter) - 1]);
  }
  const db = {
    transaction: vi.fn(async (work: (tx: any) => Promise<any>) => {
      const working = structuredClone(state);
      events.push("begin");
      const tx = {
        execute: async (statement: any) => {
          const query = new PgDialect().sqlToQuery(statement);
          if (query.sql.includes("pg_advisory_xact_lock")) {
            events.push("receipt-lock");
            return { rows: [] };
          }
          if (query.sql.includes("SELECT payload_hash, receipt FROM client_sync_receipts")) {
            events.push("receipt-read");
            return { rows: working.clientSyncReceipts.filter(row => row.ownerId === query.params[0] && row.operationId === query.params[1]) };
          }
          if (query.sql.includes("INSERT INTO client_sync_receipts")) {
            events.push("receipt-insert");
            if (failAt === "receipt-insert") throw new Error("Injected receipt insert failure");
            working.clientSyncReceipts.push({
              ownerId: query.params[0], operationId: query.params[1],
              payload_hash: query.params[2], receipt: JSON.parse(query.params[3] as string),
            });
            return { rows: [] };
          }
          throw new Error(`Unexpected receipt SQL: ${query.sql}`);
        },
        select: (projection?: any) => ({
          from: (table: any) => ({
            where: (condition: any) => {
              const query = new QueryBuilder().select(projection).from(table).where(condition);
              query.for = async (strength: string) => {
                events.push(`lock:${names.get(table)}:${strength}`);
                return working[names.get(table)!].filter(row => matches(row, condition, working));
              };
              return query;
            },
          }),
        }),
        delete: (table: any) => ({
          where: (condition: any) => {
            const name = names.get(table)!;
            events.push(`delete:${name}`);
            if (failAt === name) throw new Error("Injected delete failure");
            writes.push({ table: name, condition });
            const removed = working[name].filter(row => matches(row, condition, working));
            working[name] = working[name].filter(row => !matches(row, condition, working));
            return Object.assign(Promise.resolve(removed), {
              returning: async () => failAt === "missing-final-row" && name === "projects" ? [] : removed,
            });
          },
        }),
        update: (table: any) => ({
          set: (values: Row) => ({
            where: (condition: any) => ({
              returning: async () => {
                const name = names.get(table)!;
                events.push(`update:${name}`);
                writes.push({ table: name, values, condition });
                return working[name].filter(row => matches(row, condition, working)).map(row => {
                  for (const [key, value] of Object.entries(values)) {
                    if (value !== undefined) row[key] = key === "updatedAt"
                      ? new Date((row.updatedAt?.getTime() ?? 0) + 1) : value;
                  }
                  return row;
                });
              },
            }),
          }),
        }),
      };
      try {
        const result = await work(tx);
        Object.assign(state, working);
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
    }),
  };
  return { db, state, events, writes };
}

async function request(method: "patch" | "delete", body: any, options: {
  userId?: string; projectId?: string; backend?: ReturnType<typeof database>;
} = {}) {
  const backend = options.backend ?? database();
  const response = {
    statusCode: 200, body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(value: any) { this.body = value; backend.events.push("response"); return this; },
  };
  await handler(method, backend.db)({
    params: { projectId: options.projectId ?? "p1" },
    user: { id: options.userId ?? "owner" }, body,
  }, response);
  return { ...backend, response };
}

describe("direct project mutations", () => {
  it("transpiles the actual studio route file without syntax errors", () => {
    const result = ts.transpileModule(source, {
      fileName: "studio.ts", reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    });
    expect(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error)).toEqual([]);
    // Pin the real schema contract inspected for cleanup; there is no cascade.
    expect(getTableName(schema.projects)).toBe("projects");
    expect(getTableColumns(schema.projects)).not.toHaveProperty("version");
    expect(getTableColumns(schema.takeSegments)).toHaveProperty("takeGroupId");
  });

  it.each(["patch", "delete"] as const)("%s fails closed for unversioned older clients", async method => {
    for (const body of [undefined, {}, { title: "Old client", version: 1 }]) {
      const result = await request(method, body);
      expect(result.response.statusCode).toBe(428);
      expect(result.db.transaction).not.toHaveBeenCalled();
      expect(result.writes).toEqual([]);
    }
  });

  it.each(["patch", "delete"] as const)("%s rejects malformed timestamps before opening a transaction", async method => {
    for (const expectedUpdatedAt of ["invalid", 5, "2026-01-02"]) {
      const result = await request(method, { expectedUpdatedAt });
      expect(result.response.statusCode).toBe(400);
      expect(result.db.transaction).not.toHaveBeenCalled();
    }
  });

  it.each(["patch", "delete"] as const)("%s rejects stale versions after locking, without writes", async method => {
    const result = await request(method, { title: "Stale", expectedUpdatedAt: "2025-01-01T00:00:00.000Z" });
    expect(result.response.statusCode).toBe(409);
    expect(result.response.body).toMatchObject({ conflict: true, data: { title: "Original" } });
    expect(result.events).toEqual(["begin", "lock:projects:update", "commit", "response"]);
    expect(result.writes).toEqual([]);
  });

  it.each(["patch", "delete"] as const)("%s never authorizes a different projects owner via studioProjects", async method => {
    const result = await request(method, { title: "Unauthorized", expectedUpdatedAt: version }, { userId: "intruder" });
    expect(result.response.statusCode).toBe(404);
    expect(result.response.body).toEqual({ error: "Project not found" });
    expect(result.writes).toEqual([]);
    expect(result.state.projects[0].title).toBe("Original");
    expect(result.state.studioTracks).toHaveLength(2);
  });

  it.each(["patch", "delete"] as const)("%s treats a missing canonical row as 404", async method => {
    const result = await request(method, { expectedUpdatedAt: version }, { projectId: "missing" });
    expect(result.response.statusCode).toBe(404);
    expect(result.writes).toEqual([]);
  });

  it.each(["patch", "delete"] as const)("%s accepts explicit null only for a null stored version", async method => {
    const nullRow = await request(method, { title: "Changed", expectedUpdatedAt: null }, { backend: database(initialState(null)) });
    expect(nullRow.response.statusCode).toBe(200);
    const nonNullRow = await request(method, { expectedUpdatedAt: null });
    expect(nonNullRow.response.statusCode).toBe(409);
    expect(nonNullRow.writes).toEqual([]);
  });

  it("patches allowed fields, strips transport/legacy fields, and preserves the bpm alias", async () => {
    const result = await request("patch", {
      expectedUpdatedAt: version, title: "Changed", bpm: 135, tempo: 140,
      userId: "intruder", updatedAt: null, version: 99, id: "replacement",
    });
    expect(result.response.statusCode).toBe(200);
    expect(result.response.body).toMatchObject({ id: "p1", userId: "owner", title: "Changed", bpm: 135 });
    const write = result.writes[0];
    expect(Object.keys(write.values!)).toEqual(["title", "bpm", "updatedAt"]);
    const query = new PgDialect().sqlToQuery(write.values!.updatedAt);
    expect(query.sql).toContain("GREATEST(clock_timestamp()::timestamp");
    expect(query.sql).toContain('COALESCE("projects"."updated_at"');
    expect(query.sql).toContain("interval '1 millisecond'");
    expect(result.events).toEqual(["begin", "lock:projects:update", "update:projects", "commit", "response"]);
    expect(new PgDialect().sqlToQuery(write.condition).params).toEqual(["p1", "owner"]);
    const tempoOnly = await request("patch", { expectedUpdatedAt: version, tempo: 150 });
    expect(tempoOnly.response.body.bpm).toBe(150);
  });

  it("rejects a reused version after a successful patch, including a subsequent deletion", async () => {
    const backend = database();
    expect((await request("patch", { title: "First", expectedUpdatedAt: version }, { backend })).response.statusCode).toBe(200);
    expect((await request("patch", { title: "Stale", expectedUpdatedAt: version }, { backend })).response.statusCode).toBe(409);
    expect((await request("delete", { expectedUpdatedAt: version }, { backend })).response.statusCode).toBe(409);
    expect(backend.state.projects[0].title).toBe("First");
    expect(backend.writes).toHaveLength(1);
  });

  it("deletes DAW children and leaf data atomically, retaining unrelated project rows", async () => {
    const result = await request("delete", { expectedUpdatedAt: version });
    expect(result.response.statusCode).toBe(200);
    expect(result.response.body).toEqual({ success: true, message: "Project deleted" });
    for (const name of tableNames.filter(name => name !== "studioProjects")) {
      expect(result.state[name], name).toHaveLength(1);
      expect(result.state[name][0].id, name).not.toMatch(/p1|note1|warp1|segment1|lane1/);
    }
    expect(result.events[1]).toBe("lock:projects:update");
    expect(result.events.slice(-3)).toEqual(["delete:projects", "commit", "response"]);
    expect(result.events.indexOf("delete:midiNotes")).toBeLessThan(result.events.indexOf("delete:midiClips"));
    expect(result.events.indexOf("delete:warpMarkers")).toBeLessThan(result.events.indexOf("delete:audioClips"));
    expect(result.events.indexOf("delete:takeSegments")).toBeLessThan(result.events.indexOf("delete:takeGroups"));
    const finalDelete = result.writes.at(-1)!;
    expect(new PgDialect().sqlToQuery(finalDelete.condition).params).toEqual(["p1", "owner"]);
  });

  it.each(["projectRoyaltySplits", "projects", "missing-final-row"])(
    "rolls back earlier child deletes when %s fails", async failAt => {
      const before = initialState();
      const backend = database(structuredClone(before), failAt);
      const result = await request("delete", { expectedUpdatedAt: version }, { backend });
      expect(result.response.statusCode).toBe(500);
      expect(result.response.body).toEqual({ error: "Failed to delete project" });
      expect(result.state).toEqual(before);
      expect(result.events).toContain("delete:studioTracks");
      expect(result.events.slice(-2)).toEqual(["rollback", "response"]);
      expect(result.events).not.toContain("commit");
    },
  );
});

describe("queued project deletion shares the real cleanup and receipt transaction", () => {
  const action = { id: "delete-1", type: "project.delete", payload: { projectId: "p1", expectedUpdatedAt: version } };

  it("produces the same scoped child cleanup as direct DELETE and replays its receipt without deleting twice", async () => {
    const direct = await request("delete", { expectedUpdatedAt: version });
    const backend = database();
    const repo = receiptRepository(backend.db);
    const queued = queuedDeleteHandler();
    const execute = vi.fn((tx: any) => queued(action.payload, "owner", tx));
    const receipt = await repo.apply("owner", action, execute);
    expect(receipt).toMatchObject({ success: true, outcome: "applied", serverResponse: { projectId: "p1", deleted: true } });
    for (const name of tableNames) expect(backend.state[name], name).toEqual(direct.state[name]);
    expect(backend.writes.map(write => write.table)).toEqual(direct.writes.map(write => write.table));
    expect(backend.events.indexOf("lock:projects:update")).toBeLessThan(backend.events.indexOf("delete:midiNotes"));
    expect(backend.events.slice(-3)).toEqual(["delete:projects", "receipt-insert", "commit"]);
    expect(backend.state.clientSyncReceipts).toHaveLength(1);
    expect(await repo.apply("owner", action, execute)).toEqual(receipt);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(backend.state.clientSyncReceipts).toHaveLength(1);
  });

  it.each(["projectRoyaltySplits", "projects", "missing-final-row", "receipt-insert"])(
    "rolls back cleanup and the receipt together on %s", async failAt => {
      const before = initialState();
      const backend = database(structuredClone(before), failAt);
      const repo = receiptRepository(backend.db);
      const queued = queuedDeleteHandler();
      await expect(repo.apply("owner", action, (tx: any) => queued(action.payload, "owner", tx))).rejects.toThrow();
      expect(backend.state).toEqual(before);
      expect(backend.events).toContain("delete:studioTracks");
      expect(backend.events.at(-1)).toBe("rollback");
      expect(backend.events).not.toContain("commit");
    },
  );

  it("rejects reuse of a completed operation ID for another payload without rerunning cleanup", async () => {
    const backend = database();
    const repo = receiptRepository(backend.db);
    const queued = queuedDeleteHandler();
    const execute = vi.fn((tx: any) => queued(action.payload, "owner", tx));
    await repo.apply("owner", action, execute);
    const after = structuredClone(backend.state);
    await expect(repo.apply("owner", {
      ...action, payload: { ...action.payload, projectId: "other" },
    }, execute)).rejects.toThrow("different payload");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(backend.state).toEqual(after);
  });

  it.each([
    { owner: "owner", expected: "2025-01-01T00:00:00.000Z", outcome: "conflict" },
    { owner: "intruder", expected: version, outcome: "rejected" },
  ])("does not clean children for $outcome and records the terminal outcome", async ({ owner, expected, outcome }) => {
    const backend = database();
    const before = structuredClone(backend.state);
    const repo = receiptRepository(backend.db);
    const queued = queuedDeleteHandler();
    const operation = { ...action, payload: { ...action.payload, expectedUpdatedAt: expected } };
    const receipt = await repo.apply(owner, operation, (tx: any) => queued(operation.payload, owner, tx));
    expect(receipt).toMatchObject({ success: false, outcome });
    for (const name of tableNames) expect(backend.state[name]).toEqual(before[name]);
    expect(backend.writes).toEqual([]);
    if (outcome === "rejected") expect(receipt.serverResponse).toBeUndefined();
    expect(backend.state.clientSyncReceipts).toHaveLength(1);
  });
});
