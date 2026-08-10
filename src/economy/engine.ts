// 经济引擎：纯规则实现，不依赖 DOM。所有命令原子化（失败不落盘）。
import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import {
  AUTOMATION_ORDER_CAP,
  AUTOMATION_UNLOCK_ORDERS,
  BASE_BUSINESS_MIX,
  CENTER_BASE_COST,
  CENTER_COST_GROWTH,
  MODEL_ARCHIVE_MAX_LEVEL,
  MODELS,
  ORDERS,
  SERVER_CENTER_REQUIREMENT,
  SERVERS,
  type OrderDef,
} from "../data/content";
import type { SaveData } from "../save/types";
import { sponsorIncomeMultiplier } from "./sponsor";
import { businessMixForState, modelEffectMultipliers } from "./model-effects";
import {
  advanceFlagship,
  architectureMultiplier,
  applyFirstIteration,
  canIterate,
  iterationRequirementsMet,
  recordEra,
  researchProgressMultiplier,
  syncArchitectureBlueprints,
  stage3IncomePerSecond,
  stage3TotalCompute,
  techPassiveMultipliers,
} from "./stage3";
import {
  applyEndgameIteration,
  batchPurchaseUnlocked,
  canEndgameIterate,
  currentRound,
  endgameMode,
  SINGULARITY_MULTIPLIERS,
} from "./singularity";
import {
  advanceFinalProject,
  stage4Entered,
  stage4IncomePerSecond,
} from "./stage4";
import {
  advanceFinalProject as advanceDyson,
  stage5Entered,
  stage5IncomePerSecond,
} from "./stage5";
import {
  addExperience,
  addResearchFromLevelUp,
  addResearchFromOrder,
  awardFirstServer,
  experienceToNextLevel,
  firstServerAwarded,
  firstServerMilestoneMet,
  orderExperience,
  orderExperienceForState,
  XP_AUTOMATION_UNLOCK,
  XP_FIRST_MODEL,
} from "./workshop";

// ---------- 常数 ----------
export const RENTAL_UNIT_COST_PER_SEC = 0.25; // 每单位租赁算力每秒成本
export const RENTAL_UNIT_POWER = 1.0; // 每单位租赁算力处理能力
export const RENTAL_DEFAULT_UNITS = 2;
export const TRAIN_COST_BASE = 70; // 训练基础成本
export const TRAIN_COST_GROWTH = 1.9; // 训练成本成长
export const TRAIN_COMPUTE_GAIN = 0.10; // 每级训练处理能力提升（校准：避免训练显著加速首服）

export interface ServerPurchaseDef {
  serverId: string;
  index: number;
  cost: number;
  power: number;
}

/** 获取第 n 台服务器购买定义 */
export function serverDefFor(index: number): ServerPurchaseDef {
  const def = SERVERS.find((s) => s.index === index);
  if (!def) throw new Error("server index out of range: " + index);
  return { serverId: def.id, index: def.index, cost: def.cost, power: def.power };
}

export const MAX_SERVERS = 8;

export function nextServerIndex(state: SaveData): number {
  return state.serverCount + 1;
}

export function nextServerDef(state: SaveData): ServerPurchaseDef | null {
  const index = nextServerIndex(state);
  if (index > MAX_SERVERS) return null;
  // 第一台服务器：Stage 1 里程碑授予（等级 + 累计营业收入），非资金购买
  if (index === 1) {
    if (!firstServerMilestoneMet(state)) return null;
    return serverDefFor(1);
  }
  return serverDefFor(index);
}

export function nextServerCost(state: SaveData): Decimal | null {
  const def = nextServerDef(state);
  if (!def) return null;
  return new Decimal(def.cost);
}

// ---------- 模型 ----------
export function modelLevel(state: SaveData): number {
  if (!state.modelProgress) return 1;
  const archiveLevel = state.modelArchive?.[state.modelProgress.modelId]?.level ?? 1;
  const definition = MODELS.find((model) => model.id === state.modelProgress?.modelId);
  const combined = Math.max(1, state.modelProgress.level) + Math.max(1, archiveLevel) - 1;
  return definition ? Math.min(definition.maxLevel, combined) : combined;
}

function ensureModelArchiveEntry(state: SaveData, modelId: string, nowMs = Date.now()) {
  if (!state.modelArchive) state.modelArchive = {};
  const existing = state.modelArchive[modelId];
  if (existing) return existing;
  const created = {
    modelId,
    level: 1,
    firstAcquiredAtMs: nowMs,
    researchCount: 1,
    lifetimeTrainingCount: 0,
    lifetimeContribution: 0,
  };
  state.modelArchive[modelId] = created;
  return created;
}

/** 将当前主力模型产生的收入累计到永久档案。 */
export function creditModelContribution(state: SaveData, amount: Decimal.Value): void {
  if (!state.modelProgress) return;
  const value = new Decimal(amount);
  if (!value.isFinite() || value.lte(0)) return;
  const entry = ensureModelArchiveEntry(state, state.modelProgress.modelId);
  entry.lifetimeContribution = toStoredBig(new Decimal(entry.lifetimeContribution).plus(value));
}

