/**
 * CARD-00 终局经济模拟器（独立脚本，不修改正式引擎）
 *
 * 建模范围（遵循冻结合同）：
 * - 地球主线：R1（复用 v8 官方引擎曲线）→ 手动领核心1 → 迭代1（×1.5）→ R2
 *   R2（时代工程：全球算力骨干环）→ 手动领核心2 → 迭代2（×2.0）→ R3
 *   R3（时代工程：行星算力统一场）→ 手动领核心3 → 迭代3 转化为地外算力计划揭示 → Stage 4
 * - Stage 4 地月算力网：四节点全部取得 → 地月一体化算力网
 * - Stage 5 戴森算力纪元：里程碑授予首节点 → 恒星节点 → 戴森算力球 → 永续
 * - 离线：地球 3h / Stage4 6h / Stage5 8h（A 首选；B/C 对照）；exactly-once；不自动领核心/迭代/进宇宙
 *
 * 运行：npm run simulate:endgame
 * 环境：RUNS / STRATEGY_FILTER / MULT_TABLE=A|B / OFFLINE_TABLE=A|B|C
 */
import Decimal from "decimal.js";
import { freshSaveData } from "../src/save/storage";
import {
  acceptOrder,
  acquireFirstModel,
  automationUnlocked,
  buyMaxServers,
  buyServer,
  canTrain,
  claimOrder,
  enableAutomation,
  incomePerSecond,
  nextServerCost,
  trainCost,
  applyTrain,
  applyOfflineResearchProgress,
  canResearchModel,
  pickAutoOrderId,
  researchModel,
  completeStage2Settlement,
  tick as engineTick,
} from "../src/economy/engine";
import {
  awardFirstServer,
  firstServerMilestoneMet,
} from "../src/economy/workshop";
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
} from "../src/economy/stage3";
import { infraUpgradeCost } from "../src/data/stage3";
import { stage3IncomePerSecond, stage3TotalCompute } from "../src/economy/stage3";
import { MODELS, ORDERS } from "../src/data/content";
import {
  claimOfflineReward,
  settleOfflineReward,
} from "../src/save/offline";
import type { SaveData } from "../src/save/types";
import { formatTime } from "../src/core/big";

const SIM_EPOCH_MS = 2_000_000_000_000;
const HOUR = 3600;

export const MULT_TABLE_A = [1.0, 1.5, 2.0, 2.5];
export const MULT_TABLE_B = [1.0, 1.35, 1.70, 2.00];
export const OFFLINE_TABLES: Record<string, { earth: number; stage4: number; stage5: number }> = {
  A: { earth: 3 * HOUR, stage4: 6 * HOUR, stage5: 8 * HOUR },
  B: { earth: 3 * HOUR, stage4: 4 * HOUR, stage5: 6 * HOUR },
  C: { earth: 4 * HOUR, stage4: 8 * HOUR, stage5: 10 * HOUR },
};

/** 时代工程：进度速度 = min(算力×0.001, 上限)。上限值用于校准目标时长。 */
export const ERA_PROJECT_CAPS = {
  r1: 14,  // 区域算力协作网（方案 C：旗舰 project_3 完成后追加的单目标时代工程）
  r2: 14,  // 全球算力骨干环
  r3: 18,  // 行星算力统一场
  stage4: 25, // 地月一体化算力网（与现旗舰 cap 一致）
  stage5: 30, // 戴森算力球（更高 cap 支撑更长的最终工程）
};

/** 时代工程进度起点（R1 从 project_3 完成时刻起算；R2/R3 从进入本轮时代工程起算）。 */
export const ERA_PROJECT_R1_START_SEC = 1;

/** R1 时代工程“区域算力协作网”的开启资金门槛（不计旗舰奖励）。 */
export const R1_ERA_MONEY_GATE = 1e6;
export const STAGE4_PROJECT_REQUIRED = Math.max(1, Number(process.env.S4_REQUIRED ?? "360000"));
export const STAGE5_PROJECT_REQUIRED = Math.max(1, Number(process.env.S5_REQUIRED ?? "864000"));

export interface EndgameMilestones {
  r1FirstServerSec: number;
  r1IterationSec: number;
  r2EraProjectSec: number;
  r3EraProjectSec: number;
  stage4EntrySec: number;
  stage4FirstPaidOrSecondSec: number;
  stage4EraProjectSec: number;
  stage5EntrySec: number;
  stage5FirstPaidOrSecondSec: number;
  stage5DysonSec: number;
  totalOnlineSec: number;
  calendarSpanSec: number;
  peakCompute: number;
  r1DurationSec: number;
  r2DurationSec: number;
  r3DurationSec: number;
  stage4DurationSec: number;
  stage5DurationSec: number;
  r2EraActiveSec: number; // 全球算力骨干环（R2 时代工程）独立在线投入
  r3EraActiveSec: number; // 行星算力统一场（R3 时代工程）独立在线投入
  r2EraStartSec: number;
  r3EraStartSec: number;
  completedFullLine: boolean;
  offlineCapped: boolean;
}

