// 正式终局状态机：奇点核心 / 三次技术迭代 / 时代工程。
// 纯规则实现，不依赖 DOM。所有命令原子化（失败不落盘）。
// 门禁：仅 state.singularity?.mode === "endgame" 时生效；正式新档与兼容迁移档均由入口开启。
import Decimal from "decimal.js";
import type { SaveData, SingularityState } from "../save/types";
import { ENDGAME_SAVE_NAMESPACE } from "../save/types";
import { FLAGSHIP_PROJECTS } from "../data/stage3";
import { MODELS } from "../data/content";
import { roomCount } from "./stage3";

// ---------- 常数 ----------
export const MAX_ITERATIONS = 3;
/** 加法式永久倍率：R1 完成 → 核心1 → 迭代1 → ×1.5；R2 → 核心2 → ×2.0；R3 → 核心3 → ×2.0。 */
export const SINGULARITY_MULTIPLIERS: ReadonlyArray<number> = [1.5, 2.0, 2.0];

/** 奇点核心 id：唯一顺序 1 → 2 → 3。 */
export const SINGULARITY_CORE_IDS: ReadonlyArray<string> = ["core_1", "core_2", "core_3"];

/** 时代工程（每轮唯一最昂贵目标） */
export const ERA_PROJECTS: ReadonlyArray<{ id: string; name: string; round: 1 | 2 | 3 }> = [
  { id: "project_r1", name: "flagship.r1.name", round: 1 },
  { id: "project_r2", name: "flagship.r2.name", round: 2 },
  { id: "project_r3", name: "flagship.r3.name", round: 3 },
];

export const ERA_PROJECT_IDS = ERA_PROJECTS.map((p) => p.id);
export const ERA_PROJECT_IDS_SET = new Set(ERA_PROJECT_IDS);

// ---------- 门禁 ----------
export function endgameMode(state: SaveData): boolean {
  return state.singularity?.mode === "endgame";
}

function historicalSingularity(iterationCount: number, updatedAtMs: number): SingularityState {
  const completedIterations = Math.min(
    MAX_ITERATIONS,
    Math.max(0, Math.floor(iterationCount)),
  );
  const spacePlanRevealed = completedIterations >= MAX_ITERATIONS;
  return {
    mode: "endgame",
    coresClaimed: SINGULARITY_CORE_IDS.slice(0, completedIterations),
    spacePlanRevealed,
    claimedProjectIds: [],
    spacePlanRevealedAtMs: spacePlanRevealed ? Math.max(0, updatedAtMs) : 0,
    spacePlanStarted: false,
    stage4: null,
    stage5: null,
    perpetual: null,
  };
}

/**
 * 导入/显式重置发生在应用启动之后，不能依赖 boot 时迁移。
 * 该函数只改动尚无 singularity 的隔离替换候选；调用方必须在校验与写盘前使用。
 */
export function prepareEndgameReplacementSave(raw: Record<string, unknown>): boolean {
  if (raw.singularity != null) return false;
  const iterationCount = typeof raw.technologyIterationCount === "number"
    && Number.isFinite(raw.technologyIterationCount)
    ? raw.technologyIterationCount
    : 0;
  const updatedAtMs = typeof raw.updatedAtMs === "number" && Number.isFinite(raw.updatedAtMs)
    ? raw.updatedAtMs
    : 0;
  raw.singularity = historicalSingularity(iterationCount, updatedAtMs);
  return true;
}

/** 正式 v3 迁移（A_向前兼容）：旧正式档 singularity 缺失/为 null 时直接开启终局能力。
 *
 * 已经完成过技术迭代的旧档必须恢复对应的历史核心事实，否则会进入 R2/R3 却永远
 * 无法满足时代工程前置。该回填不是发奖：不改变资金、倍率、模型、迭代次数或地球进度。
 * 幂等：已有 singularity 则原样返回；Review v2 / dev 隔离档不经此路径。
 */
export function ensureEndgameSingularity(state: SaveData): boolean {
  if (state.singularity != null) return false;
  state.singularity = historicalSingularity(state.technologyIterationCount ?? 0, state.updatedAtMs);
  return true;
}

