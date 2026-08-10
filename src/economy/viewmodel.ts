// ViewModel：UI 只读快照。所有命令经 GameSession 执行，UI 不直接改状态。
import Decimal from "decimal.js";
import {
  AUTOMATION_ORDER_CAP,
  MODEL_ARCHIVE_MAX_LEVEL,
  MODELS,
  ORDERS,
  SERVER_CENTER_REQUIREMENT,
  SERVERS,
  type OrderDef,
} from "../data/content";
import { MAX_SERVERS } from "./engine";
import {
  firstServerProgress,
  lifetimeRevenue,
} from "./workshop";
import {
  activeBlueprint,
  architectureMultiplier,
  architectureUnlockedCount,
  ARCHITECTURE_BLUEPRINT_SERVER_THRESHOLDS,
  blueprintChoiceAvailable,
  blueprintLevel,
  blueprintOwned,
  bottleneckAnalysis,
  canCommissionRoom,
  canStartFlagship,
  canUpgradeInfrastructure,
  canIterate,
  effectiveEfficiency,
  flagshipProgressPerSec,
  flagshipRewardMultiplier,
  hasPendingFlagshipReward,
  infraLevel,
  iterationSummary,
  roomCount,
  roomRequirementsMet,
  stage3EntryMet,
  stage3IncomePerSecond,
  stage3TotalCompute,
  technologyUnlocked,
  techPassiveMultipliers,
  iterationRequirementsMet,
} from "./stage3";
import {
  batchPurchaseUnlocked,
  canClaimCore,
  canEndgameIterate,
  currentRound,
  endgameMode,
  SINGULARITY_MULTIPLIERS,
  singularityDisplay,
} from "./singularity";
import {
  canBuyNode,
  canStartFinalProject,
  cosmicModelName,
  finalProjectProgressPerSec,
  hasPendingFinalReward,
  nodeIncomeMultiplier,
  ownedNodes,
  STAGE4_FINAL_PROJECT,
  STAGE4_FINAL_PROJECT_ID,
  STAGE4_IDENTITY,
  STAGE4_MOTIVATION_TEXT,
  STAGE4_MOTIVATION_TITLE,
  STAGE4_NODES,
  stage4Entered,
  stage4IncomePerSecond,
} from "./stage4";
import {
  canBuyNode as canBuyS5Node,
  canStartFinalProject as canStartDyson,
  cosmicModelName as cosmicS5Name,
  hasPendingFinalReward as hasPendingDyson,
  nodeIncomeMultiplier as s5NodeMult,
  ownedNodes as ownedS5Nodes,
  perpetualActive,
  STAGE5_FINAL_PROJECT,
  STAGE5_FINAL_PROJECT_ID,
  STAGE5_IDENTITY,
  STAGE5_ERA_NAME,
  STAGE5_NODES,
  stage5Entered,
  stage5IncomePerSecond,
} from "./stage5";
import {
  BLUEPRINTS,
  ERA_PROJECTS,
  FLAGSHIP_PROJECTS,
  INFRASTRUCTURES,
  MACHINE_ROOMS,
  TECH_ARCHIVES,
  ERAS,
  infraUpgradeCost,
  projectById,
  roomById,
} from "../data/stage3";
import { formatBig, formatHeaderMoney, formatLiveMoney, formatMoney, formatTime } from "../core/big";
import {
  automationIncomePerSec,
  automationUnlockThreshold,
  automationUnlocked,
  canBuyServer,
  canBuyMaxServers,
  canEnableRental,
  canPrestige,
  canResearchModel,
  canTrain,
  currentStage,
  enableAutomation,
  incomePerSecond,
  modelCompute,
  modelLevel,
  nextServerCost,
  nextServerDef,
  orderById,
  orderDisplayMode,
  orderNet,
  ordersPerSecond,
  prestigePreview,
  rentalCostPerSec,
  stage3Gateway,
  stageLabel,
  trainCost,
  type OrderDisplayMode,
} from "./engine";
import type { OfflineReward, SaveData } from "../save/types";
import { businessMixForState, modelEffectMultipliers, modelRoleEffectText } from "./model-effects";
import {
  incomeBoostRemainingSeconds,
  offlineCapacitySeconds,
  SPONSOR_INCOME_ADS_PER_DAY,
  SPONSOR_INCOME_FREE_CHARGES_PER_DAY,
  SPONSOR_INCOME_MAX_REMAINING_SECONDS,
  SPONSOR_OFFLINE_ADS_PER_DAY,
  SPONSOR_OFFLINE_MAX_SECONDS,
} from "./sponsor";
import { buildFeelViewModel, type FeelViewModel } from "./feel";

export interface OrderRowVM {
  order: OrderDef;
  netIncome: string;
  rentalCost: string;
  gross: string;
  canAccept: boolean;
  recommended: boolean;
}

export interface ActiveOrderVM {
  orderIndex: number;
  orderId: string;
  name: string;
  icon: string;
  status: "processing" | "ready" | "claimed";
  progress: number;
  remainingLabel: string;
}

export interface ModelVM {
  id: string | null;
  acquired: boolean;
  name: string;
  icon: string;
  level: number;
  maxLevel: number;
  compute: string;
  trainCost: string;
  canTrain: boolean;
  atMaxLevel: boolean;
  roleLabel: string;
  effectText: string;
}

export interface ModelArchiveVM {
  id: string;
  name: string;
  icon: string;
  owned: boolean;
  current: boolean;
  archiveLevel: number;
  researchCount: number;
  lifetimeTrainingCount: number;
  firstAcquiredAtMs: number;
  lifetimeContribution: string;
  roleLabel: string;
  effectText: string;
}

export interface GrowthHistoryVM {
  enabled: boolean;
  modelHistory: ModelArchiveVM[];
  iterationHistory: Array<{ count: number; label: string; multiplier: string }>;
  singularityCores: Array<{ id: string; label: string; claimed: boolean }>;
  civilizationStages: Array<{ id: string; name: string; reached: boolean; reachedAtMs: number }>;
  galacticEras: Array<{ id: string; name: string; reached: boolean; reachedAtMs: number }>;
}

export interface LegendaryArchiveVM {
  completedAtMs: number;
  maxCompute: string;
  maxIncome: string;
  reachedEra: string;
}

export interface ServerVM {
  ownedCount: number;
  maxCount: number;
  nextName: string | null;
  nextCost: string | null;
  canBuy: boolean;
  batchUnlocked: boolean;
  canBuyMax: boolean;
  servers: Array<{ index: number; name: string; owned: boolean; power: number; cost: string }>;
  /** 阶段进度：1 自有算力 / 3 初级集群 / 5 规模化 / 8 算力中心 */
  phase: "none" | "own" | "cluster" | "scale" | "center";
  phaseLabel: string;
}

export interface CenterVM {
  unlocked: boolean; // 三服务器后解锁
  level: number;
  maxLevel: number;
  upgradeCost: string;
  canUpgrade: boolean;
  powerMult: string;
  incomeMult: string;
}

