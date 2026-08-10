import Decimal from "decimal.js";
import {
  MAX_SERVERS,
  automationUnlocked,
  canBuyMaxServers,
  canBuyServer,
  canEnableRental,
  canResearchModel,
  canTrain,
  currentStage,
  incomePerSecond,
  modelCompute,
  nextServerDef,
} from "./engine";
import {
  bottleneckAnalysis,
  canCommissionRoom,
  canStartFlagship,
  canUpgradeInfrastructure,
  hasPendingFlagshipReward,
  stage3EntryMet,
  stage3TotalCompute,
} from "./stage3";
import {
  canClaimCore,
  canEndgameIterate,
  endgameMode,
} from "./singularity";
import {
  canBuyNode as canBuyStage4Node,
  canStartFinalProject as canStartStage4Project,
  hasPendingFinalReward as hasPendingStage4Reward,
  nodeIncomeMultiplier as stage4NodeMultiplier,
  ownedNodes as ownedStage4Nodes,
  STAGE4_FINAL_PROJECT,
  STAGE4_NODES,
  stage4Entered,
} from "./stage4";
import {
  canBuyNode as canBuyStage5Node,
  canStartFinalProject as canStartStage5Project,
  hasPendingFinalReward as hasPendingStage5Reward,
  nodeIncomeMultiplier as stage5NodeMultiplier,
  ownedNodes as ownedStage5Nodes,
  perpetualActive,
  STAGE5_FINAL_PROJECT,
  STAGE5_NODES,
  stage5Entered,
} from "./stage5";
import {
  FLAGSHIP_PROJECTS,
  INFRASTRUCTURES,
  MACHINE_ROOMS,
} from "../data/stage3";
import { SERVERS } from "../data/content";
import { formatBig, formatHeaderMoney, formatMoney, formatTime, toStoredBig } from "../core/big";
import type { SaveData } from "../save/types";

export type ComputeTier =
  | "idle"
  | "micro"
  | "studio"
  | "cluster"
  | "room"
  | "regional"
  | "lunar"
  | "stellar";

export interface FeelActionVM {
  id: string;
  label: string;
  anchorAction: string;
  priority: number;
  projectedIncomeGain?: string;
}

export interface FeelBottleneckSnapshot {
  id: string;
  name: string;
  efficiency: number;
}

export interface GrowthReviewVM {
  visible: boolean;
  fromLabel: string;
  currentLabel: string;
  elapsedLabel: string;
  computeLabel: string;
  incomeLabel: string;
  milestoneCount: number;
  summary: string;
}

export interface OfflineFeelPreviewVM {
  moneyBefore: string;
  moneyAfter: string;
  computeLabel: string;
  affordableAfterCount: number;
  recommendedAfterLabel: string | null;
}

export interface FeelViewModel {
  computeTier: ComputeTier;
  computeLabel: "总算力" | "地球基底算力";
  computeValue: string;
  computeRaw: string;
  incomeValue: string;
  incomeRaw: string;
  moneyValue: string;
  moneyRaw: string;
  activity01: number;
  cosmicNodeOwned: number | null;
  cosmicNodeTotal: number | null;
  cosmicMultiplier: string | null;
  activeProjectProgress01: number | null;
  affordableActions: FeelActionVM[];
  bottleneck: FeelBottleneckSnapshot | null;
  growthReview: GrowthReviewVM;
  offlinePreview: OfflineFeelPreviewVM | null;
}

export type GrowthFeedbackKind = "minor" | "major" | "scale" | "bottleneck" | "offline";

export interface GrowthFeedbackEvent {
  command: string;
  kind: GrowthFeedbackKind;
  headline: string;
  detail: string;
  durationMs: number;
  tierChanged: boolean;
  moneyIncreased: boolean;
}

const EARTH_TIER_LIMITS: ReadonlyArray<{ min: Decimal.Value; tier: ComputeTier }> = [
  { min: 10_000, tier: "regional" },
  { min: 1_000, tier: "room" },
  { min: 100, tier: "cluster" },
  { min: 10, tier: "studio" },
  { min: 1, tier: "micro" },
];

export function resolveComputeTier(value: Decimal.Value, stage: number): ComputeTier {
  if (stage >= 5) return "stellar";
  if (stage === 4) return "lunar";
  const compute = new Decimal(value);
  for (const candidate of EARTH_TIER_LIMITS) {
    if (compute.gte(candidate.min)) return candidate.tier;
  }
  return "idle";
}

