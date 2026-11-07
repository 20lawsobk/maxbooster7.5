import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { discoverHandlers } from "./admin-route-inventory.mjs";

// Inventory only: a discovered file or handler is never an acceptance pass.
const domains = {
  artists: /artist|profile|presskit|epk/i,
  fans: /fan|membership|audience/i,
  projects: /project|workflow/i,
  studio: /studio|audio|beat|daw|mastering|mixing/i,
  distribution: /distribut|release|publishing/i,
  marketing: /social|market(?:ing)|advert|campaign|outreach|playlist/i,
  revenue: /revenue|royalt|earning|analytic/i,
  assistant: /assistant|(?:^|\/)ai|content.analysis|generat|awareness|maxcore/i,
  collaboration: /collaborat|message|team/i,
  marketplace: /marketplace|store|merch|licens/i,
  subscriptions: /billing|subscription|payment|checkout/i,
  administration: /admin|security|governance|backup|recover|developer/i,
};
const classify = name => Object.entries(domains)
  .filter(([, pattern]) => pattern.test(name)).map(([domain]) => domain);
const tracked = execFileSync("git", ["ls-files", "-z"], { maxBuffer: 32 * 1024 * 1024 })
  .toString().split("\0").filter(Boolean);
const candidates = tracked.filter(name =>
  (/^client\/src\/pages\/.*\.tsx$/.test(name) ||
   /^server\/routes(?:\/.*)?\.ts$/.test(name) ||
   /^external\/maxcore\/.*\.py$/.test(name)) &&
  !/(?:^|\/)(?:tests?|__pycache__|node_modules)(?:\/|$)/.test(name) &&
  !/(?:^|\/)(?:test_[^/]+\.py|[^/]+\.(?:test|spec)\.[^/]+)$/.test(name));
const inventory = [];
for (const name of candidates) {
  if (!fs.existsSync(name)) {
    inventory.push({ file: name, status: "MISSING_WORKTREE_FILE" });
    continue;
  }
  const content = fs.readFileSync(name, "utf8");
  const { handlers, unresolvedDeclarations } = discoverHandlers(name, content);
  inventory.push({
    file: name,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    domains: classify(name),
    kind: name.startsWith("client/") ? "page" : "route-source",
    handlers,
    unresolvedDeclarations,
    acceptance: "UNVERIFIED",
  });
}
const result = {
  schema: 1,
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
  productionReady: false,
  limitations: [
    "Static discovery, not executed journeys, authorization proof or test coverage.",
    "Literal paths are relative declarations: router mounting and dynamic handlers require tracing.",
    "Domain assignment is a filename heuristic; cross-domain and unclassified files require review.",
    "Tracked pages, TypeScript route sources and MaxCore Python only; this is not an entire-repository completeness claim.",
    "Source hashes bind each existing file; HEAD alone does not identify dirty changes.",
  ],
  domains: Object.keys(domains).map(domain => ({
    domain,
    files: inventory.filter(item => item.domains?.includes(domain)).map(item => item.file),
    acceptance: "UNVERIFIED",
  })),
  unclassified: inventory.filter(item => item.domains?.length === 0).map(item => item.file),
  inventory,
};
const output = "docs/testing/admin-gap-inventory.json";
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({
  output, files: inventory.length,
  pages: inventory.filter(item => item.kind === "page").length,
  literalHandlers: inventory.reduce((sum, item) => sum + (item.handlers?.length ?? 0), 0),
  unresolvedDeclarations: inventory.reduce((sum, item) => sum + (item.unresolvedDeclarations ?? 0), 0),
  unclassified: result.unclassified.length,
}));