export interface PrestigeVM {
  canPrestige: boolean;
  target: string;
  current: string;
  progress: number;
  count: number;
  permanentMultiplier: string;
  resetItems: string[];
  gainItems: string[];
  speedupEstimate: string;
  /** CARD-01：奇点核心显示 "n/3"（正式档为 null） */
  singularityLabel: string | null;
  /** CARD-01：当前轮奇点核心是否可手动领取 */
  coreClaimable: boolean;
  /** CARD-01：当前轮次（1/2/3，正式档为 null） */
  round: number | null;
}

export interface OfflineVM {
  hasPending: boolean;
  money: string;
  elapsedLabel: string;
  /** CARD-04 回归回执：本次离线实际时长（超出部分未计入展示） */
  rawElapsedLabel: string;
  /** CARD-04 回归回执：本阶段离线上限 */
  capLabel: string;
  /** CARD-04 回归回执：超出未计入时长（0 显示空） */
  excessLabel: string;
  /** CARD-04 回归回执：离线研发进度增量（0-100） */
  researchProgress: number;
  /** CARD-04 回归回执：离线推进工程进度增量（进度点） */
  projectProgressDelta: number;
  /** CARD-04 回归回执：离线推进工程显示名 */
  projectName: string | null;
}

export interface SponsorVM {
  pendingAdKind: "offline_capacity" | "income_boost" | null;
  offlineCapacityLabel: string;
  offlineCapacityProgress: number;
  offlineAdsUsed: number;
  offlineAdsMax: number;
  canWatchOfflineAd: boolean;
  incomeBoostRemainingLabel: string;
  incomeBoostProgress: number;
  incomeFreeUsed: number;
  incomeFreeMax: number;
  incomeAdsUsed: number;
  incomeAdsMax: number;
  canClaimFreeIncome: boolean;
  canWatchIncomeAd: boolean;
  incomeBoostActive: boolean;
}

export interface OrderDisplayVM {
  mode: OrderDisplayMode;
  opsPerSec: string;
  grossPerSec: string;
  costPerSec: string;
  netPerSec: string;
  totalCompute: string;
  /** 近 10 秒收入（算力模式展示用，由 UI 累积） */
  recentIncomeLabel: string;
  /** 每次模式切换/10 秒汇总时更新的文字 */
  summaryText: string;
}

export interface ResearchVM {
  progress: number;
  progressLabel: string;
  canResearch: boolean;
  archiveComplete: boolean;
  drawsInStage2: number;
}

export interface Stage2SettlementVM {
  shown: boolean;
  serverCount: number;
  modelCount: number;
  totalCompute: string;
  incomePerSec: string;
  stageIncome: string;
  completedAtMs: number;
}

export interface ViewModel {
  saveId: string;
  revision: number;
  createdAtMs: number;
  stage: number;
  stageLabel: string;
  stage3Gateway: boolean;
  money: string;
  moneyRaw: Decimal;
  incomePerSec: string;
  lifetimeIncome: string;
  compute: string;
  permanentMultiplier: string;
  iterationCount: number;
  architecture: {
    unlockedCount: number;
    total: number;
    multiplier: string;
    nextServerCount: number | null;
    nextBlueprintName: string | null;
  };
  model: ModelVM;
  modelArchive: ModelArchiveVM[];
  growthHistory: GrowthHistoryVM;
  legendaryArchive: LegendaryArchiveVM | null;
  achievements: AchievementVM[];
  research: ResearchVM;
  orderDisplay: OrderDisplayVM;
  orders: OrderRowVM[];
  activeOrders: ActiveOrderVM[];
  canAcceptAnyOrder: boolean;
  automationUnlocked: boolean;
  automationEnabled: boolean;
  automationCompletedOrders: number;
  automationThreshold: number;
  workshop: {
    level: number;
    experience: number;
    experienceToNextLevel: number;
    lifetimeRevenue: string;
    firstServer: {
      levelCurrent: number;
      levelTarget: number;
      levelProgress: number;
      revenueCurrent: string;
      revenueTarget: string;
      revenueProgress: number;
      met: boolean;
      awarded: boolean;
    };
  };
  trainPreview: {
    canTrain: boolean;
    computeNow: string;
    computeAfter: string;
    incomeNow: string;
    incomeAfter: string;
    cost: string;
  } | null;
  rental: {
    active: boolean;
    costPerSec: string;
    canEnable: boolean;
  };
  server: ServerVM;
  center: CenterVM;
  stage2Settlement: Stage2SettlementVM;
  prestige: PrestigeVM;
  stage3: Stage3VM;
  iteration: IterationVM;
  singularity: SingularityVM;
  stage4: Stage4VM;
  stage5: Stage5VM;
  offline: OfflineVM;
  sponsor: SponsorVM;
  /** 下一个主按钮 */
  primaryAction: { id: string; label: string; enabled: boolean } | null;
  pendingOfflineMoney: string;
  /** 上线前Level A：只读表现派生，不进入SaveData。 */
  feel: FeelViewModel;
}

export interface AchievementVM {
  id: string;
  name: string;
  description: string;
  achieved: boolean;
  achievedAtMs: number;
}

function buildOrderDisplay(state: SaveData): OrderDisplayVM {
  const mode = orderDisplayMode(state);
  const compute = modelCompute(state);
  const serverPower = new Decimal(state.serverPower);
  const permanent = new Decimal(state.permanentMultiplier);
  const ops = ordersPerSecond(state);
  const mix = businessMixForState(state);
  // 业务流水聚合：与引擎相同，先按订单时长换算每秒贡献，再乘 4 槽与真实倍率。
  const totalShare = mix.reduce((acc, m) => acc + m.share, 0);
  let grossPerSlotSec = new Decimal(0);
  let netPerSlotSec = new Decimal(0);
  for (const m of mix) {
    const def = orderById(m.orderId);
    if (!def) continue;
    const share = m.share / totalShare;
    grossPerSlotSec = grossPerSlotSec.plus(new Decimal(def.gross).div(def.durationSec).mul(share));
    netPerSlotSec = netPerSlotSec.plus(orderNet(def).div(def.durationSec).mul(share));
  }
  const modelEffects = modelEffectMultipliers(state);
  const incomeMult = permanent
    .mul(AUTOMATION_ORDER_CAP)
    .mul(architectureMultiplier(state))
    .mul(techPassiveMultipliers(state).income)
    .mul(modelEffects.income)
    .mul(modelEffects.automation);
  const gross = grossPerSlotSec.mul(compute).mul(serverPower).mul(incomeMult);
  const net = netPerSlotSec.mul(compute).mul(serverPower).mul(incomeMult);
  const cost = gross.minus(net);
  const summaryText =
    mode === "compute"
      ? `算力结算：处理请求 ${ops.toFixed(1)}/秒 · 收入 ${formatMoney(net)}/秒 · 总算力 ${formatBig(compute.mul(serverPower))}`
      : mode === "flow"
        ? `业务流水：处理速度 ${ops.toFixed(1)} 单/秒 · 净收入 ${formatMoney(net)}/秒`
        : `单笔订单：当前处理 ${ops.toFixed(2)} 单/秒`;
  return {
    mode,
    opsPerSec: ops.toFixed(mode === "single" ? 2 : 1),
    grossPerSec: formatMoney(gross),
    costPerSec: formatMoney(cost),
    netPerSec: formatMoney(net),
    totalCompute: formatBig(compute.mul(serverPower)),
    recentIncomeLabel: "",
    summaryText,
  };
}

