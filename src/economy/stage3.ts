// Stage 3 引擎：算力中心 / 基础设施 / 机房 / 旗舰工程 / 档案馆 / 第一次技术迭代。
// 纯规则实现，不依赖 DOM。命令原子化（失败不落盘）。
import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import type { SaveData } from "../save/types";
import {
  BLUEPRINTS,
  COMMISSION_BONUS_DURATION_SEC,
  COMMISSION_BONUS_MULT,
  ERA_PROJECTS,
  ERAS,
  FLAGSHIP_PROJECTS,
  infraById,
  infraUpgradeCost,
  MACHINE_ROOMS,
  projectById,
  TECH_ARCHIVES,
  type FlagshipProjectDef,
} from "../data/stage3";
import { MODELS, ORDERS } from "../data/content";
import { businessMixForState, modelEffectMultipliers } from "./model-effects";
import { currentRound, endgameMode } from "./singularity";

// ---------- 常量 ----------
/** 算力中心倍率（Stage 3 收入基座） */
export const CENTER_POWER_MULT = 1.0;
export const CENTER_INCOME_MULT = 1.0;

/** 基础设施满级 */
export const INFRA_MAX_LEVEL = 10;

/** 三个蓝图节点按服务器规模自动永久解锁，不再由玩家选择。 */
export const ARCHITECTURE_BLUEPRINT_SERVER_THRESHOLDS = [3, 5, 8] as const;
export const ARCHITECTURE_BLUEPRINT_TOTAL = ARCHITECTURE_BLUEPRINT_SERVER_THRESHOLDS.length;
const ARCHITECTURE_MULTIPLIER_BASE = "1.45";

// ---------- 工具 ----------
export function infraLevel(state: SaveData, id: string): number {
  const inf = state.stage3?.infrastructure;
  if (!inf) return 0;
  switch (id) {
    case "power": return inf.power;
    case "computeCards": return inf.computeCards;
    case "optical": return inf.optical;
    case "storage": return inf.storage;
    default: return 0;
  }
}

export function roomCount(state: SaveData): number {
  return state.stage3?.machineRooms?.length ?? 0;
}

export function hasRoom(state: SaveData, index: number): boolean {
  return (state.stage3?.machineRooms ?? []).some((r) => r.index === index);
}

/** 已达到的架构节点数量：服务器里程碑与永久档案取较大值。 */
export function architectureUnlockedCount(state: SaveData): number {
  const byServers = ARCHITECTURE_BLUEPRINT_SERVER_THRESHOLDS.filter(
    (threshold) => state.serverCount >= threshold,
  ).length;
  const owned = new Set(state.stage3?.blueprint?.owned ?? []);
  const byArchive = BLUEPRINTS.filter((blueprint) => owned.has(blueprint.id)).length;
  return Math.min(ARCHITECTURE_BLUEPRINT_TOTAL, Math.max(byServers, byArchive));
}

/** 架构蓝图全局经营倍率：1 / 1.45 / 2.1025 / 3.048625。 */
export function architectureMultiplier(state: SaveData): Decimal {
  return new Decimal(ARCHITECTURE_MULTIPLIER_BASE).pow(architectureUnlockedCount(state));
}

/** 将旧/稀疏蓝图状态收敛为固定顺序的永久解锁集合。 */
export function syncArchitectureBlueprints(state: SaveData): void {
  if (!state.stage3) return;
  const count = architectureUnlockedCount(state);
  const owned = BLUEPRINTS.slice(0, count).map((blueprint) => blueprint.id);
  const levels = Object.fromEntries(owned.map((id) => [id, 1]));
  state.stage3 = {
    ...state.stage3,
    blueprint: {
      owned,
      active: null,
      levels,
      chosenMilestones: [],
    },
  };
}

export function blueprintLevel(state: SaveData, id: string): number {
  return blueprintOwned(state, id) ? 1 : 0;
}

export function activeBlueprint(state: SaveData): string | null {
  return null;
}

export function blueprintOwned(state: SaveData, id: string): boolean {
  const index = BLUEPRINTS.findIndex((blueprint) => blueprint.id === id);
  return index >= 0 && index < architectureUnlockedCount(state);
}

export function technologyUnlocked(state: SaveData, id: string): boolean {
  return (state.stage3?.technologyArchive ?? []).some((t) => t.id === id);
}

