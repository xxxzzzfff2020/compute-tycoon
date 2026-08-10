import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/app/session";
import {
  acquireFirstModel,
  buyMaxServers,
  buyServer,
  incomePerSecond,
  researchModel,
} from "../../src/economy/engine";
import {
  applyFirstIteration,
  architectureUnlockedCount,
  blueprintChoiceAvailable,
  chooseBlueprint,
} from "../../src/economy/stage3";
import { SaveRepository } from "../../src/save/repository";
import { freshSaveData, MemorySaveStorage, type SaveStorage } from "../../src/save/storage";
import { MAX_SUPPORTED_SCHEMA_VERSION, type SaveData } from "../../src/save/types";
import { FakeClock } from "./helpers";
import { buildDevSave } from "../../src/app/devverify";

function makeIterationReady(state: SaveData): void {
  state.stage3 = {
    ...state.stage3,
    entered: true,
    enteredAtMs: 1,
    machineRooms: [
      { index: 1, id: "room_1", name: "r1", commissionedAtMs: 1 },
      { index: 2, id: "room_2", name: "r2", commissionedAtMs: 1 },
      { index: 3, id: "room_3", name: "r3", commissionedAtMs: 1 },
    ],
    flagship: {
      activeId: null,
      progress: 0,
      startedAtMs: 0,
      completedIds: ["project_1", "project_2", "project_3"],
      pendingReward: null,
    },
  };
}

function grantFirstServer(state: SaveData): void {
  state.workshop.level = 6;
  state.workshop.lifetimeRevenue = 24_000;
  state.lifetimeIncome = 24_000;
  expect(buyServer(state).ok).toBe(true);
}