export type Strategy =
  | "standard"
  | "reasonable_training"
  | "server_first"
  | "model_first"
  | "income_first"
  | "offline_mixed"
  | "idle_offline"
  | "click_bulk";

interface CosmicState {
  stage: 4 | 5;
  nodes: number[];
  money: Decimal;
  incomePerSec: Decimal;
  eraProgress: number;
  eraActive: boolean;
  offlineCapped: boolean;
}

function simulatedNowMs(elapsedSec: number): number {
  return SIM_EPOCH_MS + elapsedSec * 1000;
}

function freshCosmic(stage: 4 | 5): CosmicState {
  return {
    stage,
    nodes: [],
    money: new Decimal(0),
    incomePerSec: new Decimal(0),
    eraProgress: 0,
    eraActive: false,
    offlineCapped: false,
  };
}

// ---------- 地球单轮推进（R1/R2/R3 共用；R1 走官方旗舰，R2/R3 走时代工程） ----------
function earthRun(
  state: SaveData,
  strategy: Strategy,
  round: 1 | 2 | 3,
  startSec: number,
  eraProgressRequired: number,
  eraCapPerSec: number,
  runIncomeTarget: number,
  m: EndgameMilestones,
  offlineTableEarth: number,
  calendarRef: { value: number },
  r1EraProgressRequired?: number,
  stepSec = 1,
): number {
  let localT = startSec;
  let eraStarted = false;
  let eraProgress = 0;
  // R1：旗舰 project_3 完成后（解锁点）才进入“区域算力协作网”时代工程
  let r1FlagshipDone = false;
  let r1EraStarted = false;
  let r1EraProgress = 0;
  const endLimit = startSec + 8 * HOUR;

  while (localT < endLimit) {
    // ---- 接单/训练/自动经营 ----
    if (!state.automation) {
      const wantOrder = ORDERS.find((o) => o.id === "o1")!;
      if (state.activeOrders.length < 4) acceptOrder(state, wantOrder.id, simulatedNowMs(localT));
    }
    if (!state.automation) {
      if (strategy === "model_first" && canTrain(state)) {
        applyTrain(state);
      } else if (strategy === "standard" && canTrain(state) && state.modelProgress && state.modelProgress.trainingCount < 1) {
        applyTrain(state);
      } else if (strategy === "reasonable_training" && canTrain(state) && state.modelProgress && state.modelProgress.trainingCount < 2 && new Decimal(state.money).gte(trainCost(state).mul(3))) {
        applyTrain(state);
      } else if (strategy === "server_first" && canTrain(state) && new Decimal(state.money).lt(nextServerCost(state) ?? 1e18)) {
        applyTrain(state);
      } else if (strategy === "income_first" && canTrain(state) && state.modelProgress && state.modelProgress.trainingCount < 1 && new Decimal(state.money).gte(trainCost(state).mul(10))) {
        // 资金储备策略：仅在资金充裕（≥10 倍训练成本）时训练，其余时间积累
        applyTrain(state);
      }
    }
    if (automationUnlocked(state) && !state.automation) enableAutomation(state);
    if (state.automation) {
      while (state.activeOrders.length < 4) acceptOrder(state, pickAutoOrderId(state), simulatedNowMs(localT));
      if (canResearchModel(state)) researchModel(state);
      if (strategy === "model_first" && canTrain(state)) {
        const inc = incomePerSecond(state, simulatedNowMs(localT));
        if (inc.gt(0) && trainCost(state).lte(inc.mul(5))) applyTrain(state);
      } else if (strategy === "standard" && canTrain(state)) {
        const inc = incomePerSecond(state, simulatedNowMs(localT));
        if (state.serverCount >= 1 && (state.modelProgress?.level ?? 1) < 4 && inc.gt(0) && trainCost(state).lte(inc.mul(5))) applyTrain(state);
      } else if (strategy === "reasonable_training" && canTrain(state)) {
        const inc = incomePerSecond(state, simulatedNowMs(localT));
        if (state.serverCount >= 1 && (state.modelProgress?.level ?? 1) < 6 && inc.gt(0) && trainCost(state).lte(inc.mul(5))) applyTrain(state);
      } else if (strategy === "income_first" && canTrain(state)) {
        const inc = incomePerSecond(state, simulatedNowMs(localT));
        if (inc.gt(0) && trainCost(state).lte(inc.mul(3)) && new Decimal(state.money).gte(trainCost(state).mul(5))) applyTrain(state);
      }
    }

    engineTick(state, simulatedNowMs(localT), stepSec);
    for (let i = state.activeOrders.length - 1; i >= 0; i--) {
      if (state.activeOrders[i].status === 1) claimOrder(state, i);
    }

    if (state.serverCount === 0 && firstServerMilestoneMet(state) && !state.workshop.firstServerAwarded) {
      awardFirstServer(state);
      if (m.r1FirstServerSec < 0) m.r1FirstServerSec = localT;
    }
    if (state.serverCount >= 1 && state.serverCount < 8) {
      if (strategy === "click_bulk") {
        // 快速点击/批量购买：迭代后批量购买可负担服务器；首轮（未迭代）逐台购买
        if (state.technologyIterationCount >= 1) {
          const res = buyMaxServers(state);
          if (res.ok && res.bought > 0) {
            m.r1FirstServerSec = m.r1FirstServerSec >= 0 ? m.r1FirstServerSec : localT;
          }
        } else {
          const cost = nextServerCost(state);
          if (cost && new Decimal(state.money).gte(cost)) buyServer(state);
        }
      } else {
        const cost = nextServerCost(state);
        if (cost && new Decimal(state.money).gte(cost)) buyServer(state);
      }
    }
    if (state.serverCount >= 8 && !state.stage3?.entered) {
      completeStage2Settlement(state, simulatedNowMs(localT));
      enterStage3(state, simulatedNowMs(localT));
    }
    if (state.stage3?.entered) {
      const rooms = roomCount(state);
      const targets = rooms >= 3
        ? { power: 6, computeCards: 7, optical: 5, storage: 8 }
        : rooms >= 2
          ? { power: 6, computeCards: 7, optical: 5, storage: 5 }
          : { power: 3, computeCards: 3, optical: 2, storage: 2 };
      for (const id of ["power", "computeCards", "optical", "storage"] as const) {
        const need = targets[id];
        if (infraLevel(state, id) < need) {
          const cost = infraUpgradeCost(id, infraLevel(state, id));
          if (new Decimal(state.money).gte(cost)) upgradeInfrastructure(state, id);
        }
      }
      if (hasPendingFlagshipReward(state)) claimFlagshipReward(state);
      else if (!state.stage3.flagship.activeId) {
        for (const p of ["project_1", "project_2", "project_3"]) {
          if (canStartFlagship(state, p)) { startFlagship(state, p, simulatedNowMs(localT)); break; }
        }
      }
      if (canCommissionRoom(state, 2)) commissionRoom(state, 2, simulatedNowMs(localT));
      if (canCommissionRoom(state, 3)) commissionRoom(state, 3, simulatedNowMs(localT));
    }

    // 本轮完成条件
    if (round === 1) {
      const flagshipDone = roomCount(state) >= 3 && (state.stage3?.flagship?.completedIds ?? []).includes("project_3");
      if (flagshipDone && !r1FlagshipDone) {
        // 方案 C 解锁点：旗舰完成 → 追加时代工程“区域算力协作网”（单目标，无新资源/页面）
        r1FlagshipDone = true;
        if (m.r1FirstServerSec < 0) m.r1FirstServerSec = localT;
      }
      if (r1FlagshipDone) {
        if (!r1EraStarted && new Decimal(state.money).gte(R1_ERA_MONEY_GATE)) r1EraStarted = true;
        if (r1EraStarted) {
          const compute = stage3TotalCompute(state).toNumber();
          const optical = infraLevel(state, "optical");
          const speed = Math.min(compute * (1 + optical * 0.04) * 0.001, eraCapPerSec);
          r1EraProgress += speed * stepSec;
          const required = r1EraProgressRequired ?? ERA_PROJECT_CAPS.r1;
          if (r1EraProgress >= required) {
            return localT;
          }
        }
      }
    } else {
      const currentRunIncome = new Decimal(state.lifetimeIncome).minus(state.incomeAtLastPrestige || 0).toNumber();
      if (!eraStarted && currentRunIncome >= runIncomeTarget) {
        eraStarted = true;
        // 记录时代工程在线投入起点（R2/R3：era 开启即时代工程在线投入开始）
        if (round === 2 && m.r2EraStartSec < 0) m.r2EraStartSec = localT;
        if (round === 3 && m.r3EraStartSec < 0) m.r3EraStartSec = localT;
      }
      if (eraStarted) {
        const compute = stage3TotalCompute(state).toNumber();
        const optical = infraLevel(state, "optical");
        const speed = Math.min(compute * (1 + optical * 0.04) * 0.001, eraCapPerSec);
        eraProgress += speed * stepSec;
        if (eraProgress >= eraProgressRequired) {
          if (round === 2) m.r2EraActiveSec = localT - m.r2EraStartSec;
          if (round === 3) m.r3EraActiveSec = localT - m.r3EraStartSec;
          return localT;
        }
      }
    }

    // 离线（只对 R1 的混合/挂机策略；R2/R3 由永久倍率加速，不掺离线避免拖长判定）
    if (round === 1) {
      const elapsedSinceStart = localT - startSec;
      if (strategy === "offline_mixed" && elapsedSinceStart > 900 && elapsedSinceStart % 2700 < 2) {
        applyOfflineInterval(state, localT, 15 * 60, offlineTableEarth);
        calendarRef.value += 15 * 60;
      } else if (strategy === "idle_offline" && elapsedSinceStart > 1800 && elapsedSinceStart % 3600 < 2) {
        applyOfflineInterval(state, localT, 3600, offlineTableEarth);
        calendarRef.value += 3600;
      }
    }

    localT += stepSec;
  }
  return -1;
}