export function modelBaseCompute(state: SaveData): number {
  if (!state.modelProgress) return 0;
  const def = MODELS.find((m) => m.id === state.modelProgress!.modelId);
  if (!def) return 0;
  return def.baseCompute;
}

/** 模型处理能力 = baseCompute * (1 + (level-1) * TRAIN_COMPUTE_GAIN) */
export function modelCompute(state: SaveData): Decimal {
  const base = modelBaseCompute(state);
  if (base <= 0) return new Decimal(0);
  const level = Math.max(1, modelLevel(state));
  return new Decimal(base)
    .mul(1 + (level - 1) * TRAIN_COMPUTE_GAIN)
    .mul(modelEffectMultipliers(state).compute)
    .mul(techPassiveMultipliers(state).compute);
}

export function trainCost(state: SaveData): Decimal {
  const level = modelLevel(state);
  const cost = new Decimal(TRAIN_COST_BASE).mul(new Decimal(TRAIN_COST_GROWTH).pow(level - 1));
  return cost.floor();
}

export function canTrain(state: SaveData): boolean {
  if (!state.modelProgress) return false;
  const def = MODELS.find((m) => m.id === state.modelProgress!.modelId);
  if (!def) return false;
  if (modelLevel(state) >= def.maxLevel) return false;
  return new Decimal(state.money).gte(trainCost(state));
}

/** 训练一次：增加模型等级（消耗资金，幂等由引擎层保证） */
export function applyTrain(state: SaveData): { ok: boolean; error?: string; gainedLevel: boolean } {
  if (!state.modelProgress) return { ok: false, error: "no_model", gainedLevel: false };
  const def = MODELS.find((m) => m.id === state.modelProgress!.modelId);
  if (!def) return { ok: false, error: "no_model", gainedLevel: false };
  if (modelLevel(state) >= def.maxLevel) return { ok: false, error: "max_level", gainedLevel: false };
  const cost = trainCost(state);
  if (new Decimal(state.money).lt(cost)) return { ok: false, error: "insufficient_funds", gainedLevel: false };
  state.money = toStoredBig(new Decimal(state.money).minus(cost));
  state.modelProgress.level += 1;
  state.modelProgress.trainingCount += 1;
  ensureModelArchiveEntry(state, state.modelProgress.modelId).lifetimeTrainingCount += 1;
  return { ok: true, gainedLevel: true };
}

/** 获取第一款模型（Stage1 起点，原子） */
export function acquireFirstModel(
  state: SaveData,
  modelId: string = MODELS[0].id
): { ok: boolean; error?: string; acquired: boolean } {
  if (state.modelProgress) return { ok: false, error: "model_exists", acquired: false };
  const def = MODELS.find((m) => m.id === modelId);
  if (!def) return { ok: false, error: "unknown_model", acquired: false };
  state.modelProgress = { modelId, level: 1, trainingCount: 0 };
  if (!state.ownedModelIds.includes(modelId)) state.ownedModelIds.push(modelId);
  ensureModelArchiveEntry(state, modelId);
  recordEra(state, "era_studio");
  addExperience(state, XP_FIRST_MODEL);
  return { ok: true, acquired: true };
}

// ---------- 订单 ----------
export function orderById(orderId: string): OrderDef | null {
  return ORDERS.find((o) => o.id === orderId) ?? null;
}

/** 订单净收入 = gross - gross*rentalCostRatio（无自有服务器时） */
export function orderNet(order: OrderDef): Decimal {
  return new Decimal(order.gross).mul(1 - order.rentalCostRatio);
}

export function canAcceptOrder(state: SaveData, orderId: string): boolean {
  if (state.activeOrders.length >= AUTOMATION_ORDER_CAP) return false;
  return orderById(orderId) != null;
}

export function orderEndsAtMs(order: OrderDef, startedAtMs: number): number {
  return startedAtMs + order.durationSec * 1000;
}

/** 接受订单（手动）：记录开始时间，按当前模型处理速度结算 */
export function acceptOrder(
  state: SaveData,
  orderId: string,
  nowMs: number
): { ok: boolean; error?: string } {
  if (state.activeOrders.length >= AUTOMATION_ORDER_CAP) {
    return { ok: false, error: "order_slots_full" };
  }
  const order = orderById(orderId);
  if (!order) return { ok: false, error: "unknown_order" };
  // 有模型才能接单
  if (!state.modelProgress) return { ok: false, error: "no_model" };
  state.activeOrders.push({
    orderId,
    startedAtMs: nowMs,
    remainingSec: order.durationSec,
    status: 0,
  });
  return { ok: true };
}

export interface TickResult {
  changed: boolean;
  income: Decimal;
  /** 完成订单 id 列表 */
  completedOrderIds: string[];
  /** 手动完成数量（含自动） */
  completedCount: number;
}

/** 推进时间（秒级）。模型处理能力决定实际完成速度：
 *  每 tick 消耗 durationSec / (compute * serverPower) 真实秒。 */