describe("Codex intake bounded repair", () => {
  it("keeps the Stage 2 review checkpoint before its settlement", () => {
    const state = buildDevSave("stage2_almost_done", 1);
    expect(state.serverCount).toBe(7);
    expect(state.serverPower).toBe(209);
    expect(state.stage2.settlementShown).toBe(false);
  });

  it("builds eight reachable and eight future era entries at the final checkpoint", () => {
    const state = buildDevSave("iteration_ready", 1);
    expect(state.stage3.eraArchive.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "era_studio",
      "era_own_server",
      "era_cluster",
      "era_full_cluster",
      "era_room1",
      "era_room2",
      "era_room3",
      "era_national",
    ]));
    expect(state.ownedModelIds).toHaveLength(6);
    expect(Object.keys(state.modelArchive)).toHaveLength(6);
  });

  it("keeps all six model archive entries in the isolated second-run checkpoint", () => {
    const state = buildDevSave("second_run_start", 1);
    expect(state.modelProgress).toBeNull();
    expect(state.ownedModelIds).toHaveLength(6);
    expect(Object.keys(state.modelArchive)).toHaveLength(6);
  });

  it("server power is the exact sum of owned servers", () => {
    const state = freshSaveData(1);
    acquireFirstModel(state);
    grantFirstServer(state);
    expect(state.serverPower).toBe(2);
    state.money = 1e12;
    while (state.serverCount < 8) expect(buyServer(state).ok).toBe(true);
    expect(state.serverPower).toBe(329);
  });

  it("model archive survives iteration and reacquiring a starting model", () => {
    const state = freshSaveData(1);
    acquireFirstModel(state, "codex");
    grantFirstServer(state);
    state.ownedModelIds = ["codex", "vision", "voice", "science"];
    state.modelResearch.progress = 100;
    const draw = researchModel(state);
    expect(draw.ok).toBe(true);
    expect(draw.isNew).toBe(false);
    expect(state.modelArchive[draw.modelId].level).toBe(1);
    expect(state.modelProgress?.modelId).toBe(draw.modelId);
    const archiveBefore = structuredClone(state.modelArchive);
    const ownedBefore = [...state.ownedModelIds];
    makeIterationReady(state);
    expect(applyFirstIteration(state).ok).toBe(true);
    expect(acquireFirstModel(state, "codex").ok).toBe(true);
    expect(state.ownedModelIds).toEqual(ownedBefore);
    expect(state.modelArchive).toEqual(archiveBefore);
  });

  it("auto unlocks server3/server5/server8 blueprint nodes exactly once per run", () => {
    const state = freshSaveData(1);
    state.serverCount = 3;
    expect(blueprintChoiceAvailable(state)).toBeNull();
    expect(architectureUnlockedCount(state)).toBe(1);
    expect(chooseBlueprint(state, "bp_general").ok).toBe(false);
    state.serverCount = 8;
    expect(architectureUnlockedCount(state)).toBe(3);
    expect(chooseBlueprint(state, "bp_gpu").ok).toBe(false);
    expect(blueprintChoiceAvailable(state)).toBeNull();
    makeIterationReady(state);
    expect(applyFirstIteration(state).ok).toBe(true);
    expect(state.stage3.blueprint.owned).toEqual(["bp_general", "bp_gpu", "bp_interconnect"]);
    expect(state.stage3.blueprint.chosenMilestones).toEqual([]);
  });

  it("unlocks a real server buy-max transaction after first iteration", () => {
    const state = freshSaveData(1);
    acquireFirstModel(state);
    grantFirstServer(state);
    state.technologyIterationCount = 1;
    state.money = 75_000 + 220_000;
    const result = buyMaxServers(state);
    expect(result).toEqual({ ok: true, bought: 2 });
    expect(state.serverCount).toBe(3);
    expect(state.money).toBe(0);
  });

  it("retained technology archive passives affect the next run formulas", () => {
    const state = freshSaveData(1);
    acquireFirstModel(state);
    state.automation = true;
    const before = incomePerSecond(state);
    state.stage3.technologyArchive = [
      { id: "tech_gpu_array", unlockedAtMs: 1 },
      { id: "tech_power_modular", unlockedAtMs: 1 },
    ];
    expect(incomePerSecond(state).gt(before)).toBe(true);
  });

  it("boot settlement advances research and flagship progress without auto-claim", () => {
    const now = 1_700_000_000_000;
    const state = freshSaveData(now);
    acquireFirstModel(state);
    state.automation = true;
    state.serverCount = 8;
    state.serverPower = 50_000;
    state.modelResearch.progress = 0;
    state.lastTickAtMs = now - 10 * 60 * 1000;
    state.stage3 = {
      ...state.stage3,
      entered: true,
      enteredAtMs: 1,
      machineRooms: [{ index: 1, id: "room_1", name: "r1", commissionedAtMs: 1 }],
      flagship: {
        activeId: "project_1",
        progress: 0,
        startedAtMs: 1,
        completedIds: [],
        pendingReward: null,
      },
    };
    const storage = new MemorySaveStorage();
    storage.save(state);
    const clock = new FakeClock();
    const repository = new SaveRepository({ storage, nowMs: () => clock.now() });
    const session = new GameSession({ repository, clock });
    expect(session.getState().modelResearch.progress).toBeGreaterThan(0);
    expect(session.getState().stage3.projectProgress).toBeGreaterThan(0);
    expect(session.getState().modelResearch.stage2Draws).toBe(0);
    expect(session.getState().ownedModelIds).toEqual(["codex"]);
    expect(session.getState().stage3.flagship.pendingReward?.projectId).toBe("project_1");
    expect(session.getState().stage3.flagship.completedIds).toEqual([]);
  });

  it("blocks later writes after loading a future schema", () => {
    const storage = new MemorySaveStorage();
    const future = freshSaveData(1) as unknown as Record<string, unknown>;
    future.schemaVersion = MAX_SUPPORTED_SCHEMA_VERSION + 1;
    storage.save(future as unknown as SaveData);
    const repository = new SaveRepository({ storage, nowMs: () => 2 });
    const loaded = repository.load();
    loaded.data.money = 123;
    const saved = repository.save(loaded.data);
    expect(saved.ok).toBe(false);
    expect(saved.error).toBe("future_schema_write_blocked");
    expect((storage.load() as unknown as Record<string, unknown>).schemaVersion)
      .toBe(MAX_SUPPORTED_SCHEMA_VERSION + 1);
  });

  it("rolls back a command when storage reports write failure", () => {
    const initial = freshSaveData(1);
    const storage: SaveStorage = {
      load: () => structuredClone(initial),
      save: () => false,
      remove: () => {},
    };
    const repository = new SaveRepository({ storage, nowMs: () => 1 });
    const session = new GameSession({ repository, clock: { now: () => 1 } });
    expect(session.acquireModel().ok).toBe(false);
    expect(session.getState().modelProgress).toBeNull();
  });
});