export function eraReached(state: SaveData, id: string): boolean {
  return (state.stage3?.eraArchive ?? []).some((e) => e.id === id);
}

// ---------- 被动倍率 ----------
/** 科技档案永久被动汇总 */
export function techPassiveMultipliers(state: SaveData): {
  income: Decimal;
  compute: Decimal;
  throughput: Decimal;
  research: Decimal;
} {
  let income = new Decimal(1);
  let compute = new Decimal(1);
  let throughput = new Decimal(1);
  let research = new Decimal(1);
  for (const t of state.stage3?.technologyArchive ?? []) {
    const def = TECH_ARCHIVES.find((d) => d.id === t.id);
    if (!def?.passive) continue;
    if (def.passive.income) income = income.mul(1 + def.passive.income);
    if (def.passive.compute) compute = compute.mul(1 + def.passive.compute);
    if (def.passive.throughput) throughput = throughput.mul(1 + def.passive.throughput);
    if (def.passive.research) research = research.mul(1 + def.passive.research);
  }
  return { income, compute, throughput, research };
}

/** 兼容旧调用面的占位函数；旧的 +6%/+10%/+8% 蓝图被动已永久移除。 */
export function blueprintMultiplier(state: SaveData, kind: "general" | "gpu" | "interconnect"): Decimal {
  void state;
  void kind;
  return new Decimal(1);
}

// ---------- Stage 3 进入 ----------
export function stage3EntryMet(state: SaveData): boolean {
  return (
    state.serverCount >= 8 &&
    state.stage2?.settlementShown === true
  );
}

export function enterStage3(
  state: SaveData,
  nowMs = Date.now()
): { ok: boolean; error?: string } {
  if (!state.stage3?.entered) {
    if (!stage3EntryMet(state)) return { ok: false, error: "entry_not_met" };
    state.stage3 = {
      ...state.stage3,
      entered: true,
      enteredAtMs: nowMs,
      // 机房 1 首次投产沿用同一 60 秒投产红利；迁移/重复调用不重发。
      commissionBonusUntilMs: nowMs + COMMISSION_BONUS_DURATION_SEC * 1000,
    };
  }
  // 8 台服务器折叠为机房 1（集群核心机房）
  if (!hasRoom(state, 1)) {
    state.stage3 = {
      ...state.stage3,
      machineRooms: [
        ...(state.stage3?.machineRooms ?? []),
        { index: 1, id: "room_1", name: "era.room1.name", commissionedAtMs: nowMs },
      ],
    };
  }
  // 记录算力纪元：完整服务器集群 / 集群核心机房
  recordEra(state, "era_full_cluster");
  recordEra(state, "era_room1");
  return { ok: true };
}

// ---------- 算力纪元 ----------
export function recordEra(state: SaveData, eraId: string): void {
  const def = ERAS.find((e) => e.id === eraId);
  if (!def || !def.real) return;
  if (eraReached(state, eraId)) return;
  state.stage3 = {
    ...state.stage3,
    eraArchive: [...(state.stage3?.eraArchive ?? []), { id: eraId, reachedAtMs: Date.now() }],
  };
}

// ---------- 科技档案自动解锁 ----------
export function checkTechUnlocks(state: SaveData): string[] {
  if (!state.stage3?.entered) return [];
  const newly: string[] = [];
  for (const def of TECH_ARCHIVES) {
    if (technologyUnlocked(state, def.id)) continue;
    let met = false;
    if (def.unlock && "infra" in def.unlock && def.unlock.infra && "level" in def.unlock) {
      met = infraLevel(state, def.unlock.infra) >= def.unlock.level;
    } else if (def.unlock && "room" in def.unlock && !("infra" in def.unlock)) {
      met = hasRoom(state, (def.unlock as { room: number }).room);
    } else if (def.id === "tech_llm_training") {
      met = (state.stage3?.flagship?.completedIds ?? []).includes("project_1");
    }
    if (met) {
      state.stage3 = {
        ...state.stage3,
        technologyArchive: [...(state.stage3?.technologyArchive ?? []), { id: def.id, unlockedAtMs: Date.now() }],
      };
      newly.push(def.id);
    }
  }
  return newly;
}