export function tick(
  state: SaveData,
  nowMs: number,
  elapsedSec: number
): TickResult {
  if (elapsedSec <= 0) {
    return { changed: false, income: new Decimal(0), completedOrderIds: [], completedCount: 0 };
  }
  // CARD-03 Stage 5：戴森算力纪元专属路径（优先级高于 Stage 4）。
  if (stage5Entered(state)) {
    const s5Income = stage5IncomePerSecond(state, nowMs).mul(elapsedSec);
    advanceDyson(state, elapsedSec);
    state.singularity!.stage5 = {
      ...state.singularity!.stage5!,
      stageIncome: toStoredBig(new Decimal(state.singularity!.stage5?.stageIncome ?? 0).plus(s5Income)),
    };
    if (s5Income.gt(0)) {
      state.money = toStoredBig(new Decimal(state.money).plus(s5Income));
      state.lifetimeIncome = toStoredBig(new Decimal(state.lifetimeIncome).plus(s5Income));
      if (state.workshop) state.workshop.lifetimeRevenue = state.lifetimeIncome;
      state.highestIncomePerSecond = toStoredBig(Decimal.max(
        new Decimal(state.highestIncomePerSecond),
        s5Income.div(Math.max(1, elapsedSec)),
      ));
      return { changed: true, income: s5Income, completedOrderIds: [], completedCount: 0 };
    }
    return { changed: false, income: s5Income, completedOrderIds: [], completedCount: 0 };
  }
  // CARD-02 Stage 4：地月算力网专属路径。地球订单/自动化/Stage 3 全部停止，
  // 只有“地月收入 + 地月一体化算力网推进”（重新减速，保留太空冷却节奏）。
  if (stage4Entered(state)) {
    const s4Income = stage4IncomePerSecond(state, nowMs).mul(elapsedSec);
    advanceFinalProject(state, elapsedSec);
    state.singularity!.stage4 = {
      ...state.singularity!.stage4!,
      stageIncome: toStoredBig(new Decimal(state.singularity!.stage4?.stageIncome ?? 0).plus(s4Income)),
    };
    if (s4Income.gt(0)) {
      state.money = toStoredBig(new Decimal(state.money).plus(s4Income));
      state.lifetimeIncome = toStoredBig(new Decimal(state.lifetimeIncome).plus(s4Income));
      if (state.workshop) state.workshop.lifetimeRevenue = state.lifetimeIncome;
      state.highestIncomePerSecond = toStoredBig(Decimal.max(
        new Decimal(state.highestIncomePerSecond),
        s4Income.div(Math.max(1, elapsedSec)),
      ));
      return { changed: true, income: s4Income, completedOrderIds: [], completedCount: 0 };
    }
    return { changed: false, income: s4Income, completedOrderIds: [], completedCount: 0 };
  }
  // 租赁成本：无自有服务器时，每秒按单位成本扣除（与订单是否完成无关）
  let rentalCost = new Decimal(0);
  if (state.serverCount === 0 && state.rentalCompute.active && state.rentalCompute.unitCostPerSec > 0) {
    rentalCost = new Decimal(state.rentalCompute.unitCostPerSec).mul(state.rentalCompute.units).mul(elapsedSec);
  }
  const completedOrderIds: string[] = [];
  let income = new Decimal(0);
  const compute = modelCompute(state);
  const serverPower = new Decimal(state.serverPower);
  const speed = compute.mul(serverPower);
  if (speed.gt(0)) {
    for (const order of state.activeOrders) {
      if (order.status !== 0) continue;
      const def = orderById(order.orderId);
      if (!def) continue;
      // 消耗的真实进度
      const progressSec = elapsedSec * speed.toNumber();
      order.remainingSec -= progressSec;
      if (order.remainingSec <= 0) {
        // 完成（租赁成本由服务器免除与否决定）
        order.status = 1;
        completedOrderIds.push(order.orderId);
        // 手动模式：订单完成按毛/净收入结算；
        // 自动化模式：收入统一由 incomePerSecond（业务组合加权）按秒发放，
        // 订单完成只提供经验/研发进度，避免双轨计费导致收入虚高。
        if (!state.automation) {
          const base = state.serverCount > 0 ? new Decimal(def.gross) : orderNet(def);
          income = income.plus(
            base
              .mul(modelEffectMultipliers(state).income)
              .mul(new Decimal(state.permanentMultiplier))
          );
        }
        // 工作室经验：按订单毛收入折算（与倍率无关，避免倍率影响经验节奏）
        addExperience(state, orderExperienceForState(state, def));
        // 模型研发进度：订单完成累积（B 方案）
        addResearchFromOrder(state, def);
      }
    }
  }
  // 自动经营：模型部署后持续入账（永久倍率/算力中心倍率在此生效）
  if (state.automation) {
    const auto = incomePerSecond(state, nowMs).mul(elapsedSec);
    income = income.plus(auto);
  }
  // Stage 3：旗舰工程推进（在线推进；离线同样可推进但不可自动领奖）
  if (state.stage3?.entered) {
    advanceFlagship(state, elapsedSec);
    // 峰值统计
    const totalCompute = stage3TotalCompute(state);
    const ips = stage3IncomePerSecond(state, nowMs);
    state.stage3.peakStats.peakCompute = toStoredBig(Decimal.max(
      new Decimal(state.stage3.peakStats.peakCompute),
      totalCompute,
    ));
    state.stage3.peakStats.peakIncomePerSec = toStoredBig(Decimal.max(
      new Decimal(state.stage3.peakStats.peakIncomePerSec),
      ips,
    ));
    state.stage3.peakStats.totalRequests = toStoredBig(
      new Decimal(state.stage3.peakStats.totalRequests)
        .plus(totalCompute.mul(elapsedSec).div(12).floor()),
    );
    // 研发速度被动（科技档案）在 workshop 中已按 progress 累积，此处无需额外处理
  }
  const netIncome = income.minus(rentalCost);
  const changed = completedOrderIds.length > 0 || netIncome.gt(0) || rentalCost.gt(0);
  if (changed) {
    state.completedOrders += completedOrderIds.length;
    // 收入记账按订单毛/净收入累计；资金按净额入账（租赁成本内扣）
    state.lifetimeIncome = toStoredBig(new Decimal(state.lifetimeIncome).plus(income));
    creditModelContribution(state, income);
    if (state.workshop) {
      state.workshop.lifetimeRevenue = state.lifetimeIncome;
    }
    state.money = toStoredBig(new Decimal(state.money).plus(netIncome));
    if (new Decimal(state.money).lt(0)) state.money = 0;
    state.highestIncomePerSecond = toStoredBig(Decimal.max(
      new Decimal(state.highestIncomePerSecond),
      netIncome.gt(0) ? netIncome.div(Math.max(1, elapsedSec)) : new Decimal(state.highestIncomePerSecond),
    ));
    return { changed: true, income: netIncome, completedOrderIds, completedCount: completedOrderIds.length };
  }
  return { changed: false, income, completedOrderIds, completedCount: 0 };
}