export function buildViewModel(state: SaveData): ViewModel {
  const s5EnteredTop = stage5Entered(state);
  const s4Entered = stage4Entered(state);
  // CARD-03：Stage 5 身份跃迁（银河算力大亨）优先级最高。
  const stage = s5EnteredTop ? 5 : s4Entered ? 4 : currentStage(state);
  const stageLabelValue = s5EnteredTop
    ? STAGE5_IDENTITY
    : s4Entered
      ? STAGE4_IDENTITY
      : stageLabel(stage, stage3Gateway(state));
  // CARD-02：Stage 4 身份跃迁（地月算力运营商）——地球 stage 1-3 全部归入“地球纪元”。
  const compute = modelCompute(state);
  // 顶部显示真实正在发生的自动收入；未开启自动经营时不展示潜在产能为收入。
  const ips = state.automation ? incomePerSecond(state) : new Decimal(0);
  const gateway = stage3Gateway(state);
  const claimedCoreIds = new Set(state.singularity?.coresClaimed ?? []);

  // 模型
  const modelDef = state.modelProgress
    ? MODELS.find((m) => m.id === state.modelProgress!.modelId)
    : null;
  const modelAtMaxLevel = modelDef != null && modelLevel(state) >= modelDef.maxLevel;
  const model: ModelVM = {
    id: modelDef?.id ?? null,
    acquired: state.modelProgress != null,
    name: modelDef?.name ?? "未获取模型",
    icon: modelDef?.icon ?? "❓",
    level: modelLevel(state),
    maxLevel: modelDef?.maxLevel ?? 0,
    compute: formatBig(compute),
    trainCost: state.modelProgress && !modelAtMaxLevel ? formatMoney(trainCost(state)) : "-",
    canTrain: canTrain(state),
    atMaxLevel: modelAtMaxLevel,
    roleLabel: modelDef?.roleLabel ?? "",
    effectText: modelDef ? modelRoleEffectText(modelDef) : "",
  };
  const modelArchive: ModelArchiveVM[] = MODELS.map((definition) => {
    const archived = state.modelArchive?.[definition.id];
    return {
      id: definition.id,
      name: definition.name,
      icon: definition.icon,
      owned: archived != null,
      current: state.modelProgress?.modelId === definition.id,
      archiveLevel: archived?.level ?? 0,
      researchCount: archived?.researchCount ?? 0,
      lifetimeTrainingCount: archived?.lifetimeTrainingCount ?? 0,
      firstAcquiredAtMs: archived?.firstAcquiredAtMs ?? 0,
      lifetimeContribution: formatMoney(archived?.lifetimeContribution ?? 0),
      roleLabel: definition.roleLabel,
      effectText: modelRoleEffectText(definition),
    };
  });

  // 订单
  const orders: OrderRowVM[] = ORDERS.map((order) => {
    const net = orderNet(order);
    const rentalCost = new Decimal(order.gross).mul(order.rentalCostRatio);
    return {
      order,
      netIncome: formatMoney(net),
      rentalCost: formatMoney(rentalCost),
      gross: formatMoney(order.gross),
      canAccept: state.activeOrders.length < 4 && state.modelProgress != null,
      recommended: order.recommended,
    };
  });

  const activeOrders: ActiveOrderVM[] = state.activeOrders.map((o, i) => {
    const def = orderById(o.orderId);
    const total = def ? def.durationSec : 1;
    const progress = Math.min(1, Math.max(0, 1 - o.remainingSec / total));
    return {
      orderIndex: i,
      orderId: o.orderId,
      name: def?.name ?? o.orderId,
      icon: def?.icon ?? "📋",
      status: o.status === 0 ? "processing" : "ready",
      progress,
      remainingLabel: o.status === 1 ? "可领取" : formatTime(Math.ceil(o.remainingSec)),
    };
  });

  // 服务器
  const nextDef = nextServerDef(state);
  const nextName = nextDef ? SERVERS.find((sv) => sv.index === nextDef.index)?.name ?? null : null;
  const phase: ServerVM["phase"] =
    state.serverCount >= SERVER_CENTER_REQUIREMENT ? "center"
    : state.serverCount >= 5 ? "scale"
    : state.serverCount >= 3 ? "cluster"
    : state.serverCount >= 1 ? "own"
    : "none";
  const phaseLabel =
    phase === "center" ? "完整服务器集群（8/8）"
    : phase === "scale" ? "规模化运营（5/8）"
    : phase === "cluster" ? "初级集群（3/8）"
    : phase === "own" ? "自有算力（1/8）"
    : "未拥有服务器";
  const server: ServerVM = {
    ownedCount: state.serverCount,
    maxCount: MAX_SERVERS,
    nextName,
    nextCost: nextDef ? formatMoney(nextDef.cost) : null,
    canBuy: canBuyServer(state),
    batchUnlocked: batchPurchaseUnlocked(state) || state.technologyIterationCount > 0,
    canBuyMax: canBuyMaxServers(state),
    servers: SERVERS.map((s) => ({
      index: s.index,
      name: s.name,
      owned: state.serverCount >= s.index,
      power: s.power,
      cost: formatMoney(s.cost),
    })),
    phase,
    phaseLabel,
  };

  // 算力中心
  const center: CenterVM = {
    unlocked: false,
    level: 0,
    maxLevel: 0,
    upgradeCost: "-",
    canUpgrade: false,
    powerMult: "1.0",
    incomeMult: "1.0",
  };

  // 技术迭代
  const pp = prestigePreview(state);
  const round = currentRound(state);
  const coreClaimable = canClaimCore(state);
  const prestige: PrestigeVM = {
    canPrestige: pp.canPrestige,
    target: formatMoney(pp.target),
    current: formatMoney(pp.current),
    progress: Math.min(1, pp.current.div(pp.target).toNumber()),
    count: state.technologyIterationCount,
    permanentMultiplier: "×" + formatBig(state.permanentMultiplier),
    resetItems: pp.resetItems,
    gainItems: pp.gainItems,
    speedupEstimate: "×" + pp.speedupEstimate.toFixed(1),
    singularityLabel: singularityDisplay(state),
    coreClaimable,
    round,
  };

  const singularity: SingularityVM = {
    active: endgameMode(state),
    label: singularityDisplay(state),
    round,
    coreClaimable,
    iterationReady: canEndgameIterate(state),
    spacePlanRevealed: state.singularity?.spacePlanRevealed === true,
    spacePlanStarted: state.singularity?.spacePlanStarted === true,
  };

  const s4Nodes = ownedNodes(state);
  const s4Active = state.singularity?.stage4?.activeProjectId === STAGE4_FINAL_PROJECT_ID;
  const s4Progress = state.singularity?.stage4?.projectProgress ?? 0;
  const s4Pending = hasPendingFinalReward(state);
  const s4Completed = (state.singularity?.stage4?.completedProjectIds ?? []).includes(STAGE4_FINAL_PROJECT_ID);
  const stage4: Stage4VM = {
    active: s4Entered,
    entered: s4Entered,
    identity: STAGE4_IDENTITY,
    motivationTitle: STAGE4_MOTIVATION_TITLE,
    motivationText: STAGE4_MOTIVATION_TEXT,
    cosmicModelName: cosmicModelName(state),
    nodes: STAGE4_NODES.map((n) => ({
      id: n.id,
      name: n.name,
      icon: n.icon,
      cost: n.cost <= 0 ? "里程碑授予" : formatMoney(n.cost),
      owned: s4Nodes.includes(n.id),
      canBuy: canBuyNode(state, n.id),
    })),
    ownedNodeCount: s4Nodes.length,
    batchUnlocked: batchPurchaseUnlocked(state),
    canBuyMaxNodes: batchPurchaseUnlocked(state) && STAGE4_NODES.some((n) => canBuyNode(state, n.id)),
    incomePerSec: formatMoney(s4Entered ? stage4IncomePerSecond(state) : new Decimal(0)) + "/秒",
    nodeMult: s4Entered ? `×${nodeIncomeMultiplier(state).toFixed(2)}` : "",
    finalProject: {
      name: STAGE4_FINAL_PROJECT.name,
      icon: STAGE4_FINAL_PROJECT.icon,
      progressLabel: s4Active
        ? `${Math.min(100, Math.floor((s4Progress / STAGE4_FINAL_PROJECT.progressRequired) * 100))}%`
        : s4Completed
          ? "已完成"
          : s4Pending
            ? "待领取"
            : "",
      canStart: canStartFinalProject(state),
      active: s4Active,
      pendingReward: s4Pending,
      completed: s4Completed,
      rewardText: "完成后手动领取：地月主线完成里程碑",
    },
  };

  const s5Entered = stage5Entered(state);
  const s5Nodes = ownedS5Nodes(state);
  const s5Active = state.singularity?.stage5?.activeProjectId === STAGE5_FINAL_PROJECT_ID;
  const s5Progress = state.singularity?.stage5?.projectProgress ?? 0;
  const s5Pending = hasPendingDyson(state);
  const s5Completed = (state.singularity?.stage5?.completedProjectIds ?? []).includes(STAGE5_FINAL_PROJECT_ID);
  const s5IncomePerSec = s5Entered ? stage5IncomePerSecond(state) : new Decimal(0);
  const stage5: Stage5VM = {
    active: s5Entered,
    entered: s5Entered,
    identity: STAGE5_IDENTITY,
    cosmicModelName: cosmicS5Name(state),
    nodes: STAGE5_NODES.map((n) => ({
      id: n.id,
      name: n.name,
      icon: n.icon,
      cost: n.cost <= 0 ? "里程碑授予" : formatMoney(n.cost),
      owned: s5Nodes.includes(n.id),
      canBuy: canBuyS5Node(state, n.id),
    })),
    ownedNodeCount: s5Nodes.length,
    incomePerSec: formatMoney(s5IncomePerSec) + "/秒",
    nodeMult: s5Entered ? `×${s5NodeMult(state).toFixed(2)}` : "",
    finalProject: {
      name: STAGE5_FINAL_PROJECT.name,
      icon: STAGE5_FINAL_PROJECT.icon,
      progressLabel: s5Active
        ? `${Math.min(100, Math.floor((s5Progress / STAGE5_FINAL_PROJECT.progressRequired) * 100))}%`
        : s5Completed
          ? "已完成"
          : s5Pending
            ? "待领取"
            : "",
      canStart: canStartDyson(state),
      active: s5Active,
      pendingReward: s5Pending,
      completed: s5Completed,
      rewardText: "完成后手动领取：银河终局庆典 · 继续观察永续增长",
    },
    storyCompleted: state.singularity?.stage5?.storyCompleted === true,
    perpetualActive: perpetualActive(state),
  };

  const legendaryArchive: LegendaryArchiveVM | null = endgameMode(state) && state.singularity?.stage5?.legendaryArchive
    ? {
        completedAtMs: state.singularity.stage5.legendaryArchive.completedAtMs,
        maxCompute: formatBig(state.singularity.stage5.legendaryArchive.maxCompute),
        maxIncome: formatMoney(state.singularity.stage5.legendaryArchive.maxIncome),
        reachedEra: state.singularity.stage5.legendaryArchive.reachedEra,
      }
    : null;
  const firstModelAt = Object.values(state.modelArchive).reduce(
    (min, entry) => entry.firstAcquiredAtMs > 0 ? Math.min(min, entry.firstAcquiredAtMs) : min,
    Number.POSITIVE_INFINITY,
  );
  const achievements: AchievementVM[] = [
    { id: "first_model", name: "第一束智能火花", description: "获得第一款AI模型", achieved: state.ownedModelIds.length > 0, achievedAtMs: Number.isFinite(firstModelAt) ? firstModelAt : 0 },
    { id: "first_order", name: "第一笔业务", description: "完成第一笔客户请求", achieved: state.completedOrders > 0 || new Decimal(state.lifetimeIncome).gt(0), achievedAtMs: 0 },
    { id: "first_server", name: "自己的算力", description: "取得第一台自有服务器", achieved: state.workshop.firstServerAwarded || state.serverCount > 0, achievedAtMs: 0 },
    { id: "eight_servers", name: "完整服务器集群", description: "拥有八台服务器", achieved: state.serverCount >= 8 || state.stage2.settlementShown, achievedAtMs: state.stage2.completedAtMs },
    { id: "first_room", name: "迈入算力中心", description: "投产第一座算力机房", achieved: state.stage3?.entered === true, achievedAtMs: state.stage3.enteredAtMs },
    { id: "r1", name: "区域算力纪元", description: "获得第1枚奇点核心", achieved: claimedCoreIds.has("core_1"), achievedAtMs: 0 },
    { id: "r2", name: "全球算力纪元", description: "获得第2枚奇点核心", achieved: claimedCoreIds.has("core_2"), achievedAtMs: 0 },
    { id: "r3", name: "行星算力纪元", description: "获得第3枚奇点核心", achieved: claimedCoreIds.has("core_3"), achievedAtMs: state.singularity?.spacePlanRevealedAtMs ?? 0 },
    { id: "three_cores", name: "奇点核心 3/3", description: "集齐全部奇点核心", achieved: claimedCoreIds.size >= 3, achievedAtMs: state.singularity?.spacePlanRevealedAtMs ?? 0 },
    { id: "stage4", name: "地月算力运营商", description: "启动地外算力计划", achieved: s4Entered, achievedAtMs: state.singularity?.stage4?.enteredAtMs ?? 0 },
    { id: "four_lunar_nodes", name: "地月节点全开", description: "取得全部四个地月算力节点", achieved: s4Nodes.length >= STAGE4_NODES.length, achievedAtMs: 0 },
    { id: "stage5", name: "戴森算力纪元", description: "进入恒星级算力建设", achieved: s5Entered, achievedAtMs: state.singularity?.stage5?.enteredAtMs ?? 0 },
    { id: "dyson", name: "银河算力大亨", description: "完成戴森算力球与银河终局", achieved: perpetualActive(state), achievedAtMs: state.singularity?.stage5?.legendaryArchive?.completedAtMs ?? 0 },
    { id: "compute_scale", name: "百万级算力", description: "总算力达到100万", achieved: stage3TotalCompute(state).gte(1e6), achievedAtMs: 0 },
    { id: "income_scale", name: "十亿级收入", description: "历史最高每秒收入达到10亿", achieved: new Decimal(state.highestIncomePerSecond).gte(1e9), achievedAtMs: 0 },
  ];

  const offline: OfflineVM = state.pendingOfflineReward && !state.pendingOfflineReward.claimed
    ? buildOfflineVM(state.pendingOfflineReward)
    : {
        hasPending: false,
        money: "",
        elapsedLabel: "",
        rawElapsedLabel: "",
        capLabel: "",
        excessLabel: "",
        researchProgress: 0,
        projectProgressDelta: 0,
        projectName: null,
      };

  function buildOfflineVM(reward: OfflineReward): OfflineVM {
    const rawSec = Math.max(0, reward.rawElapsedSec ?? reward.elapsedSec);
    const capSec = Math.max(0, reward.capSec ?? reward.elapsedSec);
    const excessSec = Math.max(0, rawSec - capSec);
    return {
      hasPending: true,
      money: formatMoney(reward.money),
      elapsedLabel: formatTime(reward.elapsedSec),
      rawElapsedLabel: formatTime(rawSec),
      capLabel: formatTime(capSec),
      excessLabel: excessSec > 0 ? formatTime(excessSec) : "",
      researchProgress: Math.max(0, reward.researchProgress ?? 0),
      projectProgressDelta: Math.max(0, reward.projectProgressDelta ?? 0),
      projectName: reward.projectName ?? null,
    };
  }

  // ---------- Stage 3 / 档案馆 ----------
  const stage3Entered = state.stage3?.entered === true;
  const bottleneck = bottleneckAnalysis(state);
  const eff = effectiveEfficiency(state);
  const compute3 = stage3TotalCompute(state);
  const roomsOwned = roomCount(state);
  const previewProjectId = state.stage3?.flagship?.pendingReward?.projectId
    ?? state.stage3?.flagship?.activeId
    ?? FLAGSHIP_PROJECTS.find((project) => !(state.stage3?.flagship?.completedIds ?? []).includes(project.id))?.id
    ?? FLAGSHIP_PROJECTS[FLAGSHIP_PROJECTS.length - 1].id;

  // 固定顺序自动解锁（3 台 / 5 台 / 8 台）；保留空兼容字段以稳定旧 ViewModel 形状。
  const availableBlueprintChoice = blueprintChoiceAvailable(state);
  const blueprintChoice: Stage3VM["blueprintChoice"] =
    availableBlueprintChoice === "server3" || availableBlueprintChoice === "server8"
      ? availableBlueprintChoice
      : null;
  const architectureCount = architectureUnlockedCount(state);
  const nextArchitectureIndex = architectureCount < ARCHITECTURE_BLUEPRINT_SERVER_THRESHOLDS.length
    ? architectureCount
    : -1;
  const nextArchitectureServerCount = nextArchitectureIndex >= 0
    ? ARCHITECTURE_BLUEPRINT_SERVER_THRESHOLDS[nextArchitectureIndex]
    : null;
  const nextArchitectureName = nextArchitectureIndex >= 0
    ? BLUEPRINTS[nextArchitectureIndex]?.name ?? null
    : null;
  const archiveComplete = MODELS.every((definition) => (
    (state.modelArchive?.[definition.id]?.level ?? 0) >= MODEL_ARCHIVE_MAX_LEVEL
  ));

  const infrastructure: InfrastructureVM[] = INFRASTRUCTURES.map((d) => {
    const lvl = infraLevel(state, d.id);
    let detail = "";
    if (d.id === "storage") {
      const preview = structuredClone(state);
      preview.stage3.infrastructure.storage = Math.min(10, lvl + 1);
      detail = `当前工程资金奖励 ×${flagshipRewardMultiplier(state, previewProjectId).toFixed(2)} → ×${flagshipRewardMultiplier(preview, previewProjectId).toFixed(2)}`;
    }
    return {
      id: d.id,
      name: d.name,
      icon: d.icon,
      level: lvl,
      maxLevel: 10,
      upgradeCost: formatMoney(infraUpgradeCost(d.id, lvl)),
      canUpgrade: canUpgradeInfrastructure(state, d.id),
      desc: d.desc,
      detail,
    };
  });

  const machineRooms: MachineRoomVM[] = MACHINE_ROOMS.map((r) => {
    const owned = roomsOwned >= r.index;
    return {
      index: r.index,
      name: r.name,
      scaleName: r.scaleName,
      commissioned: owned,
      requirementsMet: roomRequirementsMet(state, r.index),
      requirements: r.requires,
    };
  });

  const flagship: FlagshipVM[] = FLAGSHIP_PROJECTS.map((p) => {
    const completed = (state.stage3?.flagship?.completedIds ?? []).includes(p.id);
    const unlocked = canStartFlagship(state, p.id) || (state.stage3?.flagship?.activeId === p.id) || completed;
    const active = state.stage3?.flagship?.activeId === p.id;
    const pendingId = hasPendingFlagshipReward(state);
    const pendingForThisProject = pendingId === p.id;
    const pendingMultiplier = pendingForThisProject
      ? state.stage3?.flagship?.pendingReward?.rewardMultiplier
      : undefined;
    const rewardMultiplier = pendingMultiplier && pendingMultiplier >= 1
      ? new Decimal(pendingMultiplier)
      : flagshipRewardMultiplier(state, p.id);
    const requirements: string[] = [
      `机房 ${roomsOwned}/${p.requiresRooms}`,
      `算力 ${formatBig(compute3)}/${formatBig(p.requiresCompute)}`,
      `光模块 Lv.${infraLevel(state, "optical")}/Lv.${p.requiresOptical ?? 0}`,
      `存储 Lv.${infraLevel(state, "storage")}/Lv.${p.requiresStorage}`,
    ];
    if (p.id === "project_2") {
      requirements.push(`前置工程「大模型集中训练」${(state.stage3?.flagship?.completedIds ?? []).includes("project_1") ? "已完成" : "未完成"}`);
    } else if (p.id === "project_3") {
      requirements.push(`前置工程「全国推理服务网络」${(state.stage3?.flagship?.completedIds ?? []).includes("project_2") ? "已完成" : "未完成"}`);
    }
    return {
      id: p.id,
      name: p.name,
      icon: p.icon,
      unlocked,
      canStart: canStartFlagship(state, p.id),
      completed,
      activeId: active ? p.id : null,
      activeName: active ? p.name : null,
      progress: active ? (state.stage3?.flagship?.progress ?? 0) : 0,
      progressLabel: active ? `${Math.min(100, Math.floor(((state.stage3?.flagship?.progress ?? 0) / p.progressRequired) * 100))}%` : "",
      progressRequired: p.progressRequired,
      totalCompute: formatBig(compute3),
      pendingRewardId: pendingForThisProject ? p.id : null,
      pendingRewardName: pendingForThisProject ? p.name : null,
      rewardText: `资金 ${formatMoney(new Decimal(p.reward.money).mul(rewardMultiplier).floor())}（存储 ×${rewardMultiplier.toFixed(2)}） · 研发进度 +${p.reward.researchProgress}`,
      requirementsText: requirements.join(" · "),
    };
  });
  // 时代工程并入旗舰列表（正式终局与隔离 Review 共用；R1 在旗舰 project_3 完成后追加）。
  if (endgameMode(state)) {
    for (const eraDef of ERA_PROJECTS) {
      const completed = (state.stage3?.flagship?.completedIds ?? []).includes(eraDef.id);
      const active = state.stage3?.flagship?.activeId === eraDef.id;
      const pendingId = hasPendingFlagshipReward(state);
      const pendingForThisProject = pendingId === eraDef.id;
      const round = eraDef.id === "project_r1" ? 1 : eraDef.id === "project_r2" ? 2 : 3;
      const previousCore = round <= 1 ? null : `core_${round - 1}`;
      const requirements = [
        `机房 ${roomsOwned}/3`,
        `前置工程「区域推理协作网」${(state.stage3?.flagship?.completedIds ?? []).includes("project_3") ? "已完成" : "未完成"}`,
      ];
      if (previousCore) requirements.push(`前置核心 ${claimedCoreIds.has(previousCore) ? "已获得" : "未获得"}`);
      flagship.push({
        id: eraDef.id,
        name: eraDef.name,
        icon: eraDef.icon,
        unlocked: canStartFlagship(state, eraDef.id) || active || completed,
        canStart: canStartFlagship(state, eraDef.id),
        completed,
        activeId: active ? eraDef.id : null,
        activeName: active ? eraDef.name : null,
        progress: active ? (state.stage3?.flagship?.progress ?? 0) : 0,
        progressLabel: active ? `${Math.min(100, Math.floor(((state.stage3?.flagship?.progress ?? 0) / eraDef.progressRequired) * 100))}%` : "",
        progressRequired: eraDef.progressRequired,
        totalCompute: formatBig(compute3),
        pendingRewardId: pendingForThisProject ? eraDef.id : null,
        pendingRewardName: pendingForThisProject ? eraDef.name : null,
        rewardText: `本轮奖励：第${round}枚奇点核心 · 奇点核心总计：${round} / 3`,
        requirementsText: requirements.join(" · "),
      });
    }
  }

  const blueprints: BlueprintVM[] = BLUEPRINTS.map((b) => ({
    id: b.id,
    name: b.name,
    icon: b.icon,
    desc: b.desc,
    owned: blueprintOwned(state, b.id),
    active: activeBlueprint(state) === b.id,
    level: blueprintLevel(state, b.id),
  }));

  const techArchive: TechArchiveVM[] = TECH_ARCHIVES.map((t) => ({
    id: t.id,
    name: t.name,
    desc: t.desc,
    unlocked: technologyUnlocked(state, t.id),
  }));

  const eraArchive: EraArchiveVM[] = [
    { id: "stage1", name: "AI创业工作室", reached: true, real: true },
    { id: "stage2", name: "服务器集群", reached: state.serverCount > 0 || state.stage2.completedAtMs > 0, real: true },
    { id: "stage3", name: "算力中心", reached: stage3Entered, real: true },
    { id: "r1", name: "第一轮地球算力纪元", reached: claimedCoreIds.has("core_1"), real: true },
    { id: "r2", name: "第二轮全球算力纪元", reached: claimedCoreIds.has("core_2"), real: true },
    { id: "r3", name: "第三轮行星算力纪元", reached: claimedCoreIds.has("core_3"), real: true },
    { id: "stage4", name: "地月算力纪元", reached: s4Entered, real: true },
    { id: "stage5", name: "戴森算力纪元", reached: s5Entered, real: true },
    { id: "dyson", name: "银河算力大亨", reached: perpetualActive(state), real: true },
  ];

  const stage3: Stage3VM = {
    entered: stage3Entered,
    entryMet: stage3EntryMet(state),
    infrastructure,
    machineRooms,
    roomsOwned,
    flagship,
    bottleneck: {
      id: bottleneck.id,
      name: bottleneck.name,
      efficiency: bottleneck.efficiency,
      upgradeEfficiency: bottleneck.upgradeEfficiency,
      projectedIncomeGain: formatMoney(bottleneck.projectedIncomeGain) + "/秒",
    },
    effectiveEfficiency: eff,
    totalCompute: formatBig(compute3),
    incomePerSec: formatMoney(stage3Entered ? stage3IncomePerSecond(state) : new Decimal(0)) + "/秒",
    commissionBonusActive: (state.stage3?.commissionBonusUntilMs ?? 0) > Date.now(),
    commissionBonusRemaining: (state.stage3?.commissionBonusUntilMs ?? 0) > Date.now()
      ? `${Math.max(0, Math.ceil(((state.stage3?.commissionBonusUntilMs ?? 0) - Date.now()) / 1000))}秒`
      : "",
    blueprintChoice,
    blueprintChoiceLabel: blueprintChoice === "server3" ? "达到 3 台服务器，选择集群架构蓝图" : blueprintChoice === "server8" ? "达到 8 台服务器，选择集群架构蓝图" : "",
    blueprints,
    techArchive,
    eraArchive,
    projectProgressLabel: state.stage3?.flagship?.activeId
      ? `${Math.min(100, Math.floor(((state.stage3?.flagship?.progress ?? 0) / (FLAGSHIP_PROJECTS.find((p) => p.id === state.stage3?.flagship?.activeId)?.progressRequired ?? 1)) * 100))}%`
      : "",
  };

  const iterationHistory = endgameMode(state)
    ? SINGULARITY_MULTIPLIERS.slice(0, Math.min(3, state.technologyIterationCount)).map((multiplier, index) => ({
        count: index + 1,
        label: `第${index + 1}次技术迭代`,
        multiplier: `×${multiplier}`,
      }))
    : [];
  const singularityCores = endgameMode(state)
    ? ["core_1", "core_2", "core_3"].map((id, index) => ({
        id,
        label: `奇点核心 ${index + 1}`,
        claimed: claimedCoreIds.has(id),
      }))
    : [];
  const civilizationStages: GrowthHistoryVM["civilizationStages"] = [
    { id: "stage1", name: "AI 创业工作室", reached: true, reachedAtMs: state.createdAtMs },
    { id: "stage2", name: "服务器集群", reached: state.serverCount > 0, reachedAtMs: state.stage2?.completedAtMs ?? 0 },
    { id: "stage3", name: "算力中心", reached: stage3Entered, reachedAtMs: state.stage3?.enteredAtMs ?? 0 },
    { id: "stage4", name: STAGE4_IDENTITY, reached: s4Entered, reachedAtMs: state.singularity?.stage4?.enteredAtMs ?? 0 },
    { id: "stage5", name: STAGE5_IDENTITY, reached: s5Entered, reachedAtMs: state.singularity?.stage5?.enteredAtMs ?? 0 },
  ];
  const archivedEras = new Map<string, { name: string; reached: boolean; reachedAtMs: number }>();
  for (const era of state.stage3?.eraArchive ?? []) {
    const definition = ERAS.find((candidate) => candidate.id === era.id);
    archivedEras.set(era.id, { name: definition?.name ?? era.id, reached: true, reachedAtMs: era.reachedAtMs });
  }
  if (s4Entered) archivedEras.set("stage4_lunar", { name: "地月算力纪元", reached: true, reachedAtMs: state.singularity?.stage4?.enteredAtMs ?? 0 });
  if (s5Entered) archivedEras.set("stage5_galactic", { name: STAGE5_ERA_NAME, reached: true, reachedAtMs: state.singularity?.stage5?.enteredAtMs ?? 0 });
  const galacticEras = endgameMode(state)
    ? [...archivedEras.entries()].map(([id, era]) => ({ id, ...era }))
    : [];
  const growthHistory: GrowthHistoryVM = {
    enabled: endgameMode(state),
    modelHistory: endgameMode(state) ? modelArchive : [],
    iterationHistory,
    singularityCores,
    civilizationStages: endgameMode(state) ? civilizationStages : [],
    galacticEras,
  };

  const iter = iterationSummary(state);
  const iteration: IterationVM = {
    canIterate: canIterate(state),
    requirementsMet: iterationRequirementsMet(state),
    machineRooms: iter.machineRooms,
    peakCompute: iter.peakCompute,
    peakIncomePerSec: iter.peakIncomePerSec,
    totalRequests: iter.totalRequests,
    models: iter.models,
    blueprints: iter.blueprints,
    resetItems: ["当前资金", "工作室等级与经验", "当前服务器", "当前机房与基础设施", "本轮模型训练等级", "本轮旗舰工程状态"],
    gainItems: ["技术迭代次数 +1", "永久收入倍率 ×2", "自动经营更早解锁", "服务器批量购买解锁", "模型研发速度永久 +25%"],
  };

  const nowMs = Date.now();
  const sponsorState = state.monetization.sponsor;
  const offlineCapacity = offlineCapacitySeconds(state);
  const incomeRemaining = incomeBoostRemainingSeconds(state, nowMs);
  const sponsor: SponsorVM = {
    pendingAdKind: state.monetization.pendingOffer?.kind ?? null,
    offlineCapacityLabel: formatTime(offlineCapacity),
    offlineCapacityProgress: Math.min(1, offlineCapacity / SPONSOR_OFFLINE_MAX_SECONDS),
    offlineAdsUsed: sponsorState.offlineAdsWatchedToday,
    offlineAdsMax: SPONSOR_OFFLINE_ADS_PER_DAY,
    canWatchOfflineAd:
      state.monetization.pendingOffer == null
      && sponsorState.offlineAdsWatchedToday < SPONSOR_OFFLINE_ADS_PER_DAY
      && offlineCapacity < SPONSOR_OFFLINE_MAX_SECONDS,
    incomeBoostRemainingLabel: formatTime(incomeRemaining),
    incomeBoostProgress: Math.min(1, incomeRemaining / SPONSOR_INCOME_MAX_REMAINING_SECONDS),
    incomeFreeUsed: sponsorState.incomeFreeChargesUsedToday,
    incomeFreeMax: SPONSOR_INCOME_FREE_CHARGES_PER_DAY,
    incomeAdsUsed: sponsorState.incomeAdsWatchedToday,
    incomeAdsMax: SPONSOR_INCOME_ADS_PER_DAY,
    canClaimFreeIncome:
      sponsorState.incomeFreeChargesUsedToday < SPONSOR_INCOME_FREE_CHARGES_PER_DAY
      && incomeRemaining < SPONSOR_INCOME_MAX_REMAINING_SECONDS,
    canWatchIncomeAd:
      state.monetization.pendingOffer == null
      && sponsorState.incomeAdsWatchedToday < SPONSOR_INCOME_ADS_PER_DAY
      && incomeRemaining < SPONSOR_INCOME_MAX_REMAINING_SECONDS,
    incomeBoostActive: incomeRemaining > 0,
  };

  // 主按钮
  let primaryAction: ViewModel["primaryAction"] = null;
  if (stage5Entered(state)) {
    primaryAction = {
      id: s5Pending ? "claim_stage5_reward" : s5Completed ? "继续经营戴森纪元" : "start_stage5_project",
      label: s5Pending
        ? "领取戴森算力球 · 主线完成"
        : s5Completed
          ? "继续经营（永续增长模式）"
          : "启动戴森算力球",
      enabled: s5Pending || !s5Completed,
    };
  } else if (stage4Entered(state) && s4Completed) {
    primaryAction = { id: "start_stage5", label: "启动戴森算力纪元", enabled: true };
  } else if (stage4Entered(state)) {
    primaryAction = {
      id: s4Pending ? "claim_stage4_reward" : "start_stage4_project",
      label: s4Pending ? "领取地月主线里程碑" : s4Completed ? "继续经营地月算力网" : "启动地月一体化算力网",
      enabled: s4Pending || !s4Completed,
    };
  } else if (state.singularity?.spacePlanRevealed === true && state.singularity.spacePlanStarted !== true) {
    primaryAction = { id: "start_space_plan", label: "启动地外算力计划", enabled: true };
  } else if (canClaimCore(state)) {
    primaryAction = { id: "claim_core", label: "领取奇点核心", enabled: true };
  } else if (canEndgameIterate(state)) {
    primaryAction = {
      id: "prestige",
      label: (currentRound(state) ?? 3) === 3 ? "揭示地外算力计划" : "执行下一次技术迭代",
      enabled: true,
    };
  } else if (!state.modelProgress) {
    primaryAction = { id: "acquire_model", label: "获取第一款模型", enabled: true };
  } else if (!state.automation && automationUnlocked(state)) {
    primaryAction = { id: "enable_automation", label: "开启自动经营", enabled: true };
  } else if (state.serverCount < MAX_SERVERS && nextDef) {
    primaryAction = {
      id: "buy_server",
      label: `购买${nextName ?? "服务器"}（${formatMoney(nextDef.cost)}）`,
      enabled: canBuyServer(state),
    };
  } else if (canPrestige(state)) {
    primaryAction = { id: "prestige", label: "进行技术迭代", enabled: true };
  }

  return {
    saveId: state.saveId,
    revision: state.revision,
    createdAtMs: state.createdAtMs,
    stage,
    stageLabel: stageLabelValue,
    stage3Gateway: gateway,
    money: perpetualActive(state) ? formatLiveMoney(state.money, s5IncomePerSec) : formatHeaderMoney(state.money),
    moneyRaw: new Decimal(state.money),
    incomePerSec: formatMoney(ips) + "/秒",
    lifetimeIncome: formatMoney(state.lifetimeIncome),
    compute: formatBig(stage3Entered ? compute3 : compute.mul(state.serverPower)),
    permanentMultiplier: "×" + formatBig(state.permanentMultiplier),
    iterationCount: state.technologyIterationCount,
    architecture: {
      unlockedCount: architectureCount,
      total: BLUEPRINTS.length,
      multiplier: architectureMultiplier(state).toFixed(2),
      nextServerCount: nextArchitectureServerCount,
      nextBlueprintName: nextArchitectureName,
    },
    model,
    modelArchive,
    growthHistory,
    legendaryArchive,
    achievements,
    research: {
      progress: state.modelResearch?.progress ?? 0,
      progressLabel: archiveComplete
        ? "模型蓝图已完成"
        : `${Math.floor(state.modelResearch?.progress ?? 0)} / 100`,
      canResearch: canResearchModel(state),
      archiveComplete,
      drawsInStage2: state.modelResearch?.stage2Draws ?? 0,
    },
    orderDisplay: buildOrderDisplay(state),
    orders,
    activeOrders,
    canAcceptAnyOrder: state.modelProgress != null && state.activeOrders.length < 4,
    automationUnlocked: automationUnlocked(state),
    automationEnabled: state.automation,
    automationCompletedOrders: state.completedOrders,
    automationThreshold: automationUnlockThreshold(state),
    workshop: buildWorkshopVM(state),
    trainPreview: buildTrainPreview(state),
    rental: {
      active: state.rentalCompute.active,
      costPerSec: formatMoney(rentalCostPerSec(state)) + "/秒",
      canEnable: canEnableRental(state),
    },
    server,
    center,
    stage2Settlement: {
      shown: state.stage2?.settlementShown ?? false,
      serverCount: state.serverCount,
      modelCount: state.ownedModelIds.length,
      totalCompute: formatBig(compute.mul(new Decimal(state.serverPower))),
      incomePerSec: formatMoney(ips) + "/秒",
      stageIncome: formatMoney(new Decimal(state.lifetimeIncome).minus(state.incomeAtLastPrestige || 0)),
      completedAtMs: state.stage2?.completedAtMs ?? 0,
    },
    prestige,
    stage3,
    iteration,
    singularity,
    stage4,
    stage5,
    offline,
    sponsor,
    primaryAction,
    pendingOfflineMoney: offline.hasPending ? offline.money : "",
    feel: buildFeelViewModel(state),
  };
}