export function activityFromIncome(value: Decimal.Value): number {
  const income = new Decimal(value);
  if (!income.isFinite() || income.lte(0)) return 0;
  const logarithmic = Math.log10(income.plus(1).toNumber()) / 14;
  return Math.max(0.12, Math.min(1, logarithmic));
}

function addAction(target: Map<string, FeelActionVM>, candidate: FeelActionVM | null): void {
  if (!candidate) return;
  const existing = target.get(candidate.id);
  if (!existing || candidate.priority > existing.priority) target.set(candidate.id, candidate);
}

function serverName(index: number): string {
  return SERVERS.find((candidate) => candidate.index === index)?.name ?? "服务器";
}

/**
 * 只读汇总真实 canX 结果。这里不执行命令、不修改成本，也不创造第二套购买入口。
 */
export function buildAffordableActions(state: SaveData): FeelActionVM[] {
  const actions = new Map<string, FeelActionVM>();
  const s4 = stage4Entered(state);
  const s5 = stage5Entered(state);
  const stage3 = state.stage3?.entered === true;

  const pendingFlagship = hasPendingFlagshipReward(state);
  if (pendingFlagship) {
    const definition = FLAGSHIP_PROJECTS.find((project) => project.id === pendingFlagship);
    addAction(actions, {
      id: "claim_flagship_reward",
      label: `领取${definition?.name ?? "时代工程"}成果`,
      anchorAction: "claim_flagship_reward",
      priority: 130,
    });
  }
  if (s5 && hasPendingStage5Reward(state)) {
    addAction(actions, { id: "claim_stage5_reward", label: "领取银河主线里程碑", anchorAction: "claim_stage5_reward", priority: 140 });
  }
  if (s4 && !s5 && hasPendingStage4Reward(state)) {
    addAction(actions, { id: "claim_stage4_reward", label: "领取地月主线里程碑", anchorAction: "claim_stage4_reward", priority: 140 });
  }
  if (canClaimCore(state)) {
    addAction(actions, { id: "claim_core", label: "领取奇点核心", anchorAction: "claim_core", priority: 135 });
  }
  if (canEndgameIterate(state)) {
    addAction(actions, { id: "prestige", label: "推进下一轮技术迭代", anchorAction: "prestige", priority: 125 });
  }
  if (state.singularity?.spacePlanRevealed === true && state.singularity.spacePlanStarted !== true) {
    addAction(actions, { id: "start_space_plan", label: "启动地外算力计划", anchorAction: "start_space_plan", priority: 125 });
  }

  if (!state.modelProgress) {
    addAction(actions, { id: "acquire_model", label: "获取第一款模型", anchorAction: "acquire_model", priority: 120 });
  } else if (!state.automation && automationUnlocked(state)) {
    addAction(actions, { id: "enable_automation", label: "开启自动经营", anchorAction: "enable_automation", priority: 120 });
  }

  if (state.serverCount >= MAX_SERVERS && !state.stage2.settlementShown) {
    addAction(actions, { id: "complete_stage2_settlement", label: "完成服务器集群里程碑", anchorAction: "complete_stage2_settlement", priority: 120 });
  }
  if (!stage3 && state.stage2.settlementShown && stage3EntryMet(state)) {
    addAction(actions, { id: "enter_stage3", label: "进入算力中心", anchorAction: "enter_stage3", priority: 120 });
  }

  if (s4 && !s5) {
    const nextNode = STAGE4_NODES.find((node) => canBuyStage4Node(state, node.id));
    if (nextNode) addAction(actions, {
      id: `buy_node:${nextNode.id}`,
      label: `部署${nextNode.name}`,
      anchorAction: `buy_node:${nextNode.id}`,
      priority: 95,
    });
    if (canStartStage4Project(state)) {
      addAction(actions, { id: "start_stage4_project", label: `启动${STAGE4_FINAL_PROJECT.name}`, anchorAction: "start_stage4_project", priority: 110 });
    }
    if ((state.singularity?.stage4?.completedProjectIds ?? []).includes(STAGE4_FINAL_PROJECT.id) && !s5) {
      addAction(actions, { id: "start_stage5", label: "进入戴森算力纪元", anchorAction: "start_stage5", priority: 125 });
    }
  }

  if (s5) {
    const nextNode = STAGE5_NODES.find((node) => canBuyStage5Node(state, node.id));
    if (nextNode) addAction(actions, {
      id: `buy_stage5_node:${nextNode.id}`,
      label: `部署${nextNode.name}`,
      anchorAction: `buy_stage5_node:${nextNode.id}`,
      priority: 95,
    });
    if (canStartStage5Project(state)) {
      addAction(actions, { id: "start_stage5_project", label: `启动${STAGE5_FINAL_PROJECT.name}`, anchorAction: "start_stage5_project", priority: 110 });
    }
  }

  if (!s4 && !s5 && state.serverCount < MAX_SERVERS && canBuyServer(state)) {
    const next = nextServerDef(state);
    if (next) addAction(actions, {
      id: "buy_server",
      label: `购买${serverName(next.index)}`,
      anchorAction: "buy_server",
      priority: 90,
    });
  }
  if (!s4 && !s5 && canBuyMaxServers(state)) {
    addAction(actions, { id: "buy_max_servers", label: "批量购买可负担服务器", anchorAction: "buy_max_servers", priority: 75 });
  }
  if (!s4 && !s5 && state.serverCount === 0 && canEnableRental(state)) {
    addAction(actions, { id: "enable_rental", label: "启用租赁算力", anchorAction: "enable_rental", priority: 80 });
  }

  if (stage3 && !s4 && !s5) {
    const bottleneck = bottleneckAnalysis(state);
    if (canUpgradeInfrastructure(state, bottleneck.id)) {
      addAction(actions, {
        id: `upgrade_infra:${bottleneck.id}`,
        label: `升级${bottleneck.name}`,
        anchorAction: `upgrade_infra:${bottleneck.id}`,
        priority: 100,
        projectedIncomeGain: `预计收入 +${formatMoney(bottleneck.projectedIncomeGain)}/秒`,
      });
    }
    for (const room of MACHINE_ROOMS) {
      if (canCommissionRoom(state, room.index)) {
        addAction(actions, {
          id: `commission_room:${room.index}`,
          label: `投产${room.name}`,
          anchorAction: `commission_room:${room.index}`,
          priority: 105,
        });
      }
    }
    for (const project of FLAGSHIP_PROJECTS) {
      if (canStartFlagship(state, project.id)) {
        addAction(actions, {
          id: `start_flagship:${project.id}`,
          label: `启动${project.name}`,
          anchorAction: `start_flagship:${project.id}`,
          priority: 105,
        });
      }
    }
    for (const infrastructure of INFRASTRUCTURES) {
      if (infrastructure.id === bottleneck.id || !canUpgradeInfrastructure(state, infrastructure.id)) continue;
      addAction(actions, {
        id: `upgrade_infra:${infrastructure.id}`,
        label: `升级${infrastructure.name}`,
        anchorAction: `upgrade_infra:${infrastructure.id}`,
        priority: 45,
      });
    }
  }

  if (canResearchModel(state)) {
    addAction(actions, { id: "research_model", label: "继续研发模型蓝图", anchorAction: "research_model", priority: 65 });
  }
  if (canTrain(state)) {
    addAction(actions, { id: "train_model", label: "训练当前模型", anchorAction: "train_model", priority: 55 });
  }

  return [...actions.values()]
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, 4);
}

