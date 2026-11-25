import { describe, before, after, it } from "node:test";
import { loadDatabaseSubject } from "./payment-processing/helpers-database-postgres.mjs";
import { defineSocialMediaJobContracts } from "./contracts/helpers-social-media-job-contracts.mjs";
defineSocialMediaJobContracts({
  describe: (name, run) => describe(name, { timeout: 60000, concurrency: false }, run),
  beforeAll: before, afterAll: after, test: it,
}, async () => ({
  ...await loadDatabaseSubject("server/services/socialMediaJobRepository.ts"),
  ...await loadDatabaseSubject("server/routes/socialMediaJobHandlers.ts"),
}));
