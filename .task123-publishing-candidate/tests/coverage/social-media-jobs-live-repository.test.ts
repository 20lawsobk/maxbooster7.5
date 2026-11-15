import { describe, beforeAll, afterAll, it } from "vitest";
import { SocialMediaJobRepository, keepMediaJobAlive } from "../../server/services/socialMediaJobRepository.js";
import { createVideoJobPollHandler, createMusicVideoJobPollHandler, rejectInvalidMusicVideoSceneRequest } from "../../server/routes/socialMediaJobHandlers.js";
import { defineSocialMediaJobContracts } from "../contracts/helpers-social-media-job-contracts.mjs";
// The real database and production handlers execute in the instrumented process.
defineSocialMediaJobContracts({
  describe,
  beforeAll: (run: () => Promise<void>) => beforeAll(run, 60000),
  afterAll: (run: () => Promise<void>) => afterAll(run, 60000),
  test: (name: string, run: () => Promise<void>) => it(name, run, 60000),
}, async () => ({ SocialMediaJobRepository, keepMediaJobAlive, createVideoJobPollHandler,
  createMusicVideoJobPollHandler, rejectInvalidMusicVideoSceneRequest }));