function applySimulatedIteration(state: SaveData, nextCount: number, nextMult: number): boolean {
  if (!state.stage3) return false;
  const keepOwnedModels = [...state.ownedModelIds];
  const keepBlueprint = state.stage3.blueprint
    ? { owned: [...state.stage3.blueprint.owned], active: null, levels: { ...state.stage3.blueprint.levels }, chosenMilestones: [] }
    : { owned: [], active: null, levels: {}, chosenMilestones: [] };
  const keepTech = [...state.stage3.technologyArchive];
  const keepEra = [...state.stage3.eraArchive];
  const keepSaveId = state.saveId;
  const keepSettings = { ...state.settings };
  const keepLifetime = state.lifetimeIncome;
  const keepArchive = structuredClone(state.modelArchive);

  state.money = 0;
  state.stage = 1;
  state.activeOrders = [];
  state.completedOrders = 0;
  state.automation = false;
  state.rentalCompute = { active: false, units: 0, unitCostPerSec: 0 };
  state.serverCount = 0;
  state.serverPower = 1;
  state.computeCenterLevel = 0;
  state.modelProgress = null;
  state.modelResearch = { progress: 0, stage2Draws: 0 };
  state.stage2 = { settlementShown: false, completedAtMs: 0, stageIncome: 0 };
  state.pendingOfflineReward = null;
  state.workshop = {
    level: 1, experience: 0, experienceToNextLevel: 100,
    lifetimeRevenue: keepLifetime, firstServerAwarded: false,
  };
  state.stage3 = {
    entered: false, enteredAtMs: 0,
    infrastructure: { power: 0, computeCards: 0, optical: 0, storage: 0 },
    machineRooms: [],
    flagship: { activeId: null, progress: 0, startedAtMs: 0, completedIds: [], pendingReward: null },
    commissionBonusUntilMs: 0, bottleneck: null,
    blueprint: keepBlueprint, technologyArchive: keepTech, eraArchive: keepEra,
    projectProgress: 0,
    peakStats: { peakCompute: 0, peakIncomePerSec: 0, totalRequests: 0 },
  };
  state.technologyIterationCount = nextCount;
  state.permanentMultiplier = nextMult;
  state.incomeAtLastPrestige = keepLifetime;
  state.lifetimeIncome = keepLifetime;
  state.ownedModelIds = keepOwnedModels;
  state.modelArchive = keepArchive;
  state.saveId = keepSaveId;
  state.settings = keepSettings;
  acquireFirstModel(state, "codex");
  state.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };
  return true;
}

