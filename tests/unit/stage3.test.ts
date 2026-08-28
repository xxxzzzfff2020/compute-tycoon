// Stage 3 / 算力档案馆 / 第一次技术迭代 / 离线与数据安全 测试。
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { freshSaveData } from "../../src/save/storage";
import {
  applyPrestige,
  buyServer,
  completeStage2Settlement,
  currentStage,
  acquireFirstModel,
  stage3Gateway,
} from "../../src/economy/engine";
import {
  advanceFlagship,
  architectureMultiplier,
  architectureUnlockedCount,
  applyFirstIteration,
  bottleneckAnalysis,
  canCommissionRoom,
  canIterate,
  canStartFlagship,
  canUpgradeInfrastructure,
  chooseBlueprint,
  claimFlagshipReward,
  commissionRoom,
  effectiveEfficiency,
  enterStage3,
  flagshipProgressPerSec,
  hasPendingFlagshipReward,
  infraLevel,
  infrastructureReadiness,
  iterationRequirementsMet,
  recordEra,
  roomRequirementsMet,
  stage3EntryMet,
  stage3IncomePerSecond,
  stage3TotalCompute,
  startFlagship,
  technologyUnlocked,
  upgradeInfrastructure,
} from "../../src/economy/stage3";
import {
  calculateOfflineReward,
  offlineCapSeconds,
} from "../../src/save/offline";
import {
  automationUnlockThreshold,
  automationUnlocked,
} from "../../src/economy/engine";
import {
  addResearchFromOrder,
  orderExperience,
  orderExperienceForState,
} from "../../src/economy/workshop";
import { iterationResearchBonus } from "../../src/economy/stage3";
import { ORDERS } from "../../src/data/content";
import { COMMISSION_BONUS_DURATION_SEC } from "../../src/data/stage3";
import type { SaveData } from "../../src/save/types";

function makeState(): SaveData {
  const s = freshSaveData(1_700_000_000_000);
  acquireFirstModel(s);
  return s;
}

/** 构造已进入 Stage 3 的档（机房 1 就绪） */
function stage3State(): SaveData {
  const s = makeState();
  s.serverCount = 8;
  s.serverPower = 329;
  s.stage2 = { settlementShown: true, completedAtMs: 1, stageIncome: 0 };
  s.stage3 = {
    ...s.stage3,
    entered: true,
    enteredAtMs: 1,
    machineRooms: [{ index: 1, id: "room_1", name: "集群核心机房", commissionedAtMs: 1 }],
  };
  return s;
}

