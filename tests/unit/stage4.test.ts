// CARD-02：宇宙惊喜事件与 Stage 4 地月算力网（隔离终局命名空间）单元测试。
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { freshSaveData } from "../../src/save/storage";
import { normalizeSave } from "../../src/save/validate";
import {
  startSpacePlan,
  stage4Entered,
  buyNode,
  canBuyNode,
  ownedNodes,
  nodeIncomeMultiplier,
  stage4IncomePerSecond,
  startFinalProject,
  canStartFinalProject,
  advanceFinalProject,
  hasPendingFinalReward,
  claimFinalProjectReward,
  buyVerifiedNodes,
  STAGE4_FINAL_PROJECT,
  STAGE4_NODES,
  STAGE4_FINAL_PROJECT_ID,
  STAGE4_ENTRY_INCOME_PER_SECOND,
} from "../../src/economy/stage4";
import { stage3IncomePerSecond } from "../../src/economy/stage3";
import { tick } from "../../src/economy/engine";
import {
  OFFLINE_STAGE4_CAP_SECONDS,
  OFFLINE_STAGE4_EFFICIENCY,
  offlineCapSeconds,
  offlineEfficiency,
} from "../../src/save/offline";
import type { SaveData } from "../../src/save/types";

function now() {
  return 1_700_000_000_000;
}

