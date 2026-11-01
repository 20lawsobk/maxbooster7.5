import { closeSync } from "node:fs";

const {
  openConsistentLocalPdimSnapshot,
  startLocalPdimServer,
  stopLocalPdimServer,
} = await import("../../server/lib/localPdimServer.ts");

try {
  await startLocalPdimServer();
  const { seedLegacyPdimFixture } = await import("./legacy-pdim-fixture.js");
  const first = Buffer.from("isolated retained PDIM recovery fixture alpha\n");
  const second = Buffer.from("isolated retained PDIM recovery fixture beta\n");
  await seedLegacyPdimFixture([
    { owner: "simulation-owner-a", name: "alpha.bin", bytes: first },
    { owner: "simulation-owner-b", name: "alpha-copy.bin", bytes: first },
    { owner: "simulation-owner-a", name: "beta.bin", bytes: second },
  ]);
  const descriptor = openConsistentLocalPdimSnapshot();
  closeSync(descriptor.fd);
  await stopLocalPdimServer();
  process.stdout.write("RETAINED_PDIM_FIXTURE_READY\n");
} catch {
  await stopLocalPdimServer().catch(() => {});
  process.stderr.write("Retained PDIM source fixture creation failed\n");
  process.exitCode = 1;
}