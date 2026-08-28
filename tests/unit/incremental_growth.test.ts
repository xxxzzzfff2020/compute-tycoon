import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  applyOfflineWorkshopExperience,
  incomePerSecond,
  modelCompute,
  modelLevel,
  trainCost,
} from "../../src/economy/engine";
import {
  allocateTalent,
  blueprintGrowthMultiplier,
  blueprintUpgradeCost,
  buyBlueprintLevels,
  buyServerScaleUnits,
  claimAchievement,
  effectiveServerPower,
  ensureGrowthState,
  resetServerScaleForIteration,
  resetTalents,
  serverScaleMultiplier,
  syncTalentPoints,
  talentPointsAvailable,
  talentPointsSpent,
} from "../../src/economy/incremental-growth";
import { enterStage3, stage3IncomePerSecond, stage3TotalCompute } from "../../src/economy/stage3";
import { SERVERS } from "../../src/data/content";
import { freshSaveData } from "../../src/save/storage";
import { normalizeSave } from "../../src/save/validate";
import { SAVE_SCHEMA_VERSION, type SaveData } from "../../src/save/types";

const NOW = 1_700_000_000_000;

function runningState(): SaveData {
  const state = freshSaveData(NOW);
  state.money = "1e30";
  state.automation = true;
  state.modelProgress = { modelId: "codex", level: 4, trainingCount: 3 };
  state.ownedModelIds = ["codex", "vision"];
  state.modelArchive = {
    codex: {
      modelId: "codex", level: 4, firstAcquiredAtMs: NOW, researchCount: 4,
      lifetimeTrainingCount: 3, lifetimeContribution: 0,
    },
    vision: {
      modelId: "vision", level: 3, firstAcquiredAtMs: NOW, researchCount: 3,
      lifetimeTrainingCount: 0, lifetimeContribution: 0,
    },
  };
  state.serverCount = 2;
  state.serverPower = 5;
  state.growth = ensureGrowthState(state);
  return state;
}