// ---------- 基础设施 ----------
export function canUpgradeInfrastructure(state: SaveData, id: string): boolean {
  if (!state.stage3?.entered) return false;
  if (infraLevel(state, id) >= INFRA_MAX_LEVEL) return false;
  return new Decimal(state.money).gte(infraUpgradeCost(id, infraLevel(state, id)));
}

export function upgradeInfrastructure(state: SaveData, id: string): { ok: boolean; error?: string } {
  if (!state.stage3?.entered) return { ok: false, error: "stage3_not_entered" };
  const current = infraLevel(state, id);
  if (current >= INFRA_MAX_LEVEL) return { ok: false, error: "max_level" };
  const cost = infraUpgradeCost(id, current);
  if (new Decimal(state.money).lt(cost)) return { ok: false, error: "insufficient_funds" };
  state.money = toStoredBig(new Decimal(state.money).minus(cost));
  const inf = { ...state.stage3.infrastructure };
  inf[id as keyof typeof inf] = current + 1;
  state.stage3 = { ...state.stage3, infrastructure: inf };
  // 科技档案自动解锁
  checkTechUnlocks(state);
  return { ok: true };
}

// ---------- 瓶颈识别 ----------
export function bottleneckAnalysis(state: SaveData): {
  id: string;
  name: string;
  efficiency: number;
  upgradeEfficiency: number;
  projectedIncomeGain: Decimal;
} {
  const eff = effectiveEfficiency(state);
  // 对每种真实升级做同公式预演，按即时收入增量选择瓶颈；存储若只影响离线上限，不伪报即时收入。
  const currentIncome = stage3IncomePerSecond(state);
  const candidates: Array<{
    id: string;
    gain: Decimal;
    nextEfficiency: number;
  }> = [];
  for (const id of ["power", "computeCards", "optical", "storage"] as const) {
    const level = infraLevel(state, id);
    if (level >= INFRA_MAX_LEVEL) continue;
    const preview = structuredClone(state);
    preview.stage3.infrastructure[id] = level + 1;
    checkTechUnlocks(preview);
    candidates.push({
      id,
      gain: Decimal.max(stage3IncomePerSecond(preview).minus(currentIncome), 0),
      nextEfficiency: effectiveEfficiency(preview),
    });
  }
  if (candidates.length === 0) {
    return { id: "", name: "stage3.noBottleneck", efficiency: eff, upgradeEfficiency: eff, projectedIncomeGain: new Decimal(0) };
  }
  candidates.sort((a, b) => b.gain.comparedTo(a.gain));
  const top = candidates[0];
  const def = infraById(top.id);
  return {
    id: top.id,
    name: def.name,
    efficiency: eff,
    upgradeEfficiency: top.nextEfficiency,
    projectedIncomeGain: top.gain,
  };
}

/** 有效效率：由电力/光模块/蓝图/科技共同决定（0-1）。不造成损坏，只降载。 */
export function effectiveEfficiency(state: SaveData, overrideInfra?: string): number {
  const powerLvl = infraLevel(state, "power");
  const opticalLvl = infraLevel(state, "optical");
  // 电力不足降载：满 8 级 100%，否则 60% + 5%/级
  const powerEff = Math.min(1, 0.6 + 0.05 * powerLvl);
  // 光模块：满 8 级 100%，否则 70% + 4%/级
  const opticalEff = Math.min(1, 0.7 + 0.04 * opticalLvl);
  let eff = powerEff * opticalEff;
  const tech = techPassiveMultipliers(state).throughput.toNumber();
  eff = Math.min(1, eff * tech);
  if (overrideInfra) {
    const cur = infraLevel(state, overrideInfra);
    const next = cur + 1;
    const powerEff2 = overrideInfra === "power" ? Math.min(1, 0.6 + 0.05 * next) : powerEff;
    const opticalEff2 = overrideInfra === "optical" ? Math.min(1, 0.7 + 0.04 * next) : opticalEff;
    const eff2 = powerEff2 * opticalEff2;
    return Math.min(1, eff2 * tech);
  }
  return eff;
}

