import { describe, expect, it } from "vitest";
import {
  toDatasetDto,
  toScheduleDto,
  toTrainingStatusDto,
} from "../training.js";

describe("training route DTO compatibility", () => {
  it("maps current MaxCore status fields to the dashboard contract", () => {
    expect(
      toTrainingStatusDto({
        state: "running",
        current_loss: 1.25,
        elapsed_seconds: 42,
        sessions_done: 3,
      }),
    ).toMatchObject({
      status: "running",
      loss: 1.25,
      elapsed_sec: 42,
      session_count: 3,
      loss_history: [],
    });
  });

  it("derives legacy dashboard dataset totals from current MaxCore datasets", () => {
    expect(
      toDatasetDto({
        total_disk_gb: 8.5,
        datasets: [
          { id: "hmdb51", samples: 6_766, size_gb: 2 },
          { id: "ucf101", samples: 13_320, size_gb: 6.5 },
          { id: "musiccaps", samples: 5_521, size_gb: 0.08 },
        ],
      }),
    ).toMatchObject({
      success: true,
      total_gb: 8.5,
      stats: {
        hmdb51_clips: 6_766,
        ucf101_clips: 13_320,
        musiccaps_captions: 5_521,
        total_video_clips: 20_086,
      },
      disk_gb: { hmdb51: 2, ucf101: 6.5, musiccaps: 0.08 },
    });
  });

  it("preserves curriculum phases while adding authoritative live state", () => {
    const phases = [{ id: "phase_1", name: "Foundation" }];
    expect(
      toScheduleDto(
        { state: "running", phase: 1 },
        { status: "running", progress_pct: 40 },
        { curriculum_phases: phases },
      ),
    ).toMatchObject({
      success: true,
      schedule: phases,
      current_status: {
        status: "running",
        current_phase: 1,
        progress_pct: 40,
      },
    });
  });
});