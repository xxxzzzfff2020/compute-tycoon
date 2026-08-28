// 单机离线收益保留原免费 2 小时额度；没有广告扩容或免费替代奖励。
// 历史存档已经解锁的收益按原账单兑现，每段只支付一次。
import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import { secondsBetween } from "../core/time";
import type { OfflineReward, SaveData } from "./types";
import { stage4Entered } from "../economy/stage4";
import { stage5Entered } from "../economy/stage5";

export const OFFLINE_FREE_SECONDS = 2 * 60 * 60;
export const OFFLINE_AD_SLICE_SECONDS = 2 * 60 * 60;
export const OFFLINE_AD_SLICE_LIMIT = 6;
/** 历史广告账单的校验上限；不是单机版新账单的免费额度。 */
export const OFFLINE_MAX_SECONDS = OFFLINE_FREE_SECONDS + OFFLINE_AD_SLICE_SECONDS * OFFLINE_AD_SLICE_LIMIT;
/** Stage 2 离线：保留原版 60% 效率与免费 2h。 */
export const OFFLINE_STAGE2_EFFICIENCY = 0.6;
export const OFFLINE_STAGE2_CAP_SECONDS = OFFLINE_FREE_SECONDS;
/** Stage 3 离线：保留原版 70% 效率与免费 2h。 */
export const OFFLINE_STAGE3_EFFICIENCY = 0.7;
export const OFFLINE_STAGE3_BASE_CAP_SECONDS = OFFLINE_FREE_SECONDS;
export const OFFLINE_STORAGE_KEY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];
export const OFFLINE_STORAGE_BONUS_SECONDS = 0;
export const OFFLINE_STAGE3_MAX_CAP_SECONDS = OFFLINE_FREE_SECONDS;
/** Stage 4/5 与地球阶段共用单次离线会话合同。 */
export const OFFLINE_STAGE4_CAP_SECONDS = OFFLINE_FREE_SECONDS;
export const OFFLINE_STAGE4_EFFICIENCY = 0.75;
export const OFFLINE_STAGE5_CAP_SECONDS = OFFLINE_FREE_SECONDS;
export const OFFLINE_STAGE5_EFFICIENCY = 0.75;

