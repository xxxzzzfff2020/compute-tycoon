// 经济引擎：纯规则实现，不依赖 DOM。所有命令原子化（失败不落盘）。
import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import {
  AUTOMATION_TOTAL_ORDER_CAP,
  AUTOMATION_UNLOCK_ORDERS,
  BASE_BUSINESS_MIX,
  CENTER_BASE_COST,
  CENTER_COST_GROWTH,
  MODEL_ARCHIVE_MAX_LEVEL,
  MODEL_TRAINING_MAX_LEVEL,
  MODELS,
  ORDERS,
  ORDER_QUEUE_EFFECTIVE_PARALLELISM,
  ORDER_UNLOCK_COSTS,
  ORDER_QUEUE_CAP,
  ORDER_SLOT_SPEED_MULTIPLIERS,
  SERVER_CENTER_REQUIREMENT,
  SERVER_ROUND_COST_MULTIPLIERS,
  SERVERS,
  type OrderDef,
} from "../data/content";
import type { OrderState, SaveData } from "../save/types";
import {
  firstFreeOrderSlot,
  normalizeOrderSlotAssignments,
} from "../save/order-slots";
import { sponsorIncomeMultiplier } from "./sponsor";
import { businessMixForState, modelEffectMultipliers } from "./model-effects";
import {
  advanceFlagship,
  architectureMultiplier,
  applyFirstIteration,
  canIterate,
  iterationRequirementsMet,
  recordEra,
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
  awardFirstServer,
  experienceToNextLevel,
  firstServerAwarded,
  firstServerMilestoneMet,
  orderExperience,
  orderExperienceForState,
  XP_AUTOMATION_UNLOCK,
  XP_FIRST_MODEL,
} from "./workshop";
import {
  blueprintGrowthMultiplier,
  effectiveServerPower,
  registerBlueprintBaseline,
  registerOwnedServerUnit,
  resetServerScaleForIteration,
  syncTalentPoints,
} from "./incremental-growth";
import { applyCompanyCosmicExperience } from "./company-level";
import {
  normalizeTrainingLevel,
  trainingComputeMultiplier,
  trainingCostAtLevel,
} from "./model-training";
export {
  LEGACY_TRAINING_TOTAL_COST,
  TRAIN_COMPUTE_GAIN,
  TRAIN_COST_BASE,
  TRAIN_COST_GROWTH,
} from "./model-training";

// ---------- 常数 ----------
export const RENTAL_UNIT_COST_PER_SEC = 0.25; // 每单位租赁算力每秒成本
export const RENTAL_UNIT_POWER = 1.0; // 每单位租赁算力处理能力
export const RENTAL_DEFAULT_UNITS = 2;

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
  const roundIndex = Math.min(2, Math.max(0, state.technologyIterationCount));
  return new Decimal(def.cost).mul(SERVER_ROUND_COST_MULTIPLIERS[roundIndex]);
}

