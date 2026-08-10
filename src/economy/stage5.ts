// Stage 5 戴森算力纪元（正式终局与隔离 Review 共用同一规则）。
// 纯规则实现，不依赖 DOM；所有命令原子化（失败不落盘）。
// 门禁：仅 state.singularity?.mode === "endgame" && stage4 地月主线完成 && stage5.entered。
// 永续模式：戴森算力球完成后激活；仅禁止技术迭代与进度型清档；保留手动完整重置存档。
import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import type { LegendaryArchiveState, SaveData, Stage5State } from "../save/types";
import { MODELS } from "../data/content";
import { stage3IncomePerSecond, stage3TotalCompute } from "./stage3";
import { stage4Entered } from "./stage4";

// ---------- 常数（来自 CARD-00 冻结表） ----------
export const STAGE5_IDENTITY = "银河算力大亨";
export const STAGE5_FINAL_PROJECT_ID = "dyson_sphere";
export const STAGE5_ERA_NAME = "银河纪元";
/** 进入时里程碑授予第一个恒星计算节点（不扣资金）。 */
export const STAGE5_NODES: ReadonlyArray<{
  id: string;
  name: string;
  icon: string;
  /** 成本；0 = 里程碑授予 */
  cost: number;
  incomeMult: number;
}> = [
  { id: "solar_array", name: "太阳能采集阵列", icon: "☀️", cost: 0, incomeMult: 1 },
  { id: "stellar_node", name: "恒星计算节点", icon: "⭐", cost: 7.2e11, incomeMult: 1.8 },
  { id: "dyson_cloud", name: "戴森计算云", icon: "🌫️", cost: 7.2e12, incomeMult: 3 },
  { id: "stellar_model", name: "恒星级模型阵列", icon: "🌠", cost: 7.2e13, incomeMult: 5 },
];

/** 宇宙模型包装：仅展示名称/图标（不增加独立抽取、配置或复杂槽位）。 */
export const STAGE5_COSMIC_MODELS: ReadonlyArray<{
  id: string;
  name: string;
  icon: string;
  desc: string;
}> = [
  { id: "stellar_ai", name: "恒星级模型", icon: "🌠", desc: "为戴森算力纪元定制恒星级推理模型" },
];

// ---------- 门禁 ----------
export function stage5Entered(state: SaveData): boolean {
  return state.singularity?.mode === "endgame"
    && stage4Entered(state)
    && state.singularity.stage5?.entered === true;
}

/** 永续增长模式：戴森算力球完成后激活（exactly-once）。 */
export function perpetualActive(state: SaveData): boolean {
  return state.singularity?.perpetual != null;
}

// ---------- 进入 ----------
/** 启动戴森算力纪元（唯一入口；前置：地月一体化算力网已完成并手动领取）。 */
export function startStage5(state: SaveData, nowMs: number): { ok: boolean; error?: string } {
  if (state.singularity?.mode !== "endgame") return { ok: false, error: "not_endgame" };
  if (!stage4Entered(state)) return { ok: false, error: "stage4_not_entered" };
  if (!(state.singularity.stage4?.completedProjectIds ?? []).includes("moon_network")) {
    return { ok: false, error: "stage4_not_complete" };
  }
  if (state.singularity.stage5 != null) return { ok: false, error: "already_started" };
  // 进入新尺度：地月资金不携带（保住 Stage 5 首购门；里程碑授予首节点不扣资金）。
  state.money = 0;
  state.singularity = {
    ...state.singularity,
    stage5: {
      entered: true,
      enteredAtMs: nowMs,
      nodes: [STAGE5_NODES[0].id], // 里程碑授予第一个恒星计算节点
      stageIncome: 0,
      projectProgress: 0,
      activeProjectId: null,
      completedProjectIds: [],
      pendingRewardProjectId: null,
      storyCompleted: false,
    },
  };
  return { ok: true };
}

// ---------- 节点 ----------
export function ownedNodes(state: SaveData): string[] {
  return stage5Entered(state) ? [...(state.singularity?.stage5?.nodes ?? [])] : [];
}

