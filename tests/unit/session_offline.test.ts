import { describe, expect, it, vi } from "vitest";
import { makeSession } from "./helpers";
import { freshSaveData } from "../../src/save/storage";
import type { SaveData } from "../../src/save/types";

describe("session: offline flow", () => {
  function incomeSave(): SaveData {
    const base = freshSaveData(1_700_000_000_000);
    base.modelProgress = { modelId: "codex", level: 3, trainingCount: 2 };
    base.ownedModelIds = ["codex"];
    base.serverCount = 1;
    base.serverPower = 1.5;
    return base;
  }

  it("settles offline reward at boot and claims the free part; no double credit", () => {
    // 预置一个有过收入的存档，lastTickAtMs 在 10 分钟前
    const base = freshSaveData(1_700_000_000_000);
    base.modelProgress = { modelId: "codex", level: 3, trainingCount: 2 };
    base.ownedModelIds = ["codex"];
    base.serverCount = 1;
    base.serverPower = 1.5;
    base.lastTickAtMs = 1_700_000_000_000 - 10 * 60 * 1000;
    const { session, clock } = makeSession({ initial: { ...base } as Partial<SaveData> });
    // 会话构造时已 settleOfflineAtBoot
    expect(session.hasPendingOffline()).toBe(true);
    const moneyBefore = session.getState().money;
    const r = session.claimOffline();
    expect(r.ok).toBe(true);
    expect(Number(session.getState().money)).toBeGreaterThan(Number(moneyBefore));
    // 部分领取：报价仍在（面板常驻），但剩余为 0，重复领取不会重复入账
    expect(session.hasPendingOffline()).toBe(true);
    const r2 = session.claimOffline();
    expect(r2.ok).toBe(false);
    expect(Number(session.getState().money)).toBe(Number(session.getState().money));
    void clock;
  });

  it("online play never triggers offline reward (autosave refreshes anchor)", () => {
    const { session, clock } = makeSession();
    session.acquireModel();
    session.acceptOrder("o1");
    // 在线玩 30 秒（多次 update + autosave）
    for (let i = 0; i < 30; i++) {
      clock.advance(1000);
      session.update(1);
    }
    // 手动保存：锚点刷新，重载不应产生离线收益
    session.save("manual");
    expect(session.hasPendingOffline()).toBe(false);
    const { session: s2 } = makeSession({
      initial: { ...session.getState() } as Partial<SaveData>,
    });
    expect(s2.hasPendingOffline()).toBe(false);
  });

  it("does not double-settle after refresh", () => {
    const base = freshSaveData(1_700_000_000_000);
    base.modelProgress = { modelId: "codex", level: 3, trainingCount: 2 };
    base.ownedModelIds = ["codex"];
    base.serverCount = 1;
    base.serverPower = 1.5;
    base.lastTickAtMs = 1_700_000_000_000 - 20 * 60 * 1000;
    const { session } = makeSession({ initial: { ...base } as Partial<SaveData> });
    expect(session.hasPendingOffline()).toBe(true);
    const money = session.getState().money;
    session.claimOffline();
    // 领取后锚点刷新：报价仍在（常驻面板），但刷新不会再重复入账
    const { session: s2 } = makeSession({
      initial: { ...session.getState() } as Partial<SaveData>,
    });
    expect(s2.hasPendingOffline()).toBe(true);
    expect(s2.claimOffline().ok).toBe(false);
    expect(Number(s2.getState().money)).toBe(Number(session.getState().money));
    expect(Number(s2.getState().money)).toBeGreaterThan(Number(money));
  });

  it("settles one same-session background interval and never double credits it", () => {
    const { session, clock } = makeSession({ initial: incomeSave() });
    expect(session.save("visibility_hidden").ok).toBe(true);
    clock.advance(10 * 60 * 1000);

    const first = session.resumeFromBackground();
    expect(first).toEqual({ ok: true, settled: true });
    expect(session.getState().pendingOfflineReward?.rawElapsedSec).toBe(10 * 60);
    const receipt = structuredClone(session.getState().pendingOfflineReward);

    // 重复 visible 事件没有新的隐藏区间/时间，不替换报价，也不推进锚点两次。
    expect(session.resumeFromBackground()).toEqual({ ok: true, settled: false });
    expect(session.getState().pendingOfflineReward).toEqual(receipt);

    const moneyBeforeClaim = Number(session.getState().money);
    expect(session.claimOffline().ok).toBe(true);
    const moneyAfterClaim = Number(session.getState().money);
    expect(moneyAfterClaim).toBeGreaterThan(moneyBeforeClaim);
    expect(session.claimOffline().ok).toBe(false);
    expect(Number(session.getState().money)).toBe(moneyAfterClaim);
  });

  it("does not accumulate sub-five-second visibility flaps into a false offline return", () => {
    const { session, clock } = makeSession({ initial: incomeSave() });
    for (let index = 0; index < 20; index += 1) {
      expect(session.save("visibility_hidden").ok).toBe(true);
      clock.advance(4_000);
      expect(session.resumeFromBackground()).toEqual({ ok: true, settled: false });
    }
    expect(session.hasPendingOffline()).toBe(false);
  });

  it("keeps an unclaimed receipt stable across a lower-value later background interval", () => {
    const { session, clock } = makeSession({ initial: incomeSave() });
    session.save("visibility_hidden");
    clock.advance(20 * 60 * 1000);
    expect(session.resumeFromBackground().settled).toBe(true);
    const original = structuredClone(session.getState().pendingOfflineReward!);

    session.save("visibility_hidden");
    clock.advance(5 * 60 * 1000);
    expect(session.resumeFromBackground()).toEqual({ ok: true, settled: false });
    expect(session.getState().pendingOfflineReward).toEqual(original);
    expect(session.getState().lastTickAtMs).toBe(clock.now());
  });

  it("rejects a clock rollback on resume without changing money or the retained receipt", () => {
    const { session, clock } = makeSession({ initial: incomeSave() });
    session.save("visibility_hidden");
    clock.advance(10 * 60 * 1000);
    session.resumeFromBackground();
    const before = structuredClone(session.getState());
    clock.advance(-60_000);
    expect(session.resumeFromBackground()).toEqual({ ok: true, settled: false });
    expect(session.getState().money).toBe(before.money);
    expect(session.getState().pendingOfflineReward).toEqual(before.pendingOfflineReward);
  });

  it("rolls back a failed resume save and retries the same interval exactly once", () => {
    const { session, clock, storage } = makeSession({ initial: incomeSave() });
    expect(session.save("visibility_hidden").ok).toBe(true);
    const before = structuredClone(session.getState());
    const persistedBefore = storage.load();
    clock.advance(10 * 60 * 1000);
    const failedWrite = vi.spyOn(storage, "save").mockReturnValue(false);
    try {
      expect(session.resumeFromBackground()).toEqual({
        ok: false, settled: false, error: "storage_write_failed",
      });
      expect(session.getState()).toEqual(before);
      expect(storage.load()).toEqual(persistedBefore);
    } finally {
      failedWrite.mockRestore();
    }

    expect(session.resumeFromBackground()).toEqual({ ok: true, settled: true });
    expect(session.getState().pendingOfflineReward?.rawElapsedSec).toBe(600);
    expect(storage.load()?.pendingOfflineReward).toEqual(session.getState().pendingOfflineReward);
    expect(session.claimOffline().ok).toBe(true);
    const credited = session.getState().money;
    expect(session.resumeFromBackground()).toEqual({ ok: true, settled: false });
    expect(session.claimOffline().ok).toBe(false);
    expect(session.getState().money).toBe(credited);
  });
});
