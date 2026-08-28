// ViewModel：UI 只读快照。所有命令经 GameSession 执行，UI 不直接改状态。
import Decimal from "decimal.js";
import {
  BLUEPRINT_LEVEL_MILESTONES,
  SERVER_SCALE_MILESTONES,
  TALENT_NODES,
  TALENT_NODE_MAX_LEVEL,
  blueprintGrowthMultiplier,
  blueprintUpgradeRatio,
  blueprintUpgradeCost,
  effectiveServerPower,
  ensureGrowthState,
  quoteBlueprintLevels,
  quoteServerScaleUnits,
  recommendedBlueprintId,
  serverScaleMultiplier,
  serverScaleUpgradeRatio,
  serverScaleUnitCost,
  syncTalentPoints,
  talentPointsAvailable,
  talentPointsSpent,
} from "./incremental-growth";
import { ACHIEVEMENT_TALENT_POINTS, ACHIEVEMENTS, claimableAchievementCount, evaluateAchievements } from "./achievements";
import {
  MODEL_ARCHIVE_MAX_LEVEL,
  MODEL_TRAINING_MAX_LEVEL,
  ORDER_QUEUE_EFFECTIVE_PARALLELISM,
  ORDER_QUEUE_CAP,
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
  infrastructureReadiness,
  infrastructureUpgradeCost,
  iterationSummary,
  projectConstructionCost,
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
  projectById,
  roomById,
} from "../data/stage3";
import { formatBig, formatHeaderMoney, formatLiveMoney, formatMoney, formatTime } from "../core/big";
import { formatPercent, t } from "../i18n";
import {
  automationIncomePerSec,
  automationUnlockThreshold,
  automationUnlocked,
  canAcceptOrder,
  canBuyServer,
  canBuyMaxServers,
  canEnableRental,
  canPrestige,
  canResearchModel,
  canTrain,
  currentStage,
  enableAutomation,
  incomePerSecond,
  ensureOrderAccess,
  isOrderUnlocked,
  modelCompute,
  modelLevel,
  nextServerCost,
  nextServerDef,
  orderById,
  orderDisplayMode,
  orderNet,
  orderSlotCapacity,
  orderUnlockCost,
  ordersPerSecond,
  prestigePreview,
  rentalCostPerSec,
  stage3Gateway,
  stageLabel,
  trainCost,
  type OrderDisplayMode,
} from "./engine";
import type { ChronicleMilestoneId, OfflineReward, SaveData } from "../save/types";
import { businessMixForState, modelEffectMultipliers, modelRoleEffectText } from "./model-effects";
import {
  incomeBoostRemainingSeconds,
  SPONSOR_INCOME_ADS_PER_DAY,
  SPONSOR_INCOME_FREE_CHARGES_PER_DAY,
  SPONSOR_INCOME_MAX_REMAINING_SECONDS,
} from "./sponsor";
import {
  OFFLINE_AD_SLICE_LIMIT,
  OFFLINE_MAX_SECONDS,
  offlineAdExpansionAvailable,
  offlineRemainingSec,
  offlineRewardSettled,
} from "../save/offline";
import { buildFeelViewModel, type FeelViewModel } from "./feel";
import { CHRONICLE_MILESTONE_IDS } from "./chronicle";
import { companyLevelProgress } from "./company-level";
import { isOrderSlotIndex } from "../save/order-slots";

/** 只改变玩家看到的算力单位，所有经济计算仍使用原始值。 */
function formatDisplayedCompute(value: Decimal.Value): string {
  return formatBig(new Decimal(value).mul(1000));
}

function orderTaskProgress(remainingSec: number, durationSec: number): number {
  return Math.min(1, Math.max(0, 1 - remainingSec / Math.max(1, durationSec)));
}

/**
 * 订单标签与进度条共用同一真实进度源。
 * 处理中最多展示 99%，避免取整后在订单结算前提前显示 100%。
 */
function orderProgressLabel(progress: number, completed: boolean): string {
  const wholePercent = completed ? 100 : Math.min(99, Math.floor(progress * 100));
  return formatPercent(wholePercent / 100);
}

export interface OrderRowVM {
  order: OrderDef;
  netIncome: string;
  rentalCost: string;
  gross: string;
  canAccept: boolean;
  queueCount: number;
  readyCount: number;
  queueCapacity: number;
  recommended: boolean;
  unlocked: boolean;
  canUnlock: boolean;
  unlockCost: string;
  canExpandSlot: boolean;
  nextSlotCost: string;
  tasks: Array<{ progress: number; progressLabel: string } | null>;
}

export interface ActiveOrderVM {
  orderIndex: number;
  orderId: string;
  name: string;
  icon: string;
  status: "processing" | "ready" | "claimed";
  progress: number;
  progressLabel: string;
}

