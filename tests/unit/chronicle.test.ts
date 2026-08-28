import { describe, expect, it } from "vitest";
import { noteChronicleClockAdjustment, recordChronicleMilestones } from "../../src/economy/chronicle";
import { freshSaveData } from "../../src/save/storage";

describe("galactic chronicle", () => {
  it("records milestone times once and never rewrites them backwards after a device-clock rollback", () => {
    const state = freshSaveData(1_000);
    state.modelProgress = { modelId: "codex", level: 1, trainingCount: 0 };
    state.ownedModelIds = ["codex"];
    state.serverCount = 1;

    expect(recordChronicleMilestones(state, 5_000)).toBe(true);
    expect(state.chronicle.milestones).toMatchObject({ first_model: 5_000, first_server: 5_000 });

    state.technologyIterationCount = 1;
    expect(recordChronicleMilestones(state, 2_000)).toBe(true);
    expect(state.chronicle.milestones.first_iteration).toBe(5_000);
    expect(state.chronicle.maxObservedDeviceAtMs).toBe(5_000);
  });

  it("keeps a neutral local clock-adjustment record without treating it as a competitive score", () => {
    const state = freshSaveData(1_000);
    expect(noteChronicleClockAdjustment(state, 500)).toBe(true);
    expect(noteChronicleClockAdjustment(state, 2_000)).toBe(true);
    expect(state.chronicle).toMatchObject({
      clockAdjustmentCount: 2,
      lastClockAdjustmentAtMs: 2_000,
      maxObservedDeviceAtMs: 2_000,
    });
  });
});
