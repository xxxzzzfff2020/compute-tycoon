// 经济模拟：用真实引擎规则（秒级循环）校准 MVP 节奏。
// 运行：npm run simulate
// 输出：各策略 1000 局中位/10%/90% 里程碑时间。
import Decimal from "decimal.js";
import { freshSaveData } from "../src/save/storage";
import {
  acceptOrder,
  acquireFirstModel,
  applyPrestige,
  applyTrain,
  automationUnlocked,
  buyServer,
  canPrestige,
  canTrain,
  claimOrder,
  creditModelContribution,
  enableAutomation,
  incomePerSecond,
  nextServerCost,
  trainCost,
  applyOfflineResearchProgress,
} from "../src/economy/engine";
import {
  awardFirstServer,
  firstServerMilestoneMet,
} from "../src/economy/workshop";
import {
  canResearchModel,
  orderDisplayMode,
  pickAutoOrderId,
  researchModel,
  completeStage2Settlement,
} from "../src/economy/engine";
import {
  advanceFlagship,
  canCommissionRoom,
  canStartFlagship,
  claimFlagshipReward,
  commissionRoom,
  enterStage3,
  startFlagship,
  upgradeInfrastructure,
  infraLevel,
  hasPendingFlagshipReward,
  roomCount,
  blueprintChoiceAvailable,
  chooseBlueprint,
} from "../src/economy/stage3";
import { infraUpgradeCost } from "../src/data/stage3";
import { stage3IncomePerSecond, stage3TotalCompute } from "../src/economy/stage3";
import { MODELS, ORDERS } from "../src/data/content";
import {
  claimOfflineReward,
  offlineCapSeconds,
  settleOfflineReward,
} from "../src/save/offline";
import type { SaveData } from "../src/save/types";
import { formatTime } from "../src/core/big";

const SIM_EPOCH_MS = 2_000_000_000_000;

// ---------- 里程碑 ----------
interface Milestones {
  firstOrderSec: number;
  automationSec: number;
  workshopLv6Sec: number;
  revenue15kSec: number;
  firstServerSec: number;
  firstServerMoney: number;
  modelLevelAtFirstServer: number;
  threeServersSec: number;
  server5Sec: number;
  server8Sec: number;
  computeCenterSec: number;
  firstIterationSec: number;
  secondRunRecoverySec: number;
  secondRunFirstServerSec: number;
  secondRunServer8Sec: number;
  iterationReached: boolean;
  modelsAcquiredDuringStage2: number;
  stage3Room2Sec: number;
  stage3Room3Sec: number;
  finalProjectSec: number;
  modelsOwnedAtIteration: number;
  trainingCountAtIteration: number;
  orderCounts: Record<string, number>;
  modelFirstAcquiredSec: Record<string, number>;
  modelLevelsAtIteration: Record<string, number>;
  modelContributionAtIteration: Record<string, number>;
  offlineIntervalsApplied: number;
  finalRoomCount: number;
  finalInfrastructure: string;
  finalFlagshipCompleted: string;
  finalIncomePerSec: number;
}

type Strategy =
  | "standard"
  | "no_training"
  | "reasonable_training"
  | "model_first"
  | "server_first"
  | "income_first"
  | "automation"
  | "offline_mixed";

