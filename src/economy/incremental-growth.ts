import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import { MODEL_ARCHIVE_MAX_LEVEL, MODELS, SERVERS } from "../data/content";
import { modelEffectMultipliers } from "./model-effects";
// 注意：achievements 依赖 stage3/stage4/stage5，而 stage3 反向依赖本模块；
// 因此这里只在函数体内引用其导出，避免模块初始化期的循环 TDZ。
import { ACHIEVEMENTS, achievementStageValue, evaluateAchievements } from "./achievements";
import type {
  AchievementRecord,
  IncrementalGrowthState,
  SaveData,
  TalentNodeId,
} from "../save/types";

export const BLUEPRINT_LEVEL_MILESTONES = [5, 10, 20, 30, 40] as const;
export const SERVER_SCALE_MILESTONES = [1, 10, 25, 50, 100] as const;
export const WORKSHOP_TALENT_LEVELS = [5, 10, 20, 35, 55, 80, 110, 145, 185, 230, 270, 310] as const;
export const TALENT_POINT_CAP = 15;
export const TALENT_NODE_MAX_LEVEL = 3;

export const TALENT_NODE_IDS: ReadonlyArray<TalentNodeId> = [
  "blueprint_power",
  "blueprint_efficiency",
  "blueprint_milestone",
  "scale_power",
  "scale_efficiency",
  "scale_milestone",
];

export interface TalentNodeDef {
  id: TalentNodeId;
  branch: "blueprint" | "scale";
  tier: 1 | 2 | 3;
  nameKey: string;
  descriptionKey: string;
}

export const TALENT_NODES: ReadonlyArray<TalentNodeDef> = [
  { id: "blueprint_power", branch: "blueprint", tier: 1, nameKey: "growth.talent.blueprintPower", descriptionKey: "growth.talent.blueprintPowerDesc" },
  { id: "blueprint_efficiency", branch: "blueprint", tier: 2, nameKey: "growth.talent.blueprintEfficiency", descriptionKey: "growth.talent.blueprintEfficiencyDesc" },
  { id: "blueprint_milestone", branch: "blueprint", tier: 3, nameKey: "growth.talent.blueprintMilestone", descriptionKey: "growth.talent.blueprintMilestoneDesc" },
  { id: "scale_power", branch: "scale", tier: 1, nameKey: "growth.talent.scalePower", descriptionKey: "growth.talent.scalePowerDesc" },
  { id: "scale_efficiency", branch: "scale", tier: 2, nameKey: "growth.talent.scaleEfficiency", descriptionKey: "growth.talent.scaleEfficiencyDesc" },
  { id: "scale_milestone", branch: "scale", tier: 3, nameKey: "growth.talent.scaleMilestone", descriptionKey: "growth.talent.scaleMilestoneDesc" },
];

const BLUEPRINT_BASE_COSTS: Record<string, number> = {
  codex: 180,
  // 六档蓝图按 1:2:4:8:16:64 起步，最高档仍是稀缺的长期投资。
  vision: 360,
  voice: 720,
  science: 1_440,
  distill: 2_880,
  scheduler: 11_520,
};

const BLUEPRINT_COST_GROWTH = 1.235;
const SCALE_COST_GROWTH = 1.16;
const MAX_BATCH_STEPS = 500;

export function emptyTalentAllocations(): Record<TalentNodeId, number> {
  return {
    blueprint_power: 0,
    blueprint_efficiency: 0,
    blueprint_milestone: 0,
    scale_power: 0,
    scale_efficiency: 0,
    scale_milestone: 0,
  };
}

export function freshIncrementalGrowth(): IncrementalGrowthState {
  return {
    blueprintBaseLevels: {},
    legacyModelId: null,
    serverUnits: {},
    serverBaseUnits: {},
    talent: {
      highestWorkshopLevel: 1,
      claimedWorkshopLevels: [],
      claimedCoreIds: [],
      claimedAchievementIds: [],
      achievementRecords: {},
      pointsEarned: 0,
      allocations: emptyTalentAllocations(),
    },
  };
}