// ---------- 模型 ----------
export function modelLevel(state: SaveData): number {
  if (!state.modelProgress) return 1;
  if (!MODELS.some((model) => model.id === state.modelProgress?.modelId)) return 1;
  return normalizeTrainingLevel(state.modelProgress.level);
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

/** 模型处理能力 = baseCompute × 共享训练倍率 × 模型/蓝图/科技倍率。 */
export function modelCompute(state: SaveData): Decimal {
  const base = modelBaseCompute(state);
  if (base <= 0) return new Decimal(0);
  const level = Math.max(1, modelLevel(state));
  return new Decimal(base)
    .mul(trainingComputeMultiplier(level))
    .mul(modelEffectMultipliers(state).compute)
    .mul(blueprintGrowthMultiplier(state))
    .mul(techPassiveMultipliers(state).compute);
}

export function trainCost(state: SaveData): Decimal {
  return trainingCostAtLevel(modelLevel(state));
}

export function canTrain(state: SaveData): boolean {
  if (!state.modelProgress) return false;
  const def = MODELS.find((m) => m.id === state.modelProgress!.modelId);
  if (!def) return false;
  if (modelLevel(state) >= MODEL_TRAINING_MAX_LEVEL) return false;
  return new Decimal(state.money).gte(trainCost(state));
}

/** 训练一次：增加模型等级（消耗资金，幂等由引擎层保证） */
export function applyTrain(state: SaveData): { ok: boolean; error?: string; gainedLevel: boolean } {
  if (!state.modelProgress) return { ok: false, error: "no_model", gainedLevel: false };
  const def = MODELS.find((m) => m.id === state.modelProgress!.modelId);
  if (!def) return { ok: false, error: "no_model", gainedLevel: false };
  if (modelLevel(state) >= MODEL_TRAINING_MAX_LEVEL) return { ok: false, error: "max_level", gainedLevel: false };
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
  registerBlueprintBaseline(state, modelId);
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

/** 将旧扁平订单存档补齐为“每订单独立解锁、固定四个免费槽位”模型。 */
export function ensureOrderAccess(state: SaveData): void {
  normalizeOrderSlotAssignments(state.activeOrders);
  const ids = ORDERS.map((order) => order.id);
  const activeIds = new Set(state.activeOrders.map((order) => order.orderId));
  const legacyWide = state.unlockedOrderIds == null && (
    state.automation
    || state.activeOrders.length > 1
    || [...activeIds].some((id) => id !== ids[0])
  );
  if (!Array.isArray(state.unlockedOrderIds) || state.unlockedOrderIds.length === 0) {
    state.unlockedOrderIds = legacyWide ? [...ids] : [ids[0]];
  }
  for (const id of activeIds) {
    if (ids.includes(id) && !state.unlockedOrderIds.includes(id)) state.unlockedOrderIds.push(id);
  }
  if (!state.orderSlotCapacity) state.orderSlotCapacity = {};
  for (const id of state.unlockedOrderIds) {
    state.orderSlotCapacity[id] = ORDER_QUEUE_CAP;
  }
}

export function isOrderUnlocked(state: SaveData, orderId: string): boolean {
  ensureOrderAccess(state);
  return state.unlockedOrderIds?.includes(orderId) ?? false;
}

export function orderSlotCapacity(state: SaveData, orderId: string): number {
  ensureOrderAccess(state);
  return state.orderSlotCapacity?.[orderId] ?? 0;
}

export function orderUnlockCost(orderId: string): Decimal {
  return new Decimal(ORDER_UNLOCK_COSTS[orderId] ?? 0);
}

export function canUnlockOrder(state: SaveData, orderId: string): boolean {
  if (!orderById(orderId) || !state.modelProgress || isOrderUnlocked(state, orderId)) return false;
  return new Decimal(state.money).gte(orderUnlockCost(orderId));
}

export function unlockOrder(state: SaveData, orderId: string): { ok: boolean; error?: string } {
  const order = orderById(orderId);
  if (!order) return { ok: false, error: "unknown_order" };
  ensureOrderAccess(state);
  if (isOrderUnlocked(state, orderId)) return { ok: false, error: "order_unlocked" };
  if (!state.modelProgress) return { ok: false, error: "no_model" };
  const cost = orderUnlockCost(orderId);
  if (new Decimal(state.money).lt(cost)) return { ok: false, error: "insufficient_funds" };
  state.money = toStoredBig(new Decimal(state.money).minus(cost));
  state.unlockedOrderIds!.push(orderId);
  state.orderSlotCapacity![orderId] = ORDER_QUEUE_CAP;
  return { ok: true };
}

export function canExpandOrderSlot(_state: SaveData, _orderId: string): boolean {
  // 旧接口仅为存档/会话兼容保留；订单解锁时四格已全部免费开放。
  return false;
}

export function expandOrderSlot(state: SaveData, orderId: string): { ok: boolean; error?: string } {
  if (!orderById(orderId)) return { ok: false, error: "unknown_order" };
  ensureOrderAccess(state);
  if (!isOrderUnlocked(state, orderId)) return { ok: false, error: "order_locked" };
  return { ok: false, error: "order_slots_already_max" };
}

export function canAcceptOrder(state: SaveData, orderId: string): boolean {
  if (!orderById(orderId) || !state.modelProgress || !isOrderUnlocked(state, orderId)) return false;
  return orderQueueCount(state, orderId) < orderSlotCapacity(state, orderId)
    && firstFreeOrderSlot(state.activeOrders, orderId) !== null;
}

/** 单条订单队列当前占用格数（兼容旧扁平 activeOrders 存档）。 */
export function orderQueueCount(state: SaveData, orderId: string): number {
  return state.activeOrders.filter((order) => order.orderId === orderId).length;
}

export function orderQueueReadyCount(state: SaveData, orderId: string): number {
  return state.activeOrders.filter((order) => order.orderId === orderId && order.status === 1).length;
}

/** 队列位置从 0 开始；超出四槽容量的位置不获得处理速度。 */
export function orderSlotSpeedMultiplier(position: number): number {
  if (!Number.isInteger(position) || position < 0) return 0;
  return ORDER_SLOT_SPEED_MULTIPLIERS[position] ?? 0;
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
  if (!orderById(orderId)) {
    return { ok: false, error: "unknown_order" };
  }
  ensureOrderAccess(state);
  if (!isOrderUnlocked(state, orderId)) {
    return { ok: false, error: "order_locked" };
  }
  if (orderQueueCount(state, orderId) >= orderSlotCapacity(state, orderId)) {
    return { ok: false, error: "order_slots_full" };
  }
  const slotIndex = firstFreeOrderSlot(state.activeOrders, orderId);
  if (slotIndex === null) return { ok: false, error: "order_slots_full" };
  const order = orderById(orderId);
  if (!order) return { ok: false, error: "unknown_order" };
  // 有模型才能接单
  if (!state.modelProgress) return { ok: false, error: "no_model" };
  state.activeOrders.push({
    orderId,
    startedAtMs: nowMs,
    slotIndex,
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
    const companyExperience = applyCompanyCosmicExperience(
      state,
      elapsedSec,
      1,
      workshopExperiencePerSecond(state).toNumber(),
    );
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
    return { changed: companyExperience > 0, income: s5Income, completedOrderIds: [], completedCount: 0 };
  }
  // CARD-02 Stage 4：地月算力网专属路径。地球订单/自动化/Stage 3 全部停止，
  // 只有“地月收入 + 地月一体化算力网推进”（重新减速，保留太空冷却节奏）。
  if (stage4Entered(state)) {
    const companyExperience = applyCompanyCosmicExperience(
      state,
      elapsedSec,
      1,
      workshopExperiencePerSecond(state).toNumber(),
    );
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
    return { changed: companyExperience > 0, income: s4Income, completedOrderIds: [], completedCount: 0 };
  }
  ensureOrderAccess(state);
  // 租赁成本：无自有服务器时，每秒按单位成本扣除（与订单是否完成无关）
  let rentalCost = new Decimal(0);
  if (state.serverCount === 0 && state.rentalCompute.active && state.rentalCompute.unitCostPerSec > 0) {
    rentalCost = new Decimal(state.rentalCompute.unitCostPerSec).mul(state.rentalCompute.units).mul(elapsedSec);
  }
  const completedOrderIds: string[] = [];
  let income = new Decimal(0);
  const orderCountBefore = state.activeOrders.length;
  if (modelCompute(state).mul(effectiveServerPower(state)).gt(0)) {
    const completeFreshOrder = (order: OrderState, def: OrderDef): void => {
      completedOrderIds.push(order.orderId);
      // 手动模式：订单完成按毛/净收入结算；自动模式由持续收入统一结算。
      if (!state.automation) {
        const base = state.serverCount > 0 ? new Decimal(def.gross) : orderNet(def);
        income = income.plus(
          base
            .mul(modelEffectMultipliers(state).income)
            .mul(new Decimal(state.permanentMultiplier)),
        );
      }
      addExperience(state, orderExperienceForState(state, def));
    };

    // 旧档可能留有 status=1 的“待领取”项：自动移除但不重复发奖；未知订单保留。
    state.activeOrders = state.activeOrders.filter((current) => (
      current.status === 0 || !orderById(current.orderId)
    ));

    // 四条固定处理线按 100%/50%/25%/12.5% 同时推进。每次推进到最近的完成事件：
    // 手动模式只释放完成槽；自动模式在原槽立即续接同类新订单。其余任务永不前移，
    // 因此四条线会形成 1×/2×/4×/8× 的真实错落周期，满载吞吐仍为 1.875。
    let remainingWallSec = elapsedSec;
    let completedInLoop = 0;
    while (remainingWallSec > 1e-9 && completedInLoop < AUTOMATION_TOTAL_ORDER_CAP) {
      const speed = modelCompute(state).mul(effectiveServerPower(state)).toNumber();
      if (!Number.isFinite(speed) || speed <= 0) break;

      const taskRates = new Map<OrderState, number>();
      let timeToNextCompletion = Number.POSITIVE_INFINITY;
      for (const current of state.activeOrders) {
        const def = orderById(current.orderId);
        if (!def || current.status !== 0) continue;
        const rate = speed * orderSlotSpeedMultiplier(current.slotIndex ?? -1);
        if (rate <= 0) continue;
        taskRates.set(current, rate);
        timeToNextCompletion = Math.min(
          timeToNextCompletion,
          Math.max(0, current.remainingSec) / rate,
        );
      }
      if (!Number.isFinite(timeToNextCompletion)) break;

      const stepSec = Math.min(remainingWallSec, timeToNextCompletion);
      for (const [current, rate] of taskRates) {
        current.remainingSec = Math.max(0, current.remainingSec - stepSec * rate);
      }
      remainingWallSec = Math.max(0, remainingWallSec - stepSec);

      const completed = state.activeOrders.filter((current) => (
        current.status === 0
        && !!orderById(current.orderId)
        && current.remainingSec <= 1e-9
      ));
      if (completed.length === 0) break;
      const completedSet = new Set<OrderState>();
      for (const current of completed) {
        const def = orderById(current.orderId);
        if (!def) continue;
        completeFreshOrder(current, def);
        if (state.automation) {
          current.startedAtMs = Math.max(0, nowMs - remainingWallSec * 1000);
          current.remainingSec = def.durationSec;
          current.status = 0;
        } else {
          completedSet.add(current);
        }
      }
      if (completedSet.size > 0) {
        state.activeOrders = state.activeOrders.filter((current) => !completedSet.has(current));
      }
      completedInLoop += completed.length;
    }
  }
  // 自动经营：模型部署后持续入账（永久倍率/算力中心倍率在此生效）
  if (state.automation && state.serverCount >= 1) {
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
  }
  const netIncome = income.minus(rentalCost);
  const changed = completedOrderIds.length > 0
    || state.activeOrders.length !== orderCountBefore
    || netIncome.gt(0)
    || rentalCost.gt(0);
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

/** 领取某一类订单队列中已经完成的任务，兼容旧扁平 activeOrders 存档。 */
export function claimOrderQueue(state: SaveData, orderId: string): { ok: boolean; error?: string } {
  if (!orderById(orderId)) return { ok: false, error: "unknown_order" };
  const readyIndexes: number[] = [];
  state.activeOrders.forEach((order, index) => {
    if (order.orderId === orderId && order.status === 1) readyIndexes.push(index);
  });
  if (readyIndexes.length === 0) return { ok: false, error: "no_ready_order" };
  for (let i = readyIndexes.length - 1; i >= 0; i -= 1) {
    claimOrder(state, readyIndexes[i]);
  }
  return { ok: true };
}

/** 自动经营解锁阈值：首轮 6 单；技术迭代后 3 单 */
export function automationUnlockThreshold(state: SaveData): number {
  return state.technologyIterationCount > 0 ? 3 : AUTOMATION_UNLOCK_ORDERS;
}

export function automationUnlocked(state: SaveData): boolean {
  // 新合同：首台自有服务器就是自动经营的唯一解锁门槛；不再要求先手动刷满订单数。
  return state.serverCount >= 1;
}

/** 开启自动经营（幂等） */
export function enableAutomation(state: SaveData): { ok: boolean; error?: string } {
  if (state.automation) return { ok: true };
  if (state.serverCount < 1) {
    return { ok: false, error: "first_server_required" };
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

/** 自动经营按业务组合接单（填满每个已解锁订单自己的四个空槽）。 */
export function automationAutoAccept(state: SaveData, nowMs: number): number {
  if (!state.automation || state.serverCount < 1) return 0;
  ensureOrderAccess(state);
  let accepted = 0;
  while (state.activeOrders.length < AUTOMATION_TOTAL_ORDER_CAP) {
    const preferredId = pickAutoOrderId(state);
    const candidate = canAcceptOrder(state, preferredId)
      ? preferredId
      : ORDERS.find((order) => canAcceptOrder(state, order.id))?.id;
    if (!candidate) break;
    const countBefore = state.activeOrders.length;
    const res = acceptOrder(state, candidate, nowMs);
    if (!res.ok || state.activeOrders.length <= countBefore) break;
    accepted += 1;
  }
  return accepted;
}

export type OrderDisplayMode = "single" | "flow" | "compute";

/** 处理速率（单/秒）：以推荐订单 12s 为基准，speed / 12 */
export function ordersPerSecond(state: SaveData): number {
  const compute = modelCompute(state);
  const speed = compute.mul(effectiveServerPower(state));
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

// ---------- 旧免费研发兼容边界 ----------
/** 免费研发已下线；蓝图只允许通过付费定向升级。 */
export function canResearchModel(_state: SaveData): boolean {
  return false;
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
  /** v7全局蓝图不再切换主力；字段只为旧回执兼容，恒为 false。 */
  switched?: boolean;
}

/** @deprecated 免费研发已下线；保留失败回执避免旧客户端调用改写存档。 */
export function researchModel(_state: SaveData): ResearchResult {
  return {
    ok: false,
    error: "feature_removed",
    modelId: "",
    isNew: false,
    gainedLevel: 0,
    archiveLevelBefore: 0,
    archiveLevelAfter: 0,
    switched: false,
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
  const cost = nextServerCost(state);
  return cost != null && new Decimal(state.money).gte(cost);
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
  const cost = nextServerCost(state);
  if (!cost) return { ok: false, error: "no_server" };
  if (new Decimal(state.money).lt(cost)) return { ok: false, error: "insufficient_funds" };
  state.money = toStoredBig(new Decimal(state.money).minus(cost));
  state.serverCount += 1;
  state.serverPower = toStoredBig(new Decimal(state.serverPower).plus(def.power));
  registerOwnedServerUnit(state, def.serverId);
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
export function modelResearchProgressPerSecond(_state: SaveData): Decimal {
  return new Decimal(0);
}

export function applyOfflineResearchProgress(_state: SaveData, _elapsedSec: number): number {
  return 0;
}

/**
 * 自动经营离线时的工作室经验速率。
 *
 * 与在线四槽订单完全使用同一业务组合、处理速度与订单经验公式；离线只把
 * 大量确定性完成事件聚合成一次经验入账，不自动购买、不自动研发，也不会
 * 额外生成一套“挂机经验”货币。
 */
export function workshopExperiencePerSecond(state: SaveData): Decimal {
  if (!state.automation || !state.modelProgress || state.serverCount < 1) return new Decimal(0);
  const mix = businessMixForState(state);
  const totalShare = mix.reduce((sum, item) => sum + item.share, 0);
  if (totalShare <= 0) return new Decimal(0);
  const speed = modelCompute(state).mul(effectiveServerPower(state));
  let weighted = new Decimal(0);
  for (const item of mix) {
    const order = orderById(item.orderId);
    if (!order) continue;
    weighted = weighted.plus(
      new Decimal(orderExperienceForState(state, order))
        .mul(speed)
        .div(order.durationSec)
        .mul(item.share),
    );
  }
  return weighted.div(totalShare).mul(ORDER_QUEUE_EFFECTIVE_PARALLELISM);
}

/**
 * 离线跨过工作室等级门槛时，同步触发一次性天赋点来源。
 * 返回实际入账的整数经验；重复结算由离线报价幂等门禁阻止。
 */
export function applyOfflineWorkshopExperience(state: SaveData, elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  if (stage4Entered(state)) return 0;
  // 首版的离线工作室经验只负责补齐有限天赋来源（最高门槛 Lv310）。
  // 在线经营仍可继续提高展示等级；这里避免终局大数算力一次离线制造
  // 数百万次 while 升级并冻结手机主线程。
  if (!state.workshop || state.workshop.level >= 310) return 0;
  const gained = workshopExperiencePerSecond(state).mul(elapsedSec).floor();
  if (gained.lte(0)) return 0;
  let xpToLastTalent = Math.max(0, state.workshop.experienceToNextLevel - state.workshop.experience);
  for (let level = state.workshop.level + 1; level < 310; level += 1) {
    xpToLastTalent += experienceToNextLevel(level);
  }
  const safeXp = Math.min(xpToLastTalent, gained.toNumber());
  addExperience(state, safeXp);
  return safeXp;
}

/** 宇宙阶段离线公司经验沿用 75% 离线效率；地球阶段由工作室经验同源入账。 */
export function applyOfflineCompanyExperience(state: SaveData, elapsedSec: number): number {
  return applyCompanyCosmicExperience(
    state,
    elapsedSec,
    0.75,
    workshopExperiencePerSecond(state).toNumber(),
  );
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
 *  自动经营保持 4 槽并行满负荷，四个位置按 100%/50%/25%/12.5% 产出，
 *  因此单队列有效并行吞吐为 1.875；五条队列只扩展玩家可见的排队操作面，
 *  避免本次信息架构调整把既有 Stage1～5 数值曲线整体放大五倍；
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
    const baseNetPerSec = businessMixNetPerSec(state).mul(ORDER_QUEUE_EFFECTIVE_PARALLELISM);
    const compute = modelCompute(state);
    const serverPower = effectiveServerPower(state);
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
  if (!state.automation || state.serverCount < 1) return new Decimal(0);
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
  if (stage === 1) return "stage.era1";
  if (stage === 2 && gateway) return "stage.era2.gateway";
  if (stage === 2) return "stage.era2";
  return "stage.era3";
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
        ? ["prestige.reset.round3"]
        : [
            "prestige.reset.money",
            "prestige.reset.workshop",
            "prestige.reset.servers",
            "prestige.reset.rooms",
            "prestige.reset.models",
            "prestige.reset.flagship",
          ],
      gainItems: [
        `prestige.gain.iterCount:${Math.min(3, coreCount + 1)}`,
        `prestige.gain.multTo:${SINGULARITY_MULTIPLIERS[coreCount]}`,
        ...(coreCount === 0 ? ["prestige.gain.bulkBuy"] : []),
        ...(coreCount === 1 ? ["prestige.gain.compression"] : []),
        ...(round === 3 ? ["prestige.gain.spaceReveal"] : []),
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
      "prestige.reset.money",
      "prestige.reset.workshop",
      "prestige.reset.servers",
      "prestige.reset.rooms",
      "prestige.reset.models",
      "prestige.reset.flagship",
    ],
    gainItems: [
      "prestige.gain.iteration",
      "prestige.gain.multiplier",
      "prestige.gain.earlierAutomation",
      "prestige.gain.bulkBuy",
      "prestige.gain.researchSpeed",
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
