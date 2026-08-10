// Stage 4 地月算力网（正式终局与隔离 Review 共用同一规则）。
// 纯规则实现，不依赖 DOM；所有命令原子化（失败不落盘）。
// 门禁：仅 state.singularity?.mode === "endgame" && spacePlanStarted === true 时生效。
// 禁止：运输/燃料/部件安装/轨道配置等复杂系统；宇宙模型仅作阶段包装（复用 6 模型图鉴）。
import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import type { SaveData, Stage4State } from "../save/types";
import { MODELS } from "../data/content";
import { stage3IncomePerSecond } from "./stage3";
import { batchPurchaseUnlocked } from "./singularity";

// ---------- 常数（来自 CARD-00 冻结表） ----------
export const STAGE4_IDENTITY = "地月算力运营商";
export const STAGE4_FINAL_PROJECT_ID = "moon_network";
export const STAGE4_MOTIVATION_TITLE = "地球算力饱和 → 太空冷却";
export const STAGE4_MOTIVATION_TEXT = "地球算力网络已接近物理上限。把算力送入太空，用冷却与新尺度换取下一段增长。";
/** 进入时里程碑授予第一个节点（不扣资金），首个自费节点 = 月球背面算力基地。 */
export const STAGE4_NODES: ReadonlyArray<{
  id: string;
  name: string;
  icon: string;
  /** 成本；0 = 里程碑授予 */
  cost: number;
  incomeMult: number;
}> = [
  { id: "leo_node", name: "近地轨道节点", icon: "🛰️", cost: 0, incomeMult: 1 },
  { id: "moon_base", name: "月球背面算力基地", icon: "🌕", cost: 1.8e10, incomeMult: 1.6 },
  { id: "lunar_link", name: "地月激光链路", icon: "🔗", cost: 1.8e11, incomeMult: 2.4 },
  { id: "deep_relay", name: "深空算力中继", icon: "🌌", cost: 1.8e12, incomeMult: 3.5 },
];
/** 首个自费节点门 8–15 分钟由 CARD-00 冻结；此处只保留价格常量，不做硬编码时间门。 */
export const STAGE4_FIRST_PAID_NODE_ID = "moon_base";

/** 宇宙模型包装：仅展示名称/图标（不增加独立抽取、配置或复杂槽位）。 */
export const STAGE4_COSMIC_MODELS: ReadonlyArray<{
  id: string;
  name: string;
  icon: string;
  desc: string;
}> = [
  { id: "lunar_ai", name: "地外AI模型", icon: "🌕", desc: "为地月算力网定制的地外推理模型" },
];

// ---------- 门禁 ----------
export function stage4Entered(state: SaveData): boolean {
  return state.singularity?.mode === "endgame"
    && state.singularity.spacePlanStarted === true
    && state.singularity.stage4?.entered === true;
}

export function spacePlanStarted(state: SaveData): boolean {
  return state.singularity?.mode === "endgame" && state.singularity.spacePlanStarted === true;
}

// ---------- 进入 ----------
/** 启动地外算力计划（唯一入口，只触发一次；不自动进入，需玩家点击）。 */
export function startSpacePlan(state: SaveData, nowMs: number): { ok: boolean; error?: string } {
  if (state.singularity?.mode !== "endgame") return { ok: false, error: "not_endgame" };
  if (state.singularity.spacePlanRevealed !== true) return { ok: false, error: "not_revealed" };
  if (state.singularity.spacePlanStarted) return { ok: false, error: "already_started" };
  // 进入新尺度：地球轮资金不携带（保住 Stage 4 首购门 8–15 分钟；里程碑授予首节点不扣资金）。
  state.money = 0;
  state.singularity = {
    ...state.singularity,
    spacePlanStarted: true,
    stage4: {
      entered: true,
      enteredAtMs: nowMs,
      nodes: [STAGE4_NODES[0].id], // 里程碑授予第一个节点
      stageIncome: 0,
      projectProgress: 0,
      activeProjectId: null,
      completedProjectIds: [],
      pendingRewardProjectId: null,
    },
  };
  return { ok: true };
}