export function normalizeGrowthState(
  raw: unknown,
  context: Pick<SaveData, "modelProgress" | "modelArchive" | "serverCount" | "workshop" | "singularity">,
): IncrementalGrowthState {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawTalent = source.talent && typeof source.talent === "object"
    ? source.talent as Record<string, unknown>
    : {};
  const normalizeLevelRecord = (value: unknown, max: number): Record<string, number> => {
    const result: Record<string, number> = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;
    for (const [id, level] of Object.entries(value as Record<string, unknown>)) {
      if (typeof level !== "number" || !Number.isFinite(level)) continue;
      result[id] = Math.min(max, Math.max(0, Math.floor(level)));
    }
    return result;
  };
  const currentBlueprints = Object.fromEntries(MODELS.map((model) => [
    model.id,
    Math.min(MODEL_ARCHIVE_MAX_LEVEL, Math.max(0, context.modelArchive?.[model.id]?.level ?? 0)),
  ]));
  const suppliedBlueprintBase = normalizeLevelRecord(source.blueprintBaseLevels, MODEL_ARCHIVE_MAX_LEVEL);
  const blueprintBaseLevels = Object.keys(suppliedBlueprintBase).length > 0
    ? suppliedBlueprintBase
    : currentBlueprints;
  const suppliedUnits = normalizeLevelRecord(source.serverUnits, 1_000_000);
  const suppliedBaseUnits = normalizeLevelRecord(source.serverBaseUnits, 1_000_000);
  const serverUnits: Record<string, number> = {};
  const serverBaseUnits: Record<string, number> = {};
  for (const server of SERVERS) {
    const owned = context.serverCount >= server.index;
    const units = Math.max(owned ? 1 : 0, suppliedUnits[server.id] ?? 0);
    serverUnits[server.id] = units;
    serverBaseUnits[server.id] = Math.min(
      units,
      suppliedBaseUnits[server.id] ?? (owned ? 1 : 0),
    );
  }
  const claimedWorkshopLevels = Array.isArray(rawTalent.claimedWorkshopLevels)
    ? [...new Set(rawTalent.claimedWorkshopLevels
        .filter((level): level is number => typeof level === "number" && WORKSHOP_TALENT_LEVELS.includes(level as never)))]
    : [];
  const claimedCoreIds = Array.isArray(rawTalent.claimedCoreIds)
    ? [...new Set(rawTalent.claimedCoreIds.filter((id): id is string => typeof id === "string" && /^core_[123]$/.test(id)))]
    : [];
  // 负责人验收反馈：天赋点新来源为成就领取。旧工作室/核心记录只保留不回退，不再自动补发。
  const claimedAchievementIds = Array.isArray(rawTalent.claimedAchievementIds)
    ? [...new Set(rawTalent.claimedAchievementIds.filter((id): id is string => typeof id === "string"))]
    : [];
  // CARD-03：达成记录快照（时间/阶段/工作室等级）。旧档无记录时置空，展示层回退到当前状态。
  const rawRecords = rawTalent.achievementRecords && typeof rawTalent.achievementRecords === "object"
    ? rawTalent.achievementRecords as Record<string, unknown>
    : {};
  const achievementRecords: Record<string, AchievementRecord> = {};
  for (const [id, value] of Object.entries(rawRecords)) {
    if (!claimedAchievementIds.includes(id) || typeof value !== "object" || value === null) continue;
    const entry = value as Record<string, unknown>;
    const achievedAtMs = typeof entry.achievedAtMs === "number" && Number.isFinite(entry.achievedAtMs)
      ? Math.max(0, Math.floor(entry.achievedAtMs))
      : 0;
    const stage = typeof entry.stage === "number" && Number.isFinite(entry.stage)
      ? Math.min(5, Math.max(1, Math.floor(entry.stage)))
      : 1;
    const workshopLevel = typeof entry.workshopLevel === "number" && Number.isFinite(entry.workshopLevel)
      ? Math.max(1, Math.floor(entry.workshopLevel))
      : 1;
    achievementRecords[id] = { achievedAtMs, stage, workshopLevel };
  }
  const rawAllocations = rawTalent.allocations && typeof rawTalent.allocations === "object"
    ? rawTalent.allocations as Record<string, unknown>
    : {};
  const allocations = emptyTalentAllocations();
  for (const id of TALENT_NODE_IDS) {
    const value = rawAllocations[id];
    allocations[id] = typeof value === "number" && Number.isFinite(value)
      ? Math.min(TALENT_NODE_MAX_LEVEL, Math.max(0, Math.floor(value)))
      : 0;
  }
  let spent = Object.values(allocations).reduce((sum, value) => sum + value, 0);
  const highestWorkshopLevel = Math.max(
    context.workshop?.level ?? 1,
    typeof rawTalent.highestWorkshopLevel === "number" && Number.isFinite(rawTalent.highestWorkshopLevel)
      ? Math.floor(rawTalent.highestWorkshopLevel)
      : 1,
  );
  const pointsEarned = Math.min(
    TALENT_POINT_CAP,
    claimedWorkshopLevels.length + claimedCoreIds.length + claimedAchievementIds.length,
  );
  // 损坏/高版本异常分配按固定顺序回收到可用点数以内。
  if (spent > pointsEarned) {
    for (const id of [...TALENT_NODE_IDS].reverse()) {
      while (allocations[id] > 0 && spent > pointsEarned) {
        allocations[id] -= 1;
        spent -= 1;
      }
    }
  }
  return {
    blueprintBaseLevels,
    legacyModelId: typeof source.legacyModelId === "string"
      ? source.legacyModelId
      : context.modelProgress?.modelId ?? null,
    serverUnits,
    serverBaseUnits,
    talent: {
      highestWorkshopLevel,
      claimedWorkshopLevels: claimedWorkshopLevels.sort((a, b) => a - b),
      claimedCoreIds,
      claimedAchievementIds,
      achievementRecords,
      pointsEarned,
      allocations,
    },
  };
}