export function canBuyNode(state: SaveData, nodeId: string): boolean {
  if (!stage5Entered(state)) return false;
  const def = STAGE5_NODES.find((n) => n.id === nodeId);
  if (!def || def.cost <= 0) return false;
  const owned = state.singularity!.stage5!.nodes;
  if (owned.includes(nodeId)) return false;
  const idx = STAGE5_NODES.findIndex((n) => n.id === nodeId);
  if (idx <= 0) return false;
  const prev = STAGE5_NODES[idx - 1].id;
  if (!owned.includes(prev)) return false;
  return new Decimal(state.money).gte(def.cost);
}

export function buyNode(state: SaveData, nodeId: string): { ok: boolean; error?: string } {
  if (!stage5Entered(state)) return { ok: false, error: "not_entered" };
  const def = STAGE5_NODES.find((n) => n.id === nodeId);
  if (!def || def.cost <= 0) return { ok: false, error: "unknown_node" };
  if (state.singularity!.stage5!.nodes.includes(nodeId)) return { ok: false, error: "already_owned" };
  const idx = STAGE5_NODES.findIndex((n) => n.id === nodeId);
  if (idx <= 0 || !state.singularity!.stage5!.nodes.includes(STAGE5_NODES[idx - 1].id)) {
    return { ok: false, error: "requires_previous" };
  }
  if (new Decimal(state.money).lt(def.cost)) return { ok: false, error: "insufficient_funds" };
  state.money = toStoredBig(new Decimal(state.money).minus(def.cost));
  state.singularity!.stage5 = {
    ...state.singularity!.stage5!,
    nodes: [...state.singularity!.stage5!.nodes, nodeId],
  };
  return { ok: true };
}

/** 节点收入倍率：已拥有节点 incomeMult 之和（至少 1）。 */
export function nodeIncomeMultiplier(state: SaveData): Decimal {
  if (!stage5Entered(state)) return new Decimal(1);
  const owned = state.singularity!.stage5!.nodes;
  const sum = owned.reduce((acc, id) => {
    const def = STAGE5_NODES.find((n) => n.id === id);
    return acc + (def?.incomeMult ?? 0);
  }, 0);
  return new Decimal(Math.max(1, sum));
}

// ---------- 收入 ----------
/** Stage 5 每秒收入：地球终局收入 × 尺度系数 × 节点倍率（模拟器口径：×0.3×40）。 */
export function stage5IncomePerSecond(state: SaveData, nowMs = Date.now()): Decimal {
  if (!stage5Entered(state)) return new Decimal(0);
  const earthFinal = stage3IncomePerSecond(state, nowMs);
  const base = earthFinal.gt(1e8) ? earthFinal : new Decimal(1e8);
  const baseScaled = base.mul(0.3).mul(40);
  return baseScaled.mul(nodeIncomeMultiplier(state));
}

// ---------- 戴森算力球 ----------
/** 唯一最终巨构：戴森算力球（最终RC：约8小时在线等效，cap=30/秒）。 */
export const STAGE5_FINAL_PROJECT = {
  id: STAGE5_FINAL_PROJECT_ID,
  name: "戴森算力球",
  icon: "🔮",
  desc: "全游戏最昂贵最明确的最终目标：以戴森结构包裹恒星，汲取全部能源运行银河级算力",
  progressRequired: 864000,
  progressCapPerSec: 30,
};

/** 戴森算力球完成时生成一次传奇档案快照（不改变收入或解锁任何新系统）。 */
export function buildLegendaryArchive(state: SaveData, completedAtMs: number): LegendaryArchiveState {
  const currentCompute = stage3TotalCompute(state);
  const currentIncome = stage5IncomePerSecond(state);
  return {
    completedAtMs,
    maxCompute: toStoredBig(Decimal.max(0, new Decimal(state.stage3?.peakStats?.peakCompute ?? 0), currentCompute)),
    maxIncome: toStoredBig(Decimal.max(0, new Decimal(state.highestIncomePerSecond ?? 0), currentIncome)),
    reachedEra: STAGE5_ERA_NAME,
  };
}

export function canStartFinalProject(state: SaveData): boolean {
  if (!stage5Entered(state)) return false;
  const s5 = state.singularity!.stage5!;
  if (s5.completedProjectIds.includes(STAGE5_FINAL_PROJECT_ID)) return false;
  if (s5.activeProjectId != null) return false;
  return s5.pendingRewardProjectId == null;
}

