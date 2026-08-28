import { describe, expect, it } from "vitest";
import { makeSession, runUntilOrdersComplete, seedBasicRun } from "./helpers";
import { freshSaveData } from "../../src/save/storage";
import {
  acquireFirstModel,
  acceptOrder,
  buyServer,
  upgradeCenter,
  applyPrestige,
  enableAutomation,
  incomePerSecond,
} from "../../src/economy/engine";
import { SERVERS, PRESTIGE_TARGET_INCOME } from "../../src/data/content";
import type { SaveData } from "../../src/save/types";

describe("session: lifecycle", () => {
  it("uses the supplied frame delta so isolated review speed is real", () => {
    const { session } = makeSession();
    session.acquireModel();
    session.acceptOrder("o1");
    session.update(12);
    expect(session.getState().activeOrders).toHaveLength(0);
    expect(session.getState().completedOrders).toBe(1);
  });

  it("creates fresh session and acquires model via command", () => {
    const { session } = makeSession();
    expect(session.getState().modelProgress).toBeNull();
    const res = session.acquireModel();
    expect(res.ok).toBe(true);
    expect(session.getState().modelProgress).not.toBeNull();
  });

  it("completes first order and grants net income", () => {
    const { session, clock } = makeSession();
    session.acquireModel();
    session.acceptOrder("o1");
    const moneyBefore = session.getState().money;
    // 模型 compute=1 → 12 秒完成；租赁 0.5/秒，资金不足时钳制不负债
    runUntilOrdersComplete(session, clock, 12);
    expect(session.getState().activeOrders).toHaveLength(0);
    const moneyAfter = session.getState().money;
    // Codex 主力收益 +10%、图鉴被动 +1%：108×1.11 - 完成 tick 租赁费 0.5 = 119.38
    expect(Number(moneyAfter)).toBeCloseTo(Number(moneyBefore) + 119.38, 1);
  });

  it("charges rental cost per second while money is available", () => {
    const { session, clock } = makeSession();
    session.acquireModel();
    const s = session.getState();
    s.money = 100;
    s.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };
    session.save("test");
    // 无订单时租赁费仍按秒扣除
    clock.advance(2000);
    session.update(2);
    expect(session.getState().money).toBeCloseTo(99, 1);
  });

  it("enables automation after the first server", () => {
    const { session } = makeSession();
    session.acquireModel();
    const s = session.getState();
    for (let i = 0; i < 6; i++) {
      s.completedOrders += 1;
    }
    s.serverCount = 1;
    session.save("test");
    const res = session.enableAutomation();
    expect(res.ok).toBe(true);
    expect(session.getState().automation).toBe(true);
  });

  it("awards first server through command without money", () => {
    const { session } = makeSession();
    session.acquireModel();
    const s = session.getState();
    s.money = 500;
    s.workshop.level = 6;
    s.workshop.lifetimeRevenue = 24000;
    s.lifetimeIncome = 24000;
    session.save("test");
    const res = session.buyServer();
    expect(res.ok).toBe(true);
    expect(session.getState().serverCount).toBe(1);
    expect(session.getState().money).toBe(500);
  });

  it("rejects the retired legacy center command", () => {
    const { session } = makeSession();
    session.acquireModel();
    const s = session.getState();
    s.serverCount = 3;
    s.serverPower = 27;
    s.money = 1e10;
    session.save("test");
    const res = session.upgradeCenter();
    expect(res.ok).toBe(false);
    expect(res.error).toBe("legacy_gateway_retired");
    expect(session.getState().computeCenterLevel).toBe(0);
  });

  it("prestige is atomic and single", () => {
    const { session } = makeSession();
    session.acquireModel();
    const s = session.getState();
    s.money = 5_000_000;
    s.serverCount = 8;
    s.serverPower = 512;
    s.stage2 = { settlementShown: true, completedAtMs: 1, stageIncome: 0 };
    s.stage3 = {
      ...s.stage3,
      entered: true,
      enteredAtMs: 1,
      machineRooms: [
        { index: 1, id: "room_1", name: "r1", commissionedAtMs: 1 },
        { index: 2, id: "room_2", name: "r2", commissionedAtMs: 1 },
        { index: 3, id: "room_3", name: "r3", commissionedAtMs: 1 },
      ],
      flagship: {
        activeId: null, progress: 0, startedAtMs: 0,
        completedIds: ["project_1", "project_2", "project_3"],
        pendingReward: null,
      },
    };
    session.save("test");
    const r1 = session.prestige();
    expect(r1.ok).toBe(true);
    const r2 = session.prestige();
    expect(r2.ok).toBe(false); // 重置后不再满足
    expect(session.getState().technologyIterationCount).toBe(1);
  });

  it("fast clicking commands are idempotent", () => {
    const { session } = makeSession();
    session.acquireModel();
    const r1 = session.acquireModel();
    const r2 = session.acquireModel();
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(session.getState().modelProgress).not.toBeNull();
  });

  it("completed orders auto-settle without a claim action", () => {
    const { session, clock } = makeSession();
    session.acquireModel();
    session.acceptOrder("o1");
    runUntilOrdersComplete(session, clock, 20);
    expect(session.getState().activeOrders).toHaveLength(0);
    expect(session.claimOrder(0).ok).toBe(false); // no_order: completion was automatic
  });
});