export function ensureGrowthState(state: SaveData): IncrementalGrowthState {
  const growth = state.growth as IncrementalGrowthState | null | undefined;
  const allocations = growth?.talent?.allocations;
  const valid = growth != null
    && growth.blueprintBaseLevels != null
    && growth.serverUnits != null
    && growth.serverBaseUnits != null
    && growth.talent != null
    && allocations != null
    && Array.isArray(growth.talent.claimedAchievementIds)
    && growth.talent.achievementRecords != null
    && TALENT_NODE_IDS.every((id) => Number.isFinite(allocations[id]));
  // Repository/load 已执行完整 normalize；运行期不要在每次读取时替换对象，
  // 否则同一事务中持有的 growth 引用会在第二次 ensure 后失效。
  if (!valid) state.growth = normalizeGrowthState(state.growth, state);
  return state.growth;
}

export function syncTalentPoints(state: SaveData): number {
  const growth = ensureGrowthState(state);
  const before = growth.talent.pointsEarned;
  growth.talent.highestWorkshopLevel = Math.max(growth.talent.highestWorkshopLevel, state.workshop?.level ?? 1);
  // 负责人验收反馈：天赋点唯一新来源是荣誉馆成就领取。
  // claimedWorkshopLevels / claimedCoreIds 仅作旧档迁移兼容（不回退、不再补发）。
  growth.talent.pointsEarned = Math.min(
    TALENT_POINT_CAP,
    growth.talent.claimedWorkshopLevels.length
      + growth.talent.claimedCoreIds.length
      + growth.talent.claimedAchievementIds.length,
  );
  return growth.talent.pointsEarned - before;
}

/** 荣誉馆领取成就 → +1 天赋点（上限 15；重复领取与未达成返回错误）。 */
export function claimAchievement(state: SaveData, id: string): { ok: boolean; error?: string; pointsGranted?: number } {
  const growth = ensureGrowthState(state);
  if (growth.talent.claimedAchievementIds.includes(id)) return { ok: false, error: "achievement_claimed" };
  if (!ACHIEVEMENTS.some((definition) => definition.id === id)) return { ok: false, error: "unknown_achievement" };
  const status = evaluateAchievements(state).find((item) => item.id === id);
  if (!status?.achieved) return { ok: false, error: "achievement_locked" };
  if (growth.talent.pointsEarned >= TALENT_POINT_CAP) return { ok: false, error: "talent_cap" };
  const before = growth.talent.pointsEarned;
  growth.talent.claimedAchievementIds.push(id);
  // CARD-03：领取时快照达成信息（时间只增不减，取已观测到的最大设备时间为下限）。
  const floor = Math.max(
    0,
    Math.floor(state.chronicle?.maxObservedDeviceAtMs ?? 0),
    Math.floor(state.updatedAtMs ?? 0),
    Math.floor(state.createdAtMs ?? 0),
  );
  const achievedAtMs = Math.max(floor, Math.floor(status.achievedAtMs ?? 0));
  growth.talent.achievementRecords = {
    ...growth.talent.achievementRecords,
    [id]: {
      achievedAtMs,
      stage: achievementStageValue(state),
      workshopLevel: Math.max(1, Math.floor(state.workshop?.level ?? 1)),
    },
  };
  syncTalentPoints(state);
  return { ok: true, pointsGranted: Math.max(0, growth.talent.pointsEarned - before) };
}

