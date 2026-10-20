import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import vm from "node:vm";
import ts from "typescript";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableColumns } from "drizzle-orm";
import { users } from "../../shared/schema";
import { getNewPasswordError } from "../../shared/passwordPolicy";
import { getAccountEligibilityError } from "../../shared/agePolicy";

const state = vi.hoisted(() => ({ database: undefined as any }));
vi.mock("../../server/db", () => ({
  db: new Proxy({}, { get: (_target, name) => {
    const value = state.database[name];
    return typeof value === "function" ? value.bind(state.database) : value;
  } }),
}));
import { consentService } from "../../server/services/consentService";

let directory: string;
let postgres: ChildProcess | undefined;
let stopped: Promise<void> | undefined;
let pool: Pool | undefined;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "paid-consent-pg-"));
  const init = spawnSync("initdb", ["-D", directory, "-U", "fixture", "--auth=trust", "--no-locale", "--encoding=UTF8"], { encoding: "utf8", timeout: 30000 });
  if (init.status !== 0) throw new Error(`Private PostgreSQL initdb failed: ${init.stderr ?? init.error?.message}`);
  const port = await new Promise<number>((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const value = (socket.address() as { port: number }).port;
      socket.close(error => error ? reject(error) : resolve(value));
    });
  });
  postgres = spawn("postgres", ["-D", directory, "-h", "127.0.0.1", "-k", directory, "-p", String(port)], { stdio: ["ignore", "ignore", "pipe"] });
  stopped = new Promise(resolve => postgres!.once("exit", () => resolve()));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Private PostgreSQL startup timed out")), 15000);
    postgres!.once("error", error => { clearTimeout(timer); reject(error); });
    postgres!.once("exit", code => { clearTimeout(timer); reject(new Error(`Private PostgreSQL exited ${code}`)); });
    postgres!.stderr!.on("data", data => {
      if (String(data).includes("database system is ready to accept connections")) { clearTimeout(timer); resolve(); }
    });
  });
  // This fixture never reads workspace database URLs or inherited credentials.
  pool = new Pool({ host: "127.0.0.1", port, user: "fixture", database: "postgres", ssl: false });
  state.database = drizzle(pool);
  const columns = Object.values(getTableColumns(users)).map(column =>
    column.name === "id" ? '"id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::text'
      : `"${column.name}" ${column.getSQLType()}`,
  );
  await pool.query(`CREATE TABLE users (${columns.join(",")}, UNIQUE(email), UNIQUE(username))`);
  await pool.query(`CREATE TABLE registration_consents (
    user_id varchar PRIMARY KEY REFERENCES users(id), birthdate date, age_verified boolean,
    tos_accepted_at timestamp, tos_version text, privacy_accepted_at timestamp, privacy_version text,
    marketing_consent boolean, marketing_consent_at timestamp, created_at timestamp, updated_at timestamp
  )`);
  await pool.query(`CREATE TABLE consent_logs (
    id serial PRIMARY KEY, user_id varchar REFERENCES users(id), consent_type text, action text,
    version text, ip_address text, user_agent text, metadata jsonb, created_at timestamp,
    CONSTRAINT fail_first_privacy_write CHECK (consent_type <> 'privacy')
  )`);
}, 30000);

afterAll(async () => {
  await pool?.end();
  if (postgres && postgres.exitCode === null) { postgres.kill("SIGTERM"); await stopped; }
  if (directory) rmSync(directory, { recursive: true, force: true });
});

it("atomically rolls back account, consent row and audit logs, then retries the same paid registration", async () => {
  const source = readFileSync("server/routes.ts", "utf8");
  const ast = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.ES2022, true);
  let route: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(ast) === "app" && node.expression.name.text === "post" &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/api/register-after-payment") {
      route = node.arguments.at(-1);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!route) throw new Error("Paid registration route missing");
  const code = ts.transpileModule(`globalThis.handler = ${route.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const session: Record<string, unknown> = {};
  const context = vm.createContext({
    db: state.database, users, consentService, getNewPasswordError, getAccountEligibilityError,
    logger: { warn() {}, info() {} },
    bcrypt: { hash: async () => "fixture-only-hash" },
    require: () => ({ assertRegistrationEnabled: async () => {}, userPocketService: { initializeUserStorage: async () => {} } }),
    sessionRegenerate: async () => {}, sessionSave: async () => {}, sessionAuthority: async () => ({ issue: async () => "fixture-generation" }),
    storage: {
      getUserByEmail: async (email: string) => (await pool!.query("SELECT * FROM users WHERE email=$1", [email])).rows[0],
      getUserByUsername: async (username: string) => (await pool!.query("SELECT * FROM users WHERE username=$1", [username])).rows[0],
    },
    stripe: { checkout: { sessions: { retrieve: async () => ({
      payment_status: "paid", mode: "subscription", customer_email: "paid-fixture@example.invalid",
      metadata: { username: "paid_fixture", tier: "monthly", birthdate: "1990-06-15" },
      line_items: { data: [{ price: { id: "fixture-price" } }] },
    }) } } },
    SUBSCRIPTION_PLANS: { monthly: { mode: "subscription" } }, getStripePriceIds: () => ({ monthly: "fixture-price" }),
  });
  vm.runInContext(code, context);
  async function invoke() {
    const response = {
      statusCode: 200, body: undefined as any,
      status(value: number) { this.statusCode = value; return this; },
      json(value: any) { this.body = value; return this; },
    };
    await (context.handler as Function)({
      body: { sessionId: "cs_fixture_same_payment", password: "Password1!", tosAccepted: true, privacyAccepted: true, marketingConsent: true },
      session, ip: "127.0.0.1", get: () => "fixture-agent",
    }, response);
    return response;
  }
  expect((await invoke()).statusCode).toBe(500);
  expect(session.userId).toBeUndefined();
  for (const table of ["users", "registration_consents", "consent_logs"]) {
    expect((await pool!.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count).toBe(0);
  }
  await pool!.query("ALTER TABLE consent_logs DROP CONSTRAINT fail_first_privacy_write");
  const retried = await invoke();
  expect(retried.statusCode).toBe(200);
  expect(retried.body.consentRecorded).toBe(true);
  expect(session.userId).toBe(retried.body.user.id);
  expect((await pool!.query("SELECT count(*)::int AS count FROM users")).rows[0].count).toBe(1);
  expect((await pool!.query("SELECT marketing_consent FROM registration_consents")).rows).toEqual([{ marketing_consent: true }]);
  expect((await pool!.query("SELECT count(*)::int AS count FROM consent_logs")).rows[0].count).toBe(3);
});