describe("CARD-01: global blueprint / scale / talent economy", () => {
  it("migrates a v6 save into the current schema with an exactly neutral growth baseline", () => {
    const legacy = runningState() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 6;
    delete legacy.growth;
    const migrated = normalizeSave(legacy)!;

    expect(migrated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(blueprintGrowthMultiplier(migrated).toFixed(8)).toBe("1.00000000");
    expect(serverScaleMultiplier(migrated).toFixed(8)).toBe("1.00000000");
    expect(new Decimal(migrated.money).eq("1e30")).toBe(true);
    expect(migrated.modelProgress?.modelId).toBe("codex");
    expect(migrated.serverCount).toBe(2);
  });

  it("makes every owned blueprint a global positive investment without switching models", () => {
    const state = runningState();
    const activeBefore = state.modelProgress?.modelId;
    const computeBefore = modelCompute(state);
    const incomeBefore = incomePerSecond(state, NOW);

    const result = buyBlueprintLevels(state, "vision", 1);

    expect(result.ok).toBe(true);
    expect(result.bought).toBe(1);
    expect(state.modelProgress?.modelId).toBe(activeBefore);
    expect(modelCompute(state).gt(computeBefore)).toBe(true);
    expect(incomePerSecond(state, NOW).gt(incomeBefore)).toBe(true);
  });

  it("keeps current-model Blueprint investment out of training level and cost", () => {
    const state = runningState();
    const trainingLevelBefore = state.modelProgress!.level;
    const trainingCostBefore = trainCost(state);
    const blueprintLevelBefore = state.modelArchive.codex.level;

    expect(buyBlueprintLevels(state, "codex", 1).ok).toBe(true);

    expect(state.modelArchive.codex.level).toBe(blueprintLevelBefore + 1);
    expect(state.modelProgress!.level).toBe(trainingLevelBefore);
    expect(modelLevel(state)).toBe(trainingLevelBefore);
    expect(trainCost(state).eq(trainingCostBefore)).toBe(true);
  });

  it("opens every blueprint as an independent level-zero investment after the first model", () => {
    const state = runningState();
    expect(blueprintUpgradeCost(state, "codex", 0).toFixed()).toBe("180");
    expect(blueprintUpgradeCost(state, "scheduler", 0).toFixed()).toBe("11520");
    const before = blueprintGrowthMultiplier(state);

    for (const modelId of ["voice", "science", "distill", "scheduler"]) {
      const result = buyBlueprintLevels(state, modelId, 1);
      expect(result.ok, modelId).toBe(true);
      expect(result.bought, modelId).toBe(1);
      expect(state.modelArchive[modelId]?.level).toBe(1);
      expect(state.ownedModelIds).toContain(modelId);
    }

    expect(blueprintGrowthMultiplier(state).gt(before)).toBe(true);
  });

  it("supports x10/MAX blueprint investment and respects the Lv40 cap", () => {
    const state = runningState();
    expect(buyBlueprintLevels(state, "codex", 10).bought).toBe(10);
    const max = buyBlueprintLevels(state, "codex", "max");
    expect(max.ok).toBe(true);
    expect(state.modelArchive.codex.level).toBe(40);
    expect(buyBlueprintLevels(state, "codex", 1).error).toBe("blueprint_max");
  });

  it("expands an owned server generation as a real scale multiplier", () => {
    const state = runningState();
    const before = effectiveServerPower(state);
    const result = buyServerScaleUnits(state, "server_1", 10);
    expect(result.ok).toBe(true);
    expect(result.bought).toBe(10);
    expect(state.growth.serverUnits.server_1).toBe(11);
    expect(effectiveServerPower(state).gt(before)).toBe(true);
  });

  it("awards one finite point per claimed achievement and enforces branch prerequisites with free reset", () => {
    const state = runningState();
    state.completedOrders = 3;
    state.serverCount = 8;
    state.stage2 = { ...state.stage2, settlementShown: true, completedAtMs: NOW };
    const claimedIds = ["first_model", "first_order", "first_server", "eight_servers"];
    for (const id of claimedIds) {
      const result = claimAchievement(state, id);
      expect(result.ok).toBe(true);
      expect(result.pointsGranted).toBe(1);
    }

    expect(state.growth.talent.pointsEarned).toBe(4);
    expect(talentPointsAvailable(state)).toBe(4);
    expect(allocateTalent(state, "blueprint_efficiency").error).toBe("talent_prerequisite");
    expect(allocateTalent(state, "blueprint_power").ok).toBe(true);
    expect(allocateTalent(state, "blueprint_power").ok).toBe(true);
    expect(allocateTalent(state, "blueprint_power").ok).toBe(true);
    expect(allocateTalent(state, "blueprint_efficiency").ok).toBe(true);
    expect(talentPointsSpent(state)).toBe(4);
    expect(resetTalents(state).ok).toBe(true);
    expect(talentPointsSpent(state)).toBe(0);
    expect(talentPointsAvailable(state)).toBe(4);
  });

  it("rejects duplicate, locked, unknown and over-cap achievement claims", () => {
    const state = runningState();
    state.completedOrders = 3;
    expect(claimAchievement(state, "first_model").ok).toBe(true);
    expect(claimAchievement(state, "first_model").error).toBe("achievement_claimed");
    expect(claimAchievement(state, "dyson").error).toBe("achievement_locked");
    expect(claimAchievement(state, "not_a_real_achievement").error).toBe("unknown_achievement");
    // 顶到 15 点上限后继续领取被拒绝。
    for (let i = 0; i < 14; i++) state.growth.talent.claimedAchievementIds.push(`seed_${i}`);
    syncTalentPoints(state);
    expect(state.growth.talent.pointsEarned).toBe(15);
    expect(claimAchievement(state, "first_order").error).toBe("talent_cap");
  });

  it("keeps blueprints and talents but resets current-round server scale on iteration", () => {
    const state = runningState();
    state.growth.talent.claimedAchievementIds = ["first_model"];
    syncTalentPoints(state);
    expect(state.growth.talent.pointsEarned).toBe(1);
    allocateTalent(state, "blueprint_power");
    buyBlueprintLevels(state, "vision", 1);
    buyServerScaleUnits(state, "server_1", 10);
    const archiveLevel = state.modelArchive.vision.level;

    resetServerScaleForIteration(state);

    expect(state.modelArchive.vision.level).toBe(archiveLevel);
    expect(state.growth.talent.allocations.blueprint_power).toBe(1);
    expect(state.growth.serverUnits.server_1).toBe(0);
    expect(state.growth.serverBaseUnits.server_1).toBe(0);
  });

  it("no longer auto-awards talent points for workshop thresholds after offline automation", () => {
    const state = runningState();
    state.workshop.level = 4;
    state.workshop.experience = 219;
    state.workshop.experienceToNextLevel = 220;
    state.growth.talent.highestWorkshopLevel = 4;
    state.growth.talent.claimedWorkshopLevels = [];
    state.growth.talent.pointsEarned = 0;

    expect(applyOfflineWorkshopExperience(state, 30)).toBeGreaterThan(0);
    expect(state.workshop.level).toBeGreaterThanOrEqual(5);
    // 新合同：工作室等级不再自动发点（改为荣誉馆成就领取）。
    syncTalentPoints(state);
    syncTalentPoints(state);
    expect(state.growth.talent.pointsEarned).toBe(0);
    expect(state.growth.talent.claimedWorkshopLevels).toEqual([]);
  });

  it("keeps legacy workshop/core talent records as frozen points without regression", () => {
    const state = runningState();
    state.growth.talent.claimedWorkshopLevels = [5, 10, 20];
    state.growth.talent.claimedCoreIds = ["core_1"];
    state.workshop.level = 310;
    syncTalentPoints(state);
    expect(state.growth.talent.pointsEarned).toBe(4);
    expect(state.growth.talent.claimedWorkshopLevels).toEqual([5, 10, 20]);
  });

  it("keeps global blueprint and server-scale investments effective after entering Stage 3", () => {
    const state = runningState();
    state.serverCount = 8;
    state.serverPower = 120;
    state.stage2.settlementShown = true;
    for (const server of SERVERS) {
      state.growth.serverUnits[server.id] = 1;
      state.growth.serverBaseUnits[server.id] = 1;
    }
    expect(enterStage3(state, NOW).ok).toBe(true);
    const computeBefore = stage3TotalCompute(state);
    const incomeBefore = stage3IncomePerSecond(state, NOW + 61_000);

    expect(buyBlueprintLevels(state, "vision", 1).ok).toBe(true);
    expect(buyServerScaleUnits(state, "server_8", 1).ok).toBe(true);

    expect(stage3TotalCompute(state).gt(computeBefore)).toBe(true);
    expect(stage3IncomePerSecond(state, NOW + 61_000).gt(incomeBefore)).toBe(true);
  });
});
