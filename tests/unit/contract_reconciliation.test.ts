import { describe, expect, it } from "vitest";
import { MODELS } from "../../src/data/content";
import { COMMISSION_BONUS_DURATION_SEC, FLAGSHIP_PROJECTS } from "../../src/data/stage3";
import {
  acquireFirstModel,
  applyOfflineResearchProgress,
  upgradeCenter,
} from "../../src/economy/engine";
import { blueprintUpgradeCost, buyBlueprintLevels } from "../../src/economy/incremental-growth";
import {
  advanceFlagship,
  applyFirstIteration,
  claimFlagshipReward,
  enterStage3,
  flagshipProgressPerSec,
  flagshipRewardMultiplier,
  stage3EntryMet,
} from "../../src/economy/stage3";
import {
  businessMixForState,
  distinctModelRoles,
  modelEffectMultipliers,
} from "../../src/economy/model-effects";
import { buildViewModel } from "../../src/economy/viewmodel";
import { offlineCapSeconds } from "../../src/save/offline";
import { freshSaveData } from "../../src/save/storage";
import { validateSave } from "../../src/save/validate";
import type { SaveData } from "../../src/save/types";

function baseState(modelId = "codex"): SaveData {
  const state = freshSaveData(1_700_000_000_000);
  expect(acquireFirstModel(state, modelId).ok).toBe(true);
  return state;
}

function stage3State(): SaveData {
  const state = baseState();
  state.serverCount = 8;
  state.serverPower = 329;
  state.stage2 = { settlementShown: true, completedAtMs: 1, stageIncome: 0 };
  state.stage3 = {
    ...state.stage3,
    entered: true,
    enteredAtMs: 1,
    machineRooms: [{ index: 1, id: "room_1", name: "集群核心机房", commissionedAtMs: 1 }],
  };
  return state;
}

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

function buyBlueprint(state: SaveData, modelId: string, quantity = 1): void {
  state.money = 1e15;
  const result = buyBlueprintLevels(state, modelId, quantity);
  expect(result.ok).toBe(true);
  expect(result.bought).toBe(quantity);
}

describe("H5 product-contract reconciliation: six models", () => {
  it("model_count_is_exactly_six", () => {
    expect(MODELS).toHaveLength(6);
  });

  it("all_six_model_roles_are_distinct", () => {
    expect(new Set(distinctModelRoles()).size).toBe(6);
    expect(MODELS.every((model) => model.activeBonus > 0 && model.archiveBonusPerLevel > 0)).toBe(true);
  });

  it("all_models_are_available_as_paid_blueprints", () => {
    const state = baseState();
    buyBlueprint(state, "distill");
    buyBlueprint(state, "scheduler");
    expect(state.ownedModelIds).toEqual(expect.arrayContaining(["distill", "scheduler"]));
  });

  it("new_model_passives_apply_to_runtime", () => {
    const researchState = baseState("distill");
    const flagshipState = baseState("scheduler");
    expect(modelEffectMultipliers(researchState).research.gt(1)).toBe(true);
    expect(modelEffectMultipliers(flagshipState).flagship.gt(1)).toBe(true);

    const voiceState = baseState("voice");
    const baseHighValue = businessMixForState(baseState()).filter((item) => ["o3", "o4", "o5"].includes(item.orderId))
      .reduce((sum, item) => sum + item.share, 0);
    const voiceHighValue = businessMixForState(voiceState).filter((item) => ["o3", "o4", "o5"].includes(item.orderId))
      .reduce((sum, item) => sum + item.share, 0);
    expect(voiceHighValue).toBeGreaterThan(baseHighValue);
  });

  it("repeated_paid_upgrades_raise_the_same_blueprint", () => {
    const state = baseState();
    buyBlueprint(state, "distill");
    const before = state.modelArchive.distill.level;
    buyBlueprint(state, "distill");
    expect(state.modelArchive.distill.level).toBeGreaterThan(before);
  });

  it("blueprint_upgrade_spends_the_exact_quoted_amount", () => {
    const state = baseState();
    const cost = blueprintUpgradeCost(state, "distill");
    state.money = cost.plus(12345).toNumber();
    expect(buyBlueprintLevels(state, "distill", 1).ok).toBe(true);
    expect(state.money).toBe(12345);
  });

  it("paid_blueprint_upgrades_never_switch_the_active_model", () => {
    const state = baseState();
    for (const model of MODELS) {
      buyBlueprint(state, model.id);
      expect(MODELS.filter((model) => model.id === state.modelProgress?.modelId)).toHaveLength(1);
      expect(state.modelProgress?.modelId).toBe("codex");
    }
  });

  it("model_archive_persists_after_iteration", () => {
    const state = baseState();
    buyBlueprint(state, "distill");
    buyBlueprint(state, "scheduler");
    const before = structuredClone(state.modelArchive);
    makeIterationReady(state);
    expect(applyFirstIteration(state).ok).toBe(true);
    expect(state.modelArchive).toEqual(before);
    expect(state.ownedModelIds).toEqual(expect.arrayContaining(["distill", "scheduler"]));
  });
});