function buildWorkshopVM(state: SaveData): ViewModel["workshop"] {
  const ws = state.workshop ?? { level: 1, experience: 0, experienceToNextLevel: 100, lifetimeRevenue: state.lifetimeIncome, firstServerAwarded: false };
  const fp = firstServerProgress(state);
  return {
    level: ws.level,
    experience: ws.experience,
    experienceToNextLevel: ws.experienceToNextLevel,
    lifetimeRevenue: formatMoney(lifetimeRevenue(state)),
    firstServer: {
      levelCurrent: fp.levelCurrent,
      levelTarget: fp.levelTarget,
      levelProgress: Math.min(1, fp.levelCurrent / Math.max(1, fp.levelTarget)),
      revenueCurrent: formatMoney(fp.revenueCurrent),
      revenueTarget: formatMoney(fp.revenueTarget),
      revenueProgress: Math.min(1, new Decimal(fp.revenueCurrent).div(Math.max(1, fp.revenueTarget)).toNumber()),
      met: fp.met,
      awarded: fp.awarded,
    },
  };
}

function buildTrainPreview(state: SaveData): ViewModel["trainPreview"] {
  if (!state.modelProgress) return null;
  if (!canTrain(state)) return null;
  const cost = trainCost(state);
  const computeNow = modelCompute(state);
  const preview = structuredClone(state);
  preview.modelProgress!.level += 1;
  const computeAfter = modelCompute(preview);
  const now = incomePerSecond(state);
  const after = incomePerSecond(preview);
  return {
    canTrain: true,
    computeNow: formatBig(computeNow),
    computeAfter: formatBig(computeAfter),
    incomeNow: formatMoney(now),
    incomeAfter: formatMoney(after),
    cost: formatMoney(cost),
  };
}

