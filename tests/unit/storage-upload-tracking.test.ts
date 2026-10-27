import { describe, expect, it } from "vitest";
import { assertTrackedUpload } from "../../server/services/storageUploadTracking.js";

describe("single-shot storage upload tracking", () => {
  const expected = {
    userId: "owner", fileKey: "users/owner/audio/uuid/song.wav",
    sizeBytes: 128, mimeType: "audio/wav", fileName: "song.wav",
  };
  const tracked = { ...expected, deletedAt: null as Date | null };

  it("accepts an exact active owner record", () => {
    expect(() => assertTrackedUpload(tracked, expected)).not.toThrow();
  });
  it("rejects an absent row after an ignored insert conflict", () => {
    expect(() => assertTrackedUpload(undefined, expected)).toThrow();
  });
  it("rejects a different tenant's row", () => {
    expect(() => assertTrackedUpload({ ...tracked, userId: "outsider" }, expected)).toThrow();
  });
  it("rejects a different storage key", () => {
    expect(() => assertTrackedUpload({ ...tracked, fileKey: "users/owner/other" }, expected)).toThrow();
  });
  it("rejects a soft-deleted record", () => {
    expect(() => assertTrackedUpload({ ...tracked, deletedAt: new Date() }, expected)).toThrow();
  });
  it("rejects incorrect byte length", () => {
    expect(() => assertTrackedUpload({ ...tracked, sizeBytes: 1 }, expected)).toThrow();
  });
  it("rejects a different MIME type", () => {
    expect(() => assertTrackedUpload({ ...tracked, mimeType: "text/html" }, expected)).toThrow();
  });
  it("rejects a different filename", () => {
    expect(() => assertTrackedUpload({ ...tracked, fileName: "different.wav" }, expected)).toThrow();
  });
});