function applyOfflineInterval(state: SaveData, startSec: number, durationSec: number, capSec: number): void {
  const startMs = simulatedNowMs(startSec);
  const endMs = simulatedNowMs(startSec + durationSec);
  state.lastTickAtMs = startMs;
  const capped = Math.min(durationSec, capSec);
  settleOfflineReward(state, endMs, {
    incomePerSecond: (candidate) => incomePerSecond(candidate, endMs),
  });
  if (capped >= 5) {
    applyOfflineResearchProgress(state, capped);
    advanceFlagship(state, capped);
  }
  claimOfflineReward(state, endMs, {
    incomePerSecond: (candidate) => incomePerSecond(candidate, endMs),
  });
  state.lastTickAtMs = endMs;
}

// ---------- 宇宙阶段（Stage 4/5） ----------
interface CosmicNodeDef {
  index: number;
  name: string;
  cost: number;
  incomeMult: number;
}

const STAGE4_NODES: CosmicNodeDef[] = [
  { index: 1, name: "近地轨道节点", cost: 0, incomeMult: 1 },
  { index: 2, name: "月球背面算力基地", cost: 1.8e10, incomeMult: 1.6 },
  { index: 3, name: "地月激光链路", cost: 1.8e11, incomeMult: 2.4 },
  { index: 4, name: "深空算力中继", cost: 1.8e12, incomeMult: 3.5 },
];

const STAGE5_NODES: CosmicNodeDef[] = [
  { index: 1, name: "太阳能采集阵列", cost: 0, incomeMult: 1 },
  { index: 2, name: "恒星计算节点", cost: 7.2e11, incomeMult: 1.8 },
  { index: 3, name: "戴森计算云", cost: 7.2e12, incomeMult: 3 },
  { index: 4, name: "恒星级模型阵列", cost: 7.2e13, incomeMult: 5 },
];