// ============ Stage 3 / 档案馆 ViewModel 扩展 ============

export interface InfrastructureVM {
  id: string;
  name: string;
  icon: string;
  level: number;
  maxLevel: number;
  upgradeCost: string;
  canUpgrade: boolean;
  desc: string;
  detail: string;
}

export interface MachineRoomVM {
  index: number;
  name: string;
  scaleName: string;
  commissioned: boolean;
  requirementsMet: boolean;
  requirements: { power: number; computeCards: number; optical: number; storage: number };
}

export interface FlagshipVM {
  id: string;
  name: string;
  icon: string;
  unlocked: boolean;
  canStart: boolean;
  completed: boolean;
  activeId: string | null;
  activeName: string | null;
  progress: number;
  progressLabel: string;
  progressRequired: number;
  totalCompute: string;
  pendingRewardId: string | null;
  pendingRewardName: string | null;
  rewardText: string;
  requirementsText: string;
}

export interface BottleneckVM {
  id: string;
  name: string;
  efficiency: number;
  upgradeEfficiency: number;
  projectedIncomeGain: string;
}

export interface BlueprintVM {
  id: string;
  name: string;
  icon: string;
  desc: string;
  owned: boolean;
  active: boolean;
  level: number;
}

export interface TechArchiveVM {
  id: string;
  name: string;
  desc: string;
  unlocked: boolean;
}