/** 终局 Review 隔离命名空间快照（仅测试/调试用途）。 */
export function endgameNamespace(): string {
  return ENDGAME_SAVE_NAMESPACE;
}

// ---------- 奇点核心状态机 ----------
export function coresClaimed(state: SaveData): string[] {
  return endgameMode(state) ? [...(state.singularity?.coresClaimed ?? [])] : [];
}

/** 当前轮次：
 * - 存在“已领核心但尚未执行对应迭代”（coresClaimed > iterationCount）→ 该轮迭代待执行（轮次 = 已领核心数）。
 * - 否则为正在经营的地球轮（轮次 = iterationCount + 1）；三次迭代完成后为 null。
 */
export function currentRound(state: SaveData): 1 | 2 | 3 | null {
  if (!endgameMode(state)) return null;
  const claimed = state.singularity?.coresClaimed?.length ?? 0;
  const iterated = state.technologyIterationCount ?? 0;
  if (claimed >= MAX_ITERATIONS && iterated >= MAX_ITERATIONS) return null;
  if (claimed > iterated) return claimed as 1 | 2 | 3;
  return (iterated + 1) as 1 | 2 | 3;
}

export function coreIdForRound(round: 1 | 2 | 3): string {
  return SINGULARITY_CORE_IDS[round - 1];
}

/** 时代工程是否可领取核心（本轮工程完成且未领取；领取与工程完成状态分离） */
export function canClaimCore(state: SaveData): boolean {
  if (!endgameMode(state)) return false;
  const round = currentRound(state);
  if (!round) return false;
  const coreId = coreIdForRound(round);
  if ((state.singularity?.coresClaimed ?? []).includes(coreId)) return false;
  const projectId = eraProjectIdForRound(round);
  return (state.stage3?.flagship?.completedIds ?? []).includes(projectId);
}

/** 手动领取奇点核心：exactly-once；未完成时代工程/重复领取/非终局档均拒绝。 */
export function claimCore(state: SaveData): { ok: boolean; error?: string } {
  if (!endgameMode(state)) return { ok: false, error: "not_endgame" };
  const round = currentRound(state);
  if (!round) return { ok: false, error: "max_cores" };
  const coreId = coreIdForRound(round);
  if ((state.singularity?.coresClaimed ?? []).includes(coreId)) {
    return { ok: false, error: "already_claimed" };
  }
  const projectId = eraProjectIdForRound(round);
  if (!(state.stage3?.flagship?.completedIds ?? []).includes(projectId)) {
    return { ok: false, error: "era_project_not_complete" };
  }
  state.singularity = {
    ...(state.singularity as SingularityState),
    coresClaimed: [...(state.singularity?.coresClaimed ?? []), coreId],
  };
  return { ok: true };
}

// ---------- 技术迭代（加法式永久倍率） ----------
export function canEndgameIterate(state: SaveData): boolean {
  if (!endgameMode(state)) return false;
  // CARD-03 永续模式：禁止技术迭代（保留手动完整重置存档）。
  if (state.singularity?.perpetual != null) return false;
  const claimed = state.singularity?.coresClaimed?.length ?? 0;
  const iterated = state.technologyIterationCount ?? 0;
  return claimed > iterated && claimed <= MAX_ITERATIONS;
}

export function eraProjectIdForRound(round: 1 | 2 | 3): string {
  return ERA_PROJECTS.find((p) => p.round === round)!.id;
}

