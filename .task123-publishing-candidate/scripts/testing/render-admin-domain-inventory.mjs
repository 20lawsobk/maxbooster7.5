import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const inventoryPath = "docs/testing/admin-gap-inventory.json";
const routesSource = fs.readFileSync("server/routes.ts", "utf8");
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const registryStart = routesSource.indexOf("const routeModules = [");
const registryEnd = routesSource.indexOf("\n  ];", registryStart);
if (registryStart < 0 || registryEnd < 0) {
  throw new Error("Could not locate the route module registry in server/routes.ts");
}
const registry = routesSource.slice(registryStart, registryEnd);
const mounts = new Map();
for (const object of registry.matchAll(/\{([^{}]*)\}/gs)) {
  const pathMatch = object[1].match(/path:\s*"([^"]+)"/);
  const importMatch = object[1].match(/import\("\.\/routes\/([^"]+)"/);
  if (pathMatch && importMatch) {
    mounts.set(`server/routes/${importMatch[1]}.ts`, pathMatch[1]);
  }
}
for (const [file, prefix] of Object.entries({
  "server/routes/admin.ts": "/api/admin",
  "server/routes/distribution.ts": "/api/distribution",
  "server/routes/artistProgress.ts": "/api/artist-progress",
  "server/routes/artistProfiles.ts": "/api/artist-profiles",
  "server/routes/revenueForecast.ts": "/api/revenue-forecast",
  "server/routes/collaboration.ts": "/api/collaboration",
  "server/routes/fanCampaigns.ts": "/api/fan-campaigns",
  "server/routes/assistant.ts": "/api/assistant",
  "server/routes/socialMedia.ts": "/api/social",
  "server/routes/customWorkflows.ts": "/api/custom-workflows",
  "server/routes/musicWorkflowAutomations.ts": "/api/music-workflow-automations",
  "server/routes/projectBudgets.ts": "/api/project-budgets",
  "server/routes/maxcore.ts": "/api/maxcore",
  "server/routes/maxcoreProxy.ts": "",
})) {
  mounts.set(file, prefix);
}

function resolveLocalImport(sourceFile, specifier) {
  const target = path.posix.normalize(
    path.posix.join(
      path.posix.dirname(sourceFile),
      specifier.replace(/\.(?:js|mjs|cjs)$/, ""),
    ),
  );
  for (const candidate of [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.js`,
    `${target}.mjs`,
    `${target}/index.ts`,
  ]) {
    if (fs.existsSync(path.join(root, candidate))) return candidate;
  }
  return null;
}

function pageApiReferences(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  return [...new Set(
    [...source.matchAll(/["'`]([^"'`]*\/api\/[^"'`]*)["'`]/g)]
      .map(match => match[1].trim())
      .filter(Boolean),
  )].sort();
}

const lines = [
  "# Admin-visible domain action inventory",
  "",
  `Generated from \`${inventoryPath}\` at source revision \`${inventory.sourceRevision}\`.`,
  `Inventory SHA-256: \`${createHash("sha256").update(fs.readFileSync(inventoryPath)).digest("hex")}\`.`,
  "",
  "This is a source inventory, not evidence that each operation succeeds. Page files identify admin-visible surfaces; registered route declarations show their server entry points. Service, storage, schema, and worker imports are listed where statically resolvable. Provider-dependent operations remain blocked unless an acceptance receipt says otherwise.",
  "",
  "## Domains",
  "",
];

for (const domain of inventory.domains) {
  const items = domain.files
    .map(file => inventory.inventory.find(item => item.file === file))
    .filter(Boolean);
  const pages = items.filter(item => item.kind === "page");
  const routeSources = items.filter(item => item.kind === "route-source");
  const otherSources = items.filter(item => item.kind !== "page" && item.kind !== "route-source");
  const declaredHandlers = routeSources.reduce((sum, item) => sum + (item.handlers?.length ?? 0), 0);
  const unresolvedDeclarations = items.reduce((sum, item) => sum + (item.unresolvedDeclarations ?? 0), 0);

  lines.push(
    `### ${domain.domain}`,
    "",
    `Source acceptance: **${domain.acceptance}**. Inventory contains ${pages.length} UI page files, ${routeSources.length} route/worker source files, ${declaredHandlers} declared handlers, and ${unresolvedDeclarations} unresolved declarations.`,
    "",
    "UI pages:",
  );
  for (const page of pages) {
    const references = pageApiReferences(page.file);
    lines.push(
      `- \`${page.file}\`${references.length ? ` — UI API references: ${references.map(route => `\`${route}\``).join(", ")}` : " — no literal API URL found; inspect imported hooks/components."}`,
    );
  }
  lines.push(
    "",
    "Server route and worker actions:",
  );

  for (const item of routeSources) {
    const prefix = mounts.get(item.file);
    const hasMount = mounts.has(item.file);
    lines.push(
      "",
      `- \`${item.file}\`${hasMount ? (prefix ? ` (mounted at \`${prefix}\`)` : " (mounted at the application root)") : " (no mount found in the route registry or direct-mount list)"} — ${item.handlers?.length ?? 0} declared action(s).`,
    );
    if (item.handlers?.length) {
      for (const handler of item.handlers) {
        const endpoint = hasMount && prefix
          ? `${prefix.replace(/\/$/, "")}/${handler.declaredPath.replace(/^\//, "")}`
          : handler.declaredPath;
        lines.push(`  - \`${handler.method} ${endpoint}\``);
      }
    }
    const source = fs.readFileSync(path.join(root, item.file), "utf8");
    const localDependencies = new Set();
    for (const match of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = resolveLocalImport(item.file, match[1]);
      if (target) localDependencies.add(target);
    }
    if (localDependencies.size) {
      lines.push(`  - Local service/schema/storage dependencies: ${[...localDependencies].sort().map(file => `\`${file}\``).join(", ")}`);
    }
  }

  if (otherSources.length) {
    lines.push("", "Additional worker/service source candidates:");
    lines.push(...otherSources.map(item => `- \`${item.file}\` (${item.kind})`));
  }
  lines.push("", `Inventory source files: ${items.length}.`, "");
}

lines.push(
  "## Evidence boundary",
  "",
  "The executable outcomes and provider-blocked actions are recorded in [admin-domain-acceptance.md](admin-domain-acceptance.md). This inventory must be regenerated after changing source with `node scripts/testing/admin-gap-inventory.mjs`, then reviewed; discovery does not promote an action to PASS.",
  "",
);

fs.writeFileSync("docs/testing/admin-domain-action-inventory.md", lines.join("\n"));
console.log(`Wrote docs/testing/admin-domain-action-inventory.md for ${inventory.domains.length} domains`);