function feelStage(state: SaveData): number {
  if (stage5Entered(state)) return 5;
  if (stage4Entered(state)) return 4;
  if (state.stage3?.entered) return 3;
  return currentStage(state);
}

function baseCompute(state: SaveData): Decimal {
  return state.stage3?.entered
    ? stage3TotalCompute(state)
    : modelCompute(state).mul(state.serverPower);
}

function identityLabel(state: SaveData, stage: number): string {
  if (stage >= 5) return "银河算力大亨";
  if (stage === 4) return "地月算力运营商";
  if (stage === 3) return "算力中心运营商";
  if (state.serverCount >= 8) return "完整服务器集群";
  if (state.serverCount >= 1) return "服务器集群";
  return "AI创业工作室";
}

function buildGrowthReview(state: SaveData, stage: number, compute: Decimal, income: Decimal): GrowthReviewVM {
  const milestoneCount = [
    state.serverCount >= 1,
    state.serverCount >= 8,
    state.technologyIterationCount >= 1,
    stage >= 4,
    stage >= 5,
    perpetualActive(state),
  ].filter(Boolean).length;
  const currentLabel = identityLabel(state, stage);
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.createdAtMs) / 1000));
  const summary = perpetualActive(state)
    ? "主线已经完成，银河网络仍在刷新你的经营纪录。"
    : stage >= 4
      ? "从地球机房到宇宙节点，你的算力版图已经跨越行星尺度。"
      : state.technologyIterationCount > 0
        ? "每次技术迭代都在压缩旧路程，把公司推向更大的算力尺度。"
        : state.serverCount >= 1
          ? "第一台服务器已经把创业工作室变成持续运转的算力资产。"
          : "第一笔自动收入会成为这家算力公司的起点。";
  return {
    visible: milestoneCount > 0,
    fromLabel: "AI创业工作室",
    currentLabel,
    elapsedLabel: formatTime(elapsedSeconds),
    computeLabel: formatBig(compute),
    incomeLabel: `${formatMoney(income)}/秒`,
    milestoneCount,
    summary,
  };
}