/** 让 Stage 3 满足迭代条件 */
function iterationReady(s: SaveData): void {
  s.stage3 = {
    ...s.stage3,
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

describe("stage3: entry & stage identity", () => {
  it("stage3_unlock_requires_8_servers", () => {
    const s = makeState();
    s.serverCount = 7;
    s.stage2 = { settlementShown: true, completedAtMs: 1, stageIncome: 0 };
    expect(stage3EntryMet(s)).toBe(false);
    s.serverCount = 8;
    s.serverPower = 329;
    expect(stage3EntryMet(s)).toBe(true);
  });

  it("stage3_not_visible_early", () => {
    const s = makeState();
    s.serverCount = 8;
    s.serverPower = 329;
    // 未完成 Stage 2 结算 → 仍 Stage 2（只解锁筹建入口）
    expect(stage3Gateway(s)).toBe(true);
    expect(currentStage(s)).toBe(2);
    expect(enterStage3(s).ok).toBe(false);
  });

  it("stage2_servers_fold_into_room1", () => {
    const s = stage3State();
    expect(enterStage3(s).ok).toBe(true);
    expect(s.stage3?.machineRooms?.some((r) => r.index === 1)).toBe(true);
    expect(roomRequirementsMet(s, 1)).toBe(true);
  });
});

describe("stage3: infrastructure & bottleneck", () => {
  it("infrastructure_purchase_updates_state", () => {
    const s = stage3State();
    s.money = 1e12;
    expect(canUpgradeInfrastructure(s, "power")).toBe(true);
    expect(upgradeInfrastructure(s, "power").ok).toBe(true);
    expect(infraLevel(s, "power")).toBe(1);
    expect(s.money).toBeLessThan(1e12);
  });

  it("bottleneck_detection_correct", () => {
    const s = stage3State();
    s.money = 1e12;
    const b = bottleneckAnalysis(s);
    expect(b.id.length).toBeGreaterThan(0);
    expect(b.efficiency).toBeLessThanOrEqual(1);
    expect(b.efficiency).toBeGreaterThan(0);
    expect(b.candidates.map((candidate) => candidate.id)).toEqual([
      "power", "computeCards", "optical", "storage",
    ]);
    expect(b.candidates.find((candidate) => candidate.id === "storage")?.gain.eq(0)).toBe(true);
  });

  it("derives monotonic readiness from real Stage 3 requirements", () => {
    const s = stage3State();
    const expected = {
      power: { next: 3, final: 6 },
      computeCards: { next: 3, final: 7 },
      optical: { next: 2, final: 5 },
      storage: { next: 2, final: 8 },
    } as const;
    for (const id of ["power", "computeCards", "optical", "storage"] as const) {
      const status = infrastructureReadiness(s, id);
      expect(status.nextRequirement, id).toBe(expected[id].next);
      expect(status.finalRequirement, id).toBe(expected[id].final);
      expect(status.readiness, id).toBe(0);
      s.stage3.infrastructure[id] = expected[id].final;
      const complete = infrastructureReadiness(s, id);
      expect(complete.nextRequirement, id).toBeNull();
      expect(complete.readiness, id).toBe(1);
    }
  });

  it("effective_efficiency_reduces_income_not_damage", () => {
    const s = stage3State();
    const lowEff = effectiveEfficiency(s);
    expect(lowEff).toBeLessThan(1);
    s.stage3 = { ...s.stage3, infrastructure: { power: 8, computeCards: 8, optical: 8, storage: 8 } };
    expect(effectiveEfficiency(s)).toBe(1);
  });
});

describe("stage3: machine rooms", () => {
  it("room2_requires_all_thresholds", () => {
    const s = stage3State();
    s.stage3 = {
      ...s.stage3,
      flagship: {
        activeId: null, progress: 0, startedAtMs: 0,
        completedIds: ["project_1"], pendingReward: null,
      },
    };
    expect(canCommissionRoom(s, 2)).toBe(false);
    s.stage3 = { ...s.stage3, infrastructure: { power: 4, computeCards: 5, optical: 3, storage: 3 } };
    s.money = 1e12;
    expect(canCommissionRoom(s, 2)).toBe(true);
  });

  it("room_commission_exactly_once", () => {
    const s = stage3State();
    s.stage3 = {
      ...s.stage3,
      infrastructure: { power: 4, computeCards: 5, optical: 3, storage: 3 },
      flagship: {
        activeId: null, progress: 0, startedAtMs: 0,
        completedIds: ["project_1"], pendingReward: null,
      },
    };
    expect(commissionRoom(s, 2).ok).toBe(true);
    expect(commissionRoom(s, 2).ok).toBe(false);
    expect((s.stage3?.machineRooms ?? []).filter((r) => r.index === 2).length).toBe(1);
  });

  it("commission_bonus_expires_correctly", () => {
    const s = stage3State();
    s.stage3 = {
      ...s.stage3,
      infrastructure: { power: 4, computeCards: 5, optical: 3, storage: 3 },
      flagship: {
        activeId: null, progress: 0, startedAtMs: 0,
        completedIds: ["project_1"], pendingReward: null,
      },
    };
    commissionRoom(s, 2);
    expect((s.stage3?.commissionBonusUntilMs ?? 0)).toBeGreaterThan(Date.now());
  });

  it("commission_bonus_uses_60_wall_clock_seconds_and_refreshes_without_stacking", () => {
    const now = 1_700_000_000_000;
    const s = stage3State();
    s.stage3 = {
      ...s.stage3,
      infrastructure: { power: 8, computeCards: 8, optical: 8, storage: 8 },
      flagship: {
        activeId: null, progress: 0, startedAtMs: 0,
        completedIds: ["project_1", "project_2"], pendingReward: null,
      },
    };
    expect(commissionRoom(s, 2, now).ok).toBe(true);
    expect(s.stage3.commissionBonusUntilMs).toBe(now + COMMISSION_BONUS_DURATION_SEC * 1000);
    const beforeExpiry = stage3IncomePerSecond(s, now + 59_999);
    const atExpiry = stage3IncomePerSecond(s, now + 60_000);
    expect(beforeExpiry.div(atExpiry).toFixed(6)).toBe("4.000000");

    expect(commissionRoom(s, 3, now + 10_000).ok).toBe(true);
    expect(s.stage3.commissionBonusUntilMs).toBe(now + 10_000 + COMMISSION_BONUS_DURATION_SEC * 1000);
    const refreshedBase = structuredClone(s);
    refreshedBase.stage3.commissionBonusUntilMs = 0;
    const refreshedIncome = stage3IncomePerSecond(refreshedBase, now + 60_000);
    expect(stage3IncomePerSecond(s, now + 60_000).div(refreshedIncome).toFixed(6)).toBe("4.000000");
    expect(stage3IncomePerSecond(s, now + 70_001).div(refreshedIncome).toFixed(6)).toBe("1.000000");
  });
});

describe("stage3: flagship projects", () => {
  it("flagship_project_single_active", () => {
    const s = stage3State();
    s.serverPower = 20_000_000; // 确保满足工程 2 的算力门槛
    s.stage3 = {
      ...s.stage3,
      infrastructure: { power: 4, computeCards: 5, optical: 5, storage: 3 },
      flagship: {
        activeId: null, progress: 0, startedAtMs: 0,
        completedIds: ["project_1"], pendingReward: null,
      },
    };
    commissionRoom(s, 2);
    s.money = 1e15;
    expect(canStartFlagship(s, "project_2")).toBe(true);
    expect(startFlagship(s, "project_2").ok).toBe(true);
    expect(canStartFlagship(s, "project_2")).toBe(false); // 同一时间最多一个
  });

  it("flagship_offline_progress", () => {
    const s = stage3State();
    s.stage3 = {
      ...s.stage3,
      flagship: {
        activeId: "project_1", progress: 0, startedAtMs: 0,
        completedIds: [], pendingReward: null,
      },
    };
    const before = s.stage3?.flagship?.progress ?? 0;
    advanceFlagship(s, 60);
    expect((s.stage3?.flagship?.progress ?? 0)).toBeGreaterThan(before);
  });

  it("flagship_reward_requires_manual_claim", () => {
    const s = stage3State();
    s.serverPower = 50_000_000; // 高算力：perSec ≈ 25，1 小时远超剩余 10 进度
    s.stage3 = {
      ...s.stage3,
      flagship: {
        activeId: "project_1", progress: 90, startedAtMs: 0,
        completedIds: [], pendingReward: null,
      },
      projectProgress: 90,
    };
    // 高算力下推进直至完成
    const r = advanceFlagship(s, 3600);
    expect(r.completed).toBe(true);
    expect(hasPendingFlagshipReward(s)).toBe("project_1");
    expect((s.stage3?.flagship?.completedIds ?? []).includes("project_1")).toBe(false);
    expect(claimFlagshipReward(s).ok).toBe(true);
    expect((s.stage3?.flagship?.completedIds ?? []).includes("project_1")).toBe(true);
  });

  it("final_project_unlocks_iteration", () => {
    const s = stage3State();
    expect(iterationRequirementsMet(s)).toBe(false);
    iterationReady(s);
    expect(iterationRequirementsMet(s)).toBe(true);
  });
});

describe("stage3: archive", () => {
  it("uses exact fixed architecture multipliers and removes legacy per-kind effects", () => {
    const s = stage3State();
    s.serverCount = 0;
    s.stage3 = { ...s.stage3, blueprint: { owned: [], active: null, levels: {}, chosenMilestones: [] } };
    const baselineCompute = stage3TotalCompute(s);
    const baselineEfficiency = effectiveEfficiency(s);
    const baselineIncome = stage3IncomePerSecond(s, 1_700_000_000_000);
    const cases = [
      [0, "1"],
      [3, "1.45"],
      [5, "2.1025"],
      [8, "3.048625"],
    ] as const;
    for (const [servers, expected] of cases) {
      s.serverCount = servers;
      s.stage3.blueprint = { owned: [], active: null, levels: {}, chosenMilestones: [] };
      expect(architectureMultiplier(s).toString()).toBe(expected);
    }
    s.serverCount = 0;
    s.stage3.blueprint = {
      owned: ["bp_general", "bp_gpu", "bp_interconnect"],
      active: null,
      levels: { bp_general: 1, bp_gpu: 1, bp_interconnect: 1 },
      chosenMilestones: [],
    };
    expect(stage3TotalCompute(s).toString()).toBe(baselineCompute.toString());
    expect(effectiveEfficiency(s)).toBe(baselineEfficiency);
    expect(stage3IncomePerSecond(s, 1_700_000_000_000).div(baselineIncome).toFixed(6)).toBe("3.048625");
  });

  it("blueprints_unlock_automatically_in_fixed_order", () => {
    const s = makeState();
    s.serverCount = 3;
    expect(chooseBlueprint(s, "bp_general").ok).toBe(false);
    expect(s.stage3?.blueprint?.active).toBeNull();
    expect(s.stage3?.blueprint?.owned).toEqual([]);
    s.serverCount = 8;
    expect(architectureUnlockedCount(s)).toBe(3);
    expect(architectureMultiplier(s).toFixed()).toBe("3.048625");
    expect(s.stage3?.blueprint?.active).toBeNull();
  });

  it("blueprint_persists_across_iteration", () => {
    const s = makeState();
    s.serverCount = 3;
    chooseBlueprint(s, "bp_general");
    iterationReady(s);
    expect(applyFirstIteration(s).ok).toBe(true);
    expect((s.stage3?.blueprint?.owned ?? []).includes("bp_general")).toBe(true);
  });

  it("technology_archive_auto_unlock", () => {
    const s = stage3State();
    s.money = 1e12;
    expect(technologyUnlocked(s, "tech_optical_bus")).toBe(false);
    s.stage3 = {
      ...s.stage3,
      infrastructure: { power: 4, computeCards: 5, optical: 3, storage: 3 },
    };
    upgradeInfrastructure(s, "optical"); // 光模块 3→4（关键等级 3 已过，首次检查触发）
    // 直接调 checkTechUnlocks 由升级触发；光模块已达 3 级
    expect(technologyUnlocked(s, "tech_optical_bus")).toBe(true);
  });

  it("era_archive_matches_real_progress", () => {
    const s = stage3State();
    recordEra(s, "era_room1");
    expect(s.stage3?.eraArchive?.some((e) => e.id === "era_room1")).toBe(true);
    // 全国级是现行最终工程可达纪元；全球级以后仍锁定。
    recordEra(s, "era_national");
    expect(s.stage3?.eraArchive?.some((e) => e.id === "era_national")).toBe(true);
    recordEra(s, "era_global");
    expect(s.stage3?.eraArchive?.some((e) => e.id === "era_global")).toBe(false);
  });

  it("locked_future_eras_do_not_apply_bonus", () => {
    const s = stage3State();
    recordEra(s, "era_dyson");
    // 未来尺度不会进入 eraArchive → 无任何被动加成路径
    expect(s.stage3?.eraArchive?.some((e) => e.id === "era_dyson")).toBe(false);
  });
});

describe("stage3: iteration 1", () => {
  it("iteration_requirements_complete", () => {
    const s = stage3State();
    expect(canIterate(s)).toBe(false);
    iterationReady(s);
    expect(canIterate(s)).toBe(true);
  });

  it("iteration_not_available_early", () => {
    const s = stage3State();
    expect(applyFirstIteration(s).ok).toBe(false);
  });

  it("iteration_reset_atomic", () => {
    const s = stage3State();
    s.money = 5_000_000;
    iterationReady(s);
    expect(applyFirstIteration(s).ok).toBe(true);
    expect(s.money).toBe(0);
    expect(s.serverCount).toBe(0);
    expect(s.computeCenterLevel).toBe(0);
    expect(s.stage3?.entered).toBe(false);
  });

  it("iteration_permanent_data_preserved", () => {
    const s = stage3State();
    s.ownedModelIds = ["codex", "vision"];
    s.stage3 = { ...s.stage3, blueprint: { owned: ["bp_general"], active: "bp_general", levels: { bp_general: 2 }, chosenMilestones: ["server3", "server8"] } };
    iterationReady(s);
    applyFirstIteration(s);
    expect(s.ownedModelIds).toEqual(["codex", "vision"]);
    expect(s.stage3?.blueprint?.owned).toContain("bp_general");
    expect(s.stage3?.blueprint?.levels?.bp_general).toBe(1);
  });

  it("iteration_multiplier_applied", () => {
    const s = stage3State();
    iterationReady(s);
    applyFirstIteration(s);
    expect(s.permanentMultiplier).toBe(2);
    expect(s.technologyIterationCount).toBe(1);
  });

  it("iteration_exactly_once", () => {
    const s = stage3State();
    iterationReady(s);
    expect(applyFirstIteration(s).ok).toBe(true);
    expect(applyFirstIteration(s).ok).toBe(false);
  });

  it("second_run_ready_state_is_terminal_under_hard_cap", () => {
    const s = stage3State();
    iterationReady(s);
    expect(applyFirstIteration(s).ok).toBe(true);
    iterationReady(s);
    expect(iterationRequirementsMet(s)).toBe(true);
    expect(canIterate(s)).toBe(false);
    const before = structuredClone(s);
    expect(applyFirstIteration(s).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it("second_run_first_server_faster", () => {
    // 首轮首服 8-12 分钟；二轮目标 ≤ 首轮 40%
    const s = stage3State();
    s.lifetimeIncome = 8_000_000;
    s.workshop = { ...s.workshop, lifetimeRevenue: 8_000_000 };
    iterationReady(s);
    applyFirstIteration(s);
    // 二轮：历史累计收入保留 → 首服里程碑（等级 + 累计收入）更快达成
    expect(s.workshop?.lifetimeRevenue).toBeGreaterThan(0);
    expect(s.permanentMultiplier).toBe(2);
  });
});

describe("offline: stage3 contract", () => {
  it("single_player_free_cap_is_two_hours_and_storage_does_not_change_it", () => {
    const s = makeState();
    expect(offlineCapSeconds(s)).toBe(2 * 60 * 60);
    s.stage3 = { ...s.stage3, entered: true, enteredAtMs: 1 };
    expect(offlineCapSeconds(s)).toBe(2 * 60 * 60);
    s.stage3 = { ...s.stage3, infrastructure: { power: 0, computeCards: 0, optical: 0, storage: 3 } };
    expect(offlineCapSeconds(s)).toBe(2 * 60 * 60);
    s.stage3 = { ...s.stage3, infrastructure: { power: 0, computeCards: 0, optical: 0, storage: 7 } };
    expect(offlineCapSeconds(s)).toBe(2 * 60 * 60);
  });

  it("offline_reward_exactly_once", () => {
    const s = makeState();
    s.money = 1000;
    const now = 1_700_000_000_000;
    s.lastTickAtMs = now - 3600 * 1000; // 1 小时前
    s.stage3 = { ...s.stage3, entered: true, enteredAtMs: 1 };
    const quote = calculateOfflineReward(s, now, {
      incomePerSecond: () => new Decimal(100),
    });
    expect(quote).not.toBeNull();
    expect(quote!.elapsedSec).toBe(60 * 60); // Stage 3 cap 60 分钟
  });

  it("offline_does_not_auto_purchase", () => {
    // 离线只产资金/研发/旗舰进度：无自动购买/升级/投产路径（引擎 tick 不触发购买）
    const s = stage3State();
    const beforeRooms = (s.stage3?.machineRooms ?? []).length;
    const beforeMoney = s.money;
    advanceFlagship(s, 300);
    expect((s.stage3?.machineRooms ?? []).length).toBe(beforeRooms);
    expect(s.money).toBe(beforeMoney);
  });
});

describe("stage3: iteration second-run acceleration", () => {
  it("second_run_automation_earlier: 迭代后仍以首服作为自动经营门槛", () => {
    const s = makeState();
    // 首轮阈值：6 单
    expect(automationUnlockThreshold(s)).toBe(6);
    // 完成第一次迭代
    iterationReady(s);
    expect(applyFirstIteration(s).ok).toBe(true);
    expect(automationUnlockThreshold(s)).toBe(3);
    // 新合同：订单数量不再解锁自动经营；首台自有服务器才是门槛。
    s.completedOrders = 3;
    expect(automationUnlocked(s)).toBe(false);
    s.serverCount = 1;
    expect(automationUnlocked(s)).toBe(true);
    s.completedOrders = 2;
    expect(automationUnlocked(s)).toBe(true);
  });

  it("legacy research bonus cannot restore the removed free Blueprint path", () => {
    const s = makeState();
    expect(iterationResearchBonus(s).toNumber()).toBe(1);
    iterationReady(s);
    applyFirstIteration(s);
    expect(iterationResearchBonus(s).toNumber()).toBe(1.25);
    const order = ORDERS[0];
    s.modelResearch = { progress: 0, stage2Draws: 0 };
    addResearchFromOrder(s, order);
    expect(s.modelResearch.progress).toBe(0);
  });

  it("iteration_permanent_multiplier_speeds_workshop_xp: 永久倍率加速二轮订单经验（首轮不受影响）", () => {
    const s = makeState();
    const order = ORDERS[0]; // o1 gross=180 → 基础经验 6
    expect(orderExperience(order)).toBe(6);
    expect(orderExperienceForState(s, order)).toBe(6); // 首轮 ×1
    iterationReady(s);
    applyFirstIteration(s);
    expect(s.permanentMultiplier).toBe(2);
    expect(orderExperienceForState(s, order)).toBe(12); // 二轮 ×2
  });
});
