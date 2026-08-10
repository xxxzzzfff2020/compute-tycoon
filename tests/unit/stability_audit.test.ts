import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/app/session";
import { acquireFirstModel } from "../../src/economy/engine";
import { SaveRepository } from "../../src/save/repository";
import { freshSaveData, MemorySaveStorage } from "../../src/save/storage";
import type { SaveData } from "../../src/save/types";
import { FakeClock } from "./helpers";

function iterationReady(now: number): SaveData {
  const state = freshSaveData(now);
  acquireFirstModel(state);
  state.serverCount = 8;
  state.serverPower = 329;
  state.stage2 = { settlementShown: true, completedAtMs: now, stageIncome: 1 };
  state.stage3 = {
    ...state.stage3,
    entered: true,
    enteredAtMs: now,
    machineRooms: [
      { index: 1, id: "room_1", name: "r1", commissionedAtMs: now },
      { index: 2, id: "room_2", name: "r2", commissionedAtMs: now },
      { index: 3, id: "room_3", name: "r3", commissionedAtMs: now },
    ],
    flagship: {
      activeId: null,
      progress: 0,
      startedAtMs: now,
      completedIds: ["project_1", "project_2", "project_3"],
      pendingReward: null,
    },
  };
  return state;
}

describe("acceptance stability audit", () => {
  it("runs a 30-minute logical soak with bounded state and autosave", () => {
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    const state = freshSaveData(clock.now());
    acquireFirstModel(state);
    state.automation = true;
    state.serverCount = 3;
    state.serverPower = 14;
    storage.save(state);
    const repository = new SaveRepository({ storage, nowMs: () => clock.now() });
    const session = new GameSession({ repository, clock });
    for (let second = 0; second < 30 * 60; second++) {
      clock.advance(1000);
      session.update(1);
    }
    expect(Number.isFinite(session.getState().money)).toBe(true);
    expect(session.getState().money).toBeGreaterThan(0);
    expect(session.getState().activeOrders.length).toBeLessThanOrEqual(4);
    expect(storage.load()?.revision).toBeGreaterThanOrEqual(120);
  });

  it("round-trips 100 consecutive save/load operations", () => {
    const storage = new MemorySaveStorage();
    let now = 1_700_000_000_000;
    const repository = new SaveRepository({ storage, nowMs: () => now++ });
    let state = repository.load().data;
    for (let i = 1; i <= 100; i++) {
      state.money = i;
      const saved = repository.save(state);
      expect(saved.ok).toBe(true);
      state = repository.load().data;
      expect(state.money).toBe(i);
    }
    expect(state.revision).toBe(100);
  });

  it("executes 20 isolated iteration transactions exactly once each", () => {
    for (let i = 0; i < 20; i++) {
      const clock = new FakeClock();
      const storage = new MemorySaveStorage();
      storage.save(iterationReady(clock.now()));
      const repository = new SaveRepository({ storage, nowMs: () => clock.now() });
      const session = new GameSession({ repository, clock });
      expect(session.prestige().ok).toBe(true);
      expect(session.prestige().ok).toBe(false);
      expect(session.getState().technologyIterationCount).toBe(1);
      expect(storage.load()?.technologyIterationCount).toBe(1);
    }
  });
});
