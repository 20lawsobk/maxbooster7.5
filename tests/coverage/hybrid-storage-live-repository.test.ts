import { describe, beforeAll, afterAll, it } from "vitest";
import { HybridStorageService, parseLegacyHybridIndex } from "../../server/services/hybridStorageService.js";
import { HybridImmutableByteStore } from "../../server/services/hybridImmutableByteStore.js";
import { HybridStorageRepository } from "../../server/services/hybridStorageRepository.js";
import { defineHybridStorageContracts } from "../contracts/helpers-hybrid-storage-contracts.mjs";
// Real TS execution is instrumented by Vitest; assertions/SQL match the Node suite.
defineHybridStorageContracts({
  describe,
  beforeAll: (run: () => Promise<void>) => beforeAll(run, 60000),
  afterAll: (run: () => Promise<void>) => afterAll(run, 60000),
  test: (name: string, run: () => Promise<void>) => it(name, run, 60000),
}, async () => ({ HybridStorageService, parseLegacyHybridIndex, HybridImmutableByteStore, HybridStorageRepository }));