// ---------- 节点 ----------
export function ownedNodes(state: SaveData): string[] {
  return stage4Entered(state) ? [...(state.singularity?.stage4?.nodes ?? [])] : [];
}

export function canBuyNode(state: SaveData, nodeId: string): boolean {
  if (!stage4Entered(state)) return false;
  const def = STAGE4_NODES.find((n) => n.id === nodeId);
  if (!def || def.cost <= 0) return false;
  const owned = state.singularity!.stage4!.nodes;
  if (owned.includes(nodeId)) return false;
  // 保持顺序：必须先拥有前一个节点
  const idx = STAGE4_NODES.findIndex((n) => n.id === nodeId);
  if (idx <= 0) return false;
  const prev = STAGE4_NODES[idx - 1].id;
  if (!owned.includes(prev)) return false;
  return new Decimal(state.money).gte(def.cost);
}

export function buyNode(state: SaveData, nodeId: string): { ok: boolean; error?: string } {
  if (!stage4Entered(state)) return { ok: false, error: "not_entered" };
  const def = STAGE4_NODES.find((n) => n.id === nodeId);
  if (!def || def.cost <= 0) return { ok: false, error: "unknown_node" };
  if (state.singularity!.stage4!.nodes.includes(nodeId)) return { ok: false, error: "already_owned" };
  const idx = STAGE4_NODES.findIndex((n) => n.id === nodeId);
  if (idx <= 0 || !state.singularity!.stage4!.nodes.includes(STAGE4_NODES[idx - 1].id)) {
    return { ok: false, error: "requires_previous" };
  }
  if (new Decimal(state.money).lt(def.cost)) return { ok: false, error: "insufficient_funds" };
  state.money = toStoredBig(new Decimal(state.money).minus(def.cost));
  state.singularity!.stage4 = {
    ...state.singularity!.stage4!,
    nodes: [...state.singularity!.stage4!.nodes, nodeId],
  };
  return { ok: true };
}

/** 核心 1 的已验证节点批量部署：只购买当前资金可负担的连续节点，避免重复点击。 */
export function buyVerifiedNodes(state: SaveData): { ok: boolean; error?: string; purchasedIds: string[] } {
  if (!stage4Entered(state)) return { ok: false, error: "not_entered", purchasedIds: [] };
  if (!batchPurchaseUnlocked(state)) return { ok: false, error: "batch_locked", purchasedIds: [] };
  const purchasedIds: string[] = [];
  for (const node of STAGE4_NODES) {
    if (node.cost <= 0 || !canBuyNode(state, node.id)) continue;
    const result = buyNode(state, node.id);
    if (!result.ok) break;
    purchasedIds.push(node.id);
  }
  return purchasedIds.length > 0
    ? { ok: true, purchasedIds }
    : { ok: false, error: "insufficient_funds", purchasedIds };
}

/** 节点收入倍率：已拥有节点 incomeMult 之和（至少 1）。 */
export function nodeIncomeMultiplier(state: SaveData): Decimal {
  if (!stage4Entered(state)) return new Decimal(1);
  const owned = state.singularity!.stage4!.nodes;
  const sum = owned.reduce((acc, id) => {
    const def = STAGE4_NODES.find((n) => n.id === id);
    return acc + (def?.incomeMult ?? 0);
  }, 0);
  return new Decimal(Math.max(1, sum));
}

// ---------- 收入 ----------
/** Stage 4 每秒收入：地球终局收入 × 尺度系数 × 节点倍率（重新减速，保留太空冷却节奏）。 */
export function stage4IncomePerSecond(state: SaveData, nowMs = Date.now()): Decimal {
  if (!stage4Entered(state)) return new Decimal(0);
  // 与 CARD-00 模拟器一致：Stage 4 起点 = 地球终局收入/秒 × 0.3（地球算力饱和后的太空冷却）。
  const earthFinal = stage3IncomePerSecond(state, nowMs);
  const base = earthFinal.gt(1e8) ? earthFinal : new Decimal(1e8);
  const baseScaled = base.mul(0.3);
  return baseScaled.mul(nodeIncomeMultiplier(state));
}

