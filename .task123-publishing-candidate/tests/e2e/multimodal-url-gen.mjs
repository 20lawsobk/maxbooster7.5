// Live E2E: Social "Generate from URL" → /api/multimodal/generate (text/image/audio)
// Run: node tests/e2e/multimodal-url-gen.mjs  (app must be running on :5000)
const BASE = "http://localhost:5000";
const jar = {};
function setCookies(res) {
  const sc = res.headers.getSetCookie?.() || [];
  for (const c of sc) { const [kv] = c.split(";"); const [k,v] = kv.split("="); jar[k]=v; }
}
function cookieHeader() { return Object.entries(jar).map(([k,v])=>`${k}=${v}`).join("; "); }
async function req(method, path, body, extra={}) {
  const res = await fetch(BASE+path, {
    method,
    headers: { "Content-Type":"application/json", Cookie: cookieHeader(), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  setCookies(res);
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
const uname = "mmtest_" + Date.now();
let r = await req("POST","/api/auth/register",{ username: uname, email: uname+"@example.com", password: "Testing123!@#" });
console.log("register:", r.status);
r = await req("GET","/api/csrf-token");
const csrf = r.data?.csrfToken || r.data?.token;
console.log("csrf:", r.status, !!csrf);
const found = [];
async function gen(modality) {
  const t0 = Date.now();
  const r = await req("POST","/api/multimodal/generate",{
    input: { modality: "url", payload: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp" },
    platforms: ["instagram"],
    intent: "Music lovers",
    constraints: { outputModality: modality, styleTags: [modality] },
  }, { "x-csrf-token": csrf });
  const assets = r.data?.assets || [];
  console.log(`\n=== ${modality} → ${r.status} in ${((Date.now()-t0)/1000).toFixed(1)}s, assets: ${assets.length}`);
  for (const a of assets.slice(0,4)) {
    console.log(`  [${a.modality}] platform=${a.platform} source=${a.metadata?.source ?? "?"} payload=${String(a.payload).slice(0,200)}`);
    if (typeof a.payload === "string" && a.payload.startsWith("/")) found.push(a.payload);
  }
  if (r.status !== 200) console.log("  body:", JSON.stringify(r.data).slice(0,300));
}
await gen("text");
await gen("image");
await gen("audio");
for (const p of found) {
  const res = await fetch(BASE+p, { headers: { Cookie: cookieHeader() } });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`\nserve-check ${p} → ${res.status} ${res.headers.get("content-type")} ${buf.length}b magic=${buf.slice(0,4).toString("hex")}`);
}