// ---------- 总算力 ----------
/** Stage 3 总算力 = 基础服务器算力 × 模型 compute × 算力卡 × 科技 compute × 机房倍率。 */
export function stage3TotalCompute(state: SaveData): Decimal {
  const base = new Decimal(state.serverPower).mul(modelComputeFactor(state));
  const cards = new Decimal(1).plus(infraLevel(state, "computeCards") * 0.25);
  const tech = techPassiveMultipliers(state).compute;
  let roomMult = new Decimal(1);
  for (const r of state.stage3?.machineRooms ?? []) {
    const def = MACHINE_ROOMS.find((d) => d.index === r.index);
    if (def) roomMult = roomMult.mul(def.computeMult);
  }
  return base.mul(cards).mul(tech).mul(roomMult);
}

function modelComputeFactor(state: SaveData): Decimal {
  // 复用现有模型处理能力（baseCompute × (1 + (level-1)*0.1)）
  if (!state.modelProgress) return new Decimal(1);
  const def = MODELS.find((m) => m.id === state.modelProgress!.modelId);
  if (!def) return new Decimal(1);
  const archiveLevel = state.modelArchive?.[state.modelProgress.modelId]?.level ?? 1;
  const effectiveLevel = Math.min(
    def.maxLevel,
    Math.max(1, state.modelProgress.level) + Math.max(1, archiveLevel) - 1,
  );
  return new Decimal(def.baseCompute)
    .mul(1 + (effectiveLevel - 1) * 0.1)
    .mul(modelEffectMultipliers(state).compute);
}

// ---------- Stage 3 收入 ----------
/** Stage 3 收入/秒 = Stage 2 完整收入（业务组合×4槽×compute×serverPower×中心×永久）
 *   × 有效效率 × 基础设施倍率（算力卡/电力） × 机房倍率 × 蓝图/科技 × 红利/费率。 */
export function stage3IncomePerSecond(state: SaveData, nowMs = Date.now()): Decimal {
  if (!state.stage3?.entered) return new Decimal(0);
  // 基础：完整 Stage 2 收入（进入 Stage 3 时 8 台服务器 + 模型已产出可观收入）
  const baseAuto = businessMixNetPerSecLocal(state).mul(4)
    .mul(modelComputeFactor(state))
    .mul(new Decimal(state.serverPower))
    .mul(new Decimal(state.permanentMultiplier));
  const eff = new Decimal(effectiveEfficiency(state));
  // 基础设施放大：算力卡每级 +15%，电力每级 +5%（都直接放大收入）
  const cardMult = new Decimal(1).plus(infraLevel(state, "computeCards") * 0.15);
  const powerMult = new Decimal(1).plus(infraLevel(state, "power") * 0.05);
  let roomMult = new Decimal(1);
  for (const r of state.stage3?.machineRooms ?? []) {
    const def = MACHINE_ROOMS.find((d) => d.index === r.index);
    if (def) roomMult = roomMult.mul(def.incomeMult);
  }
  const architecture = architectureMultiplier(state);
  const tech = techPassiveMultipliers(state).income;
  const modelEffects = modelEffectMultipliers(state);
  // 投产红利
  let bonus = new Decimal(1);
  if (nowMs < (state.stage3?.commissionBonusUntilMs ?? 0)) {
    bonus = new Decimal(COMMISSION_BONUS_MULT);
  }
  // 旗舰工程费率加成（全国推理服务网络完成奖励）
  let rateBonus = new Decimal(1);
  if ((state.stage3?.flagship?.completedIds ?? []).includes("project_2")) {
    const def = FLAGSHIP_PROJECTS.find((p) => p.id === "project_2");
    if (def?.reward.rateBonus) rateBonus = new Decimal(1).plus(def.reward.rateBonus);
  }
  return baseAuto
    .mul(eff)
    .mul(cardMult)
    .mul(powerMult)
    .mul(roomMult)
    .mul(tech)
    .mul(modelEffects.income)
    .mul(modelEffects.automation)
    .mul(architecture)
    .mul(bonus)
    .mul(rateBonus);
}

/** Stage 2 基础自动收入（复用业务组合公式：加权净收入/秒 × 4 槽；不引入循环依赖） */
function businessMixNetPerSecLocal(state: SaveData): Decimal {
  const mix = businessMixForState(state);
  const totalShare = mix.reduce((acc, m) => acc + m.share, 0);
  let weighted = new Decimal(0);
  for (const m of mix) {
    const def = ORDERS.find((o) => o.id === m.orderId);
    if (!def) continue;
    const net = new Decimal(def.gross).mul(1 - def.rentalCostRatio);
    weighted = weighted.plus(net.div(def.durationSec).mul(m.share));
  }
  return weighted.div(totalShare);
}