export interface EraArchiveVM {
  id: string;
  name: string;
  reached: boolean;
  real: boolean;
}

export interface Stage3VM {
  entered: boolean;
  entryMet: boolean;
  infrastructure: InfrastructureVM[];
  machineRooms: MachineRoomVM[];
  roomsOwned: number;
  flagship: FlagshipVM[];
  bottleneck: BottleneckVM;
  effectiveEfficiency: number;
  totalCompute: string;
  incomePerSec: string;
  commissionBonusActive: boolean;
  commissionBonusRemaining: string;
  blueprintChoice: "server3" | "server8" | null;
  blueprintChoiceLabel: string;
  blueprints: BlueprintVM[];
  techArchive: TechArchiveVM[];
  eraArchive: EraArchiveVM[];
  projectProgressLabel: string;
}

export interface IterationVM {
  canIterate: boolean;
  requirementsMet: boolean;
  machineRooms: number;
  peakCompute: string;
  peakIncomePerSec: string;
  totalRequests: string;
  models: number;
  blueprints: number;
  resetItems: string[];
  gainItems: string[];
}

/** CARD-01：顶部长期显示“奇点核心 n/3” */
export interface SingularityVM {
  active: boolean;
  label: string | null;
  round: number | null;
  coreClaimable: boolean;
  iterationReady: boolean;
  spacePlanRevealed: boolean;
  spacePlanStarted: boolean;
}

