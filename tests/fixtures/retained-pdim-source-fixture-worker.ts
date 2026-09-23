import { closeSync } from "node:fs";

const {
  openConsistentLocalPdimSnapshot,
  startLocalPdimServer,
  stopLocalPdimServer,
} = await import("../../server/lib/localPdimServer.ts");

try {
  await startLocalPdimServer();
  const { hybridStorageService } = await import(
    "../../server/services/hybridStorageService.ts"
  );
  const first = Buffer.from("isolated retained PDIM recovery fixture alpha\n");
  const second = Buffer.from("isolated retained PDIM recovery fixture beta\n");
  await hybridStorageService.upload(
    "simulation-owner-a",
    "alpha.bin",
    first,
    "application/octet-stream",
  );
  await hybridStorageService.upload(
    "simulation-owner-b",
    "alpha-copy.bin",
    first,
    "application/octet-stream",
  );
  await hybridStorageService.upload(
    "simulation-owner-a",
    "beta.bin",
    second,
    "application/octet-stream",
  );
  const descriptor = openConsistentLocalPdimSnapshot();
  closeSync(descriptor.fd);
  await stopLocalPdimServer();
  process.stdout.write("RETAINED_PDIM_FIXTURE_READY\n");
} catch {
  await stopLocalPdimServer().catch(() => {});
  process.stderr.write("Retained PDIM source fixture creation failed\n");
  process.exitCode = 1;
}