/** Stage 2 基础自动收入（复用业务组合公式，不含中心倍率） */
function baseAutoIncome(state: SaveData): Decimal {
  return businessMixNetPerSecLocal(state).mul(4);
}

// ---------- 机房投产 ----------
export function roomRequirementsMet(state: SaveData, index: number): boolean {
  const def = MACHINE_ROOMS.find((r) => r.index === index);
  if (!def) return false;
  if (def.index === 1) return true; // 机房 1 进入 Stage 3 即拥有
  return (
    infraLevel(state, "power") >= def.requires.power &&
    infraLevel(state, "computeCards") >= def.requires.computeCards &&
    infraLevel(state, "optical") >= def.requires.optical &&
    infraLevel(state, "storage") >= def.requires.storage
  );
}

export function canCommissionRoom(state: SaveData, index: number): boolean {
  if (!state.stage3?.entered) return false;
  if (hasRoom(state, index)) return false;
  // 机房必须按顺序：先有 index-1
  if (index > 1 && !hasRoom(state, index - 1)) return false;
  // 机房 2/3 需要对应旗舰工程解锁建设资格
  if (index === 2 || index === 3) {
    const gate = index === 2 ? "project_1" : "project_2";
    if (!(state.stage3?.flagship?.completedIds ?? []).includes(gate)) return false;
  }
  return roomRequirementsMet(state, index);
}

export function commissionRoom(
  state: SaveData,
  index: number,
  nowMs = Date.now()
): { ok: boolean; error?: string } {
  if (!canCommissionRoom(state, index)) return { ok: false, error: "requirements_not_met" };
  const def = MACHINE_ROOMS.find((r) => r.index === index)!;
  const now = nowMs;
  state.stage3 = {
    ...state.stage3!,
    machineRooms: [...(state.stage3!.machineRooms ?? []), {
      index: def.index,
      id: def.id,
      name: def.name,
      commissionedAtMs: now,
    }],
    // 投产红利：60 个真实墙钟秒收入 ×4；同一时间窗只保留一个到期时间。
    commissionBonusUntilMs: now + COMMISSION_BONUS_DURATION_SEC * 1000,
  };
  // 算力纪元记录
  if (index === 2) recordEra(state, "era_room2");
  if (index === 3) recordEra(state, "era_room3");
  // 科技档案自动解锁（区域算力网络）
  checkTechUnlocks(state);
  return { ok: true };
}

// ---------- 旗舰工程 ----------
export function flagshipProgressRequired(def: FlagshipProjectDef): number {
  return def.progressRequired;
}

export function flagshipUnlocked(state: SaveData, def: FlagshipProjectDef): boolean {
  if (!state.stage3?.entered) return false;
  if ((state.stage3.flagship.completedIds ?? []).includes(def.id)) return false;
  if (roomCount(state) < def.requiresRooms) return false;
  const compute = stage3TotalCompute(state);
  if (compute.lt(def.requiresCompute)) return false;
  if (def.requiresOptical && infraLevel(state, "optical") < def.requiresOptical) return false;
  return true;
}

/** 时代工程（project_r1/r2/r3）解锁：仅当前地球轮次的唯一工程可见。 */
export function eraProjectUnlocked(state: SaveData, projectId: string): boolean {
  if (!endgameMode(state)) return false;
  const def = ERA_PROJECTS.find((p) => p.id === projectId);
  if (!def) return false;
  const projectRound: 1 | 2 | 3 = projectId === "project_r1" ? 1 : projectId === "project_r2" ? 2 : 3;
  if (currentRound(state) !== projectRound) return false;
  if (state.stage3?.flagship?.activeId) return false;
  if (state.stage3?.flagship?.pendingReward) return false;
  if ((state.stage3?.flagship?.completedIds ?? []).includes(projectId)) return false;
  if (projectId === "project_r1") {
    // 方案 C：旗舰 project_3 完成后追加。
    return roomCount(state) >= 3 && (state.stage3?.flagship?.completedIds ?? []).includes("project_3");
  }
  // R2 需核心 1 已领；R3 需核心 2 已领。
  const requiredCore = projectId === "project_r2" ? "core_1" : "core_2";
  if (!(state.singularity?.coresClaimed ?? []).includes(requiredCore)) return false;
  return roomCount(state) >= 3 && (state.stage3?.flagship?.completedIds ?? []).includes("project_3");
}

