import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("client/src/pages/DeveloperApi.tsx", "utf8");
const file = ts.createSourceFile("DeveloperApi.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
function actual(name: string, scope: Record<string, unknown>, member?: string) {
  let body: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) {
      body = node.initializer;
      if (member && ts.isCallExpression(body)) {
        body = ((body.arguments[0] as ts.ObjectLiteralExpression).properties.find(p => p.name?.getText(file) === member) as ts.PropertyAssignment)?.initializer;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!body) throw new Error(`Missing ${name}.${member ?? ""}`);
  const output = ts.transpileModule(`return (${body.getText(file)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // eslint-disable-next-line no-new-func -- Execute repository-owned callback source with isolated test dependencies, never user input.
  return new Function(...Object.keys(scope), output)(...Object.values(scope));
}

describe("Developer API page mutation outcomes (actual callbacks, isolated transport)", () => {
  it("prevents two same-tick create clicks and normalizes the name", () => {
    const mutate = vi.fn();
    const createPending = { current: false };
    const create = actual("handleCreateKey", {
      createPending, createKeyMutation: { isPending: false, mutate },
      newKeyName: "  automation  ", newKeyTier: "free", toast: vi.fn(),
    });
    create(); create();
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ keyName: "automation", tier: "free" });
    actual("createKeyMutation", { createPending }, "onSettled")();
    expect(createPending.current).toBe(false);
  });
  it.each([{}, { success: false }, { success: true, apiKey: {} }, { success: true, apiKey: { id: "key", apiKey: "invalid" } }])("does not announce a key for malformed success %j", async payload => {
    const create = actual("createKeyMutation", {
      apiRequest: async () => ({ json: async () => payload }),
    }, "mutationFn");
    await expect(create({ keyName: "unit", tier: "free" })).rejects.toThrow("could not be verified");
  });
  it("accepts the actual one-time server key contract with a request deadline", async () => {
    const payload = { success: true, apiKey: { id: "key", apiKey: `mb_live_${"a".repeat(64)}` } };
    const apiRequest = vi.fn(async () => ({ json: async () => payload }));
    const create = actual("createKeyMutation", { apiRequest }, "mutationFn");
    await expect(create({ keyName: "unit", tier: "free" })).resolves.toBe(payload);
    expect(apiRequest.mock.calls[0][3].signal).toBeInstanceOf(AbortSignal);
  });
  it("requires explicit server acknowledgment before announcing revocation", async () => {
    const apiRequest = vi.fn(async () => ({ json: async () => ({}) }));
    const revoke = actual("deleteKeyMutation", { apiRequest }, "mutationFn");
    await expect(revoke("key/with/slash")).rejects.toThrow("not confirmed");
    expect(apiRequest).toHaveBeenCalledWith("DELETE", "/api/developer/keys/key%2Fwith%2Fslash");
  });
});