/** 构造已揭示地外计划、尚未启动的隔离终局档。 */
function revealedState(): SaveData {
  const s = freshSaveData(now());
  s.money = 1e13; // 模拟地球终局余钱（进入后会被清零）
  s.lifetimeIncome = 1e14;
  s.singularity = {
    mode: "endgame",
    coresClaimed: ["core_1", "core_2", "core_3"],
    spacePlanRevealed: true,
    claimedProjectIds: [],
    spacePlanRevealedAtMs: now(),
    spacePlanStarted: false,
    stage4: null,
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

describe("stage4: space plan reveal & entry", () => {
  it("start requires revealed; exactly-once", () => {
    const s = revealedState();
    s.singularity!.spacePlanRevealed = false;
    expect(startSpacePlan(s, now()).ok).toBe(false);

    const s2 = revealedState();
    expect(startSpacePlan(s2, now()).ok).toBe(true);
    expect(stage4Entered(s2)).toBe(true);
    expect(s2.singularity?.stage4?.nodes).toEqual([STAGE4_NODES[0].id]); // 里程碑授予首节点
    // 再点无效（exactly-once）
    expect(startSpacePlan(s2, now()).ok).toBe(false);
  });

  it("entry zeroes earth money to protect 8-15min first-paid gate", () => {
    const s = revealedState();
    expect(s.money).toBeGreaterThan(0);
    expect(startSpacePlan(s, now()).ok).toBe(true);
    expect(s.money).toBe(0);
  });

  it("does not auto-enter stage4 on reveal", () => {
    const s = revealedState();
    expect(stage4Entered(s)).toBe(false);
    expect(s.singularity?.stage4).toBeNull();
  });

  it("persists spacePlanStarted & stage4 through normalize", () => {
    const s = revealedState();
    startSpacePlan(s, now());
    const n = normalizeSave(structuredClone(s));
    expect(n?.singularity?.spacePlanStarted).toBe(true);
    expect(n?.singularity?.stage4?.entered).toBe(true);
    expect(n?.singularity?.stage4?.nodes).toContain(STAGE4_NODES[0].id);
  });
});

describe("stage4: nodes", () => {
  it("first paid node requires previous owned and funds", () => {
    const s = revealedState();
    startSpacePlan(s, now());
    // moon_base 需要前一节点（首节点已授予）
    expect(canBuyNode(s, "moon_base")).toBe(false); // 资金 0
    s.money = STAGE4_NODES[1].cost;
    expect(canBuyNode(s, "moon_base")).toBe(true);
    expect(buyNode(s, "moon_base").ok).toBe(true);
    expect(ownedNodes(s)).toEqual(["leo_node", "moon_base"]);
    // 重复购买失败
    expect(buyNode(s, "moon_base").ok).toBe(false);
    // 跳过顺序失败
    expect(buyNode(s, "lunar_link").ok).toBe(false);
  });

  it("node multiplier sums owned incomeMult", () => {
    const s = revealedState();
    startSpacePlan(s, now());
    expect(nodeIncomeMultiplier(s).toNumber()).toBe(1);
    s.money = STAGE4_NODES[1].cost;
    buyNode(s, "moon_base");
    expect(nodeIncomeMultiplier(s).toNumber()).toBe(2.6);
  });

  it("core 1 unlocks batch deployment of affordable verified nodes", () => {
    const s = revealedState();
    startSpacePlan(s, now());
    s.money = STAGE4_NODES.slice(1).reduce((sum, node) => sum + node.cost, 0);
    const result = buyVerifiedNodes(s);
    expect(result.ok).toBe(true);
    expect(result.purchasedIds).toEqual(["moon_base", "lunar_link", "deep_relay"]);
    expect(ownedNodes(s)).toEqual(["leo_node", "moon_base", "lunar_link", "deep_relay"]);
  });
});

describe("stage4: income & final project", () => {
  it("normalizes the first paid node to 10 minutes, then restores earth-scaled income", () => {
    const s = revealedState();
    s.permanentMultiplier = 1000;
    startSpacePlan(s, now());

    expect(stage4IncomePerSecond(s, now()).toNumber()).toBe(STAGE4_ENTRY_INCOME_PER_SECOND);
    expect(STAGE4_NODES[1].cost / STAGE4_ENTRY_INCOME_PER_SECOND).toBe(10 * 60);

    s.money = STAGE4_NODES[1].cost;
    expect(buyNode(s, STAGE4_NODES[1].id).ok).toBe(true);
    const earthFinal = Decimal.max(stage3IncomePerSecond(s, now()), 1e8);
    const expected = earthFinal.mul(0.3).mul(nodeIncomeMultiplier(s));
    expect(stage4IncomePerSecond(s, now()).toNumber()).toBeCloseTo(expected.toNumber(), 6);
  });

  it("tick credits stage4 income and advances final project", () => {
    const s = revealedState();
    startSpacePlan(s, now());
    const before = s.money;
    const r = tick(s, now(), 10);
    expect(r.changed).toBe(true);
    expect(Number(s.money)).toBeGreaterThan(Number(before));
    expect(Number(s.singularity?.stage4?.stageIncome)).toBeGreaterThan(0);
    // 工程未启动：进度不推进
    expect(s.singularity?.stage4?.projectProgress).toBe(0);
  });

  it("final project completes with manual exactly-once reward", () => {
    const s = revealedState();
    startSpacePlan(s, now());
    expect(canStartFinalProject(s)).toBe(false);
    s.money = STAGE4_NODES.slice(1).reduce((sum, node) => sum + node.cost, 0)
      + STAGE4_FINAL_PROJECT.constructionCost + 1_000_000;
    expect(buyVerifiedNodes(s).ok).toBe(true);
    expect(canStartFinalProject(s)).toBe(true);
    expect(startFinalProject(s).ok).toBe(true);
    expect(hasPendingFinalReward(s)).toBe(false);
    // 强推进到完成
    for (let i = 0; i < 500000; i++) {
      const r = advanceFinalProject(s, 100);
      if (r.completed) break;
    }
    expect(hasPendingFinalReward(s)).toBe(true);
    expect(claimFinalProjectReward(s).ok).toBe(true);
    expect(s.singularity?.stage4?.completedProjectIds).toContain(STAGE4_FINAL_PROJECT_ID);
    // 重复领取失败（exactly-once）
    expect(claimFinalProjectReward(s).ok).toBe(false);
  });

  it("tick does not run earth economy once entered", () => {
    const s = revealedState();
    startSpacePlan(s, now());
    s.completedOrders = 0;
    const r = tick(s, now(), 30);
    expect(r.completedOrderIds).toEqual([]);
    expect(s.completedOrders).toBe(0);
  });
});

describe("stage4: offline cap & exactly-once", () => {
  it("stage4 retains the original free 2h cap with 75% efficiency", () => {
    const s = revealedState();
    startSpacePlan(s, now());
    expect(offlineCapSeconds(s)).toBe(OFFLINE_STAGE4_CAP_SECONDS);
    expect(offlineEfficiency(s)).toBe(OFFLINE_STAGE4_EFFICIENCY);
    expect(OFFLINE_STAGE4_CAP_SECONDS).toBe(2 * 60 * 60);
  });
});

describe("stage4: offline settlement exactly-once", () => {
  it("settle produces one quote; claim once; refresh does not duplicate", async () => {
    const { settleOfflineReward, claimOfflineReward, hasPendingOfflineReward, offlineRemainingSec } = await import("../../src/save/offline");
    const { incomePerSecond } = await import("../../src/economy/engine");
    const s = revealedState();
    startSpacePlan(s, now());
    // 模拟离线 10 小时：首次报价只给免费 2 小时，广告可在同一回归补领。
    s.lastTickAtMs = now() - 10 * 60 * 60 * 1000;
    const q1 = settleOfflineReward(s, now(), { incomePerSecond });
    expect(q1).not.toBeNull();
    expect(q1!.elapsedSec).toBe(2 * 60 * 60);
    expect(hasPendingOfflineReward(s)).toBe(true);
    // 再次结算不重复
    const q2 = settleOfflineReward(s, now(), { incomePerSecond });
    expect(q2).toBeNull();
    // 领取一次；再领失败（部分领取：报价仍在，但剩余为 0）
    const c1 = claimOfflineReward(s, now(), { incomePerSecond });
    expect(c1.claimed).toBe(true);
    const c2 = claimOfflineReward(s, now(), { incomePerSecond });
    expect(c2.claimed).toBe(false);
    expect(hasPendingOfflineReward(s)).toBe(true);
    expect(offlineRemainingSec(s.pendingOfflineReward!)).toBe(0);
  });
});

describe("stage4: isolation from formal saves", () => {
  it("formal save without singularity is unaffected by stage4 logic", () => {
    const s = freshSaveData(now());
    expect(stage4Entered(s)).toBe(false);
    expect(canBuyNode(s, "moon_base")).toBe(false);
    expect(canStartFinalProject(s)).toBe(false);
    expect(hasPendingFinalReward(s)).toBe(false);
    // 正式档 tick 不产生地月收入
    const before = s.money;
    tick(s, now(), 60);
    expect(s.money).toBe(before);
  });

  it("endgame save without reveal/start never enters stage4", () => {
    const s = freshSaveData(now());
    s.singularity = {
      mode: "endgame",
      coresClaimed: [],
      spacePlanRevealed: false,
      claimedProjectIds: [],
      spacePlanRevealedAtMs: 0,
      spacePlanStarted: false,
      stage4: null,
      stage5: null,
      perpetual: null,
    };
    expect(stage4Entered(s)).toBe(false);
    expect(startSpacePlan(s, now()).ok).toBe(false); // not_revealed
  });
});