// ---------- 地月超级工程 ----------
/** 唯一最终工程：地月一体化算力网（最终RC：约4小时在线等效，cap=25/秒）。 */
export const STAGE4_FINAL_PROJECT = {
  id: STAGE4_FINAL_PROJECT_ID,
  name: "地月一体化算力网",
  icon: "🌐",
  desc: "将地球与月球算力统一为一张地月网络，完成即达成地月算力运营商主线目标",
  progressRequired: 360000,
  progressCapPerSec: 25,
};

export function canStartFinalProject(state: SaveData): boolean {
  if (!stage4Entered(state)) return false;
  const s4 = state.singularity!.stage4!;
  if (!STAGE4_NODES.every((node) => s4.nodes.includes(node.id))) return false;
  if (s4.completedProjectIds.includes(STAGE4_FINAL_PROJECT_ID)) return false;
  if (s4.activeProjectId != null) return false;
  return s4.pendingRewardProjectId == null;
}

export function startFinalProject(state: SaveData): { ok: boolean; error?: string } {
  if (!canStartFinalProject(state)) return { ok: false, error: "not_ready" };
  state.singularity!.stage4 = {
    ...state.singularity!.stage4!,
    activeProjectId: STAGE4_FINAL_PROJECT_ID,
    projectProgress: 0,
  };
  return { ok: true };
}

/** 工程推进速度：收入 / 1e6，cap 25/秒（与 CARD-00 模拟器一致）。 */
export function finalProjectProgressPerSec(state: SaveData): Decimal {
  if (!stage4Entered(state)) return new Decimal(0);
  const active = state.singularity?.stage4?.activeProjectId;
  if (active !== STAGE4_FINAL_PROJECT_ID) return new Decimal(0);
  const ips = stage4IncomePerSecond(state);
  return Decimal.min(ips.div(1e6), new Decimal(STAGE4_FINAL_PROJECT.progressCapPerSec));
}

/** 在线推进（秒级；离线同样推进但不可自动领取，且不自动进入/购节点）。 */
export function advanceFinalProject(state: SaveData, elapsedSec: number): { completed: boolean } {
  if (!stage4Entered(state)) return { completed: false };
  const s4 = state.singularity!.stage4!;
  if (s4.activeProjectId !== STAGE4_FINAL_PROJECT_ID) return { completed: false };
  if (s4.pendingRewardProjectId != null) return { completed: false };
  const perSec = finalProjectProgressPerSec(state);
  const progress = (s4.projectProgress ?? 0) + perSec.mul(elapsedSec).toNumber();
  if (progress >= STAGE4_FINAL_PROJECT.progressRequired) {
    state.singularity!.stage4 = {
      ...s4,
      projectProgress: STAGE4_FINAL_PROJECT.progressRequired,
      activeProjectId: null,
      pendingRewardProjectId: STAGE4_FINAL_PROJECT_ID,
    };
    return { completed: true };
  }
  state.singularity!.stage4 = { ...s4, projectProgress: progress };
  return { completed: false };
}

export function hasPendingFinalReward(state: SaveData): boolean {
  return stage4Entered(state) && state.singularity!.stage4!.pendingRewardProjectId === STAGE4_FINAL_PROJECT_ID;
}

/** 手动领取地月一体化算力网奖励：exactly-once；只发“主线完成”里程碑（不发放资金）。 */
export function claimFinalProjectReward(state: SaveData): { ok: boolean; error?: string } {
  if (!hasPendingFinalReward(state)) return { ok: false, error: "no_pending_reward" };
  const s4 = state.singularity!.stage4!;
  state.singularity!.stage4 = {
    ...s4,
    completedProjectIds: [...s4.completedProjectIds, STAGE4_FINAL_PROJECT_ID],
    pendingRewardProjectId: null,
  };
  return { ok: true };
}

// ---------- 宇宙模型包装 ----------
export function cosmicModelUnlocked(state: SaveData): boolean {
  return stage4Entered(state);
}

export function cosmicModelName(state: SaveData): string | null {
  return stage4Entered(state) ? STAGE4_COSMIC_MODELS[0].name : null;
}

/** 复用现有 6 模型图鉴承担永久收藏加成（宇宙模型仅作阶段包装，不新增抽取/槽位）。 */
export function archiveModels(state: SaveData): typeof MODELS {
  return MODELS;
}