export interface ModelVM {
  id: string | null;
  acquired: boolean;
  name: string;
  icon: string;
  level: number;
  maxLevel: number;
  blueprintLevel: number;
  blueprintMaxLevel: number;
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
  /** 模型职责描述；即使未解锁也展示，帮助玩家理解未来价值。 */
  description: string;
  /** 未解锁时展示的条件 i18n key。 */
  unlockHint: string;
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
  buyMaxCount: number;
  buyMaxCost: string;
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
  /** 剩余未领取资金（已解锁但未入账部分）。 */
  money: string;
  /** 已领取入账时长。 */
  paidLabel: string;
  /** 剩余可领时长（0 表示已领完）。 */
  remainingLabel: string;
  /** 本次会话是否已全部结算（无未领部分且广告也无法再扩容）。 */
  allSettled: boolean;
  /** 是否仍可通过广告扩容（免费部分领取后仍可继续）。 */
  canWatchOfflineAd: boolean;
  /** 当前已解锁且尚未领取的完整离线收益。 */
  canClaim: boolean;
  elapsedLabel: string;
  /** CARD-04 回归回执：本次离线实际时长（超出部分未计入展示） */
  rawElapsedLabel: string;
  /** CARD-04 回归回执：本阶段离线上限 */
  capLabel: string;
  /** 本次真实离线中还能通过广告补领到的有效上限。 */
  eligibleLabel: string;
  /** 已在本回归会话中完成的扩容广告次数。 */
  adUnlocksUsed: number;
  adUnlocksMax: number;
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
  /** 当前仍可观看的广告次数（按两类权益的剩余额度合计）。 */
  availableAdCount: number;
  /** 是否有一笔尚未结算的离线回归；无回归时离线扩容入口必须保持不可用。 */
  offlineReturnReady: boolean;
  /** 当前待领取回执的已解锁时长。 */
  offlineCapacityLabel: string;
  /** 本次离线可领取的有效总时长。 */
  offlineEligibleLabel: string;
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

export interface IncrementalGrowthVM {
  blueprintMultiplier: string;
  scaleMultiplier: string;
  totalMultiplier: string;
  recommendedBlueprintId: string | null;
  blueprints: Array<{
    id: string;
    name: string;
    owned: boolean;
    level: number;
    maxLevel: number;
    nextCost: string;
    canBuy: boolean;
    tenCount: number;
    tenCost: string;
    maxCount: number;
    maxCost: string;
    projectedCompute: string;
    projectedIncome: string;
    nextMilestone: number | null;
    milestoneProgress: number;
  }>;
  selectedServerId: string | null;
  serverLines: Array<{
    id: string;
    index: number;
    name: string;
    owned: boolean;
    units: number;
    nextCost: string;
    canBuy: boolean;
    tenCount: number;
    tenCost: string;
    maxCount: number;
    maxCost: string;
    projectedCompute: string;
    projectedIncome: string;
    nextMilestone: number | null;
    milestoneProgress: number;
  }>;
  talent: {
    earned: number;
    spent: number;
    available: number;
    /** 荣誉馆当前可领取的成就数（新天赋点来源）。 */
    claimableAchievements: number;
    nodes: Array<{
      id: import("../save/types").TalentNodeId;
      branch: "blueprint" | "scale";
      tier: number;
      nameKey: string;
      descriptionKey: string;
      level: number;
      maxLevel: number;
      canAllocate: boolean;
    }>;
  };
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
  company: {
    level: number;
    experience: number;
    experienceToNextLevel: number;
    progress: number;
    title: string;
  };
  model: ModelVM;
  modelArchive: ModelArchiveVM[];
  growthHistory: GrowthHistoryVM;
  legendaryArchive: LegendaryArchiveVM | null;
  achievements: AchievementVM[];
  research: ResearchVM;
  growth: IncrementalGrowthVM;
  orderDisplay: OrderDisplayVM;
  orders: OrderRowVM[];
  /** 所有已解锁订单独立四格中的空余槽位总数。 */
  orderEmptySlotCount: number;
  activeOrders: ActiveOrderVM[];
  canAcceptAnyOrder: boolean;
  automationUnlocked: boolean;
  automationEnabled: boolean;
  automationReadyCount: number;
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
  chronicle: ChronicleVM;
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
  /** CARD-03：达成时快照的阶段编号（1–5；0=旧档无记录）。 */
  stage: number;
  /** CARD-03：达成时快照的工作室等级（0=旧档无记录）。 */
  workshopLevel: number;
  /** 负责人验收反馈：已达成后可在荣誉馆手动领取天赋点。 */
  claimed: boolean;
  claimable: boolean;
  talentPoints: number;
}

/**
 * 银河历程册只读展示：与当前账号的云档一起保存，但绝不提交到平台排行榜。
 * 所有时间均已在会话层按“只增不减”规则冻结，页面只负责解释该事实。
 */
export interface ChronicleVM {
  cumulativeIncome: string;
  stageLabel: string;
  workshopLevel: number;
  clockAdjustmentCount: number;
  lastClockAdjustmentAtMs: number;
  milestones: Array<{
    id: ChronicleMilestoneId;
    achievedAtMs: number;
  }>;
}

function buildOrderDisplay(state: SaveData): OrderDisplayVM {
  const mode = orderDisplayMode(state);
  const compute = modelCompute(state);
  const serverPower = effectiveServerPower(state);
  const permanent = new Decimal(state.permanentMultiplier);
  const ops = ordersPerSecond(state);
  const mix = businessMixForState(state);
  // 业务流水聚合与四槽位置速度共用 1.875 的有效并行系数。
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
    .mul(ORDER_QUEUE_EFFECTIVE_PARALLELISM)
    .mul(architectureMultiplier(state))
    .mul(techPassiveMultipliers(state).income)
    .mul(modelEffects.income)
    .mul(modelEffects.automation);
  const gross = grossPerSlotSec.mul(compute).mul(serverPower).mul(incomeMult);
  const net = netPerSlotSec.mul(compute).mul(serverPower).mul(incomeMult);
  const cost = gross.minus(net);
  const summaryText =
    mode === "compute"
      ? t("order.summaryCompute", { ops: ops.toFixed(1), income: formatMoney(net), total: formatDisplayedCompute(compute.mul(serverPower)) })
      : mode === "flow"
        ? t("order.summaryFlow", { ops: ops.toFixed(1), income: formatMoney(net) })
        : t("order.summarySingle", { ops: ops.toFixed(2) });
  return {
    mode,
    opsPerSec: ops.toFixed(mode === "single" ? 2 : 1),
    grossPerSec: formatMoney(gross),
    costPerSec: formatMoney(cost),
    netPerSec: formatMoney(net),
    totalCompute: formatDisplayedCompute(compute.mul(serverPower)),
    recentIncomeLabel: "",
    summaryText,
  };
}

export function buildViewModel(state: SaveData): ViewModel {
  ensureGrowthState(state);
  syncTalentPoints(state);
  ensureOrderAccess(state);
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
  const company = companyLevelProgress(state);
  // 顶部显示真实正在发生的自动收入；未开启自动经营时不展示潜在产能为收入。
  const ips = state.automation ? incomePerSecond(state) : new Decimal(0);
  const gateway = stage3Gateway(state);
  const claimedCoreIds = new Set(state.singularity?.coresClaimed ?? []);

  // 模型
  const modelDef = state.modelProgress
    ? MODELS.find((m) => m.id === state.modelProgress!.modelId)
    : null;
  const modelAtMaxLevel = modelDef != null && modelLevel(state) >= MODEL_TRAINING_MAX_LEVEL;
  const model: ModelVM = {
    id: modelDef?.id ?? null,
    acquired: state.modelProgress != null,
    name: modelDef?.name ? t(modelDef.name) : t("model.notAcquired"),
    icon: modelDef?.icon ?? "❓",
    level: modelLevel(state),
    maxLevel: modelDef ? MODEL_TRAINING_MAX_LEVEL : 0,
    blueprintLevel: modelDef ? state.modelArchive?.[modelDef.id]?.level ?? 0 : 0,
    blueprintMaxLevel: MODEL_ARCHIVE_MAX_LEVEL,
    compute: formatDisplayedCompute(compute),
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
      description: definition.desc,
      unlockHint: definition.id === "codex" ? "model.unlock.initial" : "model.unlock.research",
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

  const nextMilestone = (value: number, milestones: readonly number[]): number | null =>
    milestones.find((threshold) => threshold > value) ?? null;
  const milestoneProgress = (value: number, milestones: readonly number[]): number => {
    const next = nextMilestone(value, milestones);
    if (next == null) return 1;
    const previous = [...milestones].reverse().find((threshold) => threshold <= value) ?? 0;
    return Math.min(1, Math.max(0, (value - previous) / Math.max(1, next - previous)));
  };
  const growthState = state.growth;
  const recommendedId = recommendedBlueprintId(state);
  const blueprintMult = blueprintGrowthMultiplier(state);
  const scaleMult = serverScaleMultiplier(state);
  const availablePoints = talentPointsAvailable(state);
  const spentPoints = talentPointsSpent(state);
  const totalComputeNow = state.stage3?.entered
    ? stage3TotalCompute(state)
    : compute.mul(effectiveServerPower(state));
  const incomeNow = state.automation ? incomePerSecond(state) : new Decimal(0);
  const growth: IncrementalGrowthVM = {
    blueprintMultiplier: `×${blueprintMult.toFixed(2)}`,
    scaleMultiplier: `×${scaleMult.toFixed(2)}`,
    totalMultiplier: `×${blueprintMult.mul(scaleMult).toFixed(2)}`,
    recommendedBlueprintId: recommendedId,
    blueprints: MODELS.map((definition) => {
      const level = state.modelArchive?.[definition.id]?.level ?? 0;
      // 首款模型获得后，尚未收录的蓝图也可从 Lv.0 开始付费投入。
      const cost = state.modelProgress && level < MODEL_ARCHIVE_MAX_LEVEL
        ? blueprintUpgradeCost(state, definition.id)
        : null;
      const previewRatio = blueprintUpgradeRatio(state, definition.id, 1);
      const tenQuote = quoteBlueprintLevels(state, definition.id, 10);
      const maxQuote = quoteBlueprintLevels(state, definition.id, "max");
      return {
        id: definition.id,
        name: definition.name,
        owned: level > 0,
        level,
        maxLevel: MODEL_ARCHIVE_MAX_LEVEL,
        nextCost: cost ? formatMoney(cost) : "—",
        canBuy: cost != null && new Decimal(state.money).gte(cost),
        tenCount: tenQuote.count,
        tenCost: formatMoney(tenQuote.total),
        maxCount: maxQuote.count,
        maxCost: formatMoney(maxQuote.total),
        projectedCompute: formatDisplayedCompute(totalComputeNow.mul(previewRatio)),
        projectedIncome: formatMoney(incomeNow.mul(previewRatio)),
        nextMilestone: nextMilestone(level, BLUEPRINT_LEVEL_MILESTONES),
        milestoneProgress: milestoneProgress(level, BLUEPRINT_LEVEL_MILESTONES),
      };
    }),
    selectedServerId: state.serverCount > 0 ? SERVERS[Math.max(0, state.serverCount - 1)]?.id ?? null : null,
    serverLines: SERVERS.map((server) => {
      const units = growthState.serverUnits[server.id] ?? 0;
      const owned = state.serverCount >= server.index;
      const cost = owned ? serverScaleUnitCost(state, server.id) : null;
      const previewRatio = serverScaleUpgradeRatio(state, server.id, 1);
      const tenQuote = quoteServerScaleUnits(state, server.id, 10);
      const maxQuote = quoteServerScaleUnits(state, server.id, "max");
      return {
        id: server.id,
        index: server.index,
        name: server.name,
        owned,
        units,
        nextCost: cost ? formatMoney(cost) : "—",
        canBuy: cost != null && new Decimal(state.money).gte(cost),
        tenCount: tenQuote.count,
        tenCost: formatMoney(tenQuote.total),
        maxCount: maxQuote.count,
        maxCost: formatMoney(maxQuote.total),
        projectedCompute: formatDisplayedCompute(totalComputeNow.mul(previewRatio)),
        projectedIncome: formatMoney(incomeNow.mul(previewRatio)),
        nextMilestone: nextMilestone(units, SERVER_SCALE_MILESTONES),
        milestoneProgress: milestoneProgress(units, SERVER_SCALE_MILESTONES),
      };
    }),
    talent: {
      earned: growthState.talent.pointsEarned,
      spent: spentPoints,
      available: availablePoints,
      claimableAchievements: claimableAchievementCount(state),
      nodes: TALENT_NODES.map((node) => {
        const level = growthState.talent.allocations[node.id] ?? 0;
        const previous = node.tier > 1
          ? TALENT_NODES.find((candidate) => candidate.branch === node.branch && candidate.tier === node.tier - 1)
          : null;
        return {
          ...node,
          level,
          maxLevel: TALENT_NODE_MAX_LEVEL,
          canAllocate: availablePoints > 0
            && level < TALENT_NODE_MAX_LEVEL
            && (!previous || growthState.talent.allocations[previous.id] >= TALENT_NODE_MAX_LEVEL),
        };
      }),
    },
  };

  // 订单
  const orders: OrderRowVM[] = ORDERS.map((order) => {
    const net = orderNet(order);
    const rentalCost = new Decimal(order.gross).mul(order.rentalCostRatio);
    const unlocked = isOrderUnlocked(state, order.id);
    const queued = state.activeOrders.filter((active) => active.orderId === order.id);
    const tasks: OrderRowVM["tasks"] = Array.from({ length: ORDER_QUEUE_CAP }, () => null);
    for (const active of queued) {
      if (!isOrderSlotIndex(active.slotIndex)) continue;
      const progress = orderTaskProgress(active.remainingSec, order.durationSec);
      tasks[active.slotIndex] = {
        progress,
        progressLabel: orderProgressLabel(progress, active.status !== 0),
      };
    }
    return {
      order,
      netIncome: formatMoney(net),
      rentalCost: formatMoney(rentalCost),
      gross: formatMoney(order.gross),
      canAccept: canAcceptOrder(state, order.id),
      queueCount: queued.length,
      readyCount: queued.filter((active) => active.status === 1).length,
      queueCapacity: unlocked ? orderSlotCapacity(state, order.id) : ORDER_QUEUE_CAP,
      recommended: order.recommended,
      unlocked,
      canUnlock: !unlocked && !!state.modelProgress && new Decimal(state.money).gte(orderUnlockCost(order.id)),
      unlockCost: formatMoney(orderUnlockCost(order.id)),
      canExpandSlot: false,
      nextSlotCost: "—",
      tasks,
    };
  });

  const activeOrders: ActiveOrderVM[] = state.activeOrders.map((o, i) => {
    const def = orderById(o.orderId);
    const total = def ? def.durationSec : 1;
    const progress = orderTaskProgress(o.remainingSec, total);
    return {
      orderIndex: i,
      orderId: o.orderId,
      name: def?.name ?? o.orderId,
      icon: def?.icon ?? "📋",
      status: o.status === 0 ? "processing" : "ready",
      progress,
      progressLabel: orderProgressLabel(progress, o.status !== 0),
    };
  });
  const orderEmptySlotCount = state.modelProgress
    ? orders.reduce((total, order) => total + (order.unlocked
      ? Math.max(0, order.queueCapacity - order.queueCount)
      : 0), 0)
    : 0;

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
    phase === "center" ? t("server.phase.center")
    : phase === "scale" ? t("server.phase.scale")
    : phase === "cluster" ? t("server.phase.cluster")
    : phase === "own" ? t("server.phase.own")
    : t("server.phase.none");
  let serverBatchRemaining = new Decimal(state.money);
  let serverBatchCost = new Decimal(0);
  let serverBatchCount = 0;
  for (const candidate of SERVERS.slice(state.serverCount)) {
    const candidateCost = new Decimal(candidate.cost);
    if (serverBatchRemaining.lt(candidateCost)) break;
    serverBatchRemaining = serverBatchRemaining.minus(candidateCost);
    serverBatchCost = serverBatchCost.plus(candidateCost);
    serverBatchCount += 1;
  }
  const server: ServerVM = {
    ownedCount: state.serverCount,
    maxCount: MAX_SERVERS,
    nextName,
    nextCost: nextDef ? formatMoney(nextDef.cost) : null,
    canBuy: canBuyServer(state),
    batchUnlocked: batchPurchaseUnlocked(state) || state.technologyIterationCount > 0,
    canBuyMax: canBuyMaxServers(state),
    buyMaxCount: serverBatchCount,
    buyMaxCost: formatMoney(serverBatchCost),
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
    coreCount: Math.min(3, claimedCoreIds.size),
    round,
    coreClaimable,
    iterationReady: canEndgameIterate(state),
    spacePlanRevealed: state.singularity?.spacePlanRevealed === true,
    spacePlanRevealedAtMs: state.singularity?.spacePlanRevealedAtMs ?? 0,
    spacePlanStarted: state.singularity?.spacePlanStarted === true,
  };

  const s4Nodes = ownedNodes(state);
  const s4Active = state.singularity?.stage4?.activeProjectId === STAGE4_FINAL_PROJECT_ID;
  const s4Progress = state.singularity?.stage4?.projectProgress ?? 0;
  const s4Pending = hasPendingFinalReward(state);
  const s4Completed = (state.singularity?.stage4?.completedProjectIds ?? []).includes(STAGE4_FINAL_PROJECT_ID);
  const s4OwnedForQuote = new Set(s4Nodes);
  let s4BatchRemaining = new Decimal(state.money);
  let s4BatchCost = new Decimal(0);
  let s4BatchCount = 0;
  if (batchPurchaseUnlocked(state)) {
    for (let index = 0; index < STAGE4_NODES.length; index += 1) {
      const node = STAGE4_NODES[index];
      if (node.cost <= 0 || s4OwnedForQuote.has(node.id)) continue;
      if (index <= 0 || !s4OwnedForQuote.has(STAGE4_NODES[index - 1].id)) break;
      const cost = new Decimal(node.cost);
      if (s4BatchRemaining.lt(cost)) break;
      s4BatchRemaining = s4BatchRemaining.minus(cost);
      s4BatchCost = s4BatchCost.plus(cost);
      s4BatchCount += 1;
      s4OwnedForQuote.add(node.id);
    }
  }
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
      cost: n.cost <= 0 ? t("common.milestoneGranted") : formatMoney(n.cost),
      owned: s4Nodes.includes(n.id),
      canBuy: canBuyNode(state, n.id),
    })),
    ownedNodeCount: s4Nodes.length,
    batchUnlocked: batchPurchaseUnlocked(state),
    canBuyMaxNodes: batchPurchaseUnlocked(state) && STAGE4_NODES.some((n) => canBuyNode(state, n.id)),
    batchCount: s4BatchCount,
    batchCost: formatMoney(s4BatchCost),
    incomePerSec: formatMoney(s4Entered ? stage4IncomePerSecond(state) : new Decimal(0)) + t("unit.perSec"),
    nodeMult: s4Entered ? `×${nodeIncomeMultiplier(state).toFixed(2)}` : "",
    finalProject: {
      name: STAGE4_FINAL_PROJECT.name,
      icon: STAGE4_FINAL_PROJECT.icon,
      constructionCost: formatMoney(STAGE4_FINAL_PROJECT.constructionCost),
      progressLabel: s4Active
        ? `${Math.min(100, Math.floor((s4Progress / STAGE4_FINAL_PROJECT.progressRequired) * 100))}%`
        : s4Completed
          ? t("common.done")
          : s4Pending
            ? t("common.pendingClaim")
            : "",
      canStart: canStartFinalProject(state),
      active: s4Active,
      pendingReward: s4Pending,
      completed: s4Completed,
      rewardText: t("common.rewardText", { label: t("stage4.rewardLabel") }),
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
      cost: n.cost <= 0 ? t("common.milestoneGranted") : formatMoney(n.cost),
      owned: s5Nodes.includes(n.id),
      canBuy: canBuyS5Node(state, n.id),
    })),
    ownedNodeCount: s5Nodes.length,
    incomePerSec: formatMoney(s5IncomePerSec) + t("unit.perSec"),
    nodeMult: s5Entered ? `×${s5NodeMult(state).toFixed(2)}` : "",
    finalProject: {
      name: STAGE5_FINAL_PROJECT.name,
      icon: STAGE5_FINAL_PROJECT.icon,
      constructionCost: formatMoney(STAGE5_FINAL_PROJECT.constructionCost),
      progressLabel: s5Active
        ? `${Math.min(100, Math.floor((s5Progress / STAGE5_FINAL_PROJECT.progressRequired) * 100))}%`
        : s5Completed
          ? t("common.done")
          : s5Pending
            ? t("common.pendingClaim")
            : "",
      canStart: canStartDyson(state),
      active: s5Active,
      pendingReward: s5Pending,
      completed: s5Completed,
      rewardText: t("common.rewardText", { label: t("stage5.rewardLabel") }),
    },
    storyCompleted: state.singularity?.stage5?.storyCompleted === true,
    perpetualActive: perpetualActive(state),
  };

  const legendaryArchive: LegendaryArchiveVM | null = endgameMode(state) && state.singularity?.stage5?.legendaryArchive
    ? {
        completedAtMs: state.singularity.stage5.legendaryArchive.completedAtMs,
        maxCompute: formatDisplayedCompute(state.singularity.stage5.legendaryArchive.maxCompute),
        maxIncome: formatMoney(state.singularity.stage5.legendaryArchive.maxIncome),
        reachedEra: state.singularity.stage5.legendaryArchive.reachedEra,
      }
    : null;
  // 负责人验收反馈：成就改为荣誉馆手动领取，每个成就 +1 天赋点。
  const claimedAchievementIds = new Set(state.growth.talent.claimedAchievementIds);
  const achievementRecords = state.growth.talent.achievementRecords ?? {};
  const evaluatedAchievements = evaluateAchievements(state);
  const achievements: AchievementVM[] = ACHIEVEMENTS.map((definition) => {
    const status = evaluatedAchievements.find((item) => item.id === definition.id)!;
    const claimed = claimedAchievementIds.has(definition.id);
    // CARD-03：达成记录（领取时快照）；旧档缺失时回退到当前状态与判定时间。
    const record = achievementRecords[definition.id];
    return {
      id: definition.id,
      name: definition.nameKey,
      description: definition.descriptionKey,
      achieved: status.achieved,
      achievedAtMs: record?.achievedAtMs ?? status.achievedAtMs,
      stage: record?.stage ?? 0,
      workshopLevel: record?.workshopLevel ?? 0,
      claimed,
      claimable: status.achieved && !claimed,
      talentPoints: ACHIEVEMENT_TALENT_POINTS,
    };
  });

  const offline: OfflineVM = state.pendingOfflineReward
    ? buildOfflineVM(state.pendingOfflineReward)
    : {
        hasPending: false,
        money: "",
        paidLabel: "",
        remainingLabel: "",
        allSettled: false,
        canWatchOfflineAd: false,
        canClaim: false,
        elapsedLabel: "",
        rawElapsedLabel: "",
      capLabel: "",
      eligibleLabel: "",
      adUnlocksUsed: 0,
      adUnlocksMax: OFFLINE_AD_SLICE_LIMIT,
        excessLabel: "",
        researchProgress: 0,
        projectProgressDelta: 0,
        projectName: null,
      };

  function buildOfflineVM(reward: OfflineReward): OfflineVM {
    const rawSec = Math.max(0, reward.rawElapsedSec ?? reward.elapsedSec);
    const capSec = Math.max(0, reward.capSec ?? reward.elapsedSec);
    const eligibleSec = Math.min(capSec, Math.max(reward.elapsedSec, reward.eligibleSec ?? reward.elapsedSec));
    const excessSec = Math.max(0, rawSec - capSec);
    const unlocked = Math.min(eligibleSec, reward.elapsedSec);
    const paidSec = Math.min(unlocked, Math.max(0, Math.floor(reward.paidSec ?? 0)));
    const remainingSec = Math.max(0, unlocked - paidSec);
    const allSettled = offlineRewardSettled(reward);
    const rate = Number(reward.moneyPerSec) > 0
      ? new Decimal(reward.moneyPerSec)
      : reward.elapsedSec > 0
        ? new Decimal(reward.money).div(reward.elapsedSec)
        : new Decimal(0);
    const remainingMoney = formatMoney(rate.mul(remainingSec));
    const maxAds = Math.max(0, reward.adUnlocksMax ?? OFFLINE_AD_SLICE_LIMIT);
    return {
      hasPending: true,
      money: remainingMoney,
      paidLabel: formatTime(paidSec),
      remainingLabel: formatTime(remainingSec),
      allSettled,
      canWatchOfflineAd: false,
      canClaim: !allSettled && remainingSec > 0,
      elapsedLabel: formatTime(reward.elapsedSec),
      rawElapsedLabel: formatTime(rawSec),
      capLabel: formatTime(capSec),
      eligibleLabel: formatTime(eligibleSec),
      adUnlocksUsed: Math.max(0, reward.adUnlocksUsed ?? 0),
      adUnlocksMax: maxAds,
      excessLabel: excessSec > 0 ? formatTime(excessSec) : "",
      researchProgress: Math.max(0, reward.researchProgress ?? 0),
      projectProgressDelta: Math.max(0, reward.projectProgressDelta ?? 0),
      projectName: reward.projectName ?? null,
    };
  }

  // ---------- Stage 3 / 档案馆 ----------
  const stage3Entered = state.stage3?.entered === true;
  const bottleneck = bottleneckAnalysis(state);
  const infrastructureInsights = new Map(
    bottleneck.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const maximumInfrastructureGain = bottleneck.candidates.reduce(
    (maximum, candidate) => Decimal.max(maximum, candidate.gain),
    new Decimal(0),
  );
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
    const readiness = infrastructureReadiness(state, d.id);
    const insight = infrastructureInsights.get(d.id);
    let detail = "";
    if (d.id === "storage") {
      const preview = structuredClone(state);
      preview.stage3.infrastructure.storage = Math.min(10, lvl + 1);
      detail = `${t("stage3.flagshipRewardPreview")} ×${flagshipRewardMultiplier(state, previewProjectId).toFixed(2)} → ×${flagshipRewardMultiplier(preview, previewProjectId).toFixed(2)}`;
    }
    return {
      id: d.id,
      name: d.name,
      icon: d.icon,
      level: lvl,
      maxLevel: 10,
      upgradeCost: formatMoney(infrastructureUpgradeCost(state, d.id, lvl)),
      canUpgrade: canUpgradeInfrastructure(state, d.id),
      desc: d.desc,
      detail,
      nextRequirement: readiness.nextRequirement,
      isBottleneck: bottleneck.id === d.id,
      pressure: insight && maximumInfrastructureGain.gt(0)
        ? Math.min(1, Math.max(0, insight.gain.div(maximumInfrastructureGain).toNumber()))
        : 0,
      projectedIncomeGain: insight
        ? formatMoney(insight.gain) + t("unit.perSec")
        : formatMoney(0) + t("unit.perSec"),
      hasImmediateIncomeGain: insight?.gain.gt(0) ?? false,
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
      canCommission: canCommissionRoom(state, r.index),
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
      `${t("stage3.reqRooms")} ${roomsOwned}/${p.requiresRooms}`,
      `${t("stage3.reqCompute")} ${formatDisplayedCompute(compute3)}/${formatDisplayedCompute(p.requiresCompute)}`,
      `${t("stage3.reqOptical")} Lv.${infraLevel(state, "optical")}/Lv.${p.requiresOptical ?? 0}`,
      `${t("stage3.reqStorage")} Lv.${infraLevel(state, "storage")}/Lv.${p.requiresStorage}`,
      `${t("stage3.constructionCost")} ${formatMoney(projectConstructionCost(state, p.id) ?? 0)}`,
    ];
    if (p.id === "project_2") {
      requirements.push(`${t("stage3.reqPrereq")}「${t("flagship.1.name")}」${(state.stage3?.flagship?.completedIds ?? []).includes("project_1") ? t("common.done") : t("stage3.notDone")}`);
    } else if (p.id === "project_3") {
      requirements.push(`${t("stage3.reqPrereq")}「${t("flagship.2.name")}」${(state.stage3?.flagship?.completedIds ?? []).includes("project_2") ? t("common.done") : t("stage3.notDone")}`);
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
      totalCompute: formatDisplayedCompute(compute3),
      pendingRewardId: pendingForThisProject ? p.id : null,
      pendingRewardName: pendingForThisProject ? p.name : null,
      rewardText: `${t("stage3.rewardMoney")} ${formatMoney(new Decimal(p.reward.money).mul(rewardMultiplier).floor())}（${t("stage3.rewardStorage")} ×${rewardMultiplier.toFixed(2)}）`,
      constructionCost: formatMoney(projectConstructionCost(state, p.id) ?? 0),
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
        `${t("stage3.reqRooms")} ${roomsOwned}/3`,
        `${t("stage3.reqPrereq")}「${t("flagship.3.name")}」${(state.stage3?.flagship?.completedIds ?? []).includes("project_3") ? t("common.done") : t("stage3.notDone")}`,
        `${t("stage3.constructionCost")} ${formatMoney(projectConstructionCost(state, eraDef.id) ?? 0)}`,
      ];
      if (previousCore) requirements.push(`${t("stage3.reqCore")} ${claimedCoreIds.has(previousCore) ? t("stage3.obtained") : t("stage3.notObtained")}`);
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
        totalCompute: formatDisplayedCompute(compute3),
        pendingRewardId: pendingForThisProject ? eraDef.id : null,
        pendingRewardName: pendingForThisProject ? eraDef.name : null,
        rewardText: `${t("stage3.roundReward")}${t("common.colon")}${round} / 3`,
        constructionCost: formatMoney(projectConstructionCost(state, eraDef.id) ?? 0),
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
    { id: "stage1", name: "civilization.stage1", reached: true, real: true },
    { id: "stage2", name: "civilization.stage2", reached: state.serverCount > 0 || state.stage2.completedAtMs > 0, real: true },
    { id: "stage3", name: "civilization.stage3", reached: stage3Entered, real: true },
    { id: "r1", name: "civilization.r1", reached: claimedCoreIds.has("core_1"), real: true },
    { id: "r2", name: "civilization.r2", reached: claimedCoreIds.has("core_2"), real: true },
    { id: "r3", name: "civilization.r3", reached: claimedCoreIds.has("core_3"), real: true },
    { id: "stage4", name: "civilization.stage4", reached: s4Entered, real: true },
    { id: "stage5", name: "civilization.stage5", reached: s5Entered, real: true },
    { id: "dyson", name: "civilization.dyson", reached: perpetualActive(state), real: true },
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
      projectedIncomeGain: formatMoney(bottleneck.projectedIncomeGain) + t("unit.perSec"),
    },
    effectiveEfficiency: eff,
        totalCompute: formatDisplayedCompute(compute3),
    incomePerSec: formatMoney(stage3Entered ? stage3IncomePerSecond(state) : new Decimal(0)) + t("unit.perSec"),
    commissionBonusActive: (state.stage3?.commissionBonusUntilMs ?? 0) > Date.now(),
    commissionBonusRemaining: (state.stage3?.commissionBonusUntilMs ?? 0) > Date.now()
      ? `${t("common.sec", { value: Math.max(0, Math.ceil(((state.stage3?.commissionBonusUntilMs ?? 0) - Date.now()) / 1000)) })}`
      : "",
    blueprintChoice,
    blueprintChoiceLabel: blueprintChoice === "server3"
      ? t("stage3.blueprintChoice3")
      : blueprintChoice === "server8"
        ? t("stage3.blueprintChoice8")
        : "",
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
        label: t("archive.iterationLabel", { count: index + 1 }),
        multiplier: `×${multiplier}`,
      }))
    : [];
  const singularityCores = endgameMode(state)
    ? ["core_1", "core_2", "core_3"].map((id, index) => ({
        id,
        label: t("archive.coreLabel", { count: index + 1 }),
        claimed: claimedCoreIds.has(id),
      }))
    : [];
  const civilizationStages: GrowthHistoryVM["civilizationStages"] = [
    { id: "stage1", name: t("civilization.stage1"), reached: true, reachedAtMs: state.createdAtMs },
    { id: "stage2", name: t("civilization.stage2"), reached: state.serverCount > 0, reachedAtMs: state.stage2?.completedAtMs ?? 0 },
    { id: "stage3", name: t("civilization.stage3"), reached: stage3Entered, reachedAtMs: state.stage3?.enteredAtMs ?? 0 },
    { id: "stage4", name: STAGE4_IDENTITY, reached: s4Entered, reachedAtMs: state.singularity?.stage4?.enteredAtMs ?? 0 },
    { id: "stage5", name: STAGE5_IDENTITY, reached: s5Entered, reachedAtMs: state.singularity?.stage5?.enteredAtMs ?? 0 },
  ];
  const archivedEras = new Map<string, { name: string; reached: boolean; reachedAtMs: number }>();
  for (const era of state.stage3?.eraArchive ?? []) {
    const definition = ERAS.find((candidate) => candidate.id === era.id);
    archivedEras.set(era.id, { name: definition?.name ?? era.id, reached: true, reachedAtMs: era.reachedAtMs });
  }
  if (s4Entered) archivedEras.set("stage4_lunar", { name: t("civilization.stage4"), reached: true, reachedAtMs: state.singularity?.stage4?.enteredAtMs ?? 0 });
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
    resetItems: ["prestige.reset.money", "prestige.reset.workshop", "prestige.reset.servers", "prestige.reset.rooms", "prestige.reset.models", "prestige.reset.flagship"],
    gainItems: ["prestige.gain.iteration", "prestige.gain.multiplier", "prestige.gain.earlierAutomation", "prestige.gain.bulkBuy", "prestige.gain.researchSpeed"],
  };

  const nowMs = Date.now();
  const sponsorState = state.monetization.sponsor;
  const pendingOffline = state.pendingOfflineReward && !offlineRewardSettled(state.pendingOfflineReward)
    ? state.pendingOfflineReward
    : null;
  const offlinePaidSec = pendingOffline
    ? Math.min(pendingOffline.elapsedSec, Math.max(0, Math.floor(pendingOffline.paidSec ?? 0)))
    : 2 * 60 * 60;
  const offlineEligible = pendingOffline
    ? Math.min(OFFLINE_MAX_SECONDS, Math.max(pendingOffline.elapsedSec, pendingOffline.eligibleSec ?? pendingOffline.elapsedSec))
    : 0;
  const offlineAdsUsed = pendingOffline?.adUnlocksUsed ?? 0;
  const offlineAdsMax = pendingOffline?.adUnlocksMax ?? OFFLINE_AD_SLICE_LIMIT;
  const incomeRemaining = incomeBoostRemainingSeconds(state, nowMs);
  const canWatchOfflineAd = false;
  const canWatchIncomeAd = false;
  const sponsor: SponsorVM = {
    pendingAdKind: null,
    availableAdCount: 0,
    offlineReturnReady: pendingOffline !== null,
    offlineCapacityLabel: formatTime(offlinePaidSec),
    offlineEligibleLabel: formatTime(offlineEligible),
    offlineCapacityProgress: pendingOffline ? Math.min(1, offlinePaidSec / Math.max(1, offlineEligible)) : 0,
    offlineAdsUsed,
    offlineAdsMax,
    canWatchOfflineAd,
    incomeBoostRemainingLabel: formatTime(incomeRemaining),
    incomeBoostProgress: Math.min(1, incomeRemaining / SPONSOR_INCOME_MAX_REMAINING_SECONDS),
    incomeFreeUsed: sponsorState.incomeFreeChargesUsedToday,
    incomeFreeMax: SPONSOR_INCOME_FREE_CHARGES_PER_DAY,
    incomeAdsUsed: sponsorState.incomeAdsWatchedToday,
    incomeAdsMax: SPONSOR_INCOME_ADS_PER_DAY,
    canClaimFreeIncome:
      sponsorState.incomeFreeChargesUsedToday < SPONSOR_INCOME_FREE_CHARGES_PER_DAY
      && incomeRemaining < SPONSOR_INCOME_MAX_REMAINING_SECONDS,
    canWatchIncomeAd,
    incomeBoostActive: incomeRemaining > 0,
  };
  const chronicle: ChronicleVM = {
    cumulativeIncome: formatMoney(state.lifetimeIncome),
    stageLabel: stageLabelValue,
    workshopLevel: state.workshop?.level ?? 1,
    clockAdjustmentCount: Math.max(0, Math.floor(state.chronicle?.clockAdjustmentCount ?? 0)),
    lastClockAdjustmentAtMs: Math.max(0, Math.floor(state.chronicle?.lastClockAdjustmentAtMs ?? 0)),
    milestones: CHRONICLE_MILESTONE_IDS.map((id) => ({
      id,
      achievedAtMs: Math.max(0, Math.floor(state.chronicle?.milestones[id] ?? 0)),
    })),
  };

  // 主按钮
  let primaryAction: ViewModel["primaryAction"] = null;
  if (stage5Entered(state)) {
    primaryAction = {
      id: s5Pending ? "claim_stage5_reward" : s5Completed ? "continue_stage5" : "start_stage5_project",
      label: s5Pending
        ? t("primary.claimDyson")
        : s5Completed
          ? t("primary.continueDyson")
          : t("primary.startDyson"),
      enabled: s5Pending || !s5Completed,
    };
  } else if (stage4Entered(state) && s4Completed) {
    primaryAction = { id: "start_stage5", label: t("stage4.enterDyson"), enabled: true };
  } else if (stage4Entered(state)) {
    primaryAction = {
      id: s4Pending ? "claim_stage4_reward" : "start_stage4_project",
      label: s4Pending ? t("feel.action.claimStage4") : s4Completed ? t("primary.continueLunar") : t("primary.startMoonNetwork"),
      enabled: s4Pending || !s4Completed,
    };
  } else if (state.singularity?.spacePlanRevealed === true && state.singularity.spacePlanStarted !== true) {
    primaryAction = { id: "start_space_plan", label: t("feel.action.startSpacePlan"), enabled: true };
  } else if (canClaimCore(state)) {
    primaryAction = { id: "claim_core", label: t("feel.action.claimCore"), enabled: true };
  } else if (canEndgameIterate(state)) {
    primaryAction = {
      id: "prestige",
      label: (currentRound(state) ?? 3) === 3 ? t("core.revealPlan") : t("prestige.executeNext"),
      enabled: true,
    };
  } else if (!state.modelProgress) {
    primaryAction = { id: "acquire_model", label: t("action.acquireModel"), enabled: true };
  } else if (!state.automation && automationUnlocked(state)) {
    primaryAction = { id: "enable_automation", label: t("action.enableAutomation"), enabled: true };
  } else if (state.serverCount < MAX_SERVERS && nextDef) {
    primaryAction = {
      id: "buy_server",
      label: t("primary.buyServer", { name: nextName ?? t("server.server"), cost: formatMoney(nextDef.cost) }),
      enabled: canBuyServer(state),
    };
  } else if (canPrestige(state)) {
    primaryAction = { id: "prestige", label: t("action.prestige"), enabled: true };
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
    incomePerSec: formatMoney(ips) + t("unit.perSec"),
    lifetimeIncome: formatMoney(state.lifetimeIncome),
    compute: formatDisplayedCompute(stage3Entered ? compute3 : compute.mul(effectiveServerPower(state))),
    permanentMultiplier: "×" + formatBig(state.permanentMultiplier),
    iterationCount: state.technologyIterationCount,
    architecture: {
      unlockedCount: architectureCount,
      total: BLUEPRINTS.length,
      multiplier: architectureMultiplier(state).toFixed(2),
      nextServerCount: nextArchitectureServerCount,
      nextBlueprintName: nextArchitectureName,
    },
    company: {
      level: company.level,
      experience: Math.floor(company.experience),
      experienceToNextLevel: Math.ceil(company.experienceToNextLevel),
      progress: company.progress,
      title: company.titleKey,
    },
    model,
    modelArchive,
    growthHistory,
    legendaryArchive,
    achievements,
    research: {
      progress: state.modelResearch?.progress ?? 0,
      progressLabel: archiveComplete
        ? t("model.archiveComplete")
        : `${Math.floor(state.modelResearch?.progress ?? 0)} / 100`,
      canResearch: canResearchModel(state),
      archiveComplete,
      drawsInStage2: state.modelResearch?.stage2Draws ?? 0,
    },
    growth,
    orderDisplay: buildOrderDisplay(state),
    orders,
    orderEmptySlotCount,
    activeOrders,
    canAcceptAnyOrder: state.modelProgress != null && orders.some((order) => order.canAccept),
    automationUnlocked: automationUnlocked(state),
    automationEnabled: state.automation && state.serverCount > 0,
    automationReadyCount: state.activeOrders.filter((order) => order.status === 1).length,
    automationCompletedOrders: state.completedOrders,
    automationThreshold: automationUnlockThreshold(state),
    workshop: buildWorkshopVM(state),
    trainPreview: buildTrainPreview(state),
    rental: {
      active: state.rentalCompute.active,
      costPerSec: formatMoney(rentalCostPerSec(state)) + t("unit.perSec"),
      canEnable: canEnableRental(state),
    },
    server,
    center,
    stage2Settlement: {
      shown: state.stage2?.settlementShown ?? false,
      serverCount: state.serverCount,
      modelCount: state.ownedModelIds.length,
      totalCompute: formatDisplayedCompute(compute.mul(effectiveServerPower(state))),
      incomePerSec: formatMoney(ips) + t("unit.perSec"),
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
    chronicle,
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
    // 旧存档可能在 workshop 冗余字段中留下较早值；顶部累计营业额必须以主账本为准，
    // 并在两个来源同时存在时取较大值，避免回归后显示倒退或像是“消失”。
    lifetimeRevenue: formatMoney(Decimal.max(lifetimeRevenue(state), new Decimal(state.lifetimeIncome))),
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
    computeNow: formatDisplayedCompute(computeNow),
    computeAfter: formatDisplayedCompute(computeAfter),
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
  nextRequirement: number | null;
  isBottleneck: boolean;
  pressure: number;
  projectedIncomeGain: string;
  hasImmediateIncomeGain: boolean;
}

export interface MachineRoomVM {
  index: number;
  name: string;
  scaleName: string;
  commissioned: boolean;
  requirementsMet: boolean;
  canCommission: boolean;
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
  constructionCost: string;
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
  /** 已实际领取的奇点核心数量；庆典不得再用等级冒充。 */
  coreCount: number;
  round: number | null;
  coreClaimable: boolean;
  iterationReady: boolean;
  spacePlanRevealed: boolean;
  spacePlanRevealedAtMs: number;
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
  batchCount: number;
  batchCost: string;
  incomePerSec: string;
  nodeMult: string;
  finalProject: {
    name: string;
    icon: string;
    constructionCost: string;
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
    constructionCost: string;
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
