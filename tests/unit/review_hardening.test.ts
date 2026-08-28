import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/app/session";
import { buildReviewSave } from "../../src/review/checkpoints";
import { SaveRepository } from "../../src/save/repository";
import { MemorySaveStorage, freshSaveData, type SaveStorage } from "../../src/save/storage";
import { MAX_SUPPORTED_SCHEMA_VERSION, SAVE_SCHEMA_VERSION, type SaveData } from "../../src/save/types";

const NOW = 1_800_000_000_000;

function sessionFrom(state: SaveData, now = NOW) {
  const storage = new MemorySaveStorage();
  storage.save(state);
  const repository = new SaveRepository({ storage, nowMs: () => now });
  return {
    storage,
    repository,
    session: new GameSession({ repository, clock: { now: () => now } }),
  };
}

describe("founder review deterministic hardening", () => {
  it("restores the same valid review progress through 30 refresh cycles", () => {
    const storage = new MemorySaveStorage();
    storage.save(buildReviewSave("room3_final_flagship", NOW));
    let expectedMoney = 1_200_000_000;

    for (let cycle = 0; cycle < 30; cycle++) {
      const repository = new SaveRepository({ storage, nowMs: () => NOW + cycle });
      const loaded = repository.load();
      expect(loaded.data.saveId).toBe("review-v2-room3_final_flagship");
      expect(loaded.data.stage3.flagship.activeId).toBe("project_3");
      expect(loaded.data.stage3.machineRooms).toHaveLength(3);
      loaded.data.money = Number(loaded.data.money) + 1;
      expectedMoney += 1;
      expect(repository.save(loaded.data).ok).toBe(true);
    }

    expect(Number(storage.load()?.money)).toBe(expectedMoney);
  });

  it("runs 20 offline settlements exactly once without executing player commands", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const state = buildReviewSave("room3_final_flagship", NOW - 10 * 60 * 1000);
      state.lastTickAtMs = NOW - 10 * 60 * 1000;
      const before = {
        money: state.money,
        research: state.modelResearch.progress,
        servers: state.serverCount,
        infrastructure: structuredClone(state.stage3.infrastructure),
        rooms: state.stage3.machineRooms.length,
        completedProjects: [...state.stage3.flagship.completedIds],
        iterationCount: state.technologyIterationCount,
      };
      const { session, storage } = sessionFrom(state);

      expect(session.hasPendingOffline()).toBe(true);
      expect(session.getState().modelResearch.progress).toBeGreaterThanOrEqual(before.research);
      expect(session.getState().serverCount).toBe(before.servers);
      expect(session.getState().stage3.infrastructure).toEqual(before.infrastructure);
      expect(session.getState().stage3.machineRooms).toHaveLength(before.rooms);
      expect(session.getState().stage3.flagship.completedIds).toEqual(before.completedProjects);
      expect(session.getState().technologyIterationCount).toBe(before.iterationCount);

      const firstClaim = session.claimOffline();
      expect(firstClaim.ok).toBe(true);
      expect(Number(session.getState().money)).toBeGreaterThan(Number(before.money));
      expect(session.claimOffline().ok).toBe(false);
      const afterFirstClaim = session.getState().money;

      const reloaded = new GameSession({
        repository: new SaveRepository({ storage, nowMs: () => NOW }),
        clock: { now: () => NOW },
      });
      // 部分领取：报价常驻，但刷新不重复入账
      expect(reloaded.hasPendingOffline()).toBe(true);
      expect(reloaded.claimOffline().ok).toBe(false);
      expect(reloaded.getState().money).toBe(afterFirstClaim);
      expect(reloaded.getState().stage3.flagship.completedIds).toEqual(before.completedProjects);
      expect(reloaded.getState().technologyIterationCount).toBe(before.iterationCount);
    }
  });

  it("does not duplicate offline rewards after a system-clock rollback", () => {
    const state = buildReviewSave("stage3_entry", NOW - 60 * 60 * 1000);
    state.lastTickAtMs = NOW - 60 * 60 * 1000;
    const { session, storage } = sessionFrom(state);
    expect(session.claimOffline().ok).toBe(true);
    const money = session.getState().money;

    const rolledBack = new GameSession({
      repository: new SaveRepository({ storage, nowMs: () => NOW - 2 * 60 * 60 * 1000 }),
      clock: { now: () => NOW - 2 * 60 * 60 * 1000 },
    });
    expect(rolledBack.hasPendingOffline()).toBe(true);
    expect(rolledBack.claimOffline().ok).toBe(false);
    expect(rolledBack.getState().money).toBe(money);
  });

  it("recovers from a corrupt save without propagating invalid data", () => {
    const storage = new MemorySaveStorage();
    storage.save({ money: Number.NaN } as unknown as SaveData);
    const repository = new SaveRepository({ storage, nowMs: () => NOW });
    const result = repository.load();
    expect(result.kind).toBe("corrupt_recreated");
    expect(result.data.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(result.data.money).toBe(0);
  });

  it("never overwrites an unknown future schema", () => {
    const storage = new MemorySaveStorage();
    const future = freshSaveData(NOW) as unknown as Record<string, unknown>;
    future.schemaVersion = MAX_SUPPORTED_SCHEMA_VERSION + 10;
    future.money = 987654321;
    storage.save(future as unknown as SaveData);
    const repository = new SaveRepository({ storage, nowMs: () => NOW + 1 });
    const loaded = repository.load();
    expect(loaded.kind).toBe("fresh");
    expect(repository.save(loaded.data).ok).toBe(false);
    expect((storage.load() as unknown as Record<string, unknown>).schemaVersion)
      .toBe(MAX_SUPPORTED_SCHEMA_VERSION + 10);
    expect((storage.load() as unknown as Record<string, unknown>).money).toBe(987654321);
  });

  it("rolls back an interrupted iteration transaction without a half-reset", () => {
    const initial = buildReviewSave("iteration_ready", NOW);
    const persisted = structuredClone(initial);
    const failingStorage: SaveStorage = {
      load: () => structuredClone(persisted),
      save: () => false,
      remove: () => {},
    };
    const repository = new SaveRepository({ storage: failingStorage, nowMs: () => NOW });
    const session = new GameSession({ repository, clock: { now: () => NOW } });
    expect(session.prestige().ok).toBe(false);
    expect(session.getState().technologyIterationCount).toBe(0);
    expect(session.getState().serverCount).toBe(8);
    expect(session.getState().stage3.machineRooms).toHaveLength(3);
    expect(session.getState().stage3.flagship.completedIds).toContain("project_3");
    expect(persisted.technologyIterationCount).toBe(0);
  });

  it("keeps milestone commands idempotent under 100 rapid attempts", () => {
    const freshHarness = sessionFrom(buildReviewSave("new_game", NOW));
    let acquired = 0;
    for (let click = 0; click < 100; click++) {
      if (freshHarness.session.acquireModel().ok) acquired += 1;
    }
    expect(acquired).toBe(1);
    expect(freshHarness.session.getState().ownedModelIds).toHaveLength(1);

    const roomHarness = sessionFrom(buildReviewSave("room2_almost", NOW));
    let commissioned = 0;
    for (let click = 0; click < 100; click++) {
      if (roomHarness.session.commissionRoom(2).ok) commissioned += 1;
    }
    expect(commissioned).toBe(1);
    expect(roomHarness.session.getState().stage3.machineRooms.filter((room) => room.index === 2)).toHaveLength(1);

    const iterationHarness = sessionFrom(buildReviewSave("iteration_ready", NOW));
    let iterated = 0;
    for (let click = 0; click < 100; click++) {
      if (iterationHarness.session.prestige().ok) iterated += 1;
    }
    expect(iterated).toBe(1);
    expect(iterationHarness.session.getState().technologyIterationCount).toBe(1);
  });
});