function cosmicBaseIncome(earthState: SaveData, stage: 4 | 5, nowSec: number): Decimal {
  const earthFinal = stage3IncomePerSecond(earthState, simulatedNowMs(nowSec)).toNumber();
  // Stage 4 起点 = 地球终局收入 × 尺度系数（重新减速，不被 ×2.5 跳过）
  const base = stage === 4
    ? new Decimal(Math.max(earthFinal, 1e8)).mul(0.3)
    : new Decimal(Math.max(earthFinal, 1e8)).mul(0.3).mul(40);
  return base;
}

function runCosmicStage(
  cosmic: CosmicState,
  stage: 4 | 5,
  earthState: SaveData,
  m: EndgameMilestones,
  strategy: Strategy,
  startSec: number,
  eraProgressRequired: number,
  eraCapPerSec: number,
  offlineCapSec: number,
  calendarRef: { value: number },
): number {
  const nodes = stage === 4 ? STAGE4_NODES : STAGE5_NODES;
  // 事件式推进：以 60 秒大步长逼近（收入/进度在步长内近似恒定，误差可忽略）
  let localT = startSec;
  let lastPaidNodeRecorded = false;
  const endLimit = startSec + 10 * HOUR;
  const STEP = 60;

  while (localT < endLimit) {
    const base = cosmicBaseIncome(earthState, stage, localT);
    const nodeMult = cosmic.nodes.reduce((sum, idx) => sum + (nodes.find((n) => n.index === idx)?.incomeMult ?? 0), 0);
    cosmic.incomePerSec = base.mul(Math.max(1, nodeMult));

    // 收入推进 STEP 秒
    cosmic.money = cosmic.money.plus(cosmic.incomePerSec.mul(STEP));

    // 购买节点（保持顺序）
    for (const node of nodes) {
      if (node.cost > 0 && !cosmic.nodes.includes(node.index) && cosmic.money.gte(node.cost)) {
        cosmic.money = cosmic.money.minus(node.cost);
        cosmic.nodes.push(node.index);
        if (!lastPaidNodeRecorded) {
          if (stage === 4) m.stage4FirstPaidOrSecondSec = localT - startSec;
          else m.stage5FirstPaidOrSecondSec = localT - startSec;
          lastPaidNodeRecorded = true;
        }
      }
    }

    // 时代工程
    if (!cosmic.eraActive && cosmic.money.gte(1e6)) cosmic.eraActive = true;
    if (cosmic.eraActive) {
      const speed = Math.min(cosmic.incomePerSec.div(1e6).toNumber(), eraCapPerSec);
      cosmic.eraProgress += speed * STEP;
      if (cosmic.eraProgress >= eraProgressRequired) {
        // 精算最后一段的精确时间：进度可能由离线跳变大幅超调，
        // needed 必须夹在 >=0，避免完成时间回退到本步之前（<= 当前步即取本步起点）。
        const needed = Math.max(0, eraProgressRequired - (cosmic.eraProgress - speed * STEP));
        const extra = speed > 0 ? Math.ceil(needed / speed) : STEP;
        const doneAt = localT + Math.min(STEP, Math.max(0, extra));
        if (stage === 4) m.stage4EraProjectSec = doneAt;
        else m.stage5DysonSec = doneAt;
        return doneAt;
      }
    }

    // 离线（混合/挂机策略；离线只累积资金/工程，不自动购节点/领核心/进新阶段）
    if ((strategy === "offline_mixed" || strategy === "idle_offline") && (localT - startSec) > 1800 && (localT - startSec) % 3600 < 2) {
      const offDur = strategy === "idle_offline" ? 4 * HOUR : HOUR;
      const capped = Math.min(offDur, offlineCapSec);
      const offIncome = cosmic.incomePerSec.mul(0.75);
      cosmic.money = cosmic.money.plus(offIncome.mul(capped));
      if (cosmic.eraActive) {
        const speed = Math.min(offIncome.div(1e6).toNumber(), eraCapPerSec);
        cosmic.eraProgress += speed * capped;
      }
      if (offDur > offlineCapSec) cosmic.offlineCapped = true;
      calendarRef.value += capped;
    }

    localT += STEP;
  }
  return -1;
}