/** 执行一次终局迭代（原子）。R1/R2 重置地球进度；R3 不重置（转化为地外算力计划揭示）。 */
export function applyEndgameIteration(state: SaveData): { ok: boolean; error?: string } {
  if (!canEndgameIterate(state)) return { ok: false, error: "not_ready" };
  const claimedCount = state.singularity?.coresClaimed?.length ?? 0;
  const round = claimedCount as 1 | 2 | 3;
  const nextCount = claimedCount; // 迭代1/2/3
  const nextMult = SINGULARITY_MULTIPLIERS[claimedCount - 1];

  // R3：不执行普通地球清档；只揭示地外算力计划（Stage 4 进入由 CARD-02 处理）。
  if (round === 3) {
    state.technologyIterationCount = nextCount;
    state.permanentMultiplier = nextMult;
    state.singularity = {
      ...(state.singularity as SingularityState),
      spacePlanRevealed: true,
      spacePlanRevealedAtMs: Date.now(),
    };
    state.updatedAtMs = Date.now();
    return { ok: true };
  }

  // R1/R2：重置地球进度，保留档案馆/图鉴/蓝图/科技/纪元/存档身份。
  const keepOwnedModels = [...state.ownedModelIds];
  const keepArchive = structuredClone(state.modelArchive);
  const keepBlueprint = state.stage3?.blueprint
    ? { owned: [...state.stage3.blueprint.owned], active: null, levels: Object.fromEntries(state.stage3.blueprint.owned.map((id) => [id, 1])), chosenMilestones: [] }
    : { owned: [], active: null, levels: {}, chosenMilestones: [] };
  const keepTech = state.stage3?.technologyArchive ? [...state.stage3.technologyArchive] : [];
  const keepEra = state.stage3?.eraArchive ? [...state.stage3.eraArchive] : [];
  const keepSaveId = state.saveId;
  const keepSettings = { ...state.settings };
  const keepLifetimeIncome = state.lifetimeIncome;

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
  if (state.workshop) {
    state.workshop.level = 1;
    state.workshop.experience = 0;
    state.workshop.experienceToNextLevel = 100;
    state.workshop.lifetimeRevenue = keepLifetimeIncome;
    state.workshop.firstServerAwarded = false;
  }
  state.stage3 = {
    entered: false,
    enteredAtMs: 0,
    infrastructure: { power: 0, computeCards: 0, optical: 0, storage: 0 },
    machineRooms: [],
    flagship: { activeId: null, progress: 0, startedAtMs: 0, completedIds: [], pendingReward: null },
    commissionBonusUntilMs: 0,
    bottleneck: null,
    blueprint: keepBlueprint,
    technologyArchive: keepTech,
    eraArchive: keepEra,
    projectProgress: 0,
    peakStats: { peakCompute: 0, peakIncomePerSec: 0, totalRequests: 0 },
  };

  state.technologyIterationCount = nextCount;
  state.permanentMultiplier = nextMult;
  state.lifetimeIncome = keepLifetimeIncome;
  state.ownedModelIds = keepOwnedModels;
  state.modelArchive = keepArchive;
  state.saveId = keepSaveId;
  state.settings = keepSettings;
  state.incomeAtLastPrestige = state.lifetimeIncome;
  state.updatedAtMs = Date.now();
  return { ok: true };
}

/** 顶部显示值：当前动态 "n/3"（不显示全序列）。 */
export function singularityDisplay(state: SaveData): string | null {
  if (!endgameMode(state)) return null;
  const count = state.singularity?.coresClaimed?.length ?? 0;
  return `${Math.min(MAX_ITERATIONS, count)}/${MAX_ITERATIONS}`;
}

// ---------- 核心奖励（核心1：批量购买已验证项目；核心2：流程压缩） ----------
export function batchPurchaseUnlocked(state: SaveData): boolean {
  if (!endgameMode(state)) return false;
  return (state.singularity?.coresClaimed ?? []).includes("core_1");
}

export function flowCompressionUnlocked(state: SaveData): boolean {
  if (!endgameMode(state)) return false;
  return (state.singularity?.coresClaimed ?? []).includes("core_2");
}

/** 批量购买可作用的已验证工程（核心 1 奖励；仅本轮已有或已完成的旗舰工程）。 */
export function bulkProjectIds(state: SaveData): string[] {
  if (!batchPurchaseUnlocked(state)) return [];
  const completed = state.stage3?.flagship?.completedIds ?? [];
  return FLAGSHIP_PROJECTS
    .map((p) => p.id)
    .filter((id) => completed.includes(id));
}

