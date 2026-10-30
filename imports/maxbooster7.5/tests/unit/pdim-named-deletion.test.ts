import { describe, expect, it, vi } from "vitest";
import { PocketStorageService } from "../../external/pdim/artifacts/api-server/src/pocket-dimension/fabric/PocketStorageService";

function fixture(container: { volumeId: string } | null) {
  const service = Object.create(PocketStorageService.prototype);
  service.getOrCreateContainer = vi.fn().mockResolvedValue(container);
  service.objectIndex = {
    listObjects: vi.fn().mockResolvedValue([
      { id: "old-1", originalName: "retired-snapshot" },
      { id: "current", originalName: "current-snapshot" },
      { id: "old-2", originalName: "retired-snapshot" },
    ]),
  };
  service.deleteObject = vi.fn().mockResolvedValue(undefined);
  return service;
}

describe("PDIM named-object retirement", () => {
  it("uses the existing owner's pocket and authoritative reference-counted deletion", async () => {
    const service = fixture({ volumeId: "owner-volume" });
    await service.deleteNamedObject("owner-a", "redis-snapshots", "retired-snapshot");
    expect(service.getOrCreateContainer).toHaveBeenCalledWith("owner-a", "redis-snapshots", false);
    expect(service.objectIndex.listObjects).toHaveBeenCalledWith("owner-volume");
    expect(service.deleteObject.mock.calls).toEqual([["old-1"], ["old-2"]]);
  });
  it("does not create a pocket to delete a missing object", async () => {
    const service = fixture(null);
    await service.deleteNamedObject("owner-a", "absent-pocket", "retired-snapshot");
    expect(service.objectIndex.listObjects).not.toHaveBeenCalled();
    expect(service.deleteObject).not.toHaveBeenCalled();
  });
  it("leaves differently named objects untouched", async () => {
    const service = fixture({ volumeId: "owner-volume" });
    await service.deleteNamedObject("owner-a", "redis-snapshots", "not-present");
    expect(service.deleteObject).not.toHaveBeenCalled();
  });
  it("propagates a failed deletion instead of claiming retirement succeeded", async () => {
    const service = fixture({ volumeId: "owner-volume" });
    service.deleteObject.mockRejectedValue(new Error("storage unavailable"));
    await expect(service.deleteNamedObject("owner-a", "redis-snapshots", "retired-snapshot"))
      .rejects.toThrow("storage unavailable");
  });
});