export function talentPointsSpent(state: SaveData): number {
  return Object.values(ensureGrowthState(state).talent.allocations).reduce((sum, value) => sum + value, 0);
}

export function talentPointsAvailable(state: SaveData): number {
  syncTalentPoints(state);
  return Math.max(0, state.growth.talent.pointsEarned - talentPointsSpent(state));
}

export function talentLevel(state: SaveData, id: TalentNodeId): number {
  return ensureGrowthState(state).talent.allocations[id] ?? 0;
}

export function allocateTalent(state: SaveData, id: TalentNodeId): { ok: boolean; error?: string } {
  const def = TALENT_NODES.find((node) => node.id === id);
  if (!def) return { ok: false, error: "unknown_talent" };
  const growth = ensureGrowthState(state);
  if (growth.talent.allocations[id] >= TALENT_NODE_MAX_LEVEL) return { ok: false, error: "talent_max" };
  if (talentPointsAvailable(state) <= 0) return { ok: false, error: "no_talent_points" };
  if (def.tier > 1) {
    const previous = TALENT_NODES.find((node) => node.branch === def.branch && node.tier === def.tier - 1)!;
    if (growth.talent.allocations[previous.id] < TALENT_NODE_MAX_LEVEL) return { ok: false, error: "talent_prerequisite" };
  }
  growth.talent.allocations[id] += 1;
  return { ok: true };
}

export function resetTalents(state: SaveData): { ok: boolean; error?: string } {
  ensureGrowthState(state).talent.allocations = emptyTalentAllocations();
  return { ok: true };
}

function reachedMilestones(level: number, milestones: readonly number[]): number {
  return milestones.filter((threshold) => level >= threshold).length;
}

function blueprintRawMultiplier(levels: Record<string, number>, milestoneTalent = 0): Decimal {
  return MODELS.reduce((total, model) => {
    const level = Math.max(0, levels[model.id] ?? 0);
    if (level <= 0) return total;
    const levelGain = new Decimal(level).mul(0.0125);
    const milestoneGain = new Decimal(reachedMilestones(level, BLUEPRINT_LEVEL_MILESTONES))
      .mul(0.035)
      .mul(1 + milestoneTalent * 0.05);
    return total.mul(new Decimal(1).plus(levelGain).plus(milestoneGain));
  }, new Decimal(1));
}

/** v7新增蓝图算力相对倍率；迁移/首次获得的基线固定为×1。 */
export function blueprintGrowthMultiplier(state: SaveData): Decimal {
  const growth = ensureGrowthState(state);
  const current = Object.fromEntries(MODELS.map((model) => [model.id, state.modelArchive?.[model.id]?.level ?? 0]));
  const milestoneTalent = talentLevel(state, "blueprint_milestone");
  const relative = blueprintRawMultiplier(current, milestoneTalent)
    .div(blueprintRawMultiplier(growth.blueprintBaseLevels, 0));
  return Decimal.max(1, relative).mul(new Decimal(1).plus(talentLevel(state, "blueprint_power") * 0.02));
}

/** 预览若干次蓝图升级后的相对收益；不改状态、不扣资金。 */
export function blueprintUpgradeRatio(state: SaveData, modelId: string, quantity = 1): Decimal {
  const currentLevel = state.modelArchive?.[modelId]?.level ?? 0;
  if (currentLevel >= MODEL_ARCHIVE_MAX_LEVEL) return new Decimal(1);
  const nextLevels = Object.fromEntries(MODELS.map((model) => [model.id, state.modelArchive?.[model.id]?.level ?? 0]));
  nextLevels[modelId] = Math.min(MODEL_ARCHIVE_MAX_LEVEL, currentLevel + Math.max(1, Math.floor(quantity)));
  const milestoneTalent = talentLevel(state, "blueprint_milestone");
  const current = blueprintRawMultiplier(
    Object.fromEntries(MODELS.map((model) => [model.id, state.modelArchive?.[model.id]?.level ?? 0])),
    milestoneTalent,
  );
  const next = blueprintRawMultiplier(nextLevels, milestoneTalent);
  return Decimal.max(1, next.div(current));
}