// ---------- 时代工程解锁/推进（R2/R3；R1 走现有旗舰 project_1..3 完成后追加） ----------
/** R2/R3 时代工程解锁条件：对应核心已领 + 本轮旗舰完成（project_3） + 三机房。 */
export function eraProjectUnlocked(state: SaveData, projectId: string): boolean {
  if (!endgameMode(state)) return false;
  if (!ERA_PROJECT_IDS_SET.has(projectId)) return false;
  const round = ERA_PROJECTS.find((project) => project.id === projectId)?.round;
  if (!round || currentRound(state) !== round) return false;
  if (state.stage3?.flagship?.activeId || state.stage3?.flagship?.pendingReward) return false;
  if ((state.stage3?.flagship?.completedIds ?? []).includes(projectId)) return false;
  if (projectId === "project_r1") {
    return roomCount(state) >= 3 && (state.stage3?.flagship?.completedIds ?? []).includes("project_3");
  }
  const requiredCore = coreIdForRound(round === 2 ? 1 : 2);
  if (!(state.singularity?.coresClaimed ?? []).includes(requiredCore)) return false;
  return roomCount(state) >= 3 && (state.stage3?.flagship?.completedIds ?? []).includes("project_3");
}

/** 时代工程进度速度（与旗舰同公式，但用 CARD-00 校准 cap：R2 14 / R3 18）。 */
export function eraProjectProgressPerSec(state: SaveData): Decimal {
  if (!endgameMode(state)) return new Decimal(0);
  const activeId = state.stage3?.flagship?.activeId;
  if (!activeId || !ERA_PROJECT_IDS_SET.has(activeId)) return new Decimal(0);
  const cap = activeId === "project_r3" ? 18 : 14;
  const compute = stage3TotalComputeSafe(state);
  return Decimal.min(compute.mul(0.001), new Decimal(cap));
}

function stage3TotalComputeSafe(state: SaveData): Decimal {
  // 复用现有 Stage 3 总算力公式（无循环依赖：仅从 stage3 导入 roomCount）。
  const base = new Decimal(state.serverPower).mul(modelComputeFactorSafe(state));
  const cards = new Decimal(1).plus((state.stage3?.infrastructure?.computeCards ?? 0) * 0.25);
  let roomMult = new Decimal(1);
  for (const r of state.stage3?.machineRooms ?? []) {
    roomMult = roomMult.mul(roomComputeMult(r.index));
  }
  return base.mul(cards).mul(roomMult);
}

function modelComputeFactorSafe(state: SaveData): Decimal {
  if (!state.modelProgress) return new Decimal(1);
  const def = MODELS.find((m) => m.id === state.modelProgress!.modelId);
  if (!def) return new Decimal(1);
  const archiveLevel = state.modelArchive?.[state.modelProgress.modelId]?.level ?? 1;
  const effectiveLevel = Math.min(def.maxLevel, Math.max(1, state.modelProgress.level) + Math.max(1, archiveLevel) - 1);
  return new Decimal(def.baseCompute).mul(1 + (effectiveLevel - 1) * 0.1);
}

function roomComputeMult(index: number): Decimal {
  // 与 MACHINE_ROOMS.computeMult 一致（避免在此引入 data/stage3 循环依赖面）。
  switch (index) {
    case 1: return new Decimal(1);
    case 2: return new Decimal(3);
    case 3: return new Decimal(12);
    default: return new Decimal(1);
  }
}

/** 时代工程完成奖励（领取核心前置；手动领取由 claimCore 完成）。 */
export function eraProjectRewardMultiplier(state: SaveData, projectId: string): Decimal {
  // 与旗舰存储奖励同规则（R1 走现有 flagshipRewardMultiplier）。
  if (projectId === "project_r1") return new Decimal(1);
  const bonusLevels = Math.max(0, (state.stage3?.infrastructure?.storage ?? 0) - 2);
  const bonus = Math.min(0.25, bonusLevels * 0.05);
  return new Decimal(1).plus(bonus);
}
