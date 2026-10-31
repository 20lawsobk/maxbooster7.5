import { describe, it, expect } from "vitest";
import {
  createEmptyProject, addScene, removeScene, moveScene, updateScene, validateProject,
  buildProductionRequest, buildSceneSrt, formatSrtTime, serializeProject, parseProject,
  readProductionTimeline, historyInit, historyPush, historyUndo, historyRedo, historyReplace,
  checkImageFile, checkImageDimensions, base64ByteLength, hasAuthoredWork, projectFingerprint,
  buildScriptText, type ProductionProject,
} from "../../client/src/components/content/productionWorkbenchModel";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
function img() { return { b64: PNG_B64, mime: "image/png" as const, name: "a.png", bytes: base64ByteLength(PNG_B64), width: 1, height: 1 }; }
function filled(): ProductionProject {
  let p = createEmptyProject("instagram");
  p = updateScene(p, p.scenes[0].id, { text: "Out Friday", durationSec: 2.5 });
  p = addScene(p);
  p = updateScene(p, p.scenes[1].id, { text: "Pre-save now", durationSec: 1.52, image: img() });
  return p;
}

describe("productionWorkbenchModel", () => {
  it("validates scene text, durations and totals", () => {
    expect(validateProject(createEmptyProject())).toContain("Scene 1 needs on-screen text.");
    expect(validateProject(filled())).toEqual([]);
    const long = updateScene(filled(), filled().scenes[0].id, { durationSec: 31 });
    expect(validateProject({ ...long, scenes: long.scenes.map(s => ({ ...s, durationSec: 31 })) }).join(" ")).toMatch(/30 seconds/);
  });

  it("adds, removes and reorders within bounds", () => {
    let p = filled();
    const [a, b] = p.scenes.map(s => s.id);
    p = moveScene(p, a, 1);
    expect(p.scenes.map(s => s.id)).toEqual([b, a]);
    expect(moveScene(p, b, -1)).toBe(p);
    p = removeScene(p, a);
    expect(removeScene(p, b)).toBe(p);
    for (let i = 0; i < 10; i++) p = addScene(p);
    expect(p.scenes.length).toBe(8);
  });

  it("builds the exact backend contract", () => {
    let p = filled();
    p = { ...p, music: { ...p.music, enabled: true }, narration: { enabled: true, text: "Hello", voice: "en-gb", wpm: 160 } };
    const { endpoint, body } = buildProductionRequest(p);
    expect(endpoint).toBe("/api/generate-video");
    expect(body.idea).toBe("Out Friday\nPre-save now");
    expect(body.dedicated_controls).toMatchObject({ width: 640, height: 640, fps: 24, duration_sec: 4, headline: "" });
    const prod = body.dedicated_controls.production;
    expect(prod.scenes[0]).toEqual({ text: "Out Friday", duration_sec: 2.5 });
    expect(prod.scenes[1].image_b64).toBe(PNG_B64);
    expect(prod.narration).toEqual({ text: "Hello", voice: "en-gb", wpm: 160 });
    expect(prod.music?.instrument).toBe("piano");
    expect(() => buildProductionRequest(createEmptyProject())).toThrow();
  });

  it("rounds SRT boundaries to 24 fps frames", () => {
    expect(formatSrtTime(36)).toBe("00:00:01,500");
    const srt = buildSceneSrt([{ text: "A", durationSec: 1.52 }, { text: "B", durationSec: 1 }]);
    expect(srt).toContain("00:00:00,000 --> 00:00:01,500\nA");
    expect(srt).toContain("00:00:01,500 --> 00:00:02,500\nB");
  });

  it("round-trips portable projects and rejects invalid imports", () => {
    const p = filled();
    const back = parseProject(serializeProject(p));
    expect(projectFingerprint(back)).toBe(projectFingerprint(p));
    expect(() => parseProject("nope")).toThrow(/JSON/);
    expect(() => parseProject(JSON.stringify({ format: "x" }))).toThrow();
    const bad = JSON.parse(serializeProject(p));
    bad.project.scenes[1].image.mime = "image/gif";
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/image/);
    bad.project.scenes = [];
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it("checks image files", () => {
    expect(checkImageFile({ type: "image/gif", size: 10 })).toMatch(/PNG/);
    expect(checkImageFile({ type: "image/png", size: 5 * 1024 * 1024 })).toMatch(/4 MiB/);
    expect(checkImageFile({ type: "image/webp", size: 10 })).toBeNull();
    expect(checkImageDimensions(4097, 4096)).toMatch(/4096/);
    expect(checkImageDimensions(4096, 4096)).toBeNull();
  });

  it("reads receipt timelines", () => {
    expect(readProductionTimeline({ receipt: { production_timeline: { scenes: [{ text: "A", duration_sec: 1, image_sha256: "ab" }] } } }))
      .toEqual([{ text: "A", durationSec: 1, imageHash: "ab" }]);
    expect(readProductionTimeline({ receipt: { effective_controls: { production: { scenes: [{ text: "B", duration_sec: 2 }] } } } }))
      .toEqual([{ text: "B", durationSec: 2 }]);
    expect(readProductionTimeline({ receipt: { effective_controls: { production: { scenes: [{ text: "C", duration_sec: 1, image_b64: { sha256: "cd", bytes: 9 } }] } } } }))
      .toEqual([{ text: "C", durationSec: 1, imageHash: "cd" }]);
    expect(readProductionTimeline({ receipt: {} })).toBeNull();
  });

  it("undo/redo history and authored-work detection", () => {
    let h = historyInit(1);
    h = historyPush(h, 2); h = historyReplace(h, 3);
    expect(historyUndo(h).present).toBe(1);
    expect(historyRedo(historyUndo(h)).present).toBe(3);
    expect(hasAuthoredWork(createEmptyProject())).toBe(false);
    expect(hasAuthoredWork(filled())).toBe(true);
    expect(buildScriptText(filled())).toContain("2. [2.50s - 4.00s] Pre-save now");
  });
});