export function canStartFlagship(state: SaveData, projectId: string): boolean {
  if (state.stage3?.flagship?.activeId) return false; // 同一时间最多一个，运行中禁止重启/清零进度
  if (state.stage3?.flagship?.pendingReward) return false; // 有待领奖励时不能开新工程
  const def = FLAGSHIP_PROJECTS.find((p) => p.id === projectId);
  if (!def) {
    // 时代工程复用旗舰机制，但解锁规则独立。
    if (endgameMode(state) && ERA_PROJECTS.some((p) => p.id === projectId)) {
      return eraProjectUnlocked(state, projectId);
    }
    return false;
  }
  return flagshipUnlocked(state, def);
}

export function startFlagship(
  state: SaveData,
  projectId: string,
  nowMs = Date.now()
): { ok: boolean; error?: string } {
  if (!canStartFlagship(state, projectId)) return { ok: false, error: "not_unlockable" };
  state.stage3 = {
    ...state.stage3!,
    flagship: {
      ...state.stage3!.flagship,
      activeId: projectId,
      progress: 0,
      startedAtMs: nowMs,
    },
    projectProgress: 0,
  };
  return { ok: true };
}

/** 旗舰工程每秒进度推进（由总算力驱动；离线同样推进） */
export function flagshipProgressPerSec(state: SaveData): Decimal {
  if (!state.stage3?.entered) return new Decimal(0);
  const activeId = state.stage3.flagship.activeId;
  if (!activeId) return new Decimal(0);
  // CARD-01 时代工程：独立速度公式（算力×0.001，cap 14/18），避免正式旗舰 25 cap 污染。
  const eraDef = ERA_PROJECTS.find((p) => p.id === activeId);
  if (eraDef && endgameMode(state)) {
    const compute = stage3TotalCompute(state);
    const cap = eraDef.id === "project_r3" ? 18 : 14;
    return Decimal.min(compute.mul(0.001), new Decimal(cap));
  }
  const def = FLAGSHIP_PROJECTS.find((p) => p.id === activeId);
  if (!def) return new Decimal(0);
  const compute = stage3TotalCompute(state);
  const opticalSpeed = new Decimal(1).plus(infraLevel(state, "optical") * 0.04);
  const modelSpeed = modelEffectMultipliers(state).flagship;
  // 进度 = 算力 × 光模块 × 旗舰模型职责 × 0.001/秒，上限 25/秒。
  // 存储不进入工程速度公式，只影响最终资金奖励与离线容量。
  // 但工程完成时间被钳制在可读范围（工程1 ≈5分钟 / 工程2 ≈5分钟 / 工程3 ≈10分钟）
  return Decimal.min(compute.mul(opticalSpeed).mul(modelSpeed).mul(0.001), new Decimal(25));
}

export const FLAGSHIP_STORAGE_REWARD_PER_LEVEL = 0.05;
export const FLAGSHIP_STORAGE_REWARD_CAP = 0.25;

/** 存储只提高旗舰工程的最终资金奖励；不改变工程进度。 */
export function flagshipRewardMultiplier(state: SaveData, projectId: string): Decimal {
  const eraDef = ERA_PROJECTS.find((p) => p.id === projectId);
  if (eraDef && endgameMode(state)) {
    return new Decimal(1); // 时代工程奖励统一为“奇点核心”，无资金/研发奖励。
  }
  const def = FLAGSHIP_PROJECTS.find((project) => project.id === projectId);
  if (!def) return new Decimal(1);
  const bonusLevels = Math.max(0, infraLevel(state, "storage") - def.requiresStorage);
  const bonus = Math.min(FLAGSHIP_STORAGE_REWARD_CAP, bonusLevels * FLAGSHIP_STORAGE_REWARD_PER_LEVEL);
  return new Decimal(1).plus(bonus);
}

