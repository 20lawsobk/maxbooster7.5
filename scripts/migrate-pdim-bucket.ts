/** Explicit offline import. Never removes local source files or enables the new
 * backend. Operator must stop the application before this command runs. */
import { createConnection } from "node:net";
import { createRecoveryStorage, verifyManagedPrivateStorage } from "./recovery-private-store.mjs";

const namespace = process.argv.find(arg => arg.startsWith("--namespace="))?.slice("--namespace=".length);
if (!process.argv.includes("--confirm-offline-migration") ||
    !namespace || process.env.PDIM_PERSISTENCE === "app-storage") {
  throw new Error("Explicit offline migration configuration and confirmation required");
}
process.env.PDIM_OFFLINE_MIGRATION = "1";
const port = Number(process.env.LOCAL_PDIM_PORT || 5556);
const occupied = await new Promise<boolean>((resolve, reject) => {
  const socket = createConnection({ port, host: "127.0.0.1" });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", error => {
    if ((error as NodeJS.ErrnoException).code === "ECONNREFUSED") resolve(false);
    else reject(error);
  });
});
if (occupied) throw new Error("PDIM owner is still running; stop the preview before migration");

const owner = await import("../server/lib/localPdimServer");
process.env.PDIM_EXEC_URL = owner.getLocalPdimUrl();
let started = false;
try {
  const storage = await createRecoveryStorage({
    bucketId: process.env.DATABASE_RECOVERY_BUCKET_ID || process.env.REPLIT_BUCKET_ID,
  });
  await verifyManagedPrivateStorage(storage);
  console.log(JSON.stringify({ phase: "restore-local-source" }));
  await owner.startLocalPdimServer();
  started = true;
  console.log(JSON.stringify(await owner.importOfflinePdimToBucket(namespace)));
} catch (error) {
  console.error(JSON.stringify({ imported: false,
    errorType: error instanceof Error ? error.name : "unknown",
    code: (error as { code?: unknown })?.code ?? null }));
  process.exitCode = 1;
} finally {
  if (started) await owner.stopLocalPdimServer();
}