/** CARD-02：Stage 4 地月算力网视图 */
export interface Stage4VM {
  active: boolean;
  entered: boolean;
  identity: string;
  motivationTitle: string;
  motivationText: string;
  cosmicModelName: string | null;
  nodes: Array<{
    id: string;
    name: string;
    icon: string;
    cost: string;
    owned: boolean;
    canBuy: boolean;
  }>;
  ownedNodeCount: number;
  batchUnlocked: boolean;
  canBuyMaxNodes: boolean;
  incomePerSec: string;
  nodeMult: string;
  finalProject: {
    name: string;
    icon: string;
    progressLabel: string;
    canStart: boolean;
    active: boolean;
    pendingReward: boolean;
    completed: boolean;
    rewardText: string;
  };
}

/** CARD-03：Stage 5 戴森算力纪元视图 */
export interface Stage5VM {
  active: boolean;
  entered: boolean;
  identity: string;
  cosmicModelName: string | null;
  nodes: Array<{
    id: string;
    name: string;
    icon: string;
    cost: string;
    owned: boolean;
    canBuy: boolean;
  }>;
  ownedNodeCount: number;
  incomePerSec: string;
  nodeMult: string;
  finalProject: {
    name: string;
    icon: string;
    progressLabel: string;
    canStart: boolean;
    active: boolean;
    pendingReward: boolean;
    completed: boolean;
    rewardText: string;
  };
  storyCompleted: boolean;
  perpetualActive: boolean;
}
