// CARD-03：Stage 5 戴森算力纪元 / 戴森算力球 / 主线结局 / 永续增长模式（隔离终局命名空间）单元测试。
import { describe, expect, it } from "vitest";
import { freshSaveData } from "../../src/save/storage";
import { normalizeSave } from "../../src/save/validate";
import {
  startStage5,
  stage5Entered,
  buyNode,
  canBuyNode,
  ownedNodes,
  nodeIncomeMultiplier,
  stage5IncomePerSecond,
  startFinalProject,
  canStartFinalProject,
  advanceFinalProject,
  hasPendingFinalReward,
  claimFinalProjectReward,
  perpetualActive,
  iterationBlockedByPerpetual,
  manualResetAvailable,
  STAGE5_NODES,
  STAGE5_ERA_NAME,
  STAGE5_FINAL_PROJECT,
  STAGE5_FINAL_PROJECT_ID,
} from "../../src/economy/stage5";
import { tick } from "../../src/economy/engine";
import { canEndgameIterate, applyEndgameIteration } from "../../src/economy/singularity";
import type { SaveData } from "../../src/save/types";

function now() {
  return 1_700_000_000_000;
}

/** 构造已完成地月主线（stage4 完成并领取）的隔离终局档。 */
function stage5ReadyState(): SaveData {
  const s = freshSaveData(now());
  s.money = 1e13;
  s.lifetimeIncome = 1e15;
  s.singularity = {
    mode: "endgame",
    coresClaimed: ["core_1", "core_2", "core_3"],
    spacePlanRevealed: true,
    claimedProjectIds: [],
    spacePlanRevealedAtMs: now(),
    spacePlanStarted: true,
    stage4: {
      entered: true,
      enteredAtMs: now(),
      nodes: ["leo_node", "moon_base", "lunar_link", "deep_relay"],
      stageIncome: 1e12,
      projectProgress: 360000,
      activeProjectId: null,
      completedProjectIds: ["moon_network"],
      pendingRewardProjectId: null,
    },
    stage5: null,
    perpetual: null,
  };
  s.stage3 = {
    ...s.stage3,
    entered: true,
    enteredAtMs: now(),
    infrastructure: { power: 8, computeCards: 8, optical: 8, storage: 8 },
    machineRooms: [
      { index: 1, id: "room_1", name: "r1", commissionedAtMs: now() },
      { index: 2, id: "room_2", name: "r2", commissionedAtMs: now() },
      { index: 3, id: "room_3", name: "r3", commissionedAtMs: now() },
    ],
    flagship: { activeId: null, progress: 0, startedAtMs: 0, completedIds: ["project_1", "project_2", "project_3"], pendingReward: null },
  };
  return s;
}

function prepareDysonConstruction(s: SaveData): void {
  s.money = STAGE5_NODES.slice(1).reduce((sum, node) => sum + node.cost, 0)
    + STAGE5_FINAL_PROJECT.constructionCost;
  for (const node of STAGE5_NODES.slice(1)) expect(buyNode(s, node.id).ok).toBe(true);
}

describe("stage5: entry & exactly-once", () => {
  it("requires stage4 complete; exactly-once", () => {
    const s = stage5ReadyState();
    // 未完成地月主线
    s.singularity!.stage4!.completedProjectIds = [];
    expect(startStage5(s, now()).ok).toBe(false);

    const s2 = stage5ReadyState();
    expect(startStage5(s2, now()).ok).toBe(true);
    expect(stage5Entered(s2)).toBe(true);
    expect(s2.singularity?.stage5?.nodes).toEqual([STAGE5_NODES[0].id]);
    expect(s2.singularity?.stage5?.storyCompleted).toBe(false);
    // 再点无效
    expect(startStage5(s2, now()).ok).toBe(false);
  });

  it("entry zeroes money to protect first-paid gate", () => {
    const s = stage5ReadyState();
    expect(s.money).toBeGreaterThan(0);
    expect(startStage5(s, now()).ok).toBe(true);
    expect(s.money).toBe(0);
  });

  it("persists stage5 & perpetual through normalize", () => {
    const s = stage5ReadyState();
    startStage5(s, now());
    const n = normalizeSave(structuredClone(s));
    expect(n?.singularity?.stage5?.entered).toBe(true);
    expect(n?.singularity?.stage5?.nodes).toContain(STAGE5_NODES[0].id);
    expect(n?.singularity?.perpetual).toBeNull();
  });
});

describe("stage5: nodes", () => {
  it("first paid node requires previous owned and funds", () => {
    const s = stage5ReadyState();
    startStage5(s, now());
    expect(canBuyNode(s, "stellar_node")).toBe(false); // 资金 0
    s.money = STAGE5_NODES[1].cost;
    expect(canBuyNode(s, "stellar_node")).toBe(true);
    expect(buyNode(s, "stellar_node").ok).toBe(true);
    expect(ownedNodes(s)).toEqual(["solar_array", "stellar_node"]);
    expect(buyNode(s, "stellar_node").ok).toBe(false);
    expect(buyNode(s, "dyson_cloud").ok).toBe(false);
  });

  it("node multiplier sums owned incomeMult", () => {
    const s = stage5ReadyState();
    startStage5(s, now());
    expect(nodeIncomeMultiplier(s).toNumber()).toBe(1);
    s.money = STAGE5_NODES[1].cost;
    buyNode(s, "stellar_node");
    expect(nodeIncomeMultiplier(s).toNumber()).toBe(2.8);
  });
});