/** 推进旗舰工程（在线/离线共用） */
export function advanceFlagship(state: SaveData, elapsedSec: number): { completed: boolean } {
  if (!state.stage3?.entered) return { completed: false };
  if (!state.stage3.flagship.activeId) return { completed: false };
  if (state.stage3.flagship.pendingReward) return { completed: false };
  const activeId = state.stage3.flagship.activeId;
  const def = FLAGSHIP_PROJECTS.find((p) => p.id === activeId)
    ?? (endgameMode(state) ? ERA_PROJECTS.find((p) => p.id === activeId) : undefined);
  if (!def) return { completed: false };
  const perSec = flagshipProgressPerSec(state);
  const progress = (state.stage3.projectProgress ?? 0) + perSec.mul(elapsedSec).toNumber();
  if (progress >= def.progressRequired) {
    // 完成：置待领取（不自动领奖）
    state.stage3 = {
      ...state.stage3,
      projectProgress: def.progressRequired,
      flagship: {
        ...state.stage3.flagship,
        activeId: null,
        progress: def.progressRequired,
        pendingReward: {
          projectId: def.id,
          rewardMultiplier: flagshipRewardMultiplier(state, def.id).toNumber(),
        },
      },
    };
    return { completed: true };
  }
  state.stage3 = {
    ...state.stage3,
    projectProgress: progress,
    flagship: { ...state.stage3.flagship, progress },
  };
  return { completed: false };
}

export function hasPendingFlagshipReward(state: SaveData): string | null {
  return state.stage3?.flagship?.pendingReward?.projectId ?? null;
}

/** 领取旗舰工程奖励（手动，exactly-once） */
export function claimFlagshipReward(state: SaveData): { ok: boolean; error?: string; projectId?: string } {
  const projectId = hasPendingFlagshipReward(state);
  if (!projectId) return { ok: false, error: "no_pending_reward" };
  // CARD-01 时代工程：领取完成态只记录 completedIds，不发放资金/研发奖励
  // （“奇点核心”由 singularity.claimCore 单独手动领取，exactly-once）。
  const eraDef = ERA_PROJECTS.find((p) => p.id === projectId);
  if (eraDef && endgameMode(state)) {
    state.stage3 = {
      ...state.stage3!,
      flagship: {
        ...state.stage3!.flagship,
        completedIds: [...(state.stage3!.flagship.completedIds ?? []), projectId],
        pendingReward: null,
      },
    };
    return { ok: true, projectId };
  }
  const def = FLAGSHIP_PROJECTS.find((p) => p.id === projectId)!;
  const storedMultiplier = state.stage3?.flagship?.pendingReward?.rewardMultiplier;
  const rewardMultiplier = Number.isFinite(storedMultiplier) && (storedMultiplier ?? 0) >= 1
    ? new Decimal(storedMultiplier as number)
    : flagshipRewardMultiplier(state, projectId);
  // 奖励入账
  if (def.reward.money > 0) {
    const moneyReward = new Decimal(def.reward.money).mul(rewardMultiplier).floor();
    state.money = toStoredBig(new Decimal(state.money).plus(moneyReward));
    state.lifetimeIncome = toStoredBig(new Decimal(state.lifetimeIncome).plus(moneyReward));
    state.workshop.lifetimeRevenue = state.lifetimeIncome;
  }
  if (def.reward.researchProgress > 0) {
    state.modelResearch = {
      ...state.modelResearch,
      progress: Math.min(100, (state.modelResearch?.progress ?? 0) + def.reward.researchProgress),
    };
  }
  // 完成记录（解锁建设资格/迭代）
  state.stage3 = {
    ...state.stage3!,
    flagship: {
      ...state.stage3!.flagship,
      completedIds: [...(state.stage3!.flagship.completedIds ?? []), projectId],
      pendingReward: null,
    },
  };
  // 工程 1 奖励：解锁更高算力卡等级（科技档案由 checkTechUnlocks 处理）
  if (def.reward.computeCardBoost) {
    state.stage3 = {
      ...state.stage3,
      infrastructure: {
        ...state.stage3.infrastructure,
        computeCards: Math.min(INFRA_MAX_LEVEL, state.stage3.infrastructure.computeCards + def.reward.computeCardBoost),
      },
    };
  }
  if (projectId === "project_2") recordEra(state, "era_national");
  checkTechUnlocks(state);
  return { ok: true, projectId };
}

// ---------- 集群架构蓝图 ----------
export function blueprintChoiceAvailable(state: SaveData): "server3" | "server8" | "iteration" | null {
  void state;
  return null;
}

export function chooseBlueprint(state: SaveData, blueprintId: string): { ok: boolean; error?: string } {
  void state;
  void blueprintId;
  return { ok: false, error: "blueprint_auto_unlock" };
}