/** 领取已完成订单：领取后移除该订单（释放槽位） */
export function claimOrder(state: SaveData, orderIndex: number): { ok: boolean; error?: string } {
  const order = state.activeOrders[orderIndex];
  if (!order) return { ok: false, error: "no_order" };
  if (order.status === 2) return { ok: false, error: "already_claimed" };
  if (order.status !== 1) return { ok: false, error: "not_ready" };
  state.activeOrders.splice(orderIndex, 1);
  return { ok: true };
}

/** 自动经营解锁阈值：首轮 6 单；技术迭代后 3 单 */
export function automationUnlockThreshold(state: SaveData): number {
  return state.technologyIterationCount > 0 ? 3 : AUTOMATION_UNLOCK_ORDERS;
}

export function automationUnlocked(state: SaveData): boolean {
  return state.automation || state.completedOrders >= automationUnlockThreshold(state);
}

/** 开启自动经营（幂等） */
export function enableAutomation(state: SaveData): { ok: boolean; error?: string } {
  if (state.automation) return { ok: true };
  if (state.completedOrders < automationUnlockThreshold(state)) {
    return { ok: false, error: "not_unlocked" };
  }
  state.automation = true;
  addExperience(state, XP_AUTOMATION_UNLOCK);
  return { ok: true };
}

/** 自动经营业务组合占比（总和 100）。所有已解锁订单参与，推荐订单占较高比例。
 *  加权平均净收入 ≈ 9.54/秒（纯推荐订单 9.0/秒，+6%）：保证"业务组合不改变 Stage 1 节奏"，
 *  同时所有订单拥有非零长期占比。 */
export const BUSINESS_MIX = BASE_BUSINESS_MIX;

/** 确定性轮盘选择（基于完成订单计数），避免每单闪动：同状态输出稳定 */
export function pickAutoOrderId(state: SaveData): string {
  const mix = businessMixForState(state);
  const seed = state.completedOrders + state.activeOrders.length;
  let acc = 0;
  const total = mix.reduce((sum, m) => sum + m.share, 0);
  const roll = (seed * 2654435761) % total;
  for (const m of mix) {
    acc += m.share;
    if (roll < acc) return m.orderId;
  }
  return mix[0].orderId;
}

/** 自动经营按业务组合接单（填满空槽） */
export function automationAutoAccept(state: SaveData, nowMs: number): number {
  if (!state.automation) return 0;
  let accepted = 0;
  while (state.activeOrders.length < AUTOMATION_ORDER_CAP) {
    const candidate = pickAutoOrderId(state);
    const res = acceptOrder(state, candidate, nowMs);
    if (!res.ok) break;
    accepted += 1;
  }
  return accepted;
}

export type OrderDisplayMode = "single" | "flow" | "compute";

/** 处理速率（单/秒）：以推荐订单 12s 为基准，speed / 12 */
export function ordersPerSecond(state: SaveData): number {
  const compute = modelCompute(state);
  const speed = compute.mul(new Decimal(state.serverPower));
  return speed.div(12).toNumber();
}

/** 订单表现档位：<1 单笔 / 1-20 业务流水 / >20 算力结算 */
export function orderDisplayMode(state: SaveData): OrderDisplayMode {
  const ops = ordersPerSecond(state);
  if (ops > 20) return "compute";
  if (ops >= 1) return "flow";
  return "single";
}

