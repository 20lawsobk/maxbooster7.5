import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Execute repository-owned service and registered route bodies without opening
// the application's database, provider clients or background workers.
const serviceFile = ts.createSourceFile("workspaceService.ts", readFileSync("server/services/workspaceService.ts", "utf8"), ts.ScriptTarget.Latest, true);
const serviceClass = serviceFile.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === "WorkspaceService")!;
const schemaDefinition = serviceFile.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(serviceFile) === "workspaceUpdateSchema"));
const routeFile = ts.createSourceFile("workspace.ts", readFileSync("server/routes/workspace.ts", "utf8"), ts.ScriptTarget.Latest, true);
function evaluate(source: string, dependencies: Record<string, unknown>) {
  return vm.runInNewContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), dependencies);
}
function route(method: string, path: string, dependencies: Record<string, unknown>) {
  let body: string | undefined;
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && n.expression.getText(routeFile) === `router.${method}` &&
      ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === path) body = n.arguments.at(-1)!.getText(routeFile);
    ts.forEachChild(n, visit);
  }
  visit(routeFile);
  expect(body).toBeTruthy();
  return evaluate(`const handler = ${body}; handler;`, { z, logger: { warn() {} }, ...dependencies });
}
const table = (name: string, fields: string[]) => Object.fromEntries([["table", name], ...fields.map(field => [field, field])]);
const workspaces = table("workspaces", ["id", "ownerId"]);
const workspaceMembers = table("members", ["id", "workspaceId", "userId", "status", "role"]);
const workspaceRoles = table("roles", ["id", "workspaceId", "name"]);
type Row = Record<string, any>;
function harness() {
  const state: Record<string, Row[]> = {
    workspaces: [{ id: "workspace", ownerId: "owner", name: "Original", slug: "immutable", settings: {} }],
    members: [
      { id: "owner-member", workspaceId: "workspace", userId: "owner", role: "owner", status: "active" },
      { id: "admin-member", workspaceId: "workspace", userId: "admin", role: "admin", status: "active" },
      { id: "ordinary-member", workspaceId: "workspace", userId: "ordinary", role: "member", roleId: "custom", status: "active" },
      { id: "inactive-member", workspaceId: "workspace", userId: "inactive", role: "admin", status: "inactive" },
    ],
    roles: [
      { id: "custom", workspaceId: "workspace", name: "Custom" },
      { id: "foreign", workspaceId: "another-workspace", name: "Foreign" },
      { id: "owner-role", workspaceId: "workspace", name: "Owner" },
    ],
  };
  const writes: Row[] = [];
  const eq = (field: string, value: unknown) => (row: Row) => row[field] === value;
  const ne = (field: string, value: unknown) => (row: Row) => row[field] !== value;
  const or = (...predicates: ((row: Row) => boolean)[]) => (row: Row) => predicates.some(p => p(row));
  const isNull = (field: string) => (row: Row) => row[field] == null;
  const and = (...predicates: ((row: Row) => boolean)[]) => (row: Row) => predicates.every(p => p(row));
  const db = {
    select: () => ({ from: (target: Row) => ({ where: (predicate: (row: Row) => boolean) => ({
      limit: async (limit: number) => state[target.table].filter(predicate).slice(0, limit),
    }) }) }),
    update: (target: Row) => ({ set: (values: Row) => ({ where: (predicate: (row: Row) => boolean) => {
      let result: Row[] | undefined;
      const apply = () => {
        if (!result) {
          result = state[target.table].filter(predicate);
          for (const row of result) {
            Object.assign(row, Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)));
            writes.push({ target: target.table, values });
          }
        }
        return result;
      };
      const query = { then: (resolve: (value: Row[]) => unknown) => Promise.resolve(apply()).then(resolve), returning: () => Promise.resolve(apply()) };
      return query;
    } }) }),
  };
  const context = { db, workspaces, workspaceMembers, workspaceRoles, eq, ne, and, or, isNull, z, logger: { warn() {} } };
  const compiled = `${schemaDefinition?.getText(serviceFile).replace(/^export /, "") ?? ""}\n${serviceClass.getText(serviceFile).replace(/^export /, "")}\n({service: new WorkspaceService(), schema: typeof workspaceUpdateSchema === 'undefined' ? undefined : workspaceUpdateSchema});`;
  const result = evaluate(compiled, context);
  result.service.logAuditEvent = vi.fn();
  return { ...result, state, writes };
}

