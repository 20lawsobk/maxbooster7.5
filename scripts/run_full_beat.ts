/**
 * One-shot: run a full Beat Money Loop cycle with a FULL-LENGTH beat (120 s).
 * Waits for MaxCore to be reachable first, then runs the cycle end-to-end
 * (generate → upload → list → price). Exits 0 on success, 1 on failure,
 * 2 when MaxCore never became reachable within the wait budget.
 */
process.env.BEAT_DURATION_SECONDS = "120";

const MAXCORE = (process.env.AI_SERVER_URL || "https://secure-ai-forge.replit.app").replace(/\/api\/?$/, "");
const WAIT_BUDGET_MS = Number(process.env.MC_WAIT_BUDGET_MS || 180_000);

async function reachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(`${MAXCORE}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const start = Date.now();
  process.stdout.write("Waiting for MaxCore...\n");
  while (!(await reachable())) {
    if (Date.now() - start > WAIT_BUDGET_MS) {
      console.log("MaxCore never became reachable — exiting 2");
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log("MaxCore online — starting full-length (120s) beat cycle");

  const { beatMoneyLoopService } = await import("../server/services/beatMoneyLoopService.js");
  const result = await beatMoneyLoopService.runCycle("manual");
  console.log("RESULT:", JSON.stringify(result, null, 2));
  process.exit(result.status === "failed" ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e);
  process.exit(1);
});