// ---------- 模拟单局 ----------
function simulateOne(strategy: Strategy): Milestones {
  const state = freshSaveData(0);
  state.lastTickAtMs = 0;
  acquireFirstModel(state, "codex");

  const milestones: Milestones = {
    firstOrderSec: -1,
    automationSec: -1,
    workshopLv6Sec: -1,
    revenue15kSec: -1,
    firstServerSec: -1,
    firstServerMoney: -1,
    modelLevelAtFirstServer: -1,
    threeServersSec: -1,
    server5Sec: -1,
    server8Sec: -1,
    computeCenterSec: -1,
    firstIterationSec: -1,
    secondRunRecoverySec: -1,
    secondRunFirstServerSec: -1,
    secondRunServer8Sec: -1,
    iterationReached: false,
    modelsAcquiredDuringStage2: 0,
    stage3Room2Sec: -1,
    stage3Room3Sec: -1,
    finalProjectSec: -1,
    modelsOwnedAtIteration: 0,
    trainingCountAtIteration: 0,
    orderCounts: {},
    modelFirstAcquiredSec: { codex: 0 },
    modelLevelsAtIteration: {},
    modelContributionAtIteration: {},
    offlineIntervalsApplied: 0,
    finalRoomCount: 0,
    finalInfrastructure: "0/0/0/0",
    finalFlagshipCompleted: "",
    finalIncomePerSec: 0,
  };
  let t = 0;
  let offlineScheduleIndex = 0;
  const offlineSchedule = [
    { atSec: 15 * 60, durationSec: 5 * 60 },
    { atSec: 45 * 60, durationSec: 15 * 60 },
  ];

  // 开局即启用租赁算力（接第一单自动激活，模拟与 Session 一致）
  state.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };

  // 第二轮恢复目标：首轮达到三台服务器时的收入/秒（集群收入恢复）
  const firstClusterIncome = { value: 0 };

  const orderDef = (id: string) => ORDERS.find((o) => o.id === id)!;

  while (t < 60 * 60 * 2) {
    if (strategy === "offline_mixed") {
      const interval = offlineSchedule[offlineScheduleIndex];
      if (interval && t >= interval.atSec) {
        applyMixedOfflineInterval(state, t, interval.durationSec);
        t += interval.durationSec;
        offlineScheduleIndex += 1;
        milestones.offlineIntervalsApplied += 1;
      }
    }

    // 策略：接单
    if (!state.automation) {
      let wantOrder = orderDef("o1");
      if (strategy === "income_first" && state.activeOrders.length < 4) {
        wantOrder = [...ORDERS].sort((a, b) => b.gross / b.durationSec - a.gross / a.durationSec)[0];
      } else if ((strategy === "model_first" || strategy === "standard") && state.modelProgress) {
        // 模型优先/标准：优先接能负担租赁成本的推荐订单
        wantOrder = orderDef("o1");
      }
      if (state.activeOrders.length < 4 && wantOrder) {
        acceptOrder(state, wantOrder.id, t * 1000);
      }
    }

    // 训练策略（自动经营开启前）
    if (!state.automation) {
      if (strategy === "no_training") {
        // 完全不训练
      } else if (strategy === "model_first" && canTrain(state)) {
        applyTrain(state);
      } else if (
        strategy === "server_first" &&
        canTrain(state) &&
        new Decimal(state.money).lt(nextServerCost(state) ?? 1e18)
      ) {
        applyTrain(state);
      } else if (strategy === "reasonable_training") {
        // 合理训练：首服前轻量训练 2 次（与标准一致），保持首服节奏且不成为陷阱
        if (canTrain(state) && state.modelProgress && state.modelProgress.trainingCount < 2) {
          applyTrain(state);
        }
      } else if (strategy === "standard" || strategy === "automation" || strategy === "offline_mixed") {
        // 标准策略：首服前轻量训练 2 次，保持成长感
        if (canTrain(state) && state.modelProgress && state.modelProgress.trainingCount < 2) {
          applyTrain(state);
        }
      }
    }

    // 自动经营开启后：按策略持续训练
    if (state.automation && canTrain(state)) {
      if (strategy === "model_first") {
        // 训练/模型优先：优先训练，但训练成本超过 5 秒收入时停手（保持可行性）
        const inc = incomePerSecond(state);
        if (inc.gt(0) && trainCost(state).lte(inc.mul(5))) applyTrain(state);
      } else if (["standard", "automation", "reasonable_training", "income_first", "offline_mixed"].includes(strategy)) {
        // 合理训练：首服后训练到 L6 上限，训练成本 < 5 秒收入（成长反馈但不过度加速）
        const inc = incomePerSecond(state);
        if (state.serverCount >= 1 && (state.modelProgress?.level ?? 1) < 6 && inc.gt(0) && trainCost(state).lte(inc.mul(5))) applyTrain(state);
      }
    }

    // 自动经营解锁
    if (automationUnlocked(state) && !state.automation) {
      enableAutomation(state);
      if (milestones.automationSec < 0) milestones.automationSec = t;
    }

    // 自动接单（自动经营）：按业务组合（多订单占比），不再只接 o1
    if (state.automation) {
      while (state.activeOrders.length < 4) {
        const wantId = pickAutoOrderId(state);
        acceptOrder(state, wantId, t * 1000);
      }
    }
    // 模型研发：进度满 100 立即研发（不耗资金）
    if (state.automation && canResearchModel(state)) {
      const research = researchModel(state);
      if (research.ok && research.isNew && milestones.modelFirstAcquiredSec[research.modelId] == null) {
        milestones.modelFirstAcquiredSec[research.modelId] = t;
      }
    }

    // 推进 1 秒（engine.tick 内部处理收入、lifetimeIncome、completedOrders）
    const tickResult = tickOrder(state, t, 1);
    for (const orderId of tickResult.completedOrderIds) {
      milestones.orderCounts[orderId] = (milestones.orderCounts[orderId] ?? 0) + 1;
    }
    if (milestones.firstOrderSec < 0 && state.completedOrders >= 1) {
      milestones.firstOrderSec = t;
    }
    // 领取已完成订单（所有策略都领取，释放槽位）
    for (let i = state.activeOrders.length - 1; i >= 0; i--) {
      if (state.activeOrders[i].status === 1) claimOrder(state, i);
    }

    // 首服里程碑：等级 + 累计收入达标即授予（不扣资金，只一次）
    if (state.serverCount === 0 && firstServerMilestoneMet(state) && !state.workshop.firstServerAwarded) {
      awardFirstServer(state);
      if (milestones.firstServerSec < 0) {
        milestones.firstServerSec = t;
        milestones.firstServerMoney = Number(state.money);
        milestones.modelLevelAtFirstServer = state.modelProgress?.level ?? 1;
      }
    }
    if (milestones.workshopLv6Sec < 0 && state.workshop.level >= 6) milestones.workshopLv6Sec = t;
    if (milestones.revenue15kSec < 0 && new Decimal(state.workshop.lifetimeRevenue).gte(15000)) milestones.revenue15kSec = t;

    // 购买服务器（第二台起资金购买，直到 8 台）
    if (state.serverCount >= 1 && state.serverCount < 8) {
      const cost = nextServerCost(state);
      if (cost && new Decimal(state.money).gte(cost)) {
        buyServer(state);
        if (state.serverCount === 3 && milestones.threeServersSec < 0) {
          milestones.threeServersSec = t;
          firstClusterIncome.value = incomePerSecond(state).toNumber();
        }
        if (state.serverCount === 5 && milestones.server5Sec < 0) milestones.server5Sec = t;
        if (state.serverCount === 8 && milestones.server8Sec < 0) milestones.server8Sec = t;
        const choice = blueprintChoiceAvailable(state);
        if (choice === "server3" || choice === "server8") {
          chooseBlueprint(state, blueprintFor(strategy, choice));
        }
      }
    }

    // Stage 3：8 台 + Stage2 结算 → 进入算力中心
    if (state.serverCount >= 8 && !state.stage3?.entered) {
      completeStage2Settlement(state, simulatedNowMs(t));
      enterStage3(state, simulatedNowMs(t));
      if (milestones.computeCenterSec < 0) milestones.computeCenterSec = t;
    }

    // Stage 3：升级基础设施（瓶颈优先 + 机房门槛导向）
    if (state.stage3?.entered) {
      const inf = state.stage3.infrastructure;
      // 目标等级：机房2 → 机房3 → 最终工程存储门槛；不为无关等级额外囤积。
      const rooms = roomCount(state);
      const targets = rooms >= 3
        ? { power: 6, computeCards: 7, optical: 5, storage: 8 }
        : rooms >= 2
          ? { power: 6, computeCards: 7, optical: 5, storage: 5 }
          : { power: 3, computeCards: 3, optical: 2, storage: 2 };
      const order: Array<{ id: string; need: number }> = [
        { id: "power", need: targets.power },
        { id: "computeCards", need: targets.computeCards },
        { id: "optical", need: targets.optical },
        { id: "storage", need: targets.storage },
      ];
      // 优先当前瓶颈
      const bp = bottleneckId(state);
      order.sort((a, b) => (a.id === bp ? -1 : b.id === bp ? 1 : 0));
      for (const o of order) {
        if (infraLevel(state, o.id) < o.need) {
          const cost = infraUpgradeCost(o.id, infraLevel(state, o.id));
          if (new Decimal(state.money).gte(cost)) {
            upgradeInfrastructure(state, o.id);
          }
        }
      }

      // 旗舰工程：可启动就启动；有完成待领取就领取
      if (hasPendingFlagshipReward(state)) {
        claimFlagshipReward(state);
        if (milestones.finalProjectSec < 0 && (state.stage3?.flagship?.completedIds ?? []).includes("project_3")) {
          milestones.finalProjectSec = t;
        }
      } else if (state.stage3.flagship.activeId) {
        // 旗舰工程由 tick 统一推进（此处不重复推进，避免双倍速度）
      } else {
        for (const p of ["project_1", "project_2", "project_3"]) {
          if (canStartFlagship(state, p)) {
            startFlagship(state, p, simulatedNowMs(t));
            break;
          }
        }
      }

      // 机房投产
      if (canCommissionRoom(state, 2)) {
        commissionRoom(state, 2, simulatedNowMs(t));
        if (milestones.stage3Room2Sec < 0) milestones.stage3Room2Sec = t;
      }
      if (canCommissionRoom(state, 3)) {
        commissionRoom(state, 3, simulatedNowMs(t));
        if (milestones.stage3Room3Sec < 0) milestones.stage3Room3Sec = t;
      }
    }

    // 技术迭代
    if (canPrestige(state)) {
      milestones.modelsAcquiredDuringStage2 = state.modelResearch?.stage2Draws ?? 0;
      milestones.modelsOwnedAtIteration = state.ownedModelIds.length;
      milestones.trainingCountAtIteration = Object.values(state.modelArchive ?? {})
        .reduce((sum, entry) => sum + entry.lifetimeTrainingCount, 0);
      for (const model of MODELS) {
        const archive = state.modelArchive[model.id];
        if (!archive) continue;
        milestones.modelLevelsAtIteration[model.id] = archive.level;
        milestones.modelContributionAtIteration[model.id] = Number(archive.lifetimeContribution);
      }
      snapshotFinalState(state, milestones, t);
      applyPrestige(state);
      milestones.firstIterationSec = t;
      milestones.iterationReached = true;
      break;
    }

    t += 1;
  }

  if (Object.keys(milestones.modelLevelsAtIteration).length === 0) {
    snapshotFinalState(state, milestones, t);
  }

  // 第二轮模拟：恢复定义 = 收入/秒 ≥ 首轮三台服务器时的收入/秒
  if (milestones.iterationReached) {
    const secondState = state;
    let t2 = 0;
    acquireFirstModel(secondState, "codex");
    while (t2 < 30 * 60) {
      // 手动接单直到自动经营解锁
      if (!secondState.automation) {
        if (secondState.activeOrders.length < 4) {
          acceptOrder(secondState, pickAutoOrderId(secondState), t2 * 1000);
        }
        // 第二轮也训练模型（模型优先），永久倍率 ×2 下更快达到峰值
        if (canTrain(secondState)) applyTrain(secondState);
        if (automationUnlocked(secondState)) {
          enableAutomation(secondState);
        }
      } else {
        if (secondState.activeOrders.length < 4) {
          acceptOrder(secondState, pickAutoOrderId(secondState), t2 * 1000);
        }
        if (canTrain(secondState) && new Decimal(secondState.money).gt(200)) applyTrain(secondState);
        if (canResearchModel(secondState)) researchModel(secondState);
      }
      tickOrder(secondState, milestones.firstIterationSec + t2, 1);
      for (let i = secondState.activeOrders.length - 1; i >= 0; i--) {
        if (secondState.activeOrders[i].status === 1) claimOrder(secondState, i);
      }
      // 二轮首服：重新走里程碑（等级+历史累计收入，因 applyPrestige 已重置 firstServerAwarded）
      if (secondState.serverCount === 0 && firstServerMilestoneMet(secondState) && !secondState.workshop.firstServerAwarded) {
        awardFirstServer(secondState);
        if (milestones.secondRunFirstServerSec < 0) milestones.secondRunFirstServerSec = t2;
      }
      if (secondState.serverCount >= 1 && secondState.serverCount < 8) {
        const cost2 = nextServerCost(secondState);
        if (cost2 && new Decimal(secondState.money).gte(cost2)) {
          buyServer(secondState);
          const secondChoice = blueprintChoiceAvailable(secondState);
          if (secondChoice === "server3" || secondChoice === "server8") {
            chooseBlueprint(secondState, blueprintFor(strategy, secondChoice));
          }
          if (secondState.serverCount === 8 && milestones.secondRunServer8Sec < 0) milestones.secondRunServer8Sec = t2;
        }
      }
      if (milestones.secondRunRecoverySec < 0 && incomePerSecond(secondState).gte(firstClusterIncome.value)) {
        milestones.secondRunRecoverySec = t2;
      }
      if (milestones.secondRunServer8Sec >= 0) break;
      t2 += 1;
    }
    if (milestones.secondRunRecoverySec < 0) milestones.secondRunRecoverySec = t2;
  }

  return milestones;
}

