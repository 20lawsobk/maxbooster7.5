import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), poll: vi.fn(),
  downloadFile: vi.fn(), uploadGeneratedFile: vi.fn(), getDownloadUrl: vi.fn(), uploadFile: vi.fn() }));
vi.mock("../../server/services/maxcoreClient.js", () => ({ MaxCoreAIClient: { generate: mocks.generate, poll: mocks.poll } }));
vi.mock("../../server/services/storageService.js", () => ({ storageService: {
  downloadFile: mocks.downloadFile, uploadGeneratedFile: mocks.uploadGeneratedFile,
  getDownloadUrl: mocks.getDownloadUrl, uploadFile: mocks.uploadFile,
} }));
vi.mock("../../server/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../server/services/musicIndustryContextFilter.js", () => ({ musicIndustryContextFilter: {} }));
vi.mock("../../shared/ml/audio/AIAudioGenerator.js", () => ({ AIAudioGenerator: class { initialize() {} } }));
import { generateFromText, generateFromReference } from "../../server/services/aiAudioGeneratorService.js";
import { synthesizeToWAV } from "../../server/services/musicGenerationService.js";

function playableWav() {
  const frames = 800, channels = 2, rate = 8000, bytes = frames * channels * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * channels * 2, 28);
  wav.writeUInt16LE(channels * 2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(bytes, 40);
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++) {
    wav.writeInt16LE(Math.round(Math.sin(frame * 2 * Math.PI * 440 / rate) * 2000), 44 + (frame * channels + channel) * 2);
  }
  return wav;
}
const ownedUrl = "/api/storage/file/users%2Fowner%2Fgenerated-audio%2Ftest.wav";
const parameters = { key: "F#", scale: "minor" as const, tempo: 136, mood: "calm", genre: "house", structure: 8 };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generate.mockResolvedValue({ job_id: "job-1", status: "processing" });
  mocks.poll.mockResolvedValue({ status: "done", url: ownedUrl, bpm: 136, key: "F# minor", duration: 4 });
  mocks.downloadFile.mockResolvedValue(playableWav());
});
describe("audio service request/job/durable-media contracts", () => {
  it("transports verbatim text and BPM using the Python fields and preserves owner through polling", async () => {
    const text = "  A calm instrumental with my exact direction\n";
    const result = await generateFromText({ text, userId: "owner", tempo: 136, duration: 4 });
    expect(mocks.generate).toHaveBeenCalledWith("/api/generate/audio", expect.objectContaining({
      prompt: text, instruction: text, bpm: 136, duration: 4,
    }), "owner");
    expect(mocks.generate.mock.calls[0][1]).not.toHaveProperty("text");
    expect(mocks.generate.mock.calls[0][1]).not.toHaveProperty("tempo");
    expect(mocks.poll.mock.calls[0][1]).toBe("owner");
    expect(result).toMatchObject({ audioFilePath: ownedUrl, parameters: { tempo: 136 } });
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });
  it("transports reference creative direction and the private owner", async () => {
    await generateFromReference({ userId: "owner", audioBuffer: playableWav(), targetType: "drums", text: "Keep the reference rhythm" });
    expect(mocks.generate).toHaveBeenCalledWith("/api/generate/audio", expect.objectContaining({
      prompt: "Keep the reference rhythm", instruction: "Keep the reference rhythm", reference_format: "wav",
      reference_audio: playableWav().toString("base64"),
    }), "owner");
  });
  it("resolves async music into owned durable storage and actually decodes the returned bytes", async () => {
    const notes = [{ note: "F#", octave: 4, time: 0, duration: 1 }];
    const chords = [{ chord: "F#min", time: 0, duration: 4 }];
    const result = await synthesizeToWAV(notes, chords, parameters, "owner");
    expect(mocks.generate).toHaveBeenCalledWith("/api/generate/audio", expect.objectContaining({
      bpm: 136, key: "F# minor", format: "wav", duration: 8 * 4 * 60 / 136, notes, chords,
    }), "owner");
    expect(JSON.parse(mocks.generate.mock.calls[0][1].instruction)).toMatchObject({ notes, chords });
    expect(result).toEqual({ url: ownedUrl, sizeBytes: playableWav().length });
    expect(mocks.downloadFile).toHaveBeenCalledWith("users/owner/generated-audio/test.wav");
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });
  it("rejects a completed foreign-owner artifact instead of downloading or exposing it", async () => {
    mocks.poll.mockResolvedValue({ status: "done", url: "/api/storage/file/users%2Fvictim%2Fstolen.wav" });
    await expect(synthesizeToWAV([], [], parameters, "owner")).rejects.toThrow("ownership mismatch");
    expect(mocks.downloadFile).not.toHaveBeenCalled();
  });
  it("rejects corrupt stored audio instead of treating an owned URL as playable proof", async () => {
    mocks.downloadFile.mockResolvedValue(Buffer.from("not a playable audio artifact"));
    await expect(synthesizeToWAV([], [], parameters, "owner")).rejects.toThrow("unplayable audio");
  });
  it("stops cancelled jobs and refuses ownerless background generation before dispatch", async () => {
    mocks.poll.mockResolvedValue({ status: "cancelled" });
    await expect(generateFromText({ text: "music", userId: "owner" })).rejects.toThrow("cancelled");
    mocks.generate.mockClear();
    await expect(synthesizeToWAV([], [], parameters)).rejects.toThrow("authenticated owner");
    await expect(generateFromText({ text: "music" })).rejects.toThrow("authenticated owner");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