function scaleRawMultiplier(units: Record<string, number>, milestoneTalent = 0): Decimal {
  return SERVERS.reduce((total, server) => {
    const count = Math.max(0, units[server.id] ?? 0);
    if (count <= 0) return total;
    const extraUnits = Math.max(0, count - 1);
    const unitGain = new Decimal(extraUnits).mul(0.012);
    const milestoneGain = new Decimal(reachedMilestones(count, SERVER_SCALE_MILESTONES))
      .mul(0.03)
      .mul(1 + milestoneTalent * 0.05);
    return total.mul(new Decimal(1).plus(unitGain).plus(milestoneGain));
  }, new Decimal(1));
}

export function serverScaleMultiplier(state: SaveData): Decimal {
  const growth = ensureGrowthState(state);
  const milestoneTalent = talentLevel(state, "scale_milestone");
  const relative = scaleRawMultiplier(growth.serverUnits, milestoneTalent)
    .div(scaleRawMultiplier(growth.serverBaseUnits, 0));
  return Decimal.max(1, relative).mul(new Decimal(1).plus(talentLevel(state, "scale_power") * 0.02));
}

/** 预览若干个规模单元后的相对收益；不改状态、不扣资金。 */
export function serverScaleUpgradeRatio(state: SaveData, serverId: string, quantity = 1): Decimal {
  const growth = ensureGrowthState(state);
  const currentUnits = growth.serverUnits[serverId] ?? 0;
  if (currentUnits <= 0) return new Decimal(1);
  const nextUnits = { ...growth.serverUnits };
  nextUnits[serverId] = currentUnits + Math.max(1, Math.floor(quantity));
  const milestoneTalent = talentLevel(state, "scale_milestone");
  return Decimal.max(1, scaleRawMultiplier(nextUnits, milestoneTalent).div(scaleRawMultiplier(growth.serverUnits, milestoneTalent)));
}

/** 唯一服务器规模事实源；Stage1～5、订单、离线和UI必须调用它。 */
export function effectiveServerPower(state: SaveData): Decimal {
  return new Decimal(state.serverPower).mul(serverScaleMultiplier(state));
}

export function blueprintUpgradeCost(state: SaveData, modelId: string, atLevel?: number): Decimal {
  const model = MODELS.find((candidate) => candidate.id === modelId);
  if (!model) return new Decimal(Infinity);
  const level = atLevel ?? state.modelArchive?.[modelId]?.level ?? 0;
  if (level < 0 || level >= MODEL_ARCHIVE_MAX_LEVEL) return new Decimal(Infinity);
  const talentEfficiency = 1 - talentLevel(state, "blueprint_efficiency") * 0.04;
  // 免费研发下线后，旧有“研发速度”模型被动与非终局首次迭代奖励
  // 等价迁移为付费蓝图升级效率，避免存档中的永久奖励变成死属性。
  // 正式终局使用独立三轮倍率，不叠加旧版首次迭代的 ×1.25。
  const iterationEfficiency = state.singularity?.mode === "endgame"
    ? new Decimal(1)
    : new Decimal(state.technologyIterationCount > 0 ? 1.25 : 1);
  const paidUpgradeEfficiency = Decimal.max(
    1,
    modelEffectMultipliers(state).research.mul(iterationEfficiency),
  );
  return new Decimal(BLUEPRINT_BASE_COSTS[modelId] ?? 1_000)
    .mul(new Decimal(BLUEPRINT_COST_GROWTH).pow(Math.max(0, level - 1)))
    .mul(talentEfficiency)
    .div(paidUpgradeEfficiency)
    .floor();
}

export function serverScaleUnitCost(state: SaveData, serverId: string, atUnits?: number): Decimal {
  const server = SERVERS.find((candidate) => candidate.id === serverId);
  if (!server) return new Decimal(Infinity);
  const units = atUnits ?? ensureGrowthState(state).serverUnits[serverId] ?? 0;
  if (units <= 0) return new Decimal(Infinity);
  const efficiency = 1 - talentLevel(state, "scale_efficiency") * 0.04;
  return new Decimal(Math.max(240, server.cost * 0.08))
    .mul(new Decimal(SCALE_COST_GROWTH).pow(Math.max(0, units - 1)))
    .mul(efficiency)
    .floor();
}