function blueprintFor(strategy: Strategy, milestone: "server3" | "server8"): string {
  if (strategy === "model_first") return "bp_gpu";
  if (strategy === "server_first") return "bp_interconnect";
  if (strategy === "standard" && milestone === "server8") return "bp_gpu";
  return "bp_general";
}

// ---------- 引擎推进（本地复刻，避免依赖 session 时钟） ----------
import { tick as engineTick } from "../src/economy/engine";
import type { TickResult } from "../src/economy/engine";

function simulatedNowMs(elapsedSec: number): number {
  return SIM_EPOCH_MS + elapsedSec * 1000;
}

function snapshotFinalState(state: SaveData, milestones: Milestones, elapsedSec: number): void {
  for (const model of MODELS) {
    const archive = state.modelArchive[model.id];
    if (!archive) continue;
    milestones.modelLevelsAtIteration[model.id] = archive.level;
    milestones.modelContributionAtIteration[model.id] = Number(archive.lifetimeContribution);
  }
  milestones.finalRoomCount = roomCount(state);
  const infra = state.stage3?.infrastructure;
  milestones.finalInfrastructure = infra
    ? `${infra.power}/${infra.computeCards}/${infra.optical}/${infra.storage}`
    : "0/0/0/0";
  milestones.finalFlagshipCompleted = (state.stage3?.flagship?.completedIds ?? []).join(",") || "none";
  milestones.finalIncomePerSec = incomePerSecond(state, simulatedNowMs(elapsedSec)).toNumber();
}

