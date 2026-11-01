import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { adaptiveCapsuleCodec as codec } from "../../script/lib/adaptiveCapsuleCodec";
import { decodeContainer, encodeContainer } from "../../server/pocket-dimension/fabric/compression/ContainerFormat";

describe("deployment small-file native compression", () => {
  it.each([Buffer.alloc(0), Buffer.from("source code\n".repeat(900)), randomBytes(8192)])(
    "retains exact bytes through its container",
    async (input) => {
      expect(await codec.decompress(await codec.compress(input))).toEqual(input);
    },
  );
  it("produces zstd frames readable by the existing CLI restore path", async () => {
    const input = Buffer.from("const source = 'unchanged';\n".repeat(300));
    const { header, payload } = decodeContainer(await codec.compress(input));
    expect(header.codec).toBe("zstd");
    expect(execFileSync("zstd", ["-d", "-c"], { input: payload })).toEqual(input);
  });
  it("reads legacy CLI-compressed containers without migration", async () => {
    const input = Buffer.from("legacy source\n".repeat(600));
    const payload = execFileSync("zstd", ["-19", "--long=27", "-c"], { input });
    const container = encodeContainer({
      profile: "lossless-max-dedup", contentClass: "unknown",
      codec: "zstd", isDelta: false, originalBytes: input.length,
    }, payload);
    expect(await codec.decompress(container)).toEqual(input);
  });
  it("rejects corruption rather than returning fabricated content", async () => {
    const encoded = await codec.compress(Buffer.from("code\n".repeat(300)));
    const { header } = decodeContainer(encoded);
    await expect(codec.decompress(encodeContainer(header, Buffer.from("broken")))).rejects.toThrow();
  });
});
