import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { freshSaveData } from "../../src/save/storage";
import {
  calculateOfflineReward,
  claimOfflineReward,
  settleOfflineReward,
  unlockOfflineRewardSlice,
  offlineRemainingSec,
  offlineRewardSettled,
  OFFLINE_FREE_SECONDS,
  hasPendingOfflineReward,
  offlineAdExpansionAvailable,
} from "../../src/save/offline";
import { incomePerSecond } from "../../src/economy/engine";

const calculator = { incomePerSecond };

function makeState(now = 1_700_000_000_000) {
  const s = freshSaveData(now);
  s.lastTickAtMs = now;
  // 让 incomePerSecond > 0：拥有模型 + 服务器
  s.modelProgress = { modelId: "codex", level: 3, trainingCount: 2 };
  s.ownedModelIds = ["codex"];
  s.serverCount = 1;
  s.serverPower = 1.5;
  return s;
}

describe("offline reward", () => {
  it("starts every eligible return at the two-hour free entitlement", () => {
    const s = makeState();
    s.lifetimeIncome = 1_000_000;
    const quote = calculateOfflineReward(s, s.lastTickAtMs + 8 * 60 * 60 * 1000, calculator);
    expect(quote).not.toBeNull();
    expect(quote!.elapsedSec).toBe(OFFLINE_FREE_SECONDS);
    expect(quote!.eligibleSec).toBe(OFFLINE_FREE_SECONDS);
    expect(quote!.capSec).toBe(OFFLINE_FREE_SECONDS);
    expect(quote!.money.gt(0)).toBe(true);
  });

  it("settles once and does not double-settle", () => {
    const s = makeState();
    const t1 = s.lastTickAtMs + 10 * 60 * 1000;
    const q1 = settleOfflineReward(s, t1, calculator);
    expect(q1).not.toBeNull();
    const q2 = settleOfflineReward(s, t1 + 60_000, calculator);
    expect(q2).toBeNull(); // 已有待领取
    expect(hasPendingOfflineReward(s)).toBe(true);
  });

  it("claims exactly once", () => {
    const s = makeState();
    const t1 = s.lastTickAtMs + 10 * 60 * 1000;
    settleOfflineReward(s, t1, calculator);
    const moneyBefore = new Decimal(s.money);
    const c1 = claimOfflineReward(s, t1 + 1000, calculator);
    expect(c1.claimed).toBe(true);
    expect(c1.money.gt(0)).toBe(true);
    expect(new Decimal(s.money).gt(moneyBefore)).toBe(true);
    const c2 = claimOfflineReward(s, t1 + 2000, calculator);
    expect(c2.claimed).toBe(false);
  });

  it("ignores too-short absence", () => {
    const s = makeState();
    const q = calculateOfflineReward(s, s.lastTickAtMs + 3_000, calculator);
    expect(q).toBeNull();
  });

  it("does not reward when no income", () => {
    const s = freshSaveData(1_700_000_000_000); // 无模型无服务器 → income=0
    s.lastTickAtMs = 1_700_000_000_000;
    const q = calculateOfflineReward(s, s.lastTickAtMs + 60_000, calculator);
    expect(q).toBeNull();
  });

  it("does not create a second reward after a system-clock rollback", () => {
    const s = makeState();
    const firstNow = s.lastTickAtMs + 10 * 60 * 1000;
    settleOfflineReward(s, firstNow, calculator);
    expect(claimOfflineReward(s, firstNow + 1000, calculator).claimed).toBe(true);
    const moneyAfterClaim = s.money;
    expect(settleOfflineReward(s, firstNow - 60_000, calculator)).toBeNull();
    expect(s.money).toBe(moneyAfterClaim);
  });

  it("settles the free part completely without waiting for disabled ads", () => {
    const s = makeState();
    const now = s.lastTickAtMs + 20 * 3600_000;
    settleOfflineReward(s, now, calculator);
    expect(claimOfflineReward(s, now, calculator).claimed).toBe(true);
    expect(hasPendingOfflineReward(s)).toBe(true);
    expect(offlineRemainingSec(s.pendingOfflineReward!)).toBe(0);
    expect(offlineRewardSettled(s.pendingOfflineReward!)).toBe(true);
    const before = structuredClone(s);
    expect(unlockOfflineRewardSlice(s)).toEqual({ ok: false, error: "ads_disabled" });
    expect(s).toEqual(before);
    expect(s.pendingOfflineReward!.elapsedSec).toBe(OFFLINE_FREE_SECONDS);
  });

  it("does not offer an ad when the remaining return is shorter than a full two-hour slice", () => {
    const s = makeState();
    const now = s.lastTickAtMs + 3 * 60 * 60 * 1000;
    settleOfflineReward(s, now, calculator);
    expect(s.pendingOfflineReward?.eligibleSec).toBe(OFFLINE_FREE_SECONDS);

    expect(claimOfflineReward(s, now + 1, calculator).claimed).toBe(true);
    expect(offlineAdExpansionAvailable(s.pendingOfflineReward!)).toBe(false);
    expect(offlineRewardSettled(s.pendingOfflineReward!)).toBe(true);
    expect(unlockOfflineRewardSlice(s)).toEqual({ ok: false, error: "ads_disabled" });
  });

  // CARD-04：高额覆盖低额——新报价总价值更高才替换未结算旧报价。
  it("replaces an unsettled quote only when the new return is worth more", () => {
    const s = makeState();
    const t1 = s.lastTickAtMs + 2 * 60 * 60 * 1000;
    settleOfflineReward(s, t1, calculator);
    const oldMoney = s.pendingOfflineReward!.money;
    // 短时间（500ms 不够 5s）不产生报价 → 保留旧报价
    expect(settleOfflineReward(s, t1 + 6_000, calculator)).toBeNull();
    expect(s.pendingOfflineReward!.money).toBe(oldMoney);
    // 长时间离线且收入更高 → 新报价覆盖旧报价
    s.lifetimeIncome = "1e15";
    s.serverCount = 8;
    s.serverPower = 8;
    s.modelProgress = { modelId: "codex", level: 10, trainingCount: 2 };
    s.lastTickAtMs = t1;
    const t2 = t1 + 8 * 60 * 60 * 1000;
    const q2 = settleOfflineReward(s, t2, calculator);
    expect(q2).not.toBeNull();
    expect(s.pendingOfflineReward!.startedAtMs).toBe(t1);
    expect(s.pendingOfflineReward!.paidSec).toBe(0);
  });

  // CARD-04：已结算报价由任意新会话直接替换（面板内容更新，不再残留旧状态）。
  it("replaces a fully settled quote with the next return", () => {
    const s = makeState();
    const t1 = s.lastTickAtMs + 10 * 60 * 1000;
    settleOfflineReward(s, t1, calculator);
    claimOfflineReward(s, t1 + 1000, calculator);
    expect(offlineRewardSettled(s.pendingOfflineReward!)).toBe(true);
    s.lastTickAtMs = t1 + 1000;
    const t2 = t1 + 1000 + 8 * 60 * 1000;
    const q2 = settleOfflineReward(s, t2, calculator);
    expect(q2).not.toBeNull();
    expect(s.pendingOfflineReward!.paidSec).toBe(0);
    expect(offlineRemainingSec(s.pendingOfflineReward!)).toBe(s.pendingOfflineReward!.elapsedSec);
  });
});