export function startFinalProject(state: SaveData): { ok: boolean; error?: string } {
  if (!canStartFinalProject(state)) return { ok: false, error: "not_ready" };
  state.singularity!.stage5 = {
    ...state.singularity!.stage5!,
    activeProjectId: STAGE5_FINAL_PROJECT_ID,
    projectProgress: 0,
  };
  return { ok: true };
}

/** 工程推进速度：收入 / 1e6，cap 30/秒（与 CARD-00 模拟器一致）。 */
export function finalProjectProgressPerSec(state: SaveData): Decimal {
  if (!stage5Entered(state)) return new Decimal(0);
  const active = state.singularity?.stage5?.activeProjectId;
  if (active !== STAGE5_FINAL_PROJECT_ID) return new Decimal(0);
  const ips = stage5IncomePerSecond(state);
  return Decimal.min(ips.div(1e6), new Decimal(STAGE5_FINAL_PROJECT.progressCapPerSec));
}

/** 在线推进（秒级；离线同样推进但不可自动领取）。 */
export function advanceFinalProject(state: SaveData, elapsedSec: number): { completed: boolean } {
  if (!stage5Entered(state)) return { completed: false };
  const s5 = state.singularity!.stage5!;
  if (s5.activeProjectId !== STAGE5_FINAL_PROJECT_ID) return { completed: false };
  if (s5.pendingRewardProjectId != null) return { completed: false };
  const perSec = finalProjectProgressPerSec(state);
  const progress = (s5.projectProgress ?? 0) + perSec.mul(elapsedSec).toNumber();
  if (progress >= STAGE5_FINAL_PROJECT.progressRequired) {
    state.singularity!.stage5 = {
      ...s5,
      projectProgress: STAGE5_FINAL_PROJECT.progressRequired,
      activeProjectId: null,
      pendingRewardProjectId: STAGE5_FINAL_PROJECT_ID,
    };
    return { completed: true };
  }
  state.singularity!.stage5 = { ...s5, projectProgress: progress };
  return { completed: false };
}

export function hasPendingFinalReward(state: SaveData): boolean {
  return stage5Entered(state) && state.singularity!.stage5!.pendingRewardProjectId === STAGE5_FINAL_PROJECT_ID;
}

/** 手动领取戴森算力球奖励：exactly-once；置 storyCompleted 并解锁永续增长模式。 */
export function claimFinalProjectReward(state: SaveData, nowMs: number): { ok: boolean; error?: string } {
  if (!hasPendingFinalReward(state)) return { ok: false, error: "no_pending_reward" };
  const s5 = state.singularity!.stage5!;
  const legendaryArchive = s5.legendaryArchive ?? buildLegendaryArchive(state, nowMs);
  state.singularity!.stage5 = {
    ...s5,
    completedProjectIds: [...s5.completedProjectIds, STAGE5_FINAL_PROJECT_ID],
    pendingRewardProjectId: null,
    storyCompleted: true,
    legendaryArchive,
  };
  // 永续增长模式：只置一次（不覆盖已有时间戳）。
  if (state.singularity!.perpetual == null) {
    state.singularity = {
      ...state.singularity!,
      perpetual: { unlockedAtMs: nowMs },
    };
  }
  return { ok: true };
}

// ---------- 永续模式边界 ----------
/** 永续模式只禁止：技术迭代 与 游戏内进度型清档/转生。 */
export function iterationBlockedByPerpetual(state: SaveData): boolean {
  return perpetualActive(state);
}

/** 手动“完整重置存档”保留（设置入口；二次确认由 UI 维持）。 */
export function manualResetAvailable(): boolean {
  return true;
}

/** 永续阶段持续可购买：节点满级后可继续观察数字增长（无新目标/无清档）。 */
export function perpetualCanContinue(state: SaveData): boolean {
  return perpetualActive(state);
}

// ---------- 宇宙模型包装 ----------
export function cosmicModelUnlocked(state: SaveData): boolean {
  return stage5Entered(state);
}

export function cosmicModelName(state: SaveData): string | null {
  return stage5Entered(state) ? STAGE5_COSMIC_MODELS[0].name : null;
}

/** 复用现有 6 模型图鉴承担永久收藏加成（宇宙模型仅作阶段包装，不新增抽取/槽位）。 */
export function archiveModels(state: SaveData): typeof MODELS {
  return MODELS;
}
