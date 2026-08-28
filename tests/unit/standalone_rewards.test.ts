import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { makeSession } from "./helpers";
import { freshSaveData } from "../../src/save/storage";
import { normalizeSave } from "../../src/save/validate";
import { GameSession } from "../../src/app/session";
import {
  prepareSponsorAd,
  grantSponsorAd,
  claimFreeIncomeCharge,
  incomeBoostRemainingSeconds,
} from "../../src/economy/sponsor";
import { incomePerSecond } from "../../src/economy/engine";
import {
  settleOfflineReward,
  unlockOfflineRewardSlice,
  offlineRewardSettled,
  OFFLINE_FREE_SECONDS,
} from "../../src/save/offline";
import { SAVE_SCHEMA_VERSION } from "../../src/save/types";
import { buildViewModel } from "../../src/economy/viewmodel";

const RUNNING_INITIAL = {
  modelProgress: { modelId: "codex", level: 3, trainingCount: 0 },
  ownedModelIds: ["codex"],
  automation: true,
  serverCount: 1,
  serverPower: 1.5,
};

describe("single-player rewards", () => {
  it.each(["offline_capacity", "income_boost"] as const)("rejects %s commands without changing state or storage", (kind) => {
    const { session, storage, clock } = makeSession({ initial: RUNNING_INITIAL });
    session.getState().lastTickAtMs = clock.now() - 14 * 3600_000;
    settleOfflineReward(session.getState(), clock.now(), { incomePerSecond });
    session.save();
    const before = session.exportJson();
    const persisted = storage.load();
    expect(session.prepareSponsorAd(kind)).toEqual({ ok: false, error: "ads_disabled" });
    expect(session.grantRewardedAd("old-ad-event")).toEqual({ ok: false, error: "ads_disabled" });
    expect(session.cancelPendingSponsorAd("old-ad-event")).toEqual({ ok: false, error: "ads_disabled" });
    expect(session.pendingRewardedAdOffer()).toBeNull();
    expect(session.exportJson()).toBe(before);
    expect(storage.load()).toEqual(persisted);
    expect(incomeBoostRemainingSeconds(session.getState(), clock.now())).toBe(0);
  });

  it("rejects even direct legacy reward APIs without generating free compensation", () => {
    const state = freshSaveData(1_700_000_000_000);
    state.monetization.pendingOffer = { eventId: "legacy", kind: "income_boost", createdAtMs: state.createdAtMs };
    const before = structuredClone(state);
    expect(prepareSponsorAd(state, "income_boost", state.createdAtMs).error).toBe("ads_disabled");
    expect(grantSponsorAd(state, "legacy", state.createdAtMs).error).toBe("ads_disabled");
    expect(unlockOfflineRewardSlice(state).error).toBe("ads_disabled");
    expect(claimFreeIncomeCharge(state, state.createdAtMs).error).toBe("free_income_charge_disabled");
    expect(state).toEqual(before);
  });

  it("never exposes ad availability or free replacement rewards in the view model", () => {
    const { session, clock } = makeSession({ initial: RUNNING_INITIAL });
    session.getState().lastTickAtMs = clock.now() - 14 * 3600_000;
    settleOfflineReward(session.getState(), clock.now(), { incomePerSecond });
    const vm = buildViewModel(session.getState());
    expect(vm.sponsor).toMatchObject({ availableAdCount: 0, canWatchOfflineAd: false, canWatchIncomeAd: false, canClaimFreeIncome: false, pendingAdKind: null });
    expect(vm.offline.canWatchOfflineAd).toBe(false);
    expect(session.claimFreeIncomeSponsor()).toEqual({ ok: false, error: "free_income_charge_disabled" });
  });

  it("settles a 14-hour absence at the original free 2 hours and permits a smaller next return", () => {
    const { session, clock } = makeSession({ initial: RUNNING_INITIAL });
    const state = session.getState();
    state.lastTickAtMs = clock.now() - 14 * 3600_000;
    settleOfflineReward(state, clock.now(), { incomePerSecond });
    expect(state.pendingOfflineReward).toMatchObject({ elapsedSec: OFFLINE_FREE_SECONDS, eligibleSec: OFFLINE_FREE_SECONDS, adUnlocksMax: 0 });
    expect(session.claimOffline().ok).toBe(true);
    expect(offlineRewardSettled(session.getState().pendingOfflineReward!)).toBe(true);
    const money = session.getState().money;
    expect(session.claimOffline().ok).toBe(false);
    expect(session.getState().money).toBe(money);
    clock.advance(60_000);
    expect(settleOfflineReward(session.getState(), clock.now(), { incomePerSecond })).not.toBeNull();
    expect(session.getState().pendingOfflineReward?.elapsedSec).toBe(60);
  });

  it("preserves a legacy unlocked 4-hour receipt with 2 hours already paid, exactly once across reload", () => {
    const legacy = { ...freshSaveData(1_700_000_000_000), ...RUNNING_INITIAL };
    legacy.money = 100;
    legacy.pendingOfflineReward = {
      startedAtMs: legacy.createdAtMs - 14 * 3600_000,
      endedAtMs: legacy.createdAtMs,
      elapsedSec: 4 * 3600,
      rawElapsedSec: 14 * 3600,
      capSec: 14 * 3600,
      eligibleSec: 14 * 3600,
      adUnlocksUsed: 1,
      adUnlocksMax: 6,
      moneyPerSec: 10,
      money: 4 * 3600 * 10,
      paidSec: 2 * 3600,
      researchProgress: 0,
      projectProgressDelta: 0,
      projectName: null,
      claimed: false,
    };
    const { session, repository, clock } = makeSession({ initial: legacy });
    expect(session.getState().pendingOfflineReward).toMatchObject({ elapsedSec: 4 * 3600, paidSec: 2 * 3600, eligibleSec: 4 * 3600, adUnlocksMax: 0 });
    expect(session.claimOffline().ok).toBe(true);
    expect(new Decimal(session.getState().money).toNumber()).toBe(100 + 2 * 3600 * 10);
    const reloaded = new GameSession({ repository, clock });
    expect(reloaded.claimOffline().ok).toBe(false);
    expect(reloaded.getState().money).toBe(session.getState().money);
    expect(reloaded.getState().pendingOfflineReward?.claimed).toBe(true);
  });

  it("keeps an already-earned legacy boost but never restores a pending ad on load or import", () => {
    const { session, clock } = makeSession({ initial: RUNNING_INITIAL });
    const legacy = structuredClone(session.getState());
    const baseIncome = incomePerSecond(legacy, clock.now());
    legacy.monetization.sponsor.incomeBoostUntilMs = clock.now() + 3600_000;
    legacy.monetization.pendingOffer = { eventId: "legacy-pending", kind: "income_boost", createdAtMs: clock.now() };
    const normalized = normalizeSave(legacy)!;
    expect(normalized.monetization.pendingOffer).toBeNull();
    expect(incomePerSecond(normalized, clock.now()).div(baseIncome).toNumber()).toBe(2);
    expect(session.importJson(JSON.stringify(legacy)).ok).toBe(true);
    expect(session.getState().monetization.pendingOffer).toBeNull();
    expect(session.grantRewardedAd("legacy-pending").ok).toBe(false);
    expect(incomeBoostRemainingSeconds(session.getState(), clock.now())).toBe(3600);
    clock.advance(3600_000);
    expect(incomeBoostRemainingSeconds(session.getState(), clock.now())).toBe(0);
  });

  it("migrates old v5 saves without a new reward or pending event", () => {
    const legacy = freshSaveData(1_700_000_000_000) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 5;
    legacy.monetization = { completedRewardEventIds: ["old"], pendingOffer: { kind: "blueprint_bonus" } };
    const normalized = normalizeSave(legacy);
    expect(normalized?.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(normalized?.monetization.pendingOffer).toBeNull();
    expect(normalized?.monetization.completedRewardEventIds).toEqual(["old"]);
    expect(normalized?.monetization.sponsor.offlineCapacityBonusSec).toBe(0);
  });
});