// ---------- 租赁算力 ----------
export const RENTAL_UNITS = 2;

export function rentalCostPerSec(state: SaveData): Decimal {
  if (!state.rentalCompute.active) return new Decimal(0);
  return new Decimal(RENTAL_UNIT_COST_PER_SEC).mul(state.rentalCompute.units);
}

export function canEnableRental(state: SaveData): boolean {
  if (state.serverCount > 0) return false; // 有自有服务器后不再需要租赁
  return new Decimal(state.money).gte(100);
}

export function enableRental(state: SaveData): { ok: boolean; error?: string } {
  if (state.rentalCompute.active) return { ok: true };
  if (state.serverCount > 0) return { ok: false, error: "server_owned" };
  if (new Decimal(state.money).lt(100)) return { ok: false, error: "insufficient_funds" };
  state.money = toStoredBig(new Decimal(state.money).minus(100));
  state.rentalCompute = { active: true, units: RENTAL_UNITS, unitCostPerSec: RENTAL_UNIT_COST_PER_SEC };
  return { ok: true };
}

// ---------- 模型研发（B 方案：进度满 100 免费研发一次） ----------
export function canResearchModel(state: SaveData): boolean {
  if (!state.modelProgress) return false;
  // 模型研发循环在 Stage 2 启用（获得第一台服务器后）；Stage 1 不抽卡，保持首服节奏
  if (state.serverCount < 1) return false;
  if ((state.modelResearch?.progress ?? 0) < 100) return false;
  return MODELS.some((model) => (state.modelArchive?.[model.id]?.level ?? 0) < MODEL_ARCHIVE_MAX_LEVEL);
}

export interface ResearchResult {
  ok: boolean;
  error?: string;
  modelId: string;
  /** true = 获得新模型；false = 重复模型转经验 */
  isNew: boolean;
  gainedLevel: number;
  archiveLevelBefore: number;
  archiveLevelAfter: number;
  /** 候选满足三项不回退合同并成为新的当前主力。 */
  switched?: boolean;
}

interface ResearchCoreMetrics {
  level: number;
  compute: Decimal;
  income: Decimal;
}

function researchCoreMetrics(state: SaveData): ResearchCoreMetrics {
  return {
    level: modelLevel(state),
    compute: modelCompute(state),
    income: incomePerSecond(state),
  };
}

function isNonRegressingResearch(candidate: ResearchCoreMetrics, before: ResearchCoreMetrics): boolean {
  return candidate.level >= before.level
    && candidate.compute.gte(before.compute)
    && candidate.income.gte(before.income)
    && (candidate.level > before.level
      || candidate.compute.gt(before.compute)
      || candidate.income.gt(before.income));
}

function rememberTrainingFacts(state: SaveData, modelId: string, trainingCount: number): void {
  const archive = ensureModelArchiveEntry(state, modelId);
  archive.lifetimeTrainingCount = Math.max(archive.lifetimeTrainingCount, trainingCount);
}

/**
 * 研发新模型：先把研发结果写入图鉴，再用同一落库状态投影候选。
 * 候选三项指标全部不回退且至少一项提高才切换；否则保留旧主力，
 * 研发后的全局收藏算力成长仍保证旧主力不回退。
 */
