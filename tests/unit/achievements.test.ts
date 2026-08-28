// CARD-06 负责人反馈：天赋点来源改为荣誉馆成就领取。
// 覆盖：成就判定、领取流程、上限、旧工作室/核心记录冻结不回退、Session 命令。
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, claimableAchievementCount, evaluateAchievements } from "../../src/economy/achievements";
import {
  claimAchievement,
  normalizeGrowthState,
  syncTalentPoints,
  talentPointsAvailable,
} from "../../src/economy/incremental-growth";
import { freshSaveData } from "../../src/save/storage";
import type { SaveData } from "../../src/save/types";
import { buildEndgameReviewSave } from "../../src/review/endgame-checkpoints";
import { GameSession } from "../../src/app/session";
import { FakeClock } from "./helpers";
import { MemorySaveStorage } from "../../src/save/storage";
import { SaveRepository } from "../../src/save/repository";

const NOW = 1_700_000_000_000;

function runningState(): SaveData {
  const state = freshSaveData(NOW);
  state.money = "1e30";
  state.modelProgress = { modelId: "codex", level: 4, trainingCount: 3 };
  state.ownedModelIds = ["codex", "vision"];
  state.completedOrders = 5;
  state.serverCount = 8;
  state.stage2 = { ...state.stage2, settlementShown: true, completedAtMs: NOW };
  return state;
}

describe("CARD-06: achievement claim talent points", () => {
  it("defines exactly 15 achievements matching the 15-point cap", () => {
    expect(ACHIEVEMENTS).toHaveLength(15);
    expect(new Set(ACHIEVEMENTS.map((item) => item.id)).size).toBe(15);
  });

  it("evaluates achievements from the formal SaveData only", () => {
    const state = runningState();
    const states = new Map(evaluateAchievements(state).map((item) => [item.id, item]));
    expect(states.get("first_model")?.achieved).toBe(true);
    expect(states.get("first_order")?.achieved).toBe(true);
    expect(states.get("first_server")?.achieved).toBe(true);
    expect(states.get("eight_servers")?.achieved).toBe(true);
    expect(states.get("dyson")?.achieved).toBe(false);
    expect(states.get("r1")?.achieved).toBe(false);
  });

  it("workshop and core records stay frozen as legacy points and stop auto-awarding", () => {
    const state = runningState();
    state.growth.talent.claimedWorkshopLevels = [5, 10, 20];
    state.growth.talent.claimedCoreIds = ["core_1"];
    state.workshop.level = 310;
    syncTalentPoints(state);
    expect(state.growth.talent.pointsEarned).toBe(4);
    expect(state.growth.talent.claimedWorkshopLevels).toEqual([5, 10, 20]);
    expect(state.growth.talent.claimedCoreIds).toEqual(["core_1"]);
  });

  it("claims every achieved achievement of an endgame save without exceeding the cap", () => {
    const state = buildEndgameReviewSave("endgame_stage5_dyson_almost", 1_800_000_000_000);
    // 清空可能的旧制遗产记录，单独验证成就来源。
    state.growth.talent.claimedWorkshopLevels = [];
    state.growth.talent.claimedCoreIds = [];
    state.growth.talent.pointsEarned = 0;
    syncTalentPoints(state);
    const achievedIds = evaluateAchievements(state).filter((item) => item.achieved).map((item) => item.id);
    expect(achievedIds.length).toBeGreaterThan(0);
    for (const id of achievedIds) {
      const result = claimAchievement(state, id);
      expect(result.ok).toBe(true);
      expect(result.pointsGranted).toBe(1);
    }
    expect(state.growth.talent.pointsEarned).toBe(Math.min(15, achievedIds.length));
    expect(state.growth.talent.pointsEarned).toBeLessThanOrEqual(15);
    // 全部领完后不再有可领取成就。
    expect(claimableAchievementCount(state)).toBe(0);
    expect(talentPointsAvailable(state)).toBe(state.growth.talent.pointsEarned);
  });

  it("exposes claiming through GameSession and keeps the save round-trip", () => {
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    const repository = new SaveRepository({ storage, nowMs: () => clock.now() });
    const session = new GameSession({ repository, clock });
    expect(session.claimAchievement("first_model").error).toBe("achievement_locked");
    session.acquireModel();
    const result = session.claimAchievement("first_model");
    expect(result.ok).toBe(true);
    expect(session.viewModel().growth.talent.available).toBe(1);
    expect(session.viewModel().achievements.find((item) => item.id === "first_model")?.claimed).toBe(true);
    expect(session.claimAchievement("first_model").error).toBe("achievement_claimed");
  });

  it("records achievedAtMs/stage/workshopLevel at claim time and keeps them monotonic", () => {
    const state = runningState();
    state.growth.talent.claimedAchievementIds = [];
    state.growth.talent.pointsEarned = 0;
    const result = claimAchievement(state, "first_model");
    expect(result.ok).toBe(true);
    const record = state.growth.talent.achievementRecords["first_model"];
    expect(record).toBeDefined();
    expect(record.achievedAtMs).toBeGreaterThan(0);
    expect(record.stage).toBe(1);
    expect(record.workshopLevel).toBeGreaterThanOrEqual(1);
    // 回拨保护：重复场景下时间只增不减（旧档无记录时归一化回填为空，UI 回退展示）
    const growth = normalizeGrowthState(state.growth, state);
    expect(growth.talent.achievementRecords["first_model"]).toEqual(record);
  });

  it("keeps records for legacy claimed achievements via normalization (empty backfill)", () => {
    const state = runningState();
    // 模拟旧档：有 claimedAchievementIds 但无记录
    state.growth.talent.claimedAchievementIds = ["first_model", "first_order"];
    state.growth.talent.pointsEarned = 2;
    delete (state.growth.talent as Partial<typeof state.growth.talent>).achievementRecords;
    const growth = normalizeGrowthState(state.growth, state);
    expect(growth.talent.achievementRecords).toEqual({});
    expect(growth.talent.claimedAchievementIds).toEqual(["first_model", "first_order"]);
    expect(growth.talent.pointsEarned).toBe(2);
  });
});