function quantityLimit(quantity: number | "max"): number {
  return quantity === "max" ? MAX_BATCH_STEPS : Math.max(1, Math.floor(quantity));
}

export interface GrowthBatchQuote {
  count: number;
  total: Decimal;
}

/**
 * 只读报价：固定数量展示完整预计总价；“最多”按当前资金展示可买数量与总价。
 * 不修改存档，也不把部分资金不足误写成固定批次的价格。
 */
export function quoteBlueprintLevels(
  state: SaveData,
  modelId: string,
  quantity: number | "max",
): GrowthBatchQuote {
  if (!state.modelProgress || !MODELS.some((model) => model.id === modelId)) {
    return { count: 0, total: new Decimal(0) };
  }
  let level = state.modelArchive?.[modelId]?.level ?? 0;
  let remaining = new Decimal(state.money);
  let total = new Decimal(0);
  let count = 0;
  for (let step = 0; step < quantityLimit(quantity) && level < MODEL_ARCHIVE_MAX_LEVEL; step += 1) {
    const cost = blueprintUpgradeCost(state, modelId, level);
    if (!cost.isFinite()) break;
    if (quantity === "max" && remaining.lt(cost)) break;
    total = total.plus(cost);
    if (quantity === "max") remaining = remaining.minus(cost);
    level += 1;
    count += 1;
  }
  return { count, total };
}

/** 服务器规模的只读批量报价，语义同 quoteBlueprintLevels。 */
export function quoteServerScaleUnits(
  state: SaveData,
  serverId: string,
  quantity: number | "max",
): GrowthBatchQuote {
  const server = SERVERS.find((candidate) => candidate.id === serverId);
  if (!server || state.serverCount < server.index) return { count: 0, total: new Decimal(0) };
  let units = Math.max(1, ensureGrowthState(state).serverUnits[serverId] ?? 1);
  let remaining = new Decimal(state.money);
  let total = new Decimal(0);
  let count = 0;
  for (let step = 0; step < quantityLimit(quantity); step += 1) {
    const cost = serverScaleUnitCost(state, serverId, units);
    if (!cost.isFinite()) break;
    if (quantity === "max" && remaining.lt(cost)) break;
    total = total.plus(cost);
    if (quantity === "max") remaining = remaining.minus(cost);
    units += 1;
    count += 1;
  }
  return { count, total };
}

export function buyBlueprintLevels(
  state: SaveData,
  modelId: string,
  quantity: number | "max" = 1,
): { ok: boolean; error?: string; bought: number; spent: Decimal } {
  // 第一款模型获得后，六条蓝图都成为可投资的全局算力资产；
  // 未购买的蓝图从 0→1 计费，不伪造研究/部署，也不改变当前主力模型。
  if (!state.modelProgress) return { ok: false, error: "blueprint_locked", bought: 0, spent: new Decimal(0) };
  if (!MODELS.some((model) => model.id === modelId)) return { ok: false, error: "blueprint_locked", bought: 0, spent: new Decimal(0) };
  if (!state.modelArchive) state.modelArchive = {};
  const entry = state.modelArchive[modelId] ?? {
    modelId,
    level: 0,
    firstAcquiredAtMs: state.updatedAtMs || Date.now(),
    researchCount: 0,
    lifetimeTrainingCount: 0,
    lifetimeContribution: 0,
  };
  state.modelArchive[modelId] = entry;
  let money = new Decimal(state.money);
  let spent = new Decimal(0);
  let bought = 0;
  for (let step = 0; step < quantityLimit(quantity) && entry.level < MODEL_ARCHIVE_MAX_LEVEL; step += 1) {
    const cost = blueprintUpgradeCost(state, modelId, entry.level);
    if (!cost.isFinite() || money.lt(cost)) break;
    money = money.minus(cost);
    spent = spent.plus(cost);
    entry.level += 1;
    entry.researchCount = Math.max(entry.researchCount, entry.level);
    bought += 1;
  }
  if (bought <= 0) return { ok: false, error: entry.level >= MODEL_ARCHIVE_MAX_LEVEL ? "blueprint_max" : "insufficient_funds", bought: 0, spent };
  if (!state.ownedModelIds.includes(modelId)) state.ownedModelIds.push(modelId);
  state.money = toStoredBig(money);
  return { ok: true, bought, spent };
}