describe("H5 product-contract reconciliation: legacy gateway", () => {
  it("legacy_gateway_not_visible", () => {
    const state = baseState();
    state.serverCount = 8;
    state.serverPower = 329;
    state.stage2.settlementShown = true;
    const vm = buildViewModel(state);
    expect(vm.center.unlocked).toBe(false);
    expect(vm.primaryAction?.id).not.toBe("upgrade_center");
  });

  it("legacy_gateway_cannot_unlock_stage3", () => {
    const state = baseState();
    state.serverCount = 3;
    state.computeCenterLevel = 10;
    expect(stage3EntryMet(state)).toBe(false);
    expect(enterStage3(state).ok).toBe(false);
    expect(upgradeCenter(state).ok).toBe(false);
  });

  it("stage3_requires_eight_servers_and_settlement", () => {
    const state = baseState();
    state.serverCount = 8;
    expect(stage3EntryMet(state)).toBe(false);
    state.stage2.settlementShown = true;
    expect(stage3EntryMet(state)).toBe(true);
  });

  it("stage3_room_one_commission_bonus_is_granted_once", () => {
    const state = baseState();
    state.serverCount = 8;
    state.serverPower = 329;
    state.stage2.settlementShown = true;
    const now = 1_700_000_000_000;
    expect(enterStage3(state, now).ok).toBe(true);
    const firstExpiry = state.stage3.commissionBonusUntilMs;
    expect(firstExpiry).toBe(now + COMMISSION_BONUS_DURATION_SEC * 1000);
    expect(enterStage3(state, now + 10_000).ok).toBe(true);
    expect(state.stage3.commissionBonusUntilMs).toBe(firstExpiry);
  });

  it("legacy_gateway_only_save_is_normalized_back_to_stage2", () => {
    const raw = baseState() as SaveData & { schemaVersion: number };
    raw.schemaVersion = 2;
    raw.serverCount = 3;
    raw.serverPower = 14;
    raw.computeCenterLevel = 6;
    const result = validateSave(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.computeCenterLevel).toBe(0);
    expect(result.data.stage3.entered).toBe(false);
    expect(result.data.serverCount).toBe(3);
    expect(result.data.stage).toBe(2);
  });

  it("legacy_real_stage3_progress_is_preserved", () => {
    const raw = baseState() as SaveData & { schemaVersion: number };
    raw.schemaVersion = 2;
    raw.serverCount = 3;
    raw.serverPower = 14;
    raw.computeCenterLevel = 4;
    raw.stage3.infrastructure.power = 1;
    const result = validateSave(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.computeCenterLevel).toBe(0);
    expect(result.data.stage3.entered).toBe(true);
    expect(result.data.stage2.settlementShown).toBe(true);
    expect(result.data.serverCount).toBe(8);
    expect(result.data.serverPower).toBeGreaterThanOrEqual(329);
    expect(result.data.stage3.machineRooms.some((room) => room.index === 1)).toBe(true);
  });

  it("legacy_iteration_record_with_gateway_is_preserved_as_real_progress", () => {
    const raw = freshSaveData(1) as unknown as Record<string, any>;
    raw.schemaVersion = 2;
    raw.computeCenterLevel = 1;
    raw.technologyIterationCount = 1;
    raw.serverCount = 0;
    raw.serverPower = 1;
    const result = validateSave(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.stage3.entered).toBe(true);
    expect(result.data.stage2.settlementShown).toBe(true);
    expect(result.data.serverCount).toBe(8);
    expect(result.data.computeCenterLevel).toBe(0);
  });

  it("legacy_gateway_migration_exactly_once", () => {
    const raw = baseState() as SaveData & { schemaVersion: number };
    raw.schemaVersion = 2;
    raw.computeCenterLevel = 3;
    const first = validateSave(raw);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = validateSave(first.data);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data).toEqual(first.data);
    expect(second.repaired).toBe(false);
  });
});

