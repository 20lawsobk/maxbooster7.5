const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Compile the actual service methods, isolating only persistence; no application
// startup, external services, or customer database writes.
function method(file, name, globals) {
  const text = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let found;
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) found = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, name);
  const code = ts.transpileModule(`class Subject { ${found} }; new Subject()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(code, globals);
}
const artistProfiles = { id: "profile.id", userId: "profile.owner" };
const artistProfileReleases = { artistProfileId: "link.profile", releaseId: "link.release" };
const eq = (field, value) => row => row[field] === value;
const and = (...predicates) => row => predicates.every(p => p(row));

test("profile deletion locks an owned row before deleting any associations", async () => {
  for (const userId of ["other", "owner"]) {
    const mutations = [];
    const tx = {
      select: () => ({ from: () => ({ where: predicate => ({
        for: async mode => {
          assert.equal(mode, "update");
          return predicate({ "profile.id": "victim", "profile.owner": "owner" }) ? [{ id: "victim" }] : [];
        },
      }) }) }),
      delete: table => ({ where: predicate => {
        mutations.push(table);
        return { returning: async () => predicate({ "profile.id": "victim", "profile.owner": "owner" }) ? [{ id: "victim" }] : [] };
      } }),
    };
    const subject = method("server/services/artistProfileService.ts", "deleteProfile", {
      db: { transaction: async callback => callback(tx) }, artistProfiles, artistProfileReleases, eq, and,
    });
    assert.equal(await subject.deleteProfile("victim", userId), userId === "owner");
    assert.equal(mutations.length, userId === "owner" ? 2 : 0);
  }
});
test("release lookup scopes profiles to the requester", async () => {
  const rows = [
    { "link.release": "release", "profile.owner": "owner", profile: { id: "private" } },
    { "link.release": "release", "profile.owner": "other", profile: { id: "allowed" } },
  ];
  const subject = method("server/services/artistProfileService.ts", "getProfilesByRelease", {
    db: { select: () => ({ from: () => ({ innerJoin: () => ({
      where: predicate => ({ limit: async () => rows.filter(predicate) }),
    }) }) }) }, artistProfiles, artistProfileReleases, eq, and,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await subject.getProfilesByRelease("release", "other"))), [{ id: "allowed" }]);
});
test("private collaboration cannot be joined but public open projects can", async () => {
  for (const isPublic of [false, true]) {
    let selects = 0, inserts = 0;
    const results = [[{ id: "p", isPublic, status: "open", maxMembers: 10 }], [], []];
    const subject = method("server/services/collaborationService.ts", "joinProject", {
      db: {
        select: () => ({ from: () => ({ where: () => {
          const result = results[selects++];
          const promise = Promise.resolve(result);
          promise.limit = async () => result;
          return promise;
        } }) }),
        insert: () => ({ values: member => ({ returning: async () => { inserts++; return [member]; } }) }),
      },
      collaborationProjects: { id: "id" }, projectMembers: {}, eq, and,
    });
    if (!isPublic) await assert.rejects(subject.joinProject("other", "p"), /not found/);
    else assert.equal((await subject.joinProject("other", "p")).status, "active");
    assert.equal(inserts, isPublic ? 1 : 0);
  }
});
test("alternate storefront route refuses unpublished stores without requiring a session", async () => {
  const source = fs.readFileSync("server/routes/storefront.ts", "utf8");
  const start = source.indexOf('router.get("/:slug",');
  const end = source.indexOf("\n});", start) + 4;
  let handler;
  const storefrontService = { getStorefrontBySlug: async () => ({ isPublic: false }) };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { router: { get: (_, fn) => { handler = fn; } }, storefrontService });
  for (const isPublic of [false, true]) {
    storefrontService.getStorefrontBySlug = async () => ({ isPublic });
    let status = 200, body;
    const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
    await handler({ params: { slug: "known" } }, res);
    assert.equal(status, isPublic ? 200 : 404);
    assert.equal(body.isPublic, isPublic ? true : undefined);
  }
});