export function offlineCapSeconds(state: SaveData): number {
  void state;
  return OFFLINE_FREE_SECONDS;
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
  eligibleSec: number;
  adUnlocksUsed: number;
  adUnlocksMax: number;
  money: Decimal;
  researchProgress: number;
  projectProgressDelta: number;
  projectName: string | null;
  /** 已包含离线效率的固定每秒收入快照。 */
  moneyPerSec: Decimal;
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

/** 新的单机报价只含原有免费 2 小时，不预留广告待领取部分。 */
export function calculateOfflineReward(
  state: SaveData,
  nowMs: number,
  calculator: OfflineCalculator
): OfflineQuote | null {
  const lastTick = state.lastTickAtMs;
  if (!lastTick || lastTick <= 0) return null;
  if (nowMs <= lastTick) return null;
  const elapsed = secondsBetween(lastTick, nowMs);
  if (elapsed < 5) return null;
  const eligibleSec = Math.min(elapsed, offlineCapSeconds(state));
  const freeSec = Math.min(eligibleSec, OFFLINE_FREE_SECONDS);
  const perSec = calculator.incomePerSecond(state, nowMs);
  if (perSec.lte(0)) return null;
  const moneyPerSec = perSec.mul(offlineEfficiency(state));
  const money = moneyPerSec.mul(freeSec);
  if (money.lte(0)) return null;
  return {
    elapsedSec: freeSec,
    rawElapsedSec: elapsed,
    capSec: offlineCapSeconds(state),
    eligibleSec,
    adUnlocksUsed: 0,
    adUnlocksMax: 0,
    money,
    researchProgress: 0,
    projectProgressDelta: 0,
    projectName: null,
    moneyPerSec,
    claimed: false,
  };
}

/** 本会话还能领取的秒数（已解锁但未入账的部分）。 */
export function offlineRemainingSec(reward: OfflineReward): number {
  const unlocked = Math.min(reward.eligibleSec ?? reward.elapsedSec, reward.elapsedSec);
  // 旧档 claimed=true 且无 paidSec（未走归一化）按已整份领取处理。
  const paid = reward.claimed && reward.paidSec == null
    ? unlocked
    : Math.max(0, Math.floor(reward.paidSec ?? 0));
  return Math.max(0, unlocked - paid);
}

/** 保留旧 API 供存档兼容；单机版不能扩容离线奖励。 */
export function offlineAdExpansionAvailable(_reward: OfflineReward): boolean {
  return false;
}

/** 已解锁部分全部领取即结清；旧账单不会等待已停用的广告。 */
export function offlineRewardSettled(reward: OfflineReward): boolean {
  return offlineRemainingSec(reward) <= 0;
}

/** 领取已解锁但未入账部分；兼容历史部分领取，每段只入账一次。 */
export function claimOfflineReward(
  state: SaveData,
  nowMs: number,
  calculator: OfflineCalculator
): { claimed: boolean; money: Decimal } {
  const reward = state.pendingOfflineReward;
  if (!reward) return { claimed: false, money: new Decimal(0) };
  const remainingSec = offlineRemainingSec(reward);
  if (remainingSec <= 0) return { claimed: false, money: new Decimal(0) };
  const rate = Number(reward.moneyPerSec) > 0
    ? new Decimal(reward.moneyPerSec)
    : reward.elapsedSec > 0
      ? new Decimal(reward.money).div(reward.elapsedSec)
      : new Decimal(0);
  const money = rate.mul(remainingSec);
  const unlocked = Math.min(reward.eligibleSec ?? reward.elapsedSec, reward.elapsedSec);
  const paidSec = unlocked;
  state.pendingOfflineReward = {
    ...reward,
    paidSec,
    claimed: offlineRewardSettled({ ...reward, paidSec }),
  };
  state.money = toStoredBig(new Decimal(state.money).plus(money));
  state.lifetimeIncome = toStoredBig(new Decimal(state.lifetimeIncome).plus(money));
  state.workshop.lifetimeRevenue = state.lifetimeIncome;
  // 领取后刷新离线锚点，避免同一区间再次产生报价
  state.lastTickAtMs = nowMs;
  return { claimed: true, money };
}

/**
 * 结算离线：生成报价（不自动入账）。已有未结算报价时，只有新报价的
 * 总价值更高才替换（高额覆盖低额），避免玩家未领取的收益被低额覆盖。
 */
export function settleOfflineReward(
  state: SaveData,
  nowMs: number,
  calculator: OfflineCalculator,
  fillReceipt?: OfflineReceiptFill
): OfflineQuote | null {
  const quote = calculateOfflineReward(state, nowMs, calculator);
  const existing = state.pendingOfflineReward;
  if (existing && !offlineRewardSettled(existing)) {
    if (!quote) {
      state.lastTickAtMs = Math.max(state.lastTickAtMs, nowMs);
      return null;
    }
    const existingValue = Number(existing.moneyPerSec) > 0
      ? new Decimal(existing.moneyPerSec).mul(Math.min(existing.eligibleSec ?? existing.elapsedSec, existing.elapsedSec))
      : new Decimal(existing.money);
    if (quote.money.lte(existingValue)) {
      state.lastTickAtMs = Math.max(state.lastTickAtMs, nowMs);
      return null;
    }
  }
  if (!quote) {
    // 无报价时也推进锚点，防止累积
    state.lastTickAtMs = Math.max(state.lastTickAtMs, nowMs);
    return null;
  }
  fillReceipt?.(state, quote);
  state.pendingOfflineReward = {
    startedAtMs: state.lastTickAtMs,
    endedAtMs: nowMs,
    elapsedSec: quote.elapsedSec,
    rawElapsedSec: quote.rawElapsedSec,
    capSec: quote.capSec,
    eligibleSec: quote.eligibleSec,
    adUnlocksUsed: quote.adUnlocksUsed,
    adUnlocksMax: quote.adUnlocksMax,
    moneyPerSec: toStoredBig(quote.moneyPerSec),
    money: toStoredBig(quote.money),
    paidSec: 0,
    researchProgress: quote.researchProgress,
    projectProgressDelta: quote.projectProgressDelta,
    projectName: quote.projectName,
    claimed: false,
  };
  state.lastTickAtMs = nowMs;
  return quote;
}

/** 旧入口必须无副作用，不能通过直接调用免费领取广告奖励。 */
export function unlockOfflineRewardSlice(_state: SaveData): {
  ok: boolean;
  addedSec?: number;
  error?: "ads_disabled";
} {
  return { ok: false, error: "ads_disabled" };
}

/** 报价存在即视为有待处理离线内容（面板常驻，直至下一次结算替换）。 */
export function hasPendingOfflineReward(state: SaveData): boolean {
  return state.pendingOfflineReward != null;
}