export function researchModel(state: SaveData): ResearchResult {
  if (!canResearchModel(state)) {
    const complete = MODELS.every((model) => (state.modelArchive?.[model.id]?.level ?? 0) >= MODEL_ARCHIVE_MAX_LEVEL);
    return {
      ok: false,
      error: complete ? "archive_complete" : "progress_not_full",
      modelId: "",
      isNew: false,
      gainedLevel: 0,
      archiveLevelBefore: 0,
      archiveLevelAfter: 0,
      switched: false,
    };
  }
  const current = state.modelProgress;
  if (!current) {
    return {
      ok: false,
      error: "no_model",
      modelId: "",
      isNew: false,
      gainedLevel: 0,
      archiveLevelBefore: 0,
      archiveLevelAfter: 0,
      switched: false,
    };
  }
  const beforeState = structuredClone(state);
  const beforeMetrics = researchCoreMetrics(state);
  const activeModelId = current.modelId;
  const currentModelIndex = MODELS.findIndex((model) => model.id === current.modelId);
  const drawCount = state.modelResearch?.stage2Draws ?? 0;
  // 候选只由稳定模型顺序、当前模型身份和已持久化研发次数决定。
  // 偏移 2 保持首轮 codex→voice、voice→distill；研发次数负责后续轮转。
  const firstCandidateIndex = (Math.max(0, currentModelIndex) + drawCount + 2) % MODELS.length;
  const hasNonCurrentCandidate = MODELS.some((model) => (
    model.id !== current.modelId
    && (state.modelArchive?.[model.id]?.level ?? 0) < MODEL_ARCHIVE_MAX_LEVEL
  ));
  let picked: (typeof MODELS)[number] | undefined;
  for (let offset = 0; offset < MODELS.length; offset += 1) {
    const candidate = MODELS[(firstCandidateIndex + offset) % MODELS.length];
    if ((state.modelArchive?.[candidate.id]?.level ?? 0) >= MODEL_ARCHIVE_MAX_LEVEL) continue;
    if (candidate.id === current.modelId && hasNonCurrentCandidate) continue;
    picked = candidate;
    break;
  }
  if (!picked) {
    return {
      ok: false,
      error: "archive_complete",
      modelId: "",
      isNew: false,
      gainedLevel: 0,
      archiveLevelBefore: 0,
      archiveLevelAfter: 0,
      switched: false,
    };
  }
  const alreadyOwned = state.ownedModelIds.includes(picked.id);
  const archiveBefore = state.modelArchive?.[picked.id]?.level ?? 0;
  if (state.modelResearch) {
    state.modelResearch.progress = 0;
    state.modelResearch.stage2Draws += 1;
  }
  if (!alreadyOwned) state.ownedModelIds.push(picked.id);
  const archive = ensureModelArchiveEntry(state, picked.id);
  if (archiveBefore <= 0) {
    archive.level = 1;
    archive.researchCount = Math.min(MODEL_ARCHIVE_MAX_LEVEL, Math.max(1, archive.researchCount));
  } else {
    archive.researchCount = Math.min(MODEL_ARCHIVE_MAX_LEVEL, archive.researchCount + 1);
    archive.level = Math.min(MODEL_ARCHIVE_MAX_LEVEL, archive.level + 1);
  }
  const archiveAfter = archive.level;

  const candidateState = structuredClone(state);
  candidateState.modelProgress = { modelId: picked.id, level: 1, trainingCount: 0 };
  const candidateMetrics = researchCoreMetrics(candidateState);
  const shouldSwitch = picked.id !== activeModelId && isNonRegressingResearch(candidateMetrics, beforeMetrics);
  if (shouldSwitch) {
    rememberTrainingFacts(state, activeModelId, current.trainingCount);
    state.modelProgress = candidateState.modelProgress;
  }
  const afterMetrics = researchCoreMetrics(state);
  if (!isNonRegressingResearch(afterMetrics, beforeMetrics)) {
    Object.assign(state, beforeState);
    return {
      ok: false,
      error: "research_growth_unavailable",
      modelId: picked.id,
      isNew: !alreadyOwned,
      gainedLevel: 0,
      archiveLevelBefore: archiveBefore,
      archiveLevelAfter: archiveAfter,
      switched: false,
    };
  }
  return {
    ok: true,
    modelId: picked.id,
    isNew: !alreadyOwned,
    gainedLevel: archiveAfter - archiveBefore,
    archiveLevelBefore: archiveBefore,
    archiveLevelAfter: archiveAfter,
    switched: shouldSwitch,
  };
}

// ---------- Stage 2 章节结算 ----------
/** 8 台服务器章节结算：exactly-once */
export function completeStage2Settlement(
  state: SaveData,
  nowMs = Date.now()
): { ok: boolean; error?: string } {
  if (state.serverCount < SERVER_CENTER_REQUIREMENT) return { ok: false, error: "cluster_not_complete" };
  if (state.stage2?.settlementShown) return { ok: false, error: "already_shown" };
  state.stage2 = {
    settlementShown: true,
    completedAtMs: nowMs,
    stageIncome: state.lifetimeIncome,
  };
  return { ok: true };
}

// ---------- 服务器 ----------
/** 当前可获得的下一台服务器（首服为里程碑，其余为购买） */
export function canBuyServer(state: SaveData): boolean {
  if (state.serverCount >= MAX_SERVERS) return false;
  const index = nextServerIndex(state);
  const def = nextServerDef(state);
  if (!def) return false;
  // 第一台：里程碑已满足且未授予
  if (index === 1) {
    return firstServerMilestoneMet(state) && !firstServerAwarded(state);
  }
  return new Decimal(state.money).gte(def.cost);
}

export function buyServer(state: SaveData): { ok: boolean; error?: string } {
  if (state.serverCount >= MAX_SERVERS) return { ok: false, error: "max_servers" };
  const index = nextServerIndex(state);
  // 第一台服务器：Stage 1 里程碑授予，不扣除当前资金，只触发一次
  if (index === 1) {
    const res = awardFirstServer(state);
    if (!res.awarded) return { ok: false, error: "milestone_not_met" };
    recordEra(state, "era_own_server");
    return { ok: true };
  }
  const def = nextServerDef(state);
  if (!def) return { ok: false, error: "no_server" };
  const cost = new Decimal(def.cost);
  if (new Decimal(state.money).lt(cost)) return { ok: false, error: "insufficient_funds" };
  state.money = toStoredBig(new Decimal(state.money).minus(cost));
  state.serverCount += 1;
  state.serverPower = toStoredBig(new Decimal(state.serverPower).plus(def.power));
  syncArchitectureBlueprints(state);
  // 购买服务器后停止租赁
  state.rentalCompute = { active: false, units: 0, unitCostPerSec: 0 };
  if (state.serverCount === 3) recordEra(state, "era_cluster");
  if (state.serverCount === 8) recordEra(state, "era_full_cluster");
  return { ok: true };
}

