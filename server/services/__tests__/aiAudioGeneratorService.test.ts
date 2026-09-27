import { describe, expect, it, vi } from "vitest";

vi.mock("../../../shared/ml/audio/AIAudioGenerator.js", () => ({
  AIAudioGenerator: class {
    initialize() {}
  },
}));

import { persistMaxCoreAudio } from "../aiAudioGeneratorService.js";

const wav = Buffer.alloc(256);
wav.write("RIFF", 0);
wav.write("WAVE", 8);

describe("MaxCore Studio audio persistence", () => {
  it("registers real media bytes in user-scoped PDIM storage and returns its URL", async () => {
    const uploadGeneratedFile = vi.fn().mockResolvedValue("users/owner-123/generated-audio/stored.wav");
    const getDownloadUrl = vi.fn().mockResolvedValue("/api/storage/file/users%2Fowner-123%2Fgenerated-audio%2Fstored.wav");
    const url = await persistMaxCoreAudio(null, wav.toString("base64"), {
      storage: { uploadGeneratedFile, getDownloadUrl } as any,
    }, "owner-123");
    expect(uploadGeneratedFile).toHaveBeenCalledWith(
      wav, "owner-123", "generated-audio", expect.stringMatching(/^mc_audio_.*\.wav$/), "audio/wav",
    );
    expect(getDownloadUrl).toHaveBeenCalledWith("users/owner-123/generated-audio/stored.wav");
    expect(url).toBe("/api/storage/file/users%2Fowner-123%2Fgenerated-audio%2Fstored.wav");
  });

  it("rejects non-audio success bodies before persisting", async () => {
    const uploadGeneratedFile = vi.fn();
    await expect(persistMaxCoreAudio(null, Buffer.alloc(256, "x").toString("base64"), {
      storage: { uploadGeneratedFile } as any,
    })).rejects.toThrow("non-audio content");
    expect(uploadGeneratedFile).not.toHaveBeenCalled();
  });

  it("rejects remote external URLs without fetching or leaking credentials", async () => {
    const fetchImpl = vi.fn();
    await expect(persistMaxCoreAudio("https://example.com/uploads/audio.wav", null, {
      fetchImpl: fetchImpl as any,
    })).rejects.toThrow("untrusted media URL");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not expose bytes without a verified owner", async () => {
    const uploadGeneratedFile = vi.fn();
    await expect(persistMaxCoreAudio(null, wav.toString("base64"), {
      storage: { uploadGeneratedFile } as any,
    })).rejects.toThrow("authenticated owner");
    expect(uploadGeneratedFile).not.toHaveBeenCalled();
  });
});