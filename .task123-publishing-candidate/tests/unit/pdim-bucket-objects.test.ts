import { describe, expect, it } from "vitest";
import { configuredPdimBucketId } from "../../server/lib/pdimBucketObjects.js";

describe("configured PDIM bucket identity", () => {
  it("prefers the explicitly configured Replit App Storage bucket", () => {
    expect(configuredPdimBucketId({
      Replit_storage_bucket_id: "owner-private-bucket",
      DATABASE_RECOVERY_BUCKET_ID: "recovery-bucket",
      REPLIT_BUCKET_ID: "legacy-bucket",
    })).toBe("owner-private-bucket");
  });

  it("retains existing recovery and legacy aliases when the explicit ID is absent", () => {
    expect(configuredPdimBucketId({
      DATABASE_RECOVERY_BUCKET_ID: "recovery-bucket",
      REPLIT_BUCKET_ID: "legacy-bucket",
    })).toBe("recovery-bucket");
    expect(configuredPdimBucketId({
      REPLIT_BUCKET_ID: "legacy-bucket",
    })).toBe("legacy-bucket");
    expect(configuredPdimBucketId({})).toBeUndefined();
  });
});
