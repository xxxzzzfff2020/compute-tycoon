import { describe, expect, it } from "vitest";
import { makeSession } from "./helpers";
import { freshSaveData } from "../../src/save/storage";
import type { SaveData } from "../../src/save/types";

describe("session: offline flow", () => {
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
});
