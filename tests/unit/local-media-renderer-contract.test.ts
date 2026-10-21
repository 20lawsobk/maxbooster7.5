import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import {
  buildLocalMediaRequest, readLocalMediaResult, LocalMediaRenderer,
} from "../../client/src/components/content/LocalMediaRenderer";
import { AIImageGenerator, readGeneratedImageFile } from "../../client/src/components/content/AIImageGenerator";

const options = {
  headline: "  Exact release headline  ", platform: "instagram", aspect: "portrait",
  colorScheme: "dark_neon", durationSec: 8, bpm: 118, key: "A minor",
  instrument: "bass", arrangement: "loop", background: "gradient",
  color1: "#112233", color2: "#445566",
};
function receipt(kind: "image" | "audio" | "video") {
  const url = `/api/storage/file/users/fixture/generated/${kind}`;
  const controls = kind === "audio"
    ? { duration_sec: 8, bpm: 118, key: "A minor", instrument: "bass" }
    : { headline: "Exact headline", width: 360, height: 640 };
  return { success: true, status: "completed", delivery_status: "durable", url, job_id: "fixture-job",
    validation: { artifact_validated: true, quality: "not_evaluated" },
    capability: { trained: false, kind: { image: "layout", audio: "synthesis", video: "procedural" }[kind] },
    receipt: { url, job_id: "fixture-job", durable: true, retrievable: true,
      sha256: "a".repeat(64), size_bytes: 2048, effective_controls: controls,
      ...(kind !== "audio" ? { width: 360, height: 640 } : {}),
      ...(kind !== "image" ? { duration: 8 } : {}),
    } };
}

describe("explicit media renderer UI contracts", () => {
  it.each(["image", "audio", "video"] as const)("builds only supported %s controls without caller ownership", kind => {
    const request = buildLocalMediaRequest(kind, options);
    expect(request.endpoint).toBe({ image: "/api/generate/image", audio: "/api/generate/audio", video: "/api/generate-video" }[kind]);
    expect(request.body).not.toHaveProperty("owner_id");
    expect(request.body).not.toHaveProperty("user_id");
    expect(request.body).not.toHaveProperty("style");
    expect(request.body.dedicated_controls).not.toHaveProperty("subject");
    if (kind === "audio") expect(request.body.dedicated_controls).toMatchObject({ bpm: 118, key: "A minor", instrument: "bass", duration_sec: 8 });
    else expect(request.body.dedicated_controls).toMatchObject({ headline: "Exact release headline", width: 360, height: 640 });
    if (kind === "video") expect(request.body).toMatchObject({ idea: "Exact release headline",
      dedicated_controls: { continuity: "single_scene", color1: "0x112233", color2: "0x445566" } });
  });
  it.each([
    ["image", { headline: "" }], ["image", { colorScheme: "imaginary" }],
    ["audio", { instrument: "vocals" }], ["audio", { bpm: Number.NaN }],
    ["audio", { durationSec: 61 }], ["video", { durationSec: 21 }],
    ["video", { background: "city skyline" }], ["video", { color1: "url(https://example.org)" }],
  ] as const)("rejects unsupported %s input (%j)", (kind, override) => {
    expect(() => buildLocalMediaRequest(kind, { ...options, ...override })).toThrow();
  });
  it.each(["image", "audio", "video"] as const)("consumes a validated durable %s receipt and real metadata", kind => {
    const result = readLocalMediaResult(kind, receipt(kind));
    expect(result).toMatchObject({ kind, url: `/api/storage/file/users/fixture/generated/${kind}` });
    if (kind === "audio") expect(result).toMatchObject({ bpm: 118, key: "A minor", instrument: "bass", durationSec: 8 });
    else expect(result).toMatchObject({ width: 360, height: 640 });
  });
  it.each([
    { url: "asset://a-spec" }, { url: "/uploads/temporary.png" },
    { validation: { artifact_validated: false } }, { delivery_status: "pending" },
    { receipt: { durable: true, retrievable: false } },
    { capability: { trained: false, kind: "synthesis" } },
    { receipt: { ...receipt("image").receipt, width: 1080 } },
  ])("rejects a plan, scratch file, failed validation or incomplete delivery (%j)", override => {
    expect(() => readLocalMediaResult("image", { ...receipt("image"), ...override })).toThrow();
  });
  it("keeps learned artwork and explicit poster creation separate", () => {
    const html = renderToStaticMarkup(React.createElement(AIImageGenerator, { platform: "instagram", topic: "A city skyline" }));
    expect(html).toContain("AI artwork"); expect(html).toContain("Poster layout");
    expect(html).not.toContain("Create poster");
    const poster = renderToStaticMarkup(React.createElement(LocalMediaRenderer, { kind: "image", initialHeadline: "Exact headline" }));
    expect(poster).toContain("Create poster"); expect(poster).toContain("not illustrated subjects");
  });
  it("accepts saved image aliases without inventing dimensions, palettes or render times", () => {
    const image = readGeneratedImageFile({ image_url: "/api/storage/file/users/fixture/image.png", success: true });
    expect(image.url).toBe("/api/storage/file/users/fixture/image.png");
    expect(image.width).toBeUndefined(); expect(image.height).toBeUndefined();
    expect(image.format).toBeUndefined(); expect(image.processing_time_ms).toBeUndefined();
    expect(image).not.toHaveProperty("color_scheme");
    expect(() => readGeneratedImageFile({ url: "asset://image-plan" })).toThrow();
    expect(() => readGeneratedImageFile({ url: "/api/storage/file/fixture", kind: "specification" })).toThrow();
    expect(() => readGeneratedImageFile({ url: "http://127.0.0.1:9878/uploads/image.png" })).toThrow();
  });
});
