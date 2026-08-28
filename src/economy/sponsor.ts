import type { RewardedAdOfferState, SaveData } from "../save/types";
import {
  OFFLINE_AD_SLICE_LIMIT,
  OFFLINE_AD_SLICE_SECONDS,
  OFFLINE_FREE_SECONDS,
  OFFLINE_MAX_SECONDS,
} from "../save/offline";

export const SPONSOR_OFFLINE_BASE_SECONDS = OFFLINE_FREE_SECONDS;
export const SPONSOR_OFFLINE_AD_SECONDS = OFFLINE_AD_SLICE_SECONDS;
/** 兼容旧导出名；额度属于单次离线回归会话，不按自然日刷新。 */
export const SPONSOR_OFFLINE_ADS_PER_DAY = OFFLINE_AD_SLICE_LIMIT;
export const SPONSOR_OFFLINE_MAX_SECONDS = OFFLINE_MAX_SECONDS;
export const SPONSOR_INCOME_CHARGE_SECONDS = 2 * 60 * 60;
/**
 * 收入加速只由成功观看激励视频获得。保留这个常量和旧字段是为了兼容历史存档，
 * 但它固定为 0，不能再向玩家显示或发放“免费充能”。
 */
export const SPONSOR_INCOME_FREE_CHARGES_PER_DAY = 0;
/** 每次广告增加 2 小时；每日 3 次，最多保持 6 小时。 */
export const SPONSOR_INCOME_ADS_PER_DAY = 3;
export const SPONSOR_INCOME_MAX_REMAINING_SECONDS = 6 * 60 * 60;
export const SPONSOR_INCOME_MULTIPLIER = 2;
export const SPONSOR_PENDING_OFFER_MAX_AGE_MS = 15 * 60 * 1000;

export type SponsorAdKind = "offline_capacity" | "income_boost";

export function beijingDayKey(nowMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** 每日额度只允许向前滚动；设备时间回拨不会重复刷新免费次数或广告次数。 */
export function normalizeSponsorDay(state: SaveData, nowMs: number): void {
  const sponsor = state.monetization.sponsor;
  const safeNow = Math.max(nowMs, sponsor.lastObservedNowMs);
  sponsor.lastObservedNowMs = safeNow;
  const nextKey = beijingDayKey(safeNow);
  if (!sponsor.dayKey) sponsor.dayKey = nextKey;
  if (nextKey > sponsor.dayKey) {
    sponsor.dayKey = nextKey;
    // 离线广告额度已经绑定到 pendingOfflineReward，不在自然日切换时刷新。
    sponsor.incomeFreeChargesUsedToday = 0;
    sponsor.incomeAdsWatchedToday = 0;
  }
}

export function offlineCapacitySeconds(state: SaveData): number {
  void state;
  return SPONSOR_OFFLINE_BASE_SECONDS;
}

export function incomeBoostRemainingSeconds(state: SaveData, nowMs: number): number {
  const safeNow = Math.max(nowMs, state.monetization.sponsor.lastObservedNowMs);
  return Math.max(0, Math.ceil((state.monetization.sponsor.incomeBoostUntilMs - safeNow) / 1000));
}

export function sponsorIncomeMultiplier(state: SaveData, nowMs: number): number {
  return incomeBoostRemainingSeconds(state, nowMs) > 0 ? SPONSOR_INCOME_MULTIPLIER : 1;
}

/** 单机版不把原广告奖励替换成免费奖励。 */
export function claimFreeIncomeCharge(_state: SaveData, _nowMs: number): { ok: boolean; error?: string } {
  return { ok: false, error: "free_income_charge_disabled" };
}

/** 保留旧签名以兼容调用方；不生成事件，不变更存档。 */
export function prepareSponsorAd(
  _state: SaveData,
  _kind: SponsorAdKind,
  _nowMs: number,
): { ok: boolean; error?: string; offer?: RewardedAdOfferState } {
  return { ok: false, error: "ads_disabled" };
}

export function grantSponsorAd(_state: SaveData, _eventId: string, _nowMs: number): { ok: boolean; error?: string; offlineAddedSec?: number } {
  return { ok: false, error: "ads_disabled" };
}

/**
 * 旧调用兼容：v8 起不再存在预充给“下一次离线”的容量；广告必须绑定当前待领取回执。
 */
export function consumeOfflineCapacityCharge(state: SaveData, rawElapsedSec: number): boolean {
  void rawElapsedSec;
  if (state.monetization.sponsor.offlineCapacityBonusSec <= 0) return false;
  state.monetization.sponsor.offlineCapacityBonusSec = 0;
  return true;
}

/** 单机启动清理历史待播放事件，不兑现或恢复广告。 */
export function expirePendingSponsorAd(state: SaveData, _nowMs: number): boolean {
  const offer = state.monetization.pendingOffer;
  if (!offer) return false;
  state.monetization.pendingOffer = null;
  return true;
}
