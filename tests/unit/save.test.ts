import { describe, expect, it } from "vitest";
import { freshSaveData, MemorySaveStorage } from "../../src/save/storage";
import { SaveRepository } from "../../src/save/repository";
import { validateSave, normalizeSave } from "../../src/save/validate";
import { MAX_SUPPORTED_SCHEMA_VERSION, SAVE_SCHEMA_VERSION, type SaveData } from "../../src/save/types";

function now() {
  return 1_700_000_000_000;
}

describe("save: validation", () => {
  it("accepts fresh save", () => {
    const s = freshSaveData(now());
    const r = validateSave(s);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.repaired).toBe(false);
  });

  it("rejects unsupported higher schema", () => {
    const s = freshSaveData(now()) as unknown as Record<string, unknown>;
    s.schemaVersion = MAX_SUPPORTED_SCHEMA_VERSION + 1;
    const r = validateSave(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsupported_version");
  });

  it("repairs missing fields", () => {
    const s = freshSaveData(now()) as unknown as Record<string, unknown>;
    delete s.money;
    delete s.settings;
    const r = validateSave(s);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.repaired).toBe(true);
      expect(r.data.money).toBe(0);
      expect(r.data.settings.soundEnabled).toBe(true);
    }
  });

  it("normalizes corrupt arrays", () => {
    const s = freshSaveData(now()) as unknown as Record<string, unknown>;
    s.ownedModelIds = [123, "codex", null];
    s.activeOrders = [{ orderId: 5 }, "junk"];
    const n = normalizeSave(s);
    expect(n).not.toBeNull();
    expect(n!.ownedModelIds).toEqual(["codex"]);
    expect(n!.activeOrders).toEqual([]);
  });

  it("migrates legacy active orders into stable fixed lanes without losing progress", () => {
    const legacy = freshSaveData(now()) as unknown as Record<string, unknown>;
    legacy.activeOrders = [12, 9, 6, 3].map((remainingSec) => ({
      orderId: "o1",
      startedAtMs: now(),
      remainingSec,
      status: 0,
    }));

    const result = validateSave(legacy);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repaired).toBe(true);
    expect(result.data.activeOrders.map((order) => order.slotIndex)).toEqual([0, 1, 2, 3]);
    expect(result.data.activeOrders.map((order) => order.remainingSec)).toEqual([12, 9, 6, 3]);
  });

  it("repairs duplicate and out-of-range order lanes deterministically", () => {
    const legacy = freshSaveData(now()) as unknown as Record<string, unknown>;
    legacy.activeOrders = [0, 0, 9, 3].map((slotIndex, index) => ({
      orderId: "o1",
      startedAtMs: now(),
      slotIndex,
      remainingSec: 12 - index,
      status: 0,
    }));

    const normalized = normalizeSave(legacy)!;

    expect(normalized.activeOrders.map((order) => order.slotIndex)).toEqual([0, 1, 2, 3]);
  });

  it("migrates legacy blueprints by earned count into fixed order", () => {
    const singleLv2 = freshSaveData(now()) as unknown as Record<string, unknown>;
    (singleLv2.stage3 as Record<string, unknown>).blueprint = {
      owned: ["bp_general"],
      active: "bp_general",
      levels: { bp_general: 2 },
      chosenMilestones: ["server3"],
    };
    const single = normalizeSave(singleLv2)!;
    expect(single.stage3.blueprint).toEqual({
      owned: ["bp_general", "bp_gpu"],
      active: null,
      levels: { bp_general: 1, bp_gpu: 1 },
      chosenMilestones: [],
    });

    const mixed = freshSaveData(now()) as unknown as Record<string, unknown>;
    (mixed.stage3 as Record<string, unknown>).blueprint = {
      owned: ["bp_gpu"],
      active: "bp_gpu",
      levels: { bp_general: 1, bp_gpu: 1, bp_interconnect: 1 },
      chosenMilestones: ["server3", "server8"],
    };
    expect(normalizeSave(mixed)!.stage3.blueprint.owned)
      .toEqual(["bp_general", "bp_gpu", "bp_interconnect"]);

    const empty = freshSaveData(now()) as unknown as Record<string, unknown>;
    (empty.stage3 as Record<string, unknown>).blueprint = {};
    expect(normalizeSave(empty)!.stage3.blueprint.owned).toEqual([]);
  });

  it("converges legacy iteration overflow to one permanent iteration", () => {
    const legacy = freshSaveData(now()) as unknown as Record<string, unknown>;
    legacy.technologyIterationCount = 4;
    legacy.permanentMultiplier = 8;
    const normalized = normalizeSave(legacy)!;
    expect(normalized.technologyIterationCount).toBe(1);
    expect(normalized.permanentMultiplier).toBe(2);
  });

  it("keeps training max separate from the unified archive cap", () => {
    const legacy = freshSaveData(now()) as unknown as Record<string, unknown>;
    legacy.ownedModelIds = ["voice"];
    legacy.modelProgress = { modelId: "voice", level: 12, trainingCount: 11 };
    legacy.modelArchive = {
      voice: {
        modelId: "voice",
        level: 99,
        firstAcquiredAtMs: now(),
        researchCount: 99,
        lifetimeTrainingCount: 11,
        lifetimeContribution: 0,
      },
    };
    const normalized = normalizeSave(legacy)!;
    expect(normalized.modelProgress?.level).toBe(12);
    expect(normalized.modelArchive.voice.level).toBe(40);
    expect(normalized.modelArchive.voice.researchCount).toBe(40);
  });

  it("migrates the legacy shared training scale from 20 levels to 40 once", () => {
    const legacy = freshSaveData(now()) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 8;
    legacy.ownedModelIds = ["codex"];
    legacy.modelProgress = { modelId: "codex", level: 19, trainingCount: 18 };

    const migrated = normalizeSave(legacy)!;
    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.modelProgress?.level).toBe(38);
    expect(migrated.modelProgress?.trainingCount).toBe(18);

    const normalizedAgain = normalizeSave(migrated)!;
    expect(normalizedAgain.modelProgress?.level).toBe(38);

    legacy.modelProgress = { modelId: "codex", level: 20, trainingCount: 19 };
    expect(normalizeSave(legacy)?.modelProgress?.level).toBe(40);
  });
});