function projectProgress(state: SaveData, stage: number): number | null {
  if (stage >= 5) {
    if (perpetualActive(state) || (state.singularity?.stage5?.completedProjectIds ?? []).includes(STAGE5_FINAL_PROJECT.id)) return 1;
    if (state.singularity?.stage5?.activeProjectId !== STAGE5_FINAL_PROJECT.id) return null;
    return Math.max(0, Math.min(1, (state.singularity.stage5.projectProgress ?? 0) / STAGE5_FINAL_PROJECT.progressRequired));
  }
  if (stage === 4) {
    if ((state.singularity?.stage4?.completedProjectIds ?? []).includes(STAGE4_FINAL_PROJECT.id)) return 1;
    if (state.singularity?.stage4?.activeProjectId !== STAGE4_FINAL_PROJECT.id) return null;
    return Math.max(0, Math.min(1, (state.singularity.stage4.projectProgress ?? 0) / STAGE4_FINAL_PROJECT.progressRequired));
  }
  if (state.stage3?.flagship?.activeId) {
    const project = FLAGSHIP_PROJECTS.find((candidate) => candidate.id === state.stage3?.flagship?.activeId);
    if (project) return Math.max(0, Math.min(1, (state.stage3.flagship.progress ?? 0) / project.progressRequired));
  }
  return null;
}

function offlinePreview(state: SaveData, compute: Decimal): OfflineFeelPreviewVM | null {
  const reward = state.pendingOfflineReward;
  if (!reward || reward.claimed) return null;
  const preview = structuredClone(state);
  preview.money = toStoredBig(new Decimal(state.money).plus(reward.money));
  const actions = buildAffordableActions(preview);
  return {
    moneyBefore: formatHeaderMoney(state.money),
    moneyAfter: formatHeaderMoney(preview.money),
    computeLabel: `保持 ${formatBig(compute)}`,
    affordableAfterCount: actions.length,
    recommendedAfterLabel: actions[0]?.label ?? null,
  };
}

export function buildFeelViewModel(state: SaveData): FeelViewModel {
  const stage = feelStage(state);
  const compute = baseCompute(state);
  const income = state.automation ? incomePerSecond(state) : new Decimal(0);
  const actions = buildAffordableActions(state);
  const bottleneck = state.stage3?.entered && stage < 4 ? bottleneckAnalysis(state) : null;
  const s4Nodes = stage === 4 ? ownedStage4Nodes(state) : [];
  const s5Nodes = stage >= 5 ? ownedStage5Nodes(state) : [];
  return {
    computeTier: resolveComputeTier(compute, stage),
    computeLabel: stage >= 4 ? "地球基底算力" : "总算力",
    computeValue: formatBig(compute),
    computeRaw: compute.toString(),
    incomeValue: `${formatMoney(income)}/秒`,
    incomeRaw: income.toString(),
    moneyValue: formatHeaderMoney(state.money),
    moneyRaw: new Decimal(state.money).toString(),
    activity01: activityFromIncome(income),
    cosmicNodeOwned: stage >= 5 ? s5Nodes.length : stage === 4 ? s4Nodes.length : null,
    cosmicNodeTotal: stage >= 5 ? STAGE5_NODES.length : stage === 4 ? STAGE4_NODES.length : null,
    cosmicMultiplier: stage >= 5
      ? `×${stage5NodeMultiplier(state).toFixed(2)}`
      : stage === 4
        ? `×${stage4NodeMultiplier(state).toFixed(2)}`
        : null,
    activeProjectProgress01: projectProgress(state, stage),
    affordableActions: actions,
    bottleneck: bottleneck
      ? { id: bottleneck.id, name: bottleneck.name, efficiency: bottleneck.efficiency }
      : null,
    growthReview: buildGrowthReview(state, stage, compute, income),
    offlinePreview: offlinePreview(state, compute),
  };
}