describe("H5 product-contract reconciliation: storage and optical", () => {
  it("storage_does_not_change_project_duration", () => {
    const state = stage3State();
    state.stage3.flagship.activeId = "project_1";
    const before = flagshipProgressPerSec(state);
    state.stage3.infrastructure.storage = 10;
    expect(flagshipProgressPerSec(state).eq(before)).toBe(true);
  });

  it("storage_increases_project_final_reward_and_claim_is_exactly_once", () => {
    const state = stage3State();
    state.stage3.infrastructure.storage = 2;
    const required = FLAGSHIP_PROJECTS.find((project) => project.id === "project_1")!.progressRequired;
    state.stage3.flagship = {
      activeId: "project_1", progress: required - 1, startedAtMs: 1, completedIds: [], pendingReward: null,
    };
    state.stage3.projectProgress = required - 1;
    expect(advanceFlagship(state, 10).completed).toBe(true);
    expect(state.stage3.flagship.pendingReward?.rewardMultiplier).toBeCloseTo(1.10);
    state.stage3.infrastructure.storage = 10;
    const before = state.money;
    expect(claimFlagshipReward(state).ok).toBe(true);
    expect(Number(state.money) - Number(before)).toBe(3_300_000);
    const after = state.money;
    expect(claimFlagshipReward(state).ok).toBe(false);
    expect(state.money).toBe(after);
  });

  it("storage_reward_bonus_caps_at_25_percent", () => {
    const state = stage3State();
    state.stage3.infrastructure.storage = 100;
    expect(flagshipRewardMultiplier(state, "project_1").toNumber()).toBe(1.25);
  });

  it("storage does not change the original free offline cap in single-player", () => {
    const state = stage3State();
    expect(offlineCapSeconds(state)).toBe(2 * 60 * 60);
    state.stage3.infrastructure.storage = 1;
    expect(offlineCapSeconds(state)).toBe(2 * 60 * 60);
    state.stage3.infrastructure.storage = 8;
    expect(offlineCapSeconds(state)).toBe(2 * 60 * 60);
    state.stage3.infrastructure.storage = 10;
    expect(offlineCapSeconds(state)).toBe(2 * 60 * 60);
  });

  it("storage cannot buy additional offline research time", () => {
    const low = stage3State();
    low.automation = true;
    low.serverPower = 0.001;
    const high = structuredClone(low);
    high.stage3.infrastructure.storage = 8;
    applyOfflineResearchProgress(low, offlineCapSeconds(low));
    applyOfflineResearchProgress(high, offlineCapSeconds(high));
    expect(high.modelResearch.progress).toBe(low.modelResearch.progress);
  });

  it("optical_module_still_controls_project_speed", () => {
    const state = stage3State();
    state.stage3.flagship.activeId = "project_1";
    const before = flagshipProgressPerSec(state);
    state.stage3.infrastructure.optical = 8;
    expect(flagshipProgressPerSec(state).gt(before)).toBe(true);
  });

  it("storage UI only describes its flagship reward effect", () => {
    const state = stage3State();
    state.stage3.infrastructure.storage = 2;
    const storage = buildViewModel(state).stage3.infrastructure.find((item) => item.id === "storage");
    expect(storage?.detail).not.toContain("离线上限");
    expect(storage?.detail).toContain("→");
    expect(storage?.detail).toContain("资金奖励");
    expect(storage?.detail).not.toContain("工程速度");
  });
});