// ---------- 模型研发（Stage 3 增强） ----------
/** 研发速度 = 基础 × 科技档案研发被动（大模型集中训练设施 +5%） */
export function researchSpeedMultiplier(state: SaveData): Decimal {
  return techPassiveMultipliers(state).research.mul(modelEffectMultipliers(state).research);
}

// ---------- 第一次技术迭代 ----------
export function iterationRequirementsMet(state: SaveData): boolean {
  // CARD-01 终局档：三次迭代由 singularity 状态机接管（含 R1 时代工程）。
  if (endgameMode(state)) return false;
  if (!state.stage3?.entered) return false;
  if (roomCount(state) < 3) return false;
  const completed = state.stage3.flagship.completedIds ?? [];
  if (!completed.includes("project_3")) return false;
  return true;
}

export function canIterate(state: SaveData): boolean {
  return state.technologyIterationCount < 1 && iterationRequirementsMet(state);
}

export function iterationSummary(state: SaveData): {
  machineRooms: number;
  peakCompute: string;
  peakIncomePerSec: string;
  totalRequests: string;
  models: number;
  blueprints: number;
  timeLabel: string;
} {
  return {
    machineRooms: roomCount(state),
    peakCompute: new Decimal(state.stage3?.peakStats?.peakCompute ?? 0).floor().toFixed(0),
    peakIncomePerSec: new Decimal(state.stage3?.peakStats?.peakIncomePerSec ?? 0).floor().toFixed(0),
    totalRequests: new Decimal(state.stage3?.peakStats?.totalRequests ?? 0).floor().toFixed(0),
    models: state.ownedModelIds.length,
    blueprints: state.stage3?.blueprint?.owned?.length ?? 0,
    timeLabel: "",
  };
}

/** 执行第一次技术迭代（原子；保留档案馆永久数据） */
export function applyFirstIteration(state: SaveData): { ok: boolean; error?: string } {
  if (endgameMode(state)) return { ok: false, error: "use_endgame_iteration" };
  if (!canIterate(state)) return { ok: false, error: "not_ready" };
  syncArchitectureBlueprints(state);
  // 永久保留
  const keepOwnedModels = [...state.ownedModelIds];
  const keepBlueprint = state.stage3?.blueprint
    ? {
        owned: [...state.stage3.blueprint.owned],
        active: null,
        levels: Object.fromEntries(state.stage3.blueprint.owned.map((id) => [id, 1])),
        chosenMilestones: [],
      }
    : { owned: [], active: null, levels: {}, chosenMilestones: [] };
  const keepTech = state.stage3?.technologyArchive ? [...state.stage3.technologyArchive] : [];
  const keepEra = state.stage3?.eraArchive ? [...state.stage3.eraArchive] : [];
  const keepSaveId = state.saveId;
  const keepSettings = { ...state.settings };
  const keepLifetimeIncome = state.lifetimeIncome;
  const nextCount = 1;
  const nextMult = new Decimal(2).toNumber();

  // 重置：资金 / 工作室等级经验 / 服务器 / 机房 / 基础设施 / 本轮模型训练 / 旗舰工程
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
  // Stage 3 重置（保留档案馆）
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

  // 永久写回
  state.technologyIterationCount = nextCount;
  state.permanentMultiplier = nextMult;
  state.lifetimeIncome = keepLifetimeIncome;
  state.ownedModelIds = keepOwnedModels;
  state.saveId = keepSaveId;
  state.settings = keepSettings;
  state.incomeAtLastPrestige = state.lifetimeIncome;
  state.updatedAtMs = Date.now();
  return { ok: true };
}

/** 第二轮加速：研发速度永久 +25%（第一次迭代奖励） */
export function iterationResearchBonus(state: SaveData): Decimal {
  if (endgameMode(state)) {
    // CARD-01：三次迭代由 singularity 状态机接管；正式档的 ×1.25 奖励不叠加污染。
    return new Decimal(1);
  }
  if (state.technologyIterationCount > 0) return new Decimal(1.25);
  return new Decimal(1);
}

/** 所有永久研发加速的真实乘积：技术迭代 × 科技档案。 */
export function researchProgressMultiplier(state: SaveData): Decimal {
  return iterationResearchBonus(state).mul(researchSpeedMultiplier(state));
}