describe("stage5: dyson sphere & story complete", () => {
  it("tick credits income and advances dyson sphere", () => {
    const s = stage5ReadyState();
    startStage5(s, now());
    const before = s.money;
    const r = tick(s, now(), 10);
    expect(r.changed).toBe(true);
    expect(Number(s.money)).toBeGreaterThan(Number(before));
    expect(Number(s.singularity?.stage5?.stageIncome)).toBeGreaterThan(0);
    expect(s.singularity?.stage5?.projectProgress).toBe(0);
  });

  it("dyson completion unlocks perpetual exactly-once", () => {
    const s = stage5ReadyState();
    startStage5(s, now());
    prepareDysonConstruction(s);
    expect(canStartFinalProject(s)).toBe(true);
    expect(startFinalProject(s).ok).toBe(true);
    for (let i = 0; i < 500000; i++) {
      const r = advanceFinalProject(s, 100);
      if (r.completed) break;
    }
    expect(hasPendingFinalReward(s)).toBe(true);
    expect(perpetualActive(s)).toBe(false);
    expect(claimFinalProjectReward(s, now()).ok).toBe(true);
    expect(s.singularity?.stage5?.completedProjectIds).toContain(STAGE5_FINAL_PROJECT_ID);
    expect(s.singularity?.stage5?.storyCompleted).toBe(true);
    expect(s.singularity?.stage5?.legendaryArchive).toEqual({
      completedAtMs: now(),
      maxCompute: expect.any(Number),
      maxIncome: expect.any(Number),
      reachedEra: STAGE5_ERA_NAME,
    });
    expect(normalizeSave(structuredClone(s))?.singularity?.stage5?.legendaryArchive).toEqual(
      s.singularity?.stage5?.legendaryArchive,
    );
    expect(perpetualActive(s)).toBe(true);
    expect(iterationBlockedByPerpetual(s)).toBe(true);
    // 重复领取失败
    expect(claimFinalProjectReward(s, now()).ok).toBe(false);
  });

  it("perpetual blocks iteration but keeps manual reset", () => {
    const s = stage5ReadyState();
    startStage5(s, now());
    prepareDysonConstruction(s);
    startFinalProject(s);
    for (let i = 0; i < 500000; i++) {
      if (advanceFinalProject(s, 100).completed) break;
    }
    claimFinalProjectReward(s, now());
    expect(iterationBlockedByPerpetual(s)).toBe(true);
    expect(manualResetAvailable()).toBe(true); // 设置中的完整重置存档保留
    // 永续模式：即使有未执行迭代也拒绝（双重门禁）
    s.technologyIterationCount = 1;
    s.singularity!.coresClaimed = ["core_1", "core_2", "core_3"];
    expect(canEndgameIterate(s)).toBe(false);
    expect(applyEndgameIteration(s).ok).toBe(false);
  });
});

describe("stage5: offline cap & exactly-once", () => {
  it("stage5 retains the original free 2h cap with 75% efficiency", async () => {
    const { OFFLINE_STAGE5_CAP_SECONDS, OFFLINE_STAGE5_EFFICIENCY, offlineCapSeconds, offlineEfficiency } = await import("../../src/save/offline");
    const s = stage5ReadyState();
    startStage5(s, now());
    expect(offlineCapSeconds(s)).toBe(OFFLINE_STAGE5_CAP_SECONDS);
    expect(offlineEfficiency(s)).toBe(OFFLINE_STAGE5_EFFICIENCY);
    expect(OFFLINE_STAGE5_CAP_SECONDS).toBe(2 * 60 * 60);
  });

  it("settle produces one quote; claim once; no duplicate", async () => {
    const { settleOfflineReward, claimOfflineReward, hasPendingOfflineReward } = await import("../../src/save/offline");
    const { incomePerSecond } = await import("../../src/economy/engine");
    const s = stage5ReadyState();
    startStage5(s, now());
    s.lastTickAtMs = now() - 10 * 60 * 60 * 1000;
    const q1 = settleOfflineReward(s, now(), { incomePerSecond });
    expect(q1).not.toBeNull();
    expect(q1!.elapsedSec).toBe(2 * 60 * 60);
    expect(hasPendingOfflineReward(s)).toBe(true);
    expect(settleOfflineReward(s, now(), { incomePerSecond })).toBeNull();
    const c1 = claimOfflineReward(s, now(), { incomePerSecond });
    expect(c1.claimed).toBe(true);
    expect(claimOfflineReward(s, now(), { incomePerSecond }).claimed).toBe(false);
  });
});

describe("stage5: isolation from formal saves", () => {
  it("formal save without singularity is unaffected", () => {
    const s = freshSaveData(now());
    expect(stage5Entered(s)).toBe(false);
    expect(canBuyNode(s, "stellar_node")).toBe(false);
    expect(canStartFinalProject(s)).toBe(false);
    expect(hasPendingFinalReward(s)).toBe(false);
    expect(perpetualActive(s)).toBe(false);
    const before = s.money;
    tick(s, now(), 60);
    expect(s.money).toBe(before);
  });

  it("stage5 requires stage4 moon_network completed", () => {
    const s = stage5ReadyState();
    s.singularity!.stage4!.completedProjectIds = ["moon_network"];
    s.singularity!.stage5 = null;
    expect(startStage5(s, now()).ok).toBe(true);
    // 永续未激活前，迭代仍由 singularity 状态机门禁（不因永续改变）
    expect(perpetualActive(s)).toBe(false);
  });
});