const FEEDBACK_COMMANDS = [
  "acquire_model",
  "enable_automation",
  "train_model",
  "research_model",
  "buy_server",
  "buy_max_servers",
  "complete_stage2_settlement",
  "enter_stage3",
  "upgrade_infra",
  "commission_room",
  "claim_flagship_reward",
  "claim_core",
  "prestige",
  "start_space_plan",
  "buy_node",
  "claim_stage4_reward",
  "start_stage5",
  "buy_stage5_node",
  "claim_stage5_reward",
  "claim_offline",
] as const;

function feedbackAllowed(command: string): boolean {
  return FEEDBACK_COMMANDS.some((prefix) => command === prefix || command.startsWith(`${prefix}:`));
}

function milestoneHeadline(command: string): string {
  if (command === "acquire_model") return "第一束智能火花已点亮";
  if (command === "enable_automation") return "自动经营开始运转";
  if (command === "buy_server" || command === "buy_max_servers") return "服务器集群扩容";
  if (command.startsWith("commission_room")) return "新机房正式投产";
  if (command === "claim_core") return "奇点核心已入库";
  if (command === "prestige") return "技术迭代完成";
  if (command === "start_space_plan") return "地外算力计划启动";
  if (command.startsWith("buy_node")) return "地月节点接入网络";
  if (command === "start_stage5") return "戴森算力纪元启动";
  if (command.startsWith("buy_stage5_node")) return "恒星节点接入网络";
  if (command === "claim_stage5_reward") return "银河主线里程碑达成";
  if (command === "claim_stage4_reward") return "地月主线里程碑达成";
  if (command === "claim_flagship_reward") return "时代工程成果已领取";
  if (command === "enter_stage3") return "算力中心正式启用";
  if (command === "complete_stage2_settlement") return "服务器集群阶段完成";
  if (command === "claim_offline") return "公司成长报告已入账";
  return "经营能力提升";
}

export function createGrowthFeedback(
  command: string,
  before: FeelViewModel,
  after: FeelViewModel,
): GrowthFeedbackEvent | null {
  if (!feedbackAllowed(command)) return null;
  const incomeBefore = new Decimal(before.incomeRaw);
  const incomeAfter = new Decimal(after.incomeRaw);
  const computeBefore = new Decimal(before.computeRaw);
  const computeAfter = new Decimal(after.computeRaw);
  const moneyBefore = new Decimal(before.moneyRaw);
  const moneyAfter = new Decimal(after.moneyRaw);
  const tierChanged = before.computeTier !== after.computeTier;
  const moneyIncreased = moneyAfter.gt(moneyBefore);

  let kind: GrowthFeedbackKind = tierChanged ? "scale" : command === "claim_offline" ? "offline" : "minor";
  let headline = milestoneHeadline(command);
  if (command.startsWith("upgrade_infra")) {
    const beforeBottleneck = before.bottleneck;
    const afterBottleneck = after.bottleneck;
    if (beforeBottleneck && beforeBottleneck.efficiency < 1 && (afterBottleneck?.efficiency ?? 0) >= 1) {
      kind = "bottleneck";
      headline = "瓶颈解除 · 效率达到100%";
    } else if (beforeBottleneck && afterBottleneck && beforeBottleneck.id !== afterBottleneck.id) {
      kind = "bottleneck";
      headline = `瓶颈转移 · 现在关注${afterBottleneck.name}`;
    } else {
      headline = "产能提升";
    }
  }
  if ([
    "buy_server", "buy_max_servers", "complete_stage2_settlement", "enter_stage3",
    "claim_core", "prestige", "start_space_plan", "claim_stage4_reward",
    "start_stage5", "claim_stage5_reward",
  ].some((prefix) => command === prefix || command.startsWith(`${prefix}:`))) {
    kind = tierChanged ? "scale" : "major";
  }

  const details: string[] = [];
  if (computeAfter.gt(computeBefore)) details.push(`算力 ${before.computeValue} → ${after.computeValue}`);
  if (incomeAfter.gt(incomeBefore)) details.push(`收入 ${before.incomeValue} → ${after.incomeValue}`);
  if (command === "claim_offline" && moneyIncreased) details.push(`资金 ${before.moneyValue} → ${after.moneyValue}`);
  if (details.length === 0 && !["major", "scale", "bottleneck"].includes(kind)) return null;
  if (details.length === 0) details.push("新的经营尺度已经生效");

  const durationMs = kind === "scale" ? 2400 : kind === "major" ? 1800 : kind === "bottleneck" ? 1600 : kind === "offline" ? 1400 : 850;
  return { command, kind, headline, detail: details.join(" · "), durationMs, tierChanged, moneyIncreased };
}

export function endgameFeelEnabled(state: SaveData): boolean {
  return endgameMode(state);
}