describe("save: repository", () => {
  it("loads fresh when empty", () => {
    const repo = new SaveRepository({ storage: new MemorySaveStorage(), nowMs: now });
    const out = repo.load();
    expect(out.kind).toBe("fresh");
  });

  it("persists and increments revision", () => {
    const storage = new MemorySaveStorage();
    const repo = new SaveRepository({ storage, nowMs: now });
    const out = repo.load();
    const r0 = out.data.revision;
    const saved = repo.save(out.data);
    expect(saved.ok).toBe(true);
    expect(saved.saved.revision).toBe(r0 + 1);
    const reloaded = repo.load();
    expect(reloaded.data.revision).toBe(r0 + 1);
  });

  it("recreates on corrupt", () => {
    const storage = new MemorySaveStorage();
    const bad = { ...freshSaveData(now()) } as unknown as Record<string, unknown>;
    delete bad.schemaVersion; // 结构损坏
    storage.save(bad as unknown as SaveData);
    const repo = new SaveRepository({ storage, nowMs: now });
    const out = repo.load();
    expect(out.kind).toBe("corrupt_recreated");
  });

  it("recreates without overwriting on unsupported schema", () => {
    const storage = new MemorySaveStorage();
    const bad = freshSaveData(now()) as unknown as Record<string, unknown>;
    bad.schemaVersion = 99;
    storage.save(bad as unknown as SaveData);
    const repo = new SaveRepository({ storage, nowMs: now });
    const out = repo.load();
    expect(out.kind).toBe("fresh");
    expect(out.message).toContain("高于当前支持版本");
    // 原档仍在存储中
    const raw = storage.load();
    expect((raw as unknown as Record<string, unknown>).schemaVersion).toBe(99);
  });

  it("exports and imports JSON", () => {
    const storage = new MemorySaveStorage();
    const repo = new SaveRepository({ storage, nowMs: now });
    repo.load();
    const json = repo.exportJson(repo.getLatest()!);
    const repo2 = new SaveRepository({ storage: new MemorySaveStorage(), nowMs: now });
    repo2.load();
    const res = repo2.importJson(json);
    expect(res.ok).toBe(true);
  });

  it("preserves unsafe economic magnitudes across save, export, and import", () => {
    const huge = "1.2345678901234567890123e+22";
    const storage = new MemorySaveStorage();
    const repo = new SaveRepository({ storage, nowMs: now });
    const fresh = repo.load().data;
    fresh.money = huge;
    fresh.lifetimeIncome = huge;
    fresh.workshop.lifetimeRevenue = huge;
    fresh.stage3.peakStats.peakCompute = huge;
    expect(repo.save(fresh).ok).toBe(true);

    const exported = repo.exportJson(repo.getLatest()!);
    expect(exported).toContain(`"money": "${huge}"`);

    const importedRepo = new SaveRepository({ storage: new MemorySaveStorage(), nowMs: now });
    const imported = importedRepo.importJson(exported);
    expect(imported.ok).toBe(true);
    expect(imported.data?.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(imported.data?.money).toBe(huge);
    expect(imported.data?.lifetimeIncome).toBe(huge);
    expect(imported.data?.workshop.lifetimeRevenue).toBe(huge);
    expect(imported.data?.stage3.peakStats.peakCompute).toBe(huge);
  });

  it("migrates schema v3 numeric saves to schema v4 without changing values", () => {
    const legacy = freshSaveData(now()) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 3;
    legacy.money = 8_000_000_000;
    legacy.lifetimeIncome = 12_000_000_000;
    const result = validateSave(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repaired).toBe(true);
      expect(result.data.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(result.data.money).toBe(8_000_000_000);
      expect(result.data.lifetimeIncome).toBe(12_000_000_000);
    }
  });

  it("rejects import of unsupported schema", () => {
    const repo = new SaveRepository({ storage: new MemorySaveStorage(), nowMs: now });
    const bad = { ...freshSaveData(now()), schemaVersion: 99 };
    const res = repo.importJson(JSON.stringify(bad));
    expect(res.ok).toBe(false);
    expect(res.error).toBe("unsupported_schema_version");
  });

  it("rejects import of corrupt JSON", () => {
    const repo = new SaveRepository({ storage: new MemorySaveStorage(), nowMs: now });
    expect(repo.importJson("{oops").ok).toBe(false);
  });

  it("resets to fresh save", () => {
    const repo = new SaveRepository({ storage: new MemorySaveStorage(), nowMs: now });
    const out = repo.load();
    out.data.money = 999;
    repo.save(out.data);
    const reset = repo.reset();
    expect(reset.ok).toBe(true);
    expect(reset.data.money).toBe(0);
    expect(repo.load().data.saveId).not.toBe(out.data.saveId);
  });

  it("prepares a reset without touching the current local save, then commits exactly that candidate", () => {
    const storage = new MemorySaveStorage();
    const repo = new SaveRepository({ storage, nowMs: now });
    const old = repo.load().data;
    old.money = 999;
    expect(repo.save(old).ok).toBe(true);
    const oldId = storage.load()!.saveId;

    const prepared = repo.prepareReset();
    expect(prepared.ok).toBe(true);
    expect(prepared.data.saveId).not.toBe(oldId);
    expect(storage.load()!.saveId).toBe(oldId);
    expect(storage.load()!.money).toBe(999);

    const committed = repo.commitPreparedReset(prepared.data);
    expect(committed.ok).toBe(true);
    expect(storage.load()!.saveId).toBe(prepared.data.saveId);
    expect(storage.load()!.money).toBe(0);
  });
});

  it("migrates legacy save without stage2 fields", () => {
    // 旧档（Stage 1 schema）：没有 modelResearch / stage2 字段
    const legacy = freshSaveData(now()) as unknown as Record<string, unknown>;
    delete legacy.modelResearch;
    delete legacy.stage2;
    legacy.money = 12345;
    legacy.serverCount = 3;
    legacy.serverPower = 14;
    legacy.workshop = {
      level: 7,
      experience: 40,
      experienceToNextLevel: 340,
      lifetimeRevenue: 25600,
      firstServerAwarded: true,
    };
    const r = validateSave(legacy);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.money).toBe(12345);
      expect(r.data.serverCount).toBe(3);
      expect(r.data.workshop.level).toBe(7);
      expect(r.data.modelResearch).toEqual({ progress: 0, stage2Draws: 0 });
      expect(r.data.stage2).toEqual({ settlementShown: false, completedAtMs: 0, stageIncome: 0 });
    }
  });