/** 第一次技术迭代奖励：购买所有当前可负担的服务器（首服仍需先走里程碑）。 */
export function buyMaxServers(state: SaveData): { ok: boolean; error?: string; bought: number } {
  // 核心 1 奖励：批量购买“已验证项目”（正式档仍要求至少 1 次迭代）。
  const unlocked = batchPurchaseUnlocked(state) || state.technologyIterationCount >= 1;
  if (!unlocked) return { ok: false, error: "not_unlocked", bought: 0 };
  if (state.serverCount < 1) return { ok: false, error: "first_server_required", bought: 0 };
  let bought = 0;
  while (state.serverCount < MAX_SERVERS && canBuyServer(state)) {
    const result = buyServer(state);
    if (!result.ok) break;
    bought += 1;
  }
  return bought > 0
    ? { ok: true, bought }
    : { ok: false, error: "no_affordable_server", bought: 0 };
}

export function canBuyMaxServers(state: SaveData): boolean {
  const unlocked = batchPurchaseUnlocked(state) || state.technologyIterationCount > 0;
  return unlocked && state.serverCount >= 1 && canBuyServer(state);
}

/** 在线业务组合对应的研发进度/秒；离线只累积进度，不自动触发研发。 */
export function modelResearchProgressPerSecond(state: SaveData): Decimal {
  if (!state.automation || !state.modelProgress || state.serverCount < 1) return new Decimal(0);
  const mix = businessMixForState(state);
  const totalShare = mix.reduce((sum, item) => sum + item.share, 0);
  const speed = modelCompute(state).mul(state.serverPower);
  let weighted = new Decimal(0);
  for (const item of mix) {
    const order = orderById(item.orderId);
    if (!order) continue;
    const progressPerCompletion = new Decimal(order.gross).mul(0.0008);
    weighted = weighted.plus(
      progressPerCompletion.mul(speed).div(order.durationSec).mul(item.share)
    );
  }
  return weighted.div(totalShare).mul(AUTOMATION_ORDER_CAP).mul(researchProgressMultiplier(state));
}

export function applyOfflineResearchProgress(state: SaveData, elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  const before = state.modelResearch?.progress ?? 0;
  const gain = modelResearchProgressPerSecond(state).mul(elapsedSec).toNumber();
  if (gain <= 0) return 0;
  state.modelResearch = {
    ...state.modelResearch,
    progress: Math.min(100, before + gain),
  };
  return state.modelResearch.progress - before;
}

// ---------- 算力中心 ----------
export function centerUpgradeCost(level: number): Decimal {
  return new Decimal(CENTER_BASE_COST)
    .mul(new Decimal(CENTER_COST_GROWTH).pow(level))
    .floor();
}

export function canUpgradeCenter(state: SaveData): boolean {
  void state;
  return false;
}

export function upgradeCenter(state: SaveData): { ok: boolean; error?: string } {
  void state;
  return { ok: false, error: "legacy_gateway_retired" };
}

// ---------- 自动收入 ----------
/** 业务组合加权净收入/秒（无倍率）：Σ(share × 订单净收入/时长)。
 *  推荐订单占 88%，加权 ≈ 9.54/秒（纯 o1 为 9.0/秒，+6% 可接受）。 */
export function businessMixNetPerSec(state: SaveData): Decimal {
  const mix = businessMixForState(state);
  const totalShare = mix.reduce((acc, m) => acc + m.share, 0);
  let weighted = new Decimal(0);
  for (const m of mix) {
    const def = orderById(m.orderId);
    if (!def) continue;
    const net = orderNet(def);
    weighted = weighted.plus(net.div(def.durationSec).mul(m.share));
  }
  return weighted.div(totalShare);
}

/** 每秒自动收入 = 业务组合加权净收入/秒 × 并行槽位 × 处理速度倍率 × 永久倍率。
 *  自动经营保持 4 槽并行满负荷，每槽按 orderNet/durationSec 产出，
 *  因此基础吞吐 = businessMixNetPerSec × AUTOMATION_ORDER_CAP；
 *  处理速度倍率（compute × serverPower）直接换算为吞吐倍率。
 *  自动化模式下订单完成不再单独结算（收入统一按此基准发放，见 tick），
 *  保证"聚合收入 = 各订单贡献之和"且不与订单结算双轨叠加。 */
export function incomePerSecond(state: SaveData, nowMs = Date.now()): Decimal {
  let income: Decimal;
  // CARD-03 Stage 5：戴森算力纪元收入（隔离终局档专属；优先级高于 Stage 4）。
  if (stage5Entered(state)) income = stage5IncomePerSecond(state, nowMs);
  // CARD-02 Stage 4：地月算力网收入（隔离终局档专属；地球收入曲线不再生效）。
  else if (stage4Entered(state)) income = stage4IncomePerSecond(state, nowMs);
  // Stage 3：算力中心收入模式（基础自动收入 × 有效效率 × 中心/机房倍率 × 蓝图/科技/红利）
  else if (state.stage3?.entered) income = stage3IncomePerSecond(state, nowMs);
  else {
    const baseNetPerSec = businessMixNetPerSec(state).mul(AUTOMATION_ORDER_CAP);
    const compute = modelCompute(state);
    const serverPower = new Decimal(state.serverPower);
    const permanent = new Decimal(state.permanentMultiplier);
    const archiveIncome = techPassiveMultipliers(state).income;
    const modelEffects = modelEffectMultipliers(state);
    // 基础为净收入（已含租赁成本扣减），不再叠加 rentalFactor 惩罚
    income = baseNetPerSec
      .mul(compute)
      .mul(serverPower)
      .mul(permanent)
      .mul(architectureMultiplier(state))
      .mul(archiveIncome)
      .mul(modelEffects.income)
      .mul(modelEffects.automation);
  }
  // 赞助收入×2只放大实际资金收入；工程推进仍读取各阶段原始收入，不被赞助加速。
  return income.mul(sponsorIncomeMultiplier(state, nowMs));
}

