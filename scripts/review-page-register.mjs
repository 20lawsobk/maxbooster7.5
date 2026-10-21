import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

// An inventory, deliberately not a functional pass/fail substitute. Browser
// journey evidence is recorded separately by readiness-assembled-acceptance.
const root = process.cwd();
const outIndex = process.argv.indexOf("--out");
if (outIndex < 0 || !process.argv[outIndex + 1]) throw new Error("Usage: node scripts/review-page-register.mjs --out <directory>");
const output = path.resolve(process.argv[outIndex + 1]);
const appSource = await readFile(path.join(root, "client/src/App.tsx"), "utf8");
const app = ts.createSourceFile("App.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const lazyPages = new Map();
function imports(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    const match = node.initializer?.getText(app).match(/import\(["'](@\/pages\/[^"']+)["']\)/);
    if (match) lazyPages.set(node.name.text, `${match[1].replace("@/", "client/src/")}.tsx`);
  }
  ts.forEachChild(node, imports);
}
imports(app);
const routes = [];
function visit(node) {
  if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(app) === "Route") {
    const attributes = node.attributes.properties;
    const route = attributes.find(a => a.name?.getText(app) === "path")?.initializer;
    const component = attributes.find(a => a.name?.getText(app) === "component")?.initializer;
    const name = component?.getText(app).replace(/^\{|\}$/g, "");
    routes.push({ route: route && ts.isStringLiteral(route) ? route.text : "*", component: name,
      file: lazyPages.get(name) ?? (name?.includes("AdminDashboard") ? lazyPages.get("AdminDashboard") : "client/src/App.tsx") });
  }
  ts.forEachChild(node, visit);
}
visit(app);
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
const testFiles = (await walk(path.join(root, "tests/unit"))).filter(file => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file));
const testSources = await Promise.all(testFiles.map(async file => [path.relative(root, file), await readFile(file, "utf8")]));
const routeSource = await readFile(path.join(root, "server/routes.ts"), "utf8");
const mountedModules = [...routeSource.matchAll(/path:\s*["']([^"']+)["'],\s*name:\s*["'][^"']+["'],\s*loader:\s*\(\)\s*=>\s*import\(["']([^"']+)["']\)/g)]
  .map(([, prefix, module]) => [prefix, `server/${module.replace(/^\.\//, "").replace(/\.js$/, "")}.ts`]);
// These direct registrations were inspected in registerRoutes separately from
// its lazy route table; do not infer handlers from coincidentally equal suffixes.
mountedModules.push(["/api/distribution", "server/routes/distribution.ts"], ["/api/social", "server/routes/socialMedia.ts"]);
const inlineApiPaths = [...routeSource.matchAll(/app\.(?:get|post|patch|put|delete)\(\s*["']([^"']+)["']/g)].map(match => match[1]);
const register = [];
for (const item of routes) {
  let file = item.file;
  let source = await readFile(path.join(root, file), "utf8");
  const reexport = source.match(/export\s*\{\s*default\s*\}\s*from\s*["']([^"']+)/);
  if (reexport) {
    file = path.posix.normalize(path.posix.join(path.posix.dirname(file), `${reexport[1]}.tsx`));
    source = await readFile(path.join(root, file), "utf8");
  }
  const apiReferences = [...new Set(source.match(/\/api\/[A-Za-z0-9_/?=&.${}-]+/g) ?? [])].sort();
  const basenames = [path.basename(item.file, ".tsx"), path.basename(file, ".tsx")];
  const tests = testSources.filter(([, content]) => basenames.some(name => content.includes(`/pages/${name}`))).map(([name]) => name);
  const serverCandidates = [...new Set(apiReferences.flatMap(api => {
    const clean = api.split(/[?${]/, 1)[0].replace(/\/$/, "");
    const modules = mountedModules.filter(([prefix]) => clean === prefix || clean.startsWith(`${prefix}/`)).map(([, file]) => file);
    if (inlineApiPaths.some(route => route === clean || route.startsWith(`${clean}/:`))) modules.push("server/routes.ts");
    return modules;
  }))].sort();
  register.push({ ...item, implementation: file, sourceInventory: "PASS", functionalReview: "UNVERIFIED — see isolated browser evidence for exercised routes",
    authHook: source.match(/\buseRequire(?:Auth|Subscription|Admin)\b/)?.[0] ?? "shared App navigation gate / API authorization",
    apiReferences, serverHandlerCandidates: serverCandidates,
    stateIndicators: { loading: /isLoading|Loading|Skeleton/.test(source), error: /isError|onError|Alert|Error/.test(source), empty: /empty|No [A-Za-z]|length\s*===?\s*0/i.test(source), forms: /<form\b|useForm\(/.test(source), mutations: /useMutation\(/.test(source) },
    directSourceContractTests: tests,
  });
}
const allPages = (await walk(path.join(root, "client/src/pages"))).filter(file => /\.tsx?$/.test(file)).map(file => path.relative(root, file)).sort();
const evidence = { generatedAt: new Date().toISOString(), scope: "All discovered App.tsx routes plus all page files. State indicators and server candidates are lexical inventory only, not reviewed semantics. No network or application mutations.",
  globalControls: ["client/src/App.tsx: route Suspense + ErrorBoundary + accessible loading status", "client/src/components/auth/AuthProvider.tsx", "client/src/lib/pageAccess.ts: navigation policy; API auth remains server responsibility", "server/middleware/auth.ts"],
  routeCount: register.length, pageFileCount: allPages.length, register,
  unroutedPageFiles: allPages.filter(file => !register.some(item => item.file === file || item.implementation === file)),
};
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "page-register.json"), `${JSON.stringify(evidence, null, 2)}\n`);
await writeFile(path.join(output, "page-register.md"), `# Page review register\n\n${evidence.scope}\n\n${register.length} routes; ${allPages.length} page files. Every route is inventoried; per-route functional completion remains UNVERIFIED unless the separately recorded browser journey proves it. Direct source tests do not prove external provider actions.\n\n| Route | Implementation | Local auth hook | API references | Direct source tests |\n| --- | --- | --- | ---: | ---: |\n${register.map(item => `| \`${item.route}\` | \`${item.implementation}\` | ${item.authHook} | ${item.apiReferences.length} | ${item.directSourceContractTests.length} |`).join("\n")}\n\n## Unrouted page files\n\n${evidence.unroutedPageFiles.map(file => `- \`${file}\` — not discovered in App.tsx; retained as UNVERIFIED.`).join("\n")}\n`);
console.log(JSON.stringify({ output, routes: register.length, pageFiles: allPages.length }));
