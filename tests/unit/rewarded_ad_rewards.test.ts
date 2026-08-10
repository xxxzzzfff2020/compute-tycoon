import { describe, expect, it } from "vitest";
import { makeSession } from "./helpers";
import { freshSaveData } from "../../src/save/storage";
import { normalizeSave } from "../../src/save/validate";
import { GameSession } from "../../src/app/session";
import {
  offlineCapacitySeconds,
  incomeBoostRemainingSeconds,
  SPONSOR_PENDING_OFFER_MAX_AGE_MS,
} from "../../src/economy/sponsor";
import { incomePerSecond } from "../../src/economy/engine";
import { settleOfflineReward } from "../../src/save/offline";

describe("formal sponsor rewards", () => {
  it("adds two hours to the next offline capacity exactly once", () => {
    const { session, repository, clock } = makeSession();
    const prepared = session.prepareSponsorAd("offline_capacity");
    expect(prepared.ok).toBe(true);
    const eventId = prepared.rewardedAdOffer!.eventId;

    expect(session.grantRewardedAd(eventId).ok).toBe(true);
    expect(offlineCapacitySeconds(session.getState())).toBe(8 * 60 * 60);
    expect(session.grantRewardedAd(eventId)).toEqual({ ok: false, error: "ad_offer_missing" });

    const reloaded = new GameSession({ repository, clock });
    expect(offlineCapacitySeconds(reloaded.getState())).toBe(8 * 60 * 60);
    expect(reloaded.grantRewardedAd(eventId).ok).toBe(false);
  });

  it("stacks free and rewarded income charges without exceeding 24 hours", () => {
    const { session, clock } = makeSession();
    expect(session.claimFreeIncomeSponsor().ok).toBe(true);
    expect(incomeBoostRemainingSeconds(session.getState(), clock.now())).toBe(2 * 60 * 60);
    const prepared = session.prepareSponsorAd("income_boost");
    expect(session.grantRewardedAd(prepared.rewardedAdOffer!.eventId).ok).toBe(true);
    expect(incomeBoostRemainingSeconds(session.getState(), clock.now())).toBe(4 * 60 * 60);
  });

  it("caps daily grants at 9 offline ads and 3 free plus 9 income ads", () => {
    const { session, clock } = makeSession();
    for (let i = 0; i < 9; i++) {
      const prepared = session.prepareSponsorAd("offline_capacity");
      expect(prepared.ok).toBe(true);
      expect(session.grantRewardedAd(prepared.rewardedAdOffer!.eventId).ok).toBe(true);
    }
    expect(offlineCapacitySeconds(session.getState())).toBe(24 * 60 * 60);
    expect(session.prepareSponsorAd("offline_capacity").ok).toBe(false);

    for (let i = 0; i < 3; i++) expect(session.claimFreeIncomeSponsor().ok).toBe(true);
    expect(session.claimFreeIncomeSponsor().ok).toBe(false);
    for (let i = 0; i < 9; i++) {
      const prepared = session.prepareSponsorAd("income_boost");
      expect(prepared.ok).toBe(true);
      expect(session.grantRewardedAd(prepared.rewardedAdOffer!.eventId).ok).toBe(true);
    }
    expect(incomeBoostRemainingSeconds(session.getState(), clock.now())).toBe(24 * 60 * 60);
  });

  it("doubles central cash income while active", () => {
    const { session, clock } = makeSession({ initial: {
      modelProgress: { modelId: "codex", level: 3, trainingCount: 0 },
      ownedModelIds: ["codex"],
      automation: true,
      serverCount: 1,
      serverPower: 1.5,
    } });
    const before = incomePerSecond(session.getState(), clock.now());
    expect(session.claimFreeIncomeSponsor().ok).toBe(true);
    expect(incomePerSecond(session.getState(), clock.now()).div(before).toNumber()).toBe(2);
  });

  it("consumes offline capacity when the quote is created, not when it is later claimed", () => {
    const { session, clock } = makeSession({ initial: {
      modelProgress: { modelId: "codex", level: 3, trainingCount: 0 },
      ownedModelIds: ["codex"],
      automation: true,
      serverCount: 1,
      serverPower: 1.5,
    } });
    const first = session.prepareSponsorAd("offline_capacity");
    session.grantRewardedAd(first.rewardedAdOffer!.eventId);
    const state = session.getState();
    state.lastTickAtMs = clock.now() - 8 * 60 * 60_000;
    expect(settleOfflineReward(state, clock.now(), { incomePerSecond })).not.toBeNull();
    expect(state.pendingOfflineReward?.capSec).toBe(8 * 60 * 60);
    expect(offlineCapacitySeconds(state)).toBe(6 * 60 * 60);
    const second = session.prepareSponsorAd("offline_capacity");
    session.grantRewardedAd(second.rewardedAdOffer!.eventId);
    expect(session.claimOffline().ok).toBe(true);
    expect(offlineCapacitySeconds(session.getState())).toBe(8 * 60 * 60);
  });

  it("keeps charged capacity after a short background visit", () => {
    const { session, clock } = makeSession({ initial: {
      modelProgress: { modelId: "codex", level: 3, trainingCount: 0 },
      ownedModelIds: ["codex"],
      automation: true,
      serverCount: 1,
      serverPower: 1.5,
    } });
    const prepared = session.prepareSponsorAd("offline_capacity");
    session.grantRewardedAd(prepared.rewardedAdOffer!.eventId);
    const state = session.getState();
    state.lastTickAtMs = clock.now() - 10 * 60_000;
    expect(settleOfflineReward(state, clock.now(), { incomePerSecond })).not.toBeNull();
    expect(offlineCapacitySeconds(state)).toBe(8 * 60 * 60);
  });

  it("expires stale pending ads on reload but preserves a fresh recovery", () => {
    const { session, repository, clock } = makeSession();
    const prepared = session.prepareSponsorAd("income_boost");
    expect(prepared.ok).toBe(true);
    const fresh = new GameSession({ repository, clock });
    expect(fresh.pendingRewardedAdOffer()?.eventId).toBe(prepared.rewardedAdOffer!.eventId);

    clock.advance(SPONSOR_PENDING_OFFER_MAX_AGE_MS + 1);
    const expired = new GameSession({ repository, clock });
    expect(expired.pendingRewardedAdOffer()).toBeNull();
    expect(repository.load().data.monetization.pendingOffer).toBeNull();
  });

  it("migrates schema v5 saves with sponsor defaults and clears stale offers", () => {
    const legacy = freshSaveData(1_700_000_000_000) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 5;
    legacy.monetization = { completedRewardEventIds: ["old"], pendingOffer: { kind: "blueprint_bonus" } };
    const normalized = normalizeSave(legacy);
    expect(normalized?.schemaVersion).toBe(6);
    expect(normalized?.monetization.pendingOffer).toBeNull();
    expect(normalized?.monetization.completedRewardEventIds).toEqual(["old"]);
    expect(normalized?.monetization.sponsor.offlineCapacityBonusSec).toBe(0);
  });
});