describe("save: stage3 migration & restore", () => {
  it("save_schema_migration: 旧 Stage 2 档升级补 Stage 3 默认值，不清除资金/模型/服务器", () => {
    const legacy = freshSaveData(now()) as unknown as Record<string, unknown>;
    delete legacy.stage3;
    legacy.money = 888_000;
    legacy.serverCount = 8;
    legacy.serverPower = 329;
    legacy.ownedModelIds = ["codex", "vision"];
    legacy.workshop = {
      level: 9,
      experience: 10,
      experienceToNextLevel: 500,
      lifetimeRevenue: 1_200_000,
      firstServerAwarded: true,
    };
    const r = validateSave(legacy);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.money).toBe(888_000);
      expect(r.data.serverCount).toBe(8);
      expect(r.data.ownedModelIds).toEqual(["codex", "vision"]);
      expect(r.data.workshop.level).toBe(9);
      expect(r.data.stage3).toBeDefined();
      expect(r.data.stage3.entered).toBe(false);
      expect(r.data.stage3.machineRooms).toEqual([]);
      expect(r.data.stage3.infrastructure).toEqual({ power: 0, computeCards: 0, optical: 0, storage: 0 });
    }
  });

  it("refresh_restore_workshop_progress: 刷新后等级/经验/累计收入/首服状态/Stage3 档案恢复", () => {
    const storage = new MemorySaveStorage();
    const s = freshSaveData(now());
    s.money = 5_000_000;
    s.workshop = {
      level: 12,
      experience: 30,
      experienceToNextLevel: 540,
      lifetimeRevenue: 9_000_000,
      firstServerAwarded: true,
    };
    s.stage3 = {
      entered: true,
      enteredAtMs: 1,
      infrastructure: { power: 5, computeCards: 6, optical: 4, storage: 3 },
      machineRooms: [
        { index: 1, id: "room_1", name: "集群核心机房", commissionedAtMs: 1 },
        { index: 2, id: "room_2", name: "企业级算力机房", commissionedAtMs: 1 },
      ],
      flagship: { activeId: "project_2", progress: 42, startedAtMs: 1, completedIds: ["project_1"], pendingReward: null },
      commissionBonusUntilMs: 0,
      bottleneck: null,
      blueprint: { owned: ["bp_general"], active: "bp_general", levels: { bp_general: 2 }, chosenMilestones: ["server3"] },
      technologyArchive: [{ id: "tech_gpu_array", unlockedAtMs: 1 }],
      eraArchive: [{ id: "era_room1", reachedAtMs: 1 }, { id: "era_room2", reachedAtMs: 1 }],
      projectProgress: 42,
      peakStats: { peakCompute: 1_000_000, peakIncomePerSec: 88_000, totalRequests: 999 },
    };
    storage.save(s);
    const r = validateSave(storage.load() as unknown as Record<string, unknown>);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const restored = r.data;
      expect(restored.workshop.level).toBe(12);
      expect(restored.workshop.experience).toBe(30);
      expect(restored.workshop.lifetimeRevenue).toBe(9_000_000);
      expect(restored.workshop.firstServerAwarded).toBe(true);
      expect(restored.stage3.entered).toBe(true);
      expect(restored.stage3.machineRooms.length).toBe(2);
      expect(restored.stage3.infrastructure.computeCards).toBe(6);
      expect(restored.stage3.flagship.activeId).toBe("project_2");
      expect(restored.stage3.flagship.progress).toBe(42);
      expect(restored.stage3.blueprint.owned).toContain("bp_general");
      expect(restored.stage3.technologyArchive.length).toBe(1);
      expect(restored.stage3.eraArchive.length).toBe(2);
    }
  });

  it("unknown_future_schema_rejected: 未知高版本 Schema 拒绝覆盖", () => {
    const s = freshSaveData(now()) as unknown as Record<string, unknown>;
    s.schemaVersion = MAX_SUPPORTED_SCHEMA_VERSION + 5;
    const r = validateSave(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsupported_version");
  });
});