function tickOrder(state: SaveData, elapsedSecFromStart: number, elapsedSec: number): TickResult {
  return engineTick(state, simulatedNowMs(elapsedSecFromStart), elapsedSec);
}

/** 混合离线策略使用与正式 Session 相同的收益、研发、旗舰与同一存储上限。 */
function applyMixedOfflineInterval(state: SaveData, startSec: number, elapsedSec: number): void {
  const startMs = simulatedNowMs(startSec);
  const endMs = simulatedNowMs(startSec + elapsedSec);
  state.lastTickAtMs = startMs;
  const cappedSec = Math.min(elapsedSec, offlineCapSeconds(state));
  settleOfflineReward(state, endMs, {
    incomePerSecond: (candidate) => incomePerSecond(candidate, endMs),
  });
  if (cappedSec >= 5) {
    applyOfflineResearchProgress(state, cappedSec);
    advanceFlagship(state, cappedSec);
  }
  const claimed = claimOfflineReward(state, endMs, {
    incomePerSecond: (candidate) => incomePerSecond(candidate, endMs),
  });
  if (claimed.claimed) creditModelContribution(state, claimed.money);
}

function bottleneckId(state: SaveData): string {
  const levels = state.stage3?.infrastructure ?? { power: 0, computeCards: 0, optical: 0, storage: 0 };
  const candidates = [
    { id: "power", impact: Math.max(0, 1 - levels.power / 8) },
    { id: "computeCards", impact: 0.35 * (1 - levels.computeCards / 10) },
    { id: "optical", impact: 0.3 * (1 - levels.optical / 8) },
    { id: "storage", impact: 0.15 * (1 - levels.storage / 8) },
  ];
  candidates.sort((a, b) => b.impact - a.impact);
  return candidates[0].id;
}