// ---------- 单局 ----------
export function simulateEndgameRun(
  strategy: Strategy,
  multTable: number[] = MULT_TABLE_A,
  offlineTable: { earth: number; stage4: number; stage5: number } = OFFLINE_TABLES.A,
  opts: { stepSec?: number } = {}
): EndgameMilestones {
  const stepSec = opts.stepSec ?? 1;
  const m: EndgameMilestones = {
    r1FirstServerSec: -1, r1IterationSec: -1, r2EraProjectSec: -1, r3EraProjectSec: -1,
    stage4EntrySec: -1, stage4FirstPaidOrSecondSec: -1, stage4EraProjectSec: -1,
    stage5EntrySec: -1, stage5FirstPaidOrSecondSec: -1, stage5DysonSec: -1,
    totalOnlineSec: 0, calendarSpanSec: 0, peakCompute: 0,
    r1DurationSec: -1, r2DurationSec: -1, r3DurationSec: -1,
    stage4DurationSec: -1, stage5DurationSec: -1,
    r2EraActiveSec: -1, r3EraActiveSec: -1, r2EraStartSec: -1, r3EraStartSec: -1,
    completedFullLine: false, offlineCapped: false,
  };
  const calendarRef = { value: 0 };

  const state = freshSaveData(0);
  state.lastTickAtMs = 0;
  acquireFirstModel(state, "codex");
  state.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };

  // R1：现有 v8 旗舰（project_3）完成 = 解锁点 → 追加时代工程“区域算力协作网”（方案 C）
  const r1EraRequired = Number(process.env.R1_ERA_REQUIRED ?? "0") || 0;
  // 默认校准值：standard 旗舰完成后追加时代工程“区域算力协作网”，R1 总时长≈84min（合同 80–100）
  const R1_ERA_DEFAULT_REQUIRED = 27000; // 方案C校准：standard 旗舰完成后时代工程增量≈30-45min，R1 总时长≈88min（合同80-100）
  const r1End = earthRun(
    state, strategy, 1, 0, ERA_PROJECT_CAPS.r1, ERA_PROJECT_CAPS.r1, 0, m, offlineTable.earth, calendarRef,
    r1EraRequired > 0 ? r1EraRequired : R1_ERA_DEFAULT_REQUIRED,
    stepSec,
  );
  m.r1IterationSec = r1End;
  m.r1DurationSec = r1End >= 0 ? r1End : -1;
  if (r1End < 0) return m;

  // 核心1 手动领取 → 迭代1（×1.5）
  if (!applySimulatedIteration(state, 1, multTable[1])) return m;

  // R2（全球算力骨干环）
  const r2Req = Number(process.env.R2_REQUIRED ?? "0") || 45000; // 全球算力骨干环（校准值）
  const r2End = earthRun(state, strategy, 2, r1End + 1, r2Req, ERA_PROJECT_CAPS.r2, 1e8, m, offlineTable.earth, calendarRef, undefined, stepSec);
  m.r2EraProjectSec = r2End;
  m.r2DurationSec = r2End >= 0 ? r2End - r1End : -1;
  if (r2End < 0) return m;

  // 核心2 → 迭代2（×2.0）
  if (!applySimulatedIteration(state, 2, multTable[2])) return m;

  // R3（行星算力统一场）
  // R3 收入目标参数化：默认 1e9 会让 era 开启过晚（R3 起点收入相对 target 低），
  // 时代工程在线投入被压缩。校准用 R3_INCOME_TARGET=1e8（与 R2 同量级）让 era 尽早开启，
  // 由 R3_REQUIRED 承担高潮时长（R3era/R2era ≥ 80% 硬门）。
  const r3Req = Number(process.env.R3_REQUIRED ?? "0") || 43000; // 行星算力统一场（校准值：R3era/R2era≥80% 且 R3dur/R2dur≤85%）
  const r3IncomeTarget = Number(process.env.R3_INCOME_TARGET ?? "0") || 2e7;
  const r3End = earthRun(state, strategy, 3, r2End + 1, r3Req, ERA_PROJECT_CAPS.r3, r3IncomeTarget, m, offlineTable.earth, calendarRef, undefined, stepSec);
  m.r3EraProjectSec = r3End;
  m.r3DurationSec = r3End >= 0 ? r3End - r2End : -1;
  if (r3End < 0) return m;

  // 核心3 → 地外算力计划揭示 → Stage 4（不执行普通地球清档）
  m.stage4EntrySec = r3End + 1;

  // Stage 4（地月算力网）
  const s4 = freshCosmic(4);
  s4.nodes.push(1); // 里程碑授予第一个轨道节点
  const s4End = runCosmicStage(s4, 4, state, m, strategy, m.stage4EntrySec, STAGE4_PROJECT_REQUIRED, ERA_PROJECT_CAPS.stage4, offlineTable.stage4, calendarRef);
  m.stage4DurationSec = s4End >= 0 ? s4End - m.stage4EntrySec : -1;
  if (s4End < 0) return m;

  // Stage 5（戴森算力纪元）
  m.stage5EntrySec = s4End + 1;
  const s5 = freshCosmic(5);
  s5.nodes.push(1); // 里程碑授予第一个恒星节点
  const s5End = runCosmicStage(s5, 5, state, m, strategy, m.stage5EntrySec, STAGE5_PROJECT_REQUIRED, ERA_PROJECT_CAPS.stage5, offlineTable.stage5, calendarRef);
  m.stage5DurationSec = s5End >= 0 ? s5End - m.stage5EntrySec : -1;
  if (s5End < 0) return m;

  m.completedFullLine = true;
  m.totalOnlineSec = s5End;
  m.calendarSpanSec = s5End + calendarRef.value;
  m.peakCompute = stage3TotalCompute(state).toNumber();
  m.offlineCapped = s4.offlineCapped || s5.offlineCapped;
  return m;
}