describe("session: save/restore", () => {
  it("restores state after refresh", () => {
    const { session, storage } = makeSession();
    session.acquireModel();
    session.getState().money = 12345;
    session.save("manual");
    // 模拟刷新：新会话读同一存储
    const { session: session2 } = makeSession();
    // makeSession 创建新 MemorySaveStorage —— 这里直接验证存储持久化
    const raw = storage.load();
    expect(raw).not.toBeNull();
    expect(raw!.money).toBe(12345);
    expect(raw!.modelProgress).not.toBeNull();
  });

  it("autosaves periodically", () => {
    const { session, clock, storage } = makeSession();
    session.acquireModel();
    for (let i = 0; i < 16; i++) {
      clock.advance(1000);
      session.update(1);
    }
    const raw = storage.load();
    expect(raw!.revision).toBeGreaterThanOrEqual(1);
  });

  it("export/import round-trips", () => {
    const { session } = makeSession();
    session.acquireModel();
    session.getState().money = 777;
    const json = session.exportJson();
    const { session: session2 } = makeSession();
    const res = session2.importJson(json);
    expect(res.ok).toBe(true);
    expect(session2.getState().money).toBe(777);
  });

  it("holds the old local save unchanged while a cloud-first reset is pending", () => {
    const { session, clock, storage } = makeSession();
    session.acquireModel();
    session.getState().money = 777;
    expect(session.save("seed").ok).toBe(true);
    const oldId = session.getState().saveId;

    const prepared = session.beginResetTransaction();
    expect(prepared.ok).toBe(true);
    expect(JSON.parse(prepared.saveJson!).saveId).not.toBe(oldId);
    expect(session.resetTransactionPending()).toBe(true);
    clock.advance(30_000);
    session.update(30);
    expect(session.trainModel()).toEqual({ ok: false, error: "reset_in_progress" });
    expect(storage.load()!.saveId).toBe(oldId);
    expect(storage.load()!.money).toBe(777);

    session.cancelResetTransaction();
    expect(session.resetTransactionPending()).toBe(false);
    expect(session.getState().saveId).toBe(oldId);

    expect(session.beginResetTransaction().ok).toBe(true);
    expect(session.commitResetTransaction()).toEqual({ ok: true });
    expect(session.getState().saveId).not.toBe(oldId);
    expect(storage.load()!.saveId).toBe(session.getState().saveId);
  });

  it("second run recovers income faster after prestige", () => {
    const { session, clock } = makeSession();
    session.acquireModel();
    let s = session.getState();
    s.money = 100000;
    session.save("seed");
    // 首轮基线收入（无倍率）
    const firstRunIps = incomePerSecond(session.getState());
    // 触发迭代（满足 Stage 3 条件）
    s = session.getState();
    s.serverCount = 8;
    s.serverPower = 512;
    s.stage2 = { settlementShown: true, completedAtMs: 1, stageIncome: 0 };
    s.stage3 = {
      ...s.stage3,
      entered: true,
      enteredAtMs: 1,
      machineRooms: [
        { index: 1, id: "room_1", name: "r1", commissionedAtMs: 1 },
        { index: 2, id: "room_2", name: "r2", commissionedAtMs: 1 },
        { index: 3, id: "room_3", name: "r3", commissionedAtMs: 1 },
      ],
      flagship: {
        activeId: null, progress: 0, startedAtMs: 0,
        completedIds: ["project_1", "project_2", "project_3"],
        pendingReward: null,
      },
    };
    session.save("prestige_ready");
    expect(session.prestige().ok).toBe(true);
    // 永久倍率 ×2
    expect(session.getState().permanentMultiplier).toBe(2);
    // 第二轮同配置（模型 Lv1 + 无服务器）收入 = 永久收入 ×2 × 已收集架构 ×3.048625
    session.acquireModel();
    const secondIps = incomePerSecond(session.getState());
    expect(secondIps.toNumber()).toBeCloseTo(firstRunIps.mul(2).mul(3.048625).toNumber(), 8);
    void clock;
  });
});