// ---------- 统计 ----------
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return -1;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function median(sorted: number[]): number {
  return percentile(sorted, 0.5);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarize(name: string, results: Milestones[]): void {
  const completed = results.filter((r) => r.iterationReached);
  console.log(`  失败率: ${(((results.length - completed.length) / results.length) * 100).toFixed(1)}%`);
  const fields: Array<[string, (m: Milestones) => number]> = [
    ["二轮首服", (m) => m.secondRunFirstServerSec],
    ["二轮八服", (m) => m.secondRunServer8Sec],
    ["第一订单", (m) => m.firstOrderSec],
    ["自动经营", (m) => m.automationSec],
    ["工作室Lv6", (m) => m.workshopLv6Sec],
    ["累计收入15k", (m) => m.revenue15kSec],
    ["第一服务器", (m) => m.firstServerSec],
    ["三服务器", (m) => m.threeServersSec],
    ["五服务器", (m) => m.server5Sec],
    ["八服务器", (m) => m.server8Sec],
    ["算力中心", (m) => m.computeCenterSec],
    ["第一次迭代", (m) => m.firstIterationSec],
    ["Stage3机房2", (m) => m.stage3Room2Sec],
    ["Stage3机房3", (m) => m.stage3Room3Sec],
    ["最终旗舰工程", (m) => m.finalProjectSec],
    ["第二轮恢复", (m) => m.secondRunRecoverySec],
  ];
  console.log(`\n== ${name}（${results.length} 局，${completed.length} 局完成迭代）==`);
  for (const [label, getter] of fields) {
    const vals = results.map(getter).filter((v) => v >= 0).sort((a, b) => a - b);
    if (vals.length === 0) {
      console.log(`  ${label}: 未达成`);
      continue;
    }
    const p10 = percentile(vals, 0.1);
    const p50 = median(vals);
    const p90 = percentile(vals, 0.9);
    console.log(
      `  ${label}: 中位 ${formatTime(p50)} | 10% ${formatTime(p10)} | 90% ${formatTime(p90)}`
    );
  }
  const fsMoney = results.map((m) => m.firstServerMoney).filter((v) => v >= 0).sort((a, b) => a - b);
  const fsLevel = results.map((m) => m.modelLevelAtFirstServer).filter((v) => v >= 0).sort((a, b) => a - b);
  if (fsMoney.length > 0) {
    console.log(`  首服时资金: 中位 ¥${fsMoney[Math.floor(fsMoney.length / 2)].toFixed(0)}`);
    console.log(`  首服时模型等级: 中位 Lv.${fsLevel[Math.floor(fsLevel.length / 2)]}`);
  }
  const draws = results.map((m) => m.modelsAcquiredDuringStage2).filter((v) => v >= 0).sort((a, b) => a - b);
  if (draws.length > 0) {
    console.log(`  Stage2 模型研发次数: 中位 ${draws[Math.floor(draws.length / 2)]}`);
  }
  const modelCounts = results.map((m) => m.modelsOwnedAtIteration).sort((a, b) => a - b);
  const trainingCounts = results.map((m) => m.trainingCountAtIteration).sort((a, b) => a - b);
  console.log(`  迭代时模型数量: 中位 ${median(modelCounts)}`);
  console.log(`  迭代时训练次数: 中位 ${median(trainingCounts)}`);
  const aggregateOrders: Record<string, number> = {};
  for (const result of results) {
    for (const [id, count] of Object.entries(result.orderCounts)) {
      aggregateOrders[id] = (aggregateOrders[id] ?? 0) + count;
    }
  }
  const totalOrders = Object.values(aggregateOrders).reduce((sum, count) => sum + count, 0);
  const shares = Object.fromEntries(Object.entries(aggregateOrders).map(([id, count]) => [
    id,
    totalOrders > 0 ? Number(((count / totalOrders) * 100).toFixed(2)) : 0,
  ]));
  console.log(`  长期订单占比: ${JSON.stringify(shares)}`);

  const totalContribution = results.reduce((grandTotal, result) => (
    grandTotal + Object.values(result.modelContributionAtIteration).reduce((sum, value) => sum + value, 0)
  ), 0);
  console.log("  模型价值:");
  for (const model of MODELS) {
    const acquired = results.filter((result) => result.modelFirstAcquiredSec[model.id] != null);
    const firstTimes = acquired
      .map((result) => result.modelFirstAcquiredSec[model.id])
      .sort((a, b) => a - b);
    const levels = acquired.map((result) => result.modelLevelsAtIteration[model.id] ?? 0);
    const contributions = acquired.map((result) => result.modelContributionAtIteration[model.id] ?? 0);
    const contributionTotal = contributions.reduce((sum, value) => sum + value, 0);
    const contributionShare = totalContribution > 0 ? contributionTotal / totalContribution : 0;
    const valueStatus = acquired.length > 0 && contributionTotal > 0 ? "有效" : "需复核";
    console.log(
      `    ${model.id}/${model.role}: 获取率 ${((acquired.length / results.length) * 100).toFixed(1)}%`
      + ` | 首获中位 ${firstTimes.length > 0 ? formatTime(median(firstTimes)) : "未获得"}`
      + ` | 平均图鉴等级 ${average(levels).toFixed(2)}`
      + ` | 平均经营贡献 ¥${new Decimal(average(contributions)).toSignificantDigits(6).toString()}`
      + ` | 贡献占比 ${(contributionShare * 100).toFixed(2)}% | ${valueStatus}`
    );
  }
  const offlineIntervals = results.map((result) => result.offlineIntervalsApplied);
  if (offlineIntervals.some((count) => count > 0)) {
    console.log(`  混合离线区间: 平均 ${average(offlineIntervals).toFixed(1)} 次（正式收益/研发/旗舰共享存储上限）`);
  }
  const representative = results[0];
  console.log(
    `  轨迹终态: 机房${representative.finalRoomCount}`
    + ` | 基础设施 ${representative.finalInfrastructure}`
    + ` | 已完成旗舰 ${representative.finalFlagshipCompleted}`
    + ` | 收入/秒 ¥${new Decimal(representative.finalIncomePerSec).toSignificantDigits(6).toString()}`
  );
}

// ---------- 主流程 ----------
const ALL_STRATEGIES: Strategy[] = [
  "standard",
  "no_training",
  "reasonable_training",
  "model_first",
  "server_first",
  "income_first",
  "automation",
  "offline_mixed",
];
const requestedStrategies = (process.env.STRATEGY_FILTER ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value): value is Strategy => ALL_STRATEGIES.includes(value as Strategy));
const STRATEGIES: Strategy[] = requestedStrategies.length > 0 ? requestedStrategies : ALL_STRATEGIES;
const RUNS = Number(process.env.RUNS ?? "1000");

for (const strategy of STRATEGIES) {
  const results: Milestones[] = [];
  for (let i = 0; i < RUNS; i++) {
    results.push(simulateOne(strategy));
  }
  summarize(strategy, results);
}
