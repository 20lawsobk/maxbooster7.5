import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, desc, isNull } from "drizzle-orm";
import { tsImport } from "tsx/esm/api";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { z } from "zod";
import { startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";
import { loadIsolatedClosed, responseHarness } from "./payment-processing/helpers-inbound.mjs";

function workflowHandler(service) {
  const path = "server/routes/distribution.ts";
  const tree = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  let source;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(tree) === "router" && node.expression.name.text === "post" &&
      ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/workflow/transition") {
      source = node.arguments.at(-1).getText(tree);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(source, "production workflow route is mounted");
  return vm.runInNewContext(ts.transpile(`const handler = ${source}; handler;`, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }), { z, enhancedWorkflowService: service, logger: { warn() {} } });
}

test("distribution workflow isolates owners and records real state changes in private PostgreSQL", { timeout: 30_000 }, async t => {
  const fixture = await startDisposablePostgres();
  t.after(() => fixture.stop());
  const { pool } = fixture;
  // Use repository-owned tables and generated DDL, including every NOT NULL
  // constraint. A substitute schema previously concealed requested_by failures.
  const schema = await tsImport("../shared/schema.ts", import.meta.url);
  const tables = Object.fromEntries(["users", "releases", "releaseWorkflowRequests", "releaseVersionHistory", "releaseScheduledActions"]
    .map(name => [name, schema[name]]));
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(tables));
  for (const statement of statements) await pool.query(statement);
  globalThis.__workflowTenantDb = drizzle(pool);
  globalThis.__workflowTenantTables = tables;
  globalThis.__workflowTenantOperators = { eq, and, desc, isNull };
  t.after(() => { delete globalThis.__workflowTenantDb; delete globalThis.__workflowTenantTables; delete globalThis.__workflowTenantOperators; });
  const { releaseWorkflowService: service } = await loadIsolatedClosed("server/services/releaseWorkflowService.ts", {
    "../db": "export const db=globalThis.__workflowTenantDb;",
    "@shared/schema": "export const {users,releases,releaseWorkflowRequests,releaseVersionHistory,releaseScheduledActions}=globalThis.__workflowTenantTables;",
    "../logger.js": "export const logger={info(){},warn(){}};",
    "drizzle-orm": "export const {eq,and,desc,isNull}=globalThis.__workflowTenantOperators;",
  });
  const releaseId = "11111111-1111-4111-8111-111111111111";
  await pool.query("INSERT INTO users(id,email,password,role) VALUES('owner','owner@example.invalid','synthetic','user'),('attacker','attacker@example.invalid','synthetic','user'),('administrator','administrator@example.invalid','synthetic','admin')");
  await pool.query("INSERT INTO releases(id,user_id,title,status) VALUES($1,'owner','Private original','draft')", [releaseId]);

  await t.test("foreign transition and history access do not expose or change the release", async () => {
    const result = await service.transition(releaseId, "attacker", "pending_review", "submit_for_review", {});
    assert.equal(result.success, false);
    assert.deepEqual(await service.getWorkflowHistory(releaseId, "attacker"), []);
    assert.deepEqual(await service.getVersionHistory(releaseId, "attacker"), []);
    assert.deepEqual((await pool.query("SELECT user_id,title,status FROM releases WHERE id=$1", [releaseId])).rows[0],
      { user_id: "owner", title: "Private original", status: "draft" });
    assert.equal(Number((await pool.query("SELECT count(*) FROM release_workflow_requests")).rows[0].count), 0);
  });

  await t.test("owner can submit without options and real version data survives SQL insertion", async () => {
    const result = await service.submitForReview(releaseId, "owner");
    assert.equal(result.success, true);
    const version = (await pool.query("SELECT previous_data,changes FROM release_version_history WHERE release_id=$1", [releaseId])).rows[0];
    assert.deepEqual(version, { previous_data: { status: "draft" }, changes: { newData: { status: "pending_review" } } });
    const request = (await service.getWorkflowHistory(releaseId, "owner"))[0];
    assert.equal(request.requestedBy, "owner");
    assert.deepEqual(request.metadata, { previousStatus: "draft", newStatus: "pending_review" });
    assert.equal((await service.getVersionHistory(releaseId, "owner")).length, 1);
  });

  await t.test("stored administrative authority retains review access without transferring ownership", async () => {
    const result = await service.transition(releaseId, "administrator", "in_review", "approve", {});
    assert.equal(result.success, true);
    assert.equal((await pool.query("SELECT user_id FROM releases WHERE id=$1", [releaseId])).rows[0].user_id, "owner");
    assert.equal((await service.getWorkflowHistory(releaseId, "administrator")).length, 2);
  });

  await t.test("metadata changes cannot transfer ownership or rewrite lifecycle state", async () => {
    for (const changes of [{ userId: "attacker" }, { id: "different" }, { status: "live" }]) {
      assert.equal((await service.updateMetadata(releaseId, "owner", changes)).success, false);
    }
    assert.equal((await service.updateMetadata(releaseId, "attacker", { title: "Stolen" })).success, false);
    assert.equal((await service.updateMetadata(releaseId, "owner", { title: "Owner edit" }, "owned correction")).success, true);
    assert.deepEqual((await pool.query("SELECT user_id,title,status FROM releases WHERE id=$1", [releaseId])).rows[0],
      { user_id: "owner", title: "Owner edit", status: "in_review" });
    const change = (await pool.query("SELECT changes FROM release_version_history WHERE change_type='metadata_update'")).rows[0].changes;
    assert.deepEqual(change, { newData: { title: "Owner edit" }, reason: "owned correction" });
  });

  await t.test("public transition handler cannot claim reviewer or distributor success", async () => {
    const handler = workflowHandler(service);
    for (const [requestType, targetStatus] of [["approve", "approved"], ["publish", "live"], ["archive", "approved"]]) {
      const res = responseHarness();
      await handler({ user: { id: "owner" }, body: { releaseId, requestType, targetStatus, metadata: { role: "admin" } } }, res);
      assert.equal(res.statusCode, 403);
    }
    const denied = responseHarness();
    await handler({ user: { id: "attacker" }, body: { releaseId, requestType: "archive", targetStatus: "archived" } }, denied);
    assert.equal(denied.statusCode, 404);
  });

  await t.test("pending request lists stay scoped except for a stored administrator", async () => {
    await pool.query("INSERT INTO release_workflow_requests(release_id,requested_by,request_type,status) VALUES($1,'owner','request_update','pending'),($1,'attacker','request_update','pending')", [releaseId]);
    const owner = await service.getPendingRequests("owner");
    assert.equal(owner.length, 1);
    assert.equal(owner[0].requestedBy, "owner");
    assert.equal((await service.getPendingRequests("administrator")).length, 2);
    assert.deepEqual(await service.getPendingRequests(undefined), []);
  });
  await t.test("legacy null draft status transitions through the real nullable schema", async () => {
    await pool.query("INSERT INTO releases(id,user_id,title,status) VALUES('null-draft','owner','Legacy draft',NULL)");
    assert.equal((await service.submitForReview("null-draft", "owner")).success, true);
    assert.equal((await pool.query("SELECT status FROM releases WHERE id='null-draft'")).rows[0].status, "pending_review");
  });

  await t.test("audit failures roll back release state, requests and version history together", async () => {
    await pool.query(`
      CREATE FUNCTION reject_selected_workflow_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'isolated workflow audit failure'; END $$;
      CREATE TRIGGER reject_request_audit BEFORE INSERT ON release_workflow_requests
        FOR EACH ROW WHEN (NEW.release_id='request-audit-failure') EXECUTE FUNCTION reject_selected_workflow_audit();
      CREATE TRIGGER reject_version_audit BEFORE INSERT ON release_version_history
        FOR EACH ROW WHEN (NEW.release_id IN ('version-audit-failure','metadata-audit-failure')) EXECUTE FUNCTION reject_selected_workflow_audit();
    `);
    for (const id of ["request-audit-failure", "version-audit-failure", "metadata-audit-failure"]) {
      await pool.query("INSERT INTO releases(id,user_id,title,status) VALUES($1,'owner','Original audited title','draft')", [id]);
      const result = id === "metadata-audit-failure"
        ? await service.updateMetadata(id, "owner", { title: "Uncommitted title" })
        : await service.submitForReview(id, "owner");
      assert.equal(result.success, false);
      assert.deepEqual((await pool.query("SELECT status,title FROM releases WHERE id=$1", [id])).rows[0],
        { status: "draft", title: "Original audited title" });
      assert.equal(Number((await pool.query("SELECT count(*) FROM release_workflow_requests WHERE release_id=$1", [id])).rows[0].count), 0);
      assert.equal(Number((await pool.query("SELECT count(*) FROM release_version_history WHERE release_id=$1", [id])).rows[0].count), 0);
    }
  });

  await t.test("concurrent metadata writes serialize their actual previous state and version numbers", async () => {
    const id = "concurrent-metadata";
    await pool.query("INSERT INTO releases(id,user_id,title,status) VALUES($1,'owner','Original concurrent title','draft')", [id]);
    const results = await Promise.all(["Concurrent first", "Concurrent second"].map(title => service.updateMetadata(id, "owner", { title })));
    assert.ok(results.every(result => result.success));
    assert.deepEqual(results.map(result => result.version).sort(), [1, 2]);
    const versions = (await pool.query("SELECT version,previous_data,changes FROM release_version_history WHERE release_id=$1 ORDER BY version", [id])).rows;
    assert.equal(versions[0].previous_data.title, "Original concurrent title");
    assert.equal(versions[1].previous_data.title, versions[0].changes.newData.title);
    assert.equal((await pool.query("SELECT title FROM releases WHERE id=$1", [id])).rows[0].title, versions[1].changes.newData.title);
  });

});