describe("workspace ownership boundaries", () => {
  it("rejects ownership and identifier mass assignment before persistence", async () => {
    const h = harness();
    for (const updates of [{ ownerId: "admin" }, { id: "taken" }, { slug: "taken" }, { createdAt: "synthetic" }]) {
      expect((await h.service.updateWorkspace("workspace", updates, "admin")).success).toBe(false);
    }
    expect(h.writes).toHaveLength(0);
    expect(h.state.workspaces[0]).toMatchObject({ id: "workspace", ownerId: "owner", slug: "immutable" });
  });
  it("preserves supported settings while retaining the real owner", async () => {
    const h = harness();
    const updates = { name: "Updated", description: "Team workspace", settings: { catalogVisibility: "private" }, logoUrl: "/logo.png" };
    expect((await h.service.updateWorkspace("workspace", updates, "admin")).success).toBe(true);
    expect(h.state.workspaces[0]).toMatchObject({ ...updates, ownerId: "owner" });
  });
  it.each(["ordinary", "inactive", "outsider"])("rejects direct settings writes by %s", async user => {
    const h = harness();
    expect((await h.service.updateWorkspace("workspace", { name: "Taken" }, user)).success).toBe(false);
    expect(h.writes).toHaveLength(0);
  });
  it("cannot demote the owner or an owner record whose role is already inconsistent", async () => {
    const h = harness();
    expect((await h.service.updateMemberRole("workspace", "owner-member", "viewer", undefined, "admin")).success).toBe(false);
    h.state.members[0].role = "member";
    expect((await h.service.updateMemberRole("workspace", "owner-member", "viewer", undefined, "admin")).success).toBe(false);
    expect(h.writes).toHaveLength(0);
  });
  it("rejects owner promotion and custom roles from another tenant", async () => {
    const h = harness();
    for (const [role, roleId] of [["owner", undefined], ["member", "foreign"], ["member", "owner-role"]]) {
      expect((await h.service.updateMemberRole("workspace", "ordinary-member", role, roleId, "admin")).success).toBe(false);
    }
    expect(h.writes).toHaveLength(0);
  });
  it("updates ordinary roles and clears a removed custom role", async () => {
    const h = harness();
    expect((await h.service.updateMemberRole("workspace", "ordinary-member", "manager", undefined, "admin")).success).toBe(true);
    expect(h.state.members[2]).toMatchObject({ role: "manager", roleId: null });
  });
  it("requires active administrator membership for direct role changes", async () => {
    const h = harness();
    expect((await h.service.updateMemberRole("workspace", "ordinary-member", "manager", undefined, "inactive")).success).toBe(false);
    expect(h.writes).toHaveLength(0);
  });
  it("preserves same-workspace custom roles and supports legacy null roles", async () => {
    const h = harness();
    h.state.members[2].role = null;
    expect((await h.service.updateMemberRole("workspace", "ordinary-member", "manager", "custom", "owner")).success).toBe(true);
    expect(h.state.members[2]).toMatchObject({ role: "manager", roleId: "custom" });
  });
  it.each([
    ["inactive", "owner", "admin", "inactive", false],
    ["owner", "owner", "viewer", "active", true],
    ["impostor", "owner", "owner", "active", false],
  ])("admin guard uses active membership and authoritative ownership (%s)", async (user, ownerId, role, status, allowed) => {
    const definition = routeFile.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(routeFile) === "requireWorkspaceAdmin"))!;
    const guard = evaluate(`${definition.getText(routeFile)}; requireWorkspaceAdmin;`, {
      workspaceService: { getWorkspace: async () => ({ ownerId }), getMember: async () => ({ role, status }) },
      logger: { warn() {} },
    });
    const next = vi.fn();
    const res = { statusCode: 200, status(value: number) { this.statusCode = value; return this; }, json: vi.fn() };
    await guard({ user: { id: user }, params: { id: "workspace" } }, res, next);
    expect(next).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(res.statusCode).toBe(allowed ? 200 : 403);
  });
  it("registered settings endpoint rejects forbidden fields before calling the service", async () => {
    const h = harness();
    const updateWorkspace = vi.fn(async () => ({ success: true, workspace: {} }));
    const handler = route("put", "/:id", { workspaceService: { updateWorkspace }, workspaceUpdateSchema: h.schema });
    const res = { statusCode: 200, status(value: number) { this.statusCode = value; return this; }, json: vi.fn() };
    await handler({ user: { id: "admin" }, params: { id: "workspace" }, body: { ownerId: "admin" } }, res);
    expect(res.statusCode).toBe(400);
    expect(updateWorkspace).not.toHaveBeenCalled();
  });
});
