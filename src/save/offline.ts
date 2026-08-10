// 离线收益：基础6小时；赞助充能每次+2小时，下一次离线结算最高24小时；
// 生成待领取报价；同一报价只能领取一次；
// 不允许重叠离线区间重复计算；报价在普通存档后仍有效。
import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import { secondsBetween } from "../core/time";
import type { SaveData } from "./types";
import { consumeOfflineCapacityCharge, offlineCapacitySeconds } from "../economy/sponsor";
import { stage4Entered } from "../economy/stage4";
import { stage5Entered } from "../economy/stage5";

export const OFFLINE_MAX_SECONDS = 6 * 60 * 60;
/** Stage 2 离线：60% 效率，统一基础6小时上限 */
export const OFFLINE_STAGE2_EFFICIENCY = 0.6;
export const OFFLINE_STAGE2_CAP_SECONDS = 6 * 60 * 60;
/** Stage 3 离线：70% 效率；容量统一由赞助系统控制，存储不再改变离线上限。 */
export const OFFLINE_STAGE3_EFFICIENCY = 0.7;
export const OFFLINE_STAGE3_BASE_CAP_SECONDS = 6 * 60 * 60;
export const OFFLINE_STORAGE_KEY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];
export const OFFLINE_STORAGE_BONUS_SECONDS = 0;
export const OFFLINE_STAGE3_MAX_CAP_SECONDS = 6 * 60 * 60;
/** CARD-02 Stage 4 离线：A 表 6h（CARD-00 冻结首选；以隔离终局档生效）。 */
export const OFFLINE_STAGE4_CAP_SECONDS = 6 * 60 * 60;
export const OFFLINE_STAGE4_EFFICIENCY = 0.75;
/** Stage 5 同样采用6小时基础容量；赞助可临时充至24小时。 */
export const OFFLINE_STAGE5_CAP_SECONDS = 6 * 60 * 60;
export const OFFLINE_STAGE5_EFFICIENCY = 0.75;

export function offlineCapSeconds(state: SaveData): number {
  return offlineCapacitySeconds(state);
}

export function offlineEfficiency(state: SaveData): number {
  if (stage5Entered(state)) return OFFLINE_STAGE5_EFFICIENCY;
  if (stage4Entered(state)) return OFFLINE_STAGE4_EFFICIENCY;
  return state.stage3?.entered ? OFFLINE_STAGE3_EFFICIENCY : OFFLINE_STAGE2_EFFICIENCY;
}

export interface OfflineQuote {
  elapsedSec: number;
  rawElapsedSec: number;
  capSec: number;
  money: Decimal;
  researchProgress: number;
  projectProgressDelta: number;
  projectName: string | null;
  perSecRate: Decimal;
  claimed: false;
}

export interface OfflineCalculator {
  /** 每秒自动收入（已含倍率） */
  incomePerSecond(state: SaveData, nowMs: number): Decimal;
}

export interface OfflineReceiptFill {
  /** 结算时附加回执：离线研发进度增量（0-100）与工程推进增量（进度点）。 */
  (state: SaveData, quote: OfflineQuote): void;
}

/** 计算离线报价：只计算 [lastTickAtMs, nowMs] 一次，上限由当前阶段与存储等级决定。 */
export function calculateOfflineReward(
  state: SaveData,
  nowMs: number,
  calculator: OfflineCalculator
): OfflineQuote | null {
  if (state.pendingOfflineReward && !state.pendingOfflineReward.claimed) {
    // 已有未领取报价：不重复计算
    return null;
  }
  const lastTick = state.lastTickAtMs;
  if (!lastTick || lastTick <= 0) return null;
  if (nowMs <= lastTick) return null;
  const elapsed = secondsBetween(lastTick, nowMs);
  if (elapsed < 5) return null;
  const capped = Math.min(elapsed, offlineCapSeconds(state));
  const perSec = calculator.incomePerSecond(state, nowMs);
  if (perSec.lte(0)) return null;
  // 离线效率（Stage 2 60% / Stage 3 70%）
  const money = perSec.mul(offlineEfficiency(state)).mul(capped);
  if (money.lte(0)) return null;
  return {
    elapsedSec: capped,
    rawElapsedSec: elapsed,
    capSec: offlineCapSeconds(state),
    money,
    researchProgress: 0,
    projectProgressDelta: 0,
    projectName: null,
    perSecRate: perSec,
    claimed: false,
  };
}

/** 领取报价：exactly-once。返回是否领取成功 */
export function claimOfflineReward(
  state: SaveData,
  nowMs: number,
  calculator: OfflineCalculator
): { claimed: boolean; money: Decimal } {
  const reward = state.pendingOfflineReward;
  if (!reward) return { claimed: false, money: new Decimal(0) };
  if (reward.claimed) return { claimed: false, money: new Decimal(0) };
  const money = new Decimal(reward.money);
  state.pendingOfflineReward = { ...reward, claimed: true };
  state.money = toStoredBig(new Decimal(state.money).plus(money));
  state.lifetimeIncome = toStoredBig(new Decimal(state.lifetimeIncome).plus(money));
  state.workshop.lifetimeRevenue = state.lifetimeIncome;
  // 领取后刷新离线锚点，避免同一区间再次产生报价
  state.lastTickAtMs = nowMs;
  return { claimed: true, money };
}

/** 结算离线：生成报价（不自动入账） */
export function settleOfflineReward(
  state: SaveData,
  nowMs: number,
  calculator: OfflineCalculator,
  fillReceipt?: OfflineReceiptFill
): OfflineQuote | null {
  if (state.pendingOfflineReward && !state.pendingOfflineReward.claimed) return null;
  const quote = calculateOfflineReward(state, nowMs, calculator);
  if (!quote) {
    // 无报价时也推进锚点，防止累积
    state.lastTickAtMs = Math.max(state.lastTickAtMs, nowMs);
    return null;
  }
  // 只有实际用到基础6小时以外的扩展区间才消耗容量。
  consumeOfflineCapacityCharge(state, quote.rawElapsedSec);
  fillReceipt?.(state, quote);
  state.pendingOfflineReward = {
    startedAtMs: state.lastTickAtMs,
    endedAtMs: nowMs,
    elapsedSec: quote.elapsedSec,
    rawElapsedSec: quote.rawElapsedSec,
    capSec: quote.capSec,
    money: toStoredBig(quote.money),
    researchProgress: quote.researchProgress,
    projectProgressDelta: quote.projectProgressDelta,
    projectName: quote.projectName,
    claimed: false,
  };
  state.lastTickAtMs = nowMs;
  return quote;
}

/** 从已结算报价恢复待领取（刷新后仍有效） */
export function hasPendingOfflineReward(state: SaveData): boolean {
  return (
    state.pendingOfflineReward != null &&
    state.pendingOfflineReward.claimed === false
  );
}