/** 自动经营每秒收入（仅在自动化开启时） */
export function automationIncomePerSec(state: SaveData): Decimal {
  if (!state.automation) return new Decimal(0);
  return incomePerSecond(state);
}

// ---------- 阶段 ----------
export function currentStage(state: SaveData): 1 | 2 | 3 {
  // Stage 3：8 台 + Stage2 结算完成 → 进入算力中心（stage3.entered）
  if (state.stage3?.entered) return 3;
  if (state.serverCount > 0) return 2;
  return 1;
}

/** Stage 3 筹建入口：8 台完整集群后解锁（过渡状态，非 Stage 3） */
export function stage3Gateway(state: SaveData): boolean {
  return state.serverCount >= SERVER_CENTER_REQUIREMENT;
}

export function stageLabel(stage: number, gateway = false): string {
  if (stage === 1) return "创业纪元 · AI 工作室";
  if (stage === 2 && gateway) return "集群纪元 · 服务器集群完成 · 算力中心筹建已解锁";
  if (stage === 2) return "集群纪元 · 服务器集群";
  return "地球纪元 · 算力中心";
}

// ---------- 技术迭代 ----------
/** 本轮累计收入（距上次迭代或开局） */
export function currentRunIncome(state: SaveData): Decimal {
  return new Decimal(state.lifetimeIncome).minus(state.incomeAtLastPrestige || 0);
}

export function canPrestige(state: SaveData): boolean {
  // CARD-01 终局档：迭代由 singularity 状态机接管（当前轮核心已领）。
  if (endgameMode(state)) return canEndgameIterate(state);
  // 正式档（v8）：机房 3 + 最终旗舰工程完成。
  return canIterate(state);
}

export interface PrestigePreview {
  canPrestige: boolean;
  target: Decimal;
  current: Decimal;
  /** 重置项说明 */
  resetItems: string[];
  /** 永久获得项 */
  gainItems: string[];
  /** 第二轮预期加速（倍率） */
  speedupEstimate: number;
}

export function prestigePreview(state: SaveData): PrestigePreview {
  const can = canPrestige(state);
  if (endgameMode(state)) {
    const round = currentRound(state);
    const coreCount = state.singularity?.coresClaimed?.length ?? 0;
    return {
      canPrestige: can,
      target: new Decimal(0),
      current: new Decimal(0),
      resetItems: round === 3
        ? ["本轮地球经营保持不变（第三次迭代转化为地外算力计划揭示）"]
        : [
            "当前资金",
            "工作室等级与经验",
            "当前服务器",
            "当前机房与基础设施",
            "本轮模型训练等级",
            "本轮旗舰工程状态",
          ],
      gainItems: [
        `技术迭代次数 → ${Math.min(3, coreCount + 1)}`,
        `永久收入倍率 → ×${SINGULARITY_MULTIPLIERS[coreCount]}`,
        ...(coreCount === 0 ? ["批量购买已验证项目解锁"] : []),
        ...(coreCount === 1 ? ["已学早期流程压缩"] : []),
        ...(round === 3 ? ["地外算力计划揭示"] : []),
      ],
      speedupEstimate: SINGULARITY_MULTIPLIERS[coreCount] ?? SINGULARITY_MULTIPLIERS[SINGULARITY_MULTIPLIERS.length - 1],
    };
  }
  const speedupEstimate = state.technologyIterationCount > 0
    ? state.permanentMultiplier
    : can ? 2 : 1;
  return {
    canPrestige: can,
    target: new Decimal(0),
    current: new Decimal(0),
    resetItems: [
      "当前资金",
      "工作室等级与经验",
      "当前服务器",
      "当前机房与基础设施",
      "本轮模型训练等级",
      "本轮旗舰工程状态",
    ],
    gainItems: [
      "技术迭代次数 +1",
      "永久收入倍率 ×2",
      "自动经营更早解锁",
      "服务器批量购买解锁",
      "模型研发速度永久 +25%",
    ],
    speedupEstimate,
  };
}

/** 执行技术迭代（原子事务：失败不落盘）。第一次迭代合同由 stage3.applyFirstIteration 实现。 */
export function applyPrestige(state: SaveData): { ok: boolean; error?: string } {
  if (endgameMode(state)) {
    // CARD-01：终局迭代（核心已领且未超过 3 次）。
    return applyEndgameIteration(state);
  }
  return applyFirstIteration(state);
}
