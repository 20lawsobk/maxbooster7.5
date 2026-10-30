import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute the production method without starting autonomous loops or providers.
const file = "server/services/autonomousService.ts";
const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
let method = "";
function visit(node: ts.Node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(source) === "dispatchAutonomousContent") method = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
if (!method) throw new Error("Autonomous dispatch entrypoint not found");
function harness() {
  const post: Record<string, unknown> = { id: "post-fixture", userId: "owner-fixture", platforms: ["instagram"], status: "scheduled" };
  const update = vi.fn(async (_id: string, changes: Record<string, unknown>) => Object.assign(post, changes));
  const publish = vi.fn(async () => { post.status = "pending"; return true; });
  const dispatch = vm.runInNewContext(ts.transpile(`class Isolated { ${method} }; new Isolated().dispatchAutonomousContent;`, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }), { storage: { getSocialPost: async () => post, updateSocialPost: update }, socialQueueService: { publishToPlatform: publish },
    logger: { info() {}, warn() {} } });
  return { post, update, publish, dispatch };
}

it("leaves accepted scheduled work claimable instead of claiming provider publication", async () => {
  const f = harness();
  await f.dispatch("post-fixture");
  expect(f.publish).toHaveBeenCalledWith("post-fixture", "instagram");
  expect(f.post.status).toBe("pending"); // claimSocialPost requires this state.
  expect(f.post.publishedAt).toBeUndefined();
  expect(f.update).not.toHaveBeenCalled();
});
it("does not overwrite a worker claim that races with queue acceptance", async () => {
  const f = harness();
  f.publish.mockImplementation(async () => { f.post.status = "posting"; return true; });
  await f.dispatch("post-fixture");
  expect(f.post.status).toBe("posting");
  expect(f.post.publishedAt).toBeUndefined();
});
it("preserves scheduled work when no platform account accepts it", async () => {
  const f = harness();
  f.publish.mockImplementation(async () => false);
  await f.dispatch("post-fixture");
  expect(f.post.status).toBe("scheduled");
  expect(f.update).not.toHaveBeenCalled();
});
it("does not fabricate published state after a queue failure", async () => {
  const f = harness();
  f.publish.mockRejectedValue(new Error("queue unavailable"));
  await f.dispatch("post-fixture");
  expect(f.post.status).toBe("scheduled");
  expect(f.post.publishedAt).toBeUndefined();
});