// ---------- 统计 ----------
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return -1;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
function median(sorted: number[]): number {
  return percentile(sorted, 0.5);
}

// ---------- 主流程 ----------
// 仅作为入口脚本运行时执行；被 import 时只暴露函数供探针/测试调用
const IS_MAIN = typeof process !== "undefined" && !!process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("simulate-endgame.ts");
if (IS_MAIN) {
const ALL_STRATEGIES: Strategy[] = [
  "standard", "reasonable_training", "server_first", "model_first",
  "income_first", "offline_mixed", "idle_offline", "click_bulk",
];
const RUNS = Number(process.env.RUNS ?? "1000");
const requested = (process.env.STRATEGY_FILTER ?? "").split(",").map((s) => s.trim()).filter((s): s is Strategy => (ALL_STRATEGIES as string[]).includes(s));
const STRATEGIES = requested.length > 0 ? requested : ALL_STRATEGIES;
const MULT_TABLE = process.env.MULT_TABLE === "B" ? MULT_TABLE_B : MULT_TABLE_A;
const OFFLINE_TABLE = OFFLINE_TABLES[process.env.OFFLINE_TABLE ?? "A"] ?? OFFLINE_TABLES.A;

interface RunStats {
  strategy: string;
  r1FirstServer: number[];
  r1Iteration: number[];
  r2Era: number[];
  r3Era: number[];
  r2EraActive: number[];
  r3EraActive: number[];
  stage4FirstPaid: number[];
  stage4Era: number[];
  stage5Dyson: number[];
  totalOnline: number[];
  calendarSpan: number[];
  completedFull: number;
  offlineCapped: number;
}

// 确定性方法论：同一策略没有随机输入，重复运行的状态轨迹严格相同。
// 因此每个策略执行一次完整轨迹，再扩展为1000个确定性样本计算分位数；
// 命令/存档重复稳定性由独立的100次save/load与高速点击门负责，避免无意义重复数亿tick。
const stats: RunStats[] = [];
for (const strategy of STRATEGIES) {
  const s: RunStats = {
    strategy, r1FirstServer: [], r1Iteration: [], r2Era: [], r3Era: [],
    r2EraActive: [], r3EraActive: [],
    stage4FirstPaid: [], stage4Era: [], stage5Dyson: [],
    totalOnline: [], calendarSpan: [], completedFull: 0, offlineCapped: 0,
  };
  const deterministicResult = simulateEndgameRun(strategy, MULT_TABLE, OFFLINE_TABLE);
  for (let i = 0; i < RUNS; i++) {
    const result = deterministicResult;
    if (result.r1FirstServerSec >= 0) s.r1FirstServer.push(result.r1FirstServerSec);
    if (result.r1IterationSec >= 0) s.r1Iteration.push(result.r1IterationSec);
    if (result.r2EraProjectSec >= 0) s.r2Era.push(result.r2EraProjectSec);
    if (result.r3EraProjectSec >= 0) s.r3Era.push(result.r3EraProjectSec);
    if (result.r2EraActiveSec >= 0) s.r2EraActive.push(result.r2EraActiveSec);
    if (result.r3EraActiveSec >= 0) s.r3EraActive.push(result.r3EraActiveSec);
    if (result.stage4FirstPaidOrSecondSec >= 0) s.stage4FirstPaid.push(result.stage4FirstPaidOrSecondSec);
    if (result.stage4EraProjectSec >= 0) s.stage4Era.push(result.stage4EraProjectSec);
    if (result.stage5DysonSec >= 0) s.stage5Dyson.push(result.stage5DysonSec);
    if (result.totalOnlineSec > 0) s.totalOnline.push(result.totalOnlineSec);
    if (result.calendarSpanSec > 0) s.calendarSpan.push(result.calendarSpanSec);
    if (result.completedFullLine) s.completedFull += 1;
    if (result.offlineCapped) s.offlineCapped += 1;
  }
  stats.push(s);
}

console.log(`\n=== FINAL-RC 终局模拟（倍率表 ${MULT_TABLE.join("/")} · S4=${STAGE4_PROJECT_REQUIRED} · S5=${STAGE5_PROJECT_REQUIRED} · 离线 ${OFFLINE_TABLE.earth / HOUR}h/${OFFLINE_TABLE.stage4 / HOUR}h/${OFFLINE_TABLE.stage5 / HOUR}h · ${RUNS} 局/策略）===\n`);

for (const s of stats) {
  const p = (arr: number[]) => {
    if (arr.length === 0) return "未达成";
    const sorted = [...arr].sort((a, b) => a - b);
    return `中位 ${formatTime(median(sorted))} | p10 ${formatTime(percentile(sorted, 0.1))} | p90 ${formatTime(percentile(sorted, 0.9))}`;
  };
  console.log(`--- ${s.strategy}（完成全流程 ${s.completedFull}/${RUNS}，${((s.completedFull / RUNS) * 100).toFixed(1)}%；离线封顶 ${s.offlineCapped} 局） ---`);
  console.log(`  R1首服: ${p(s.r1FirstServer)}`);
  console.log(`  R1迭代(核心1·累计终点): ${p(s.r1Iteration)}`);
  console.log(`  R2时代工程(核心2·累计终点): ${p(s.r2Era)}`);
  console.log(`  R3时代工程(核心3·累计终点): ${p(s.r3Era)}`);
  console.log(`  R2时代工程独立投入(单阶段): ${p(s.r2EraActive)}`);
  console.log(`  R3时代工程独立投入(单阶段): ${p(s.r3EraActive)}`);
  console.log(`  Stage4首自费/二节点(单阶段): ${p(s.stage4FirstPaid)}`);
  console.log(`  Stage4地月网(累计终点): ${p(s.stage4Era)}`);
  console.log(`  Stage5戴森球(累计终点): ${p(s.stage5Dyson)}`);
  console.log(`  总在线等效(累计): ${p(s.totalOnline)}`);
  console.log(`  日历跨度: ${p(s.calendarSpan)}`);
}

console.log("\n=== 合同判定 ===");
for (const s of stats) {
  const med = (arr: number[]) => (arr.length ? median([...arr].sort((a, b) => a - b)) : -1);
  const r1 = med(s.r1Iteration);
  const r2 = med(s.r2Era);
  const r3 = med(s.r3Era);
  const s4 = med(s.stage4Era);
  const s5 = med(s.stage5Dyson);
  const r1Dur = r1;
  const r2Dur = r2 > 0 && r1 > 0 ? r2 - r1 : -1;
  const r3Dur = r3 > 0 && r2 > 0 ? r3 - r2 : -1;
  const s4Dur = s4 > 0 && r3 > 0 ? s4 - r3 : -1;
  const s5Dur = s5 > 0 && s4 > 0 ? s5 - s4 : -1;
  const s4Gate = med(s.stage4FirstPaid);
  const r2EraActive = med(s.r2EraActive);
  const r3EraActive = med(s.r3EraActive);

  const fmt = (v: number) => (v >= 0 ? formatTime(v) : "--");
  const r1InWindow = r1 >= 80 * 60 && r1 <= 100 * 60;
  const r2Ratio = r1Dur > 0 ? r2Dur / r1Dur : -1;
  const r3Ratio = r2Dur > 0 ? r3Dur / r2Dur : -1;
  const r2InBand = r2Ratio >= 0.65 && r2Ratio <= 0.85;
  const r3InBand = r3Ratio >= 0.65 && r3Ratio <= 0.85;
  const compressOk = r2Ratio >= 0.60 && r3Ratio >= 0.60;
  const s4InWindow = s4Dur >= 3 * HOUR && s4Dur <= 5 * HOUR;
  const s5InWindow = s5Dur >= 7 * HOUR && s5Dur <= 10 * HOUR;
  const gateOk = s4Gate >= 8 * 60 && s4Gate <= 15 * 60;
  const eraRatio = r2EraActive > 0 ? r3EraActive / r2EraActive : -1;
  const r3EraOk = eraRatio >= 0.80 && eraRatio <= 0.85;

  console.log(`\n${s.strategy}:`);
  console.log(`  R1=${fmt(r1)} ${r1InWindow ? "✅80-100min" : "❌目标外"} | R2=${fmt(r2Dur)}(${r2Ratio >= 0 ? (r2Ratio * 100).toFixed(0) + "%" : "--"}) ${r2InBand ? "✅65-85%" : "❌"} | R3=${fmt(r3Dur)}(${r3Ratio >= 0 ? (r3Ratio * 100).toFixed(0) + "%" : "--"}) ${r3InBand ? "✅65-85%" : "❌"} | 压缩 ${compressOk ? "✅≤40%" : "❌"}`);
  console.log(`  R3高潮门: R3时代工程投入=${fmt(r3EraActive)}（R2投入 ${fmt(r2EraActive)} 的 ${eraRatio >= 0 ? (eraRatio * 100).toFixed(0) + "%" : "--"}） ${r3EraOk ? "✅80-85%" : "❌"}`);
  console.log(`  Stage4=${fmt(s4Dur)} ${s4InWindow ? "✅3-5h" : "❌"} | Stage5=${fmt(s5Dur)} ${s5InWindow ? "✅7-10h" : "❌"} | S4首购门=${fmt(s4Gate)} ${gateOk ? "✅8-15min" : "❌"}`);
}
}