export function recommendedBlueprintId(state: SaveData): string | null {
  return MODELS
    .filter((model) => state.modelProgress != null && (state.modelArchive?.[model.id]?.level ?? 0) < MODEL_ARCHIVE_MAX_LEVEL)
    .sort((a, b) => {
      const cost = blueprintUpgradeCost(state, a.id).comparedTo(blueprintUpgradeCost(state, b.id));
      if (cost !== 0) return cost;
      return (state.modelArchive?.[a.id]?.level ?? 0) - (state.modelArchive?.[b.id]?.level ?? 0);
    })[0]?.id ?? null;
}

export function buyRecommendedBlueprint(state: SaveData, quantity: number | "max" = 1) {
  const modelId = recommendedBlueprintId(state);
  return modelId
    ? { ...buyBlueprintLevels(state, modelId, quantity), modelId }
    : { ok: false as const, error: "no_blueprint", bought: 0, spent: new Decimal(0), modelId: null };
}

export function buyServerScaleUnits(
  state: SaveData,
  serverId: string,
  quantity: number | "max" = 1,
): { ok: boolean; error?: string; bought: number; spent: Decimal } {
  const server = SERVERS.find((candidate) => candidate.id === serverId);
  if (!server || state.serverCount < server.index) return { ok: false, error: "server_locked", bought: 0, spent: new Decimal(0) };
  const growth = ensureGrowthState(state);
  let units = Math.max(1, growth.serverUnits[serverId] ?? 1);
  let money = new Decimal(state.money);
  let spent = new Decimal(0);
  let bought = 0;
  for (let step = 0; step < quantityLimit(quantity); step += 1) {
    const cost = serverScaleUnitCost(state, serverId, units);
    if (!cost.isFinite() || money.lt(cost)) break;
    money = money.minus(cost);
    spent = spent.plus(cost);
    units += 1;
    bought += 1;
  }
  if (bought <= 0) return { ok: false, error: "insufficient_funds", bought: 0, spent };
  growth.serverUnits[serverId] = units;
  state.money = toStoredBig(money);
  return { ok: true, bought, spent };
}

/** 取得一代服务器时建立“第1规模单元=原服务器”的等价基线。 */
export function registerOwnedServerUnit(state: SaveData, serverId: string): void {
  const growth = ensureGrowthState(state);
  growth.serverUnits[serverId] = Math.max(1, growth.serverUnits[serverId] ?? 0);
  growth.serverBaseUnits[serverId] = Math.max(1, growth.serverBaseUnits[serverId] ?? 0);
}

/** 技术迭代只重置本轮服务器规模，永久蓝图与天赋不变。 */
export function resetServerScaleForIteration(state: SaveData): void {
  const growth = ensureGrowthState(state);
  growth.serverUnits = Object.fromEntries(SERVERS.map((server) => [server.id, 0]));
  growth.serverBaseUnits = Object.fromEntries(SERVERS.map((server) => [server.id, 0]));
}

/**
 * 迭代保留已研发蓝图的收藏身份，却不会把上一轮刷满的投资等级带入新一轮。
 * 已拥有蓝图以 Lv.1 回归，未拥有蓝图维持 Lv.0；模型收藏与天赋记录不受影响。
 */
export function resetBlueprintInvestmentForIteration(state: SaveData): void {
  const growth = ensureGrowthState(state);
  for (const model of MODELS) {
    const archive = state.modelArchive[model.id];
    const resetLevel = archive && archive.level > 0 ? 1 : 0;
    if (archive) archive.level = resetLevel;
    growth.blueprintBaseLevels[model.id] = resetLevel;
  }
}

/** 首次获得模型时把既有旧曲线登记为基线，之后所有蓝图升级才产生新倍率。 */
export function registerBlueprintBaseline(state: SaveData, modelId: string): void {
  const growth = ensureGrowthState(state);
  if (growth.blueprintBaseLevels[modelId] == null) {
    growth.blueprintBaseLevels[modelId] = state.modelArchive?.[modelId]?.level ?? 1;
  }
  if (!growth.legacyModelId) growth.legacyModelId = state.modelProgress?.modelId ?? modelId;
}
