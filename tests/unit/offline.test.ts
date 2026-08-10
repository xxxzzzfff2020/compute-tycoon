import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { freshSaveData } from "../../src/save/storage";
import {
  calculateOfflineReward,
  claimOfflineReward,
  settleOfflineReward,
  OFFLINE_MAX_SECONDS,
  hasPendingOfflineReward,
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
  it("calculates up to the universal six-hour base cap", () => {
    const s = makeState();
    s.lifetimeIncome = 1_000_000;
    const quote = calculateOfflineReward(s, s.lastTickAtMs + 8 * 60 * 60 * 1000, calculator);
    expect(quote).not.toBeNull();
    expect(quote!.elapsedSec).toBe(OFFLINE_MAX_SECONDS);
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
});
