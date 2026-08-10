import type { RewardedAdOfferState, SaveData } from "../save/types";

export const SPONSOR_OFFLINE_BASE_SECONDS = 6 * 60 * 60;
export const SPONSOR_OFFLINE_AD_SECONDS = 2 * 60 * 60;
export const SPONSOR_OFFLINE_ADS_PER_DAY = 9;
export const SPONSOR_OFFLINE_MAX_SECONDS = 24 * 60 * 60;
export const SPONSOR_INCOME_CHARGE_SECONDS = 2 * 60 * 60;
export const SPONSOR_INCOME_FREE_CHARGES_PER_DAY = 3;
export const SPONSOR_INCOME_ADS_PER_DAY = 9;
export const SPONSOR_INCOME_MAX_REMAINING_SECONDS = 24 * 60 * 60;
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
    sponsor.offlineAdsWatchedToday = 0;
    sponsor.incomeFreeChargesUsedToday = 0;
    sponsor.incomeAdsWatchedToday = 0;
  }
}

export function offlineCapacitySeconds(state: SaveData): number {
  return Math.min(
    SPONSOR_OFFLINE_MAX_SECONDS,
    SPONSOR_OFFLINE_BASE_SECONDS + Math.max(0, state.monetization.sponsor.offlineCapacityBonusSec),
  );
}

export function incomeBoostRemainingSeconds(state: SaveData, nowMs: number): number {
  const safeNow = Math.max(nowMs, state.monetization.sponsor.lastObservedNowMs);
  return Math.max(0, Math.ceil((state.monetization.sponsor.incomeBoostUntilMs - safeNow) / 1000));
}

export function sponsorIncomeMultiplier(state: SaveData, nowMs: number): number {
  return incomeBoostRemainingSeconds(state, nowMs) > 0 ? SPONSOR_INCOME_MULTIPLIER : 1;
}

function addIncomeBoost(state: SaveData, nowMs: number): void {
  const sponsor = state.monetization.sponsor;
  const safeNow = Math.max(nowMs, sponsor.lastObservedNowMs);
  const base = Math.max(safeNow, sponsor.incomeBoostUntilMs);
  sponsor.incomeBoostUntilMs = Math.min(
    base + SPONSOR_INCOME_CHARGE_SECONDS * 1000,
    safeNow + SPONSOR_INCOME_MAX_REMAINING_SECONDS * 1000,
  );
}

export function claimFreeIncomeCharge(state: SaveData, nowMs: number): { ok: boolean; error?: string } {
  normalizeSponsorDay(state, nowMs);
  const sponsor = state.monetization.sponsor;
  if (sponsor.incomeFreeChargesUsedToday >= SPONSOR_INCOME_FREE_CHARGES_PER_DAY) {
    return { ok: false, error: "free_income_charges_exhausted" };
  }
  if (incomeBoostRemainingSeconds(state, nowMs) >= SPONSOR_INCOME_MAX_REMAINING_SECONDS) {
    return { ok: false, error: "income_boost_full" };
  }
  sponsor.incomeFreeChargesUsedToday += 1;
  addIncomeBoost(state, nowMs);
  return { ok: true };
}

export function prepareSponsorAd(
  state: SaveData,
  kind: SponsorAdKind,
  nowMs: number,
): { ok: boolean; error?: string; offer?: RewardedAdOfferState } {
  normalizeSponsorDay(state, nowMs);
  const sponsor = state.monetization.sponsor;
  if (state.monetization.pendingOffer) return { ok: false, error: "ad_offer_pending" };
  if (kind === "offline_capacity") {
    if (sponsor.offlineAdsWatchedToday >= SPONSOR_OFFLINE_ADS_PER_DAY) {
      return { ok: false, error: "offline_ads_exhausted" };
    }
    if (offlineCapacitySeconds(state) >= SPONSOR_OFFLINE_MAX_SECONDS) {
      return { ok: false, error: "offline_capacity_full" };
    }
  } else {
    if (sponsor.incomeAdsWatchedToday >= SPONSOR_INCOME_ADS_PER_DAY) {
      return { ok: false, error: "income_ads_exhausted" };
    }
    if (incomeBoostRemainingSeconds(state, nowMs) >= SPONSOR_INCOME_MAX_REMAINING_SECONDS) {
      return { ok: false, error: "income_boost_full" };
    }
  }
  const used = kind === "offline_capacity" ? sponsor.offlineAdsWatchedToday : sponsor.incomeAdsWatchedToday;
  const offer: RewardedAdOfferState = {
    eventId: `sponsor:${state.saveId}:${sponsor.dayKey}:${kind}:${used + 1}`,
    kind,
    createdAtMs: nowMs,
  };
  state.monetization.pendingOffer = offer;
  return { ok: true, offer };
}

export function grantSponsorAd(state: SaveData, eventId: string, nowMs: number): { ok: boolean; error?: string } {
  normalizeSponsorDay(state, nowMs);
  const offer = state.monetization.pendingOffer;
  if (!offer || offer.eventId !== eventId) return { ok: false, error: "ad_offer_missing" };
  if (state.monetization.completedRewardEventIds.includes(eventId)) {
    return { ok: false, error: "ad_reward_already_granted" };
  }
  const sponsor = state.monetization.sponsor;
  if (offer.kind === "offline_capacity") {
    if (sponsor.offlineAdsWatchedToday >= SPONSOR_OFFLINE_ADS_PER_DAY) return { ok: false, error: "offline_ads_exhausted" };
    sponsor.offlineAdsWatchedToday += 1;
    sponsor.offlineCapacityBonusSec = Math.min(
      SPONSOR_OFFLINE_MAX_SECONDS - SPONSOR_OFFLINE_BASE_SECONDS,
      sponsor.offlineCapacityBonusSec + SPONSOR_OFFLINE_AD_SECONDS,
    );
  } else {
    if (sponsor.incomeAdsWatchedToday >= SPONSOR_INCOME_ADS_PER_DAY) return { ok: false, error: "income_ads_exhausted" };
    sponsor.incomeAdsWatchedToday += 1;
    addIncomeBoost(state, nowMs);
  }
  state.monetization.completedRewardEventIds = [
    ...state.monetization.completedRewardEventIds,
    eventId,
  ].slice(-128);
  state.monetization.pendingOffer = null;
  return { ok: true };
}

/** 只有实际使用基础6小时以外的扩展区间时才消耗已充入容量。 */
export function consumeOfflineCapacityCharge(state: SaveData, rawElapsedSec: number): boolean {
  if (state.monetization.sponsor.offlineCapacityBonusSec <= 0) return false;
  if (rawElapsedSec <= SPONSOR_OFFLINE_BASE_SECONDS) return false;
  state.monetization.sponsor.offlineCapacityBonusSec = 0;
  return true;
}

/** 启动时清理过期事件；新鲜事件留给玩家在赞助页显式继续或取消。 */
export function expirePendingSponsorAd(state: SaveData, nowMs: number): boolean {
  const offer = state.monetization.pendingOffer;
  if (!offer) return false;
  if (nowMs - offer.createdAtMs <= SPONSOR_PENDING_OFFER_MAX_AGE_MS) return false;
  state.monetization.pendingOffer = null;
  return true;
}
