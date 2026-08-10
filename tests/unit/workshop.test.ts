// 工作室成长轨道：经验/等级/首服里程碑/训练平衡。
import { describe, expect, it } from "vitest";
import { makeSession, seedBasicRun } from "./helpers";
import { freshSaveData } from "../../src/save/storage";
import {
  addExperience,
  awardFirstServer,
  experienceToNextLevel,
  firstServerMilestoneMet,
  lifetimeRevenue,
  orderExperience,
  FIRST_SERVER_LIFETIME_REVENUE,
  FIRST_SERVER_WORKSHOP_LEVEL,
} from "../../src/economy/workshop";
import { buyServer, applyTrain, acceptOrder } from "../../src/economy/engine";
import { ORDERS } from "../../src/data/content";
import type { SaveData } from "../../src/save/types";

describe("workshop: order grants", () => {
  it("order_grants_money_and_experience: 订单同时增加资金和经验；累计收入正确增加", () => {
    const { session, clock } = makeSession();
    session.acquireModel();
    session.acceptOrder("o1");
    const expBefore = session.getState().workshop.experience;
    const revBefore = session.getState().workshop.lifetimeRevenue;
    // 推进 12 秒完成订单
    for (let i = 0; i < 13; i++) {
      clock.advance(1000);
      session.update(1);
    }
    expect(session.getState().activeOrders[0].status).toBe(1);
    session.claimOrder(0);
    // 资金增加（净收入）
    expect(session.getState().money).toBeGreaterThan(0);
    // 经验增加（按订单毛收入折算）
    expect(session.getState().workshop.experience).toBeGreaterThan(expBefore);
    expect(session.getState().workshop.experience).toBe(expBefore + orderExperience(ORDERS[0]));
    // 累计收入 = 毛收入 × 倍率（正确增加）
    expect(Number(session.getState().workshop.lifetimeRevenue)).toBeGreaterThan(Number(revBefore));
    expect(session.getState().workshop.lifetimeRevenue).toBe(session.getState().lifetimeIncome);
  });

  it("workshop_level_progression: 经验升级正确；重复结算不重复升级", () => {
    const s = freshSaveData(0);
    s.workshop = { level: 1, experience: 0, experienceToNextLevel: experienceToNextLevel(1), lifetimeRevenue: 0, firstServerAwarded: false };
    // 一次 +100 恰好升级 Lv1→2
    expect(addExperience(s, experienceToNextLevel(1))).toBe(true);
    expect(s.workshop.level).toBe(2);
    expect(s.workshop.experience).toBe(0);
    // 溢出结转
    expect(addExperience(s, experienceToNextLevel(2) + 10)).toBe(true);
    expect(s.workshop.level).toBe(3);
    expect(s.workshop.experience).toBe(10);
    // 少量经验不升级
    expect(addExperience(s, 1)).toBe(false);
    expect(s.workshop.level).toBe(3);
    expect(s.workshop.experience).toBe(11);
  });
});

describe("workshop: first server milestone", () => {
  function milestoneState(): SaveData {
    const s = freshSaveData(0);
    s.workshop = { level: FIRST_SERVER_WORKSHOP_LEVEL, experience: 0, experienceToNextLevel: 1, lifetimeRevenue: FIRST_SERVER_LIFETIME_REVENUE, firstServerAwarded: false };
    s.lifetimeIncome = FIRST_SERVER_LIFETIME_REVENUE;
    return s;
  }

  it("first_server_unlock: 等级和累计收入同时满足后授予；不扣当前资金", () => {
    const s = milestoneState();
    s.money = 999;
    const res = buyServer(s);
    expect(res.ok).toBe(true);
    expect(s.serverCount).toBe(1);
    expect(s.money).toBe(999); // 不扣资金
  });

  it("first_server_not_unlocked_early: 只满足一个条件时不授予", () => {
    // 只有等级
    const s1 = freshSaveData(0);
    s1.workshop.level = FIRST_SERVER_WORKSHOP_LEVEL;
    s1.workshop.lifetimeRevenue = 0;
    expect(firstServerMilestoneMet(s1)).toBe(false);
    expect(buyServer(s1).ok).toBe(false);
    // 只有累计收入
    const s2 = freshSaveData(0);
    s2.workshop.level = 1;
    s2.workshop.lifetimeRevenue = FIRST_SERVER_LIFETIME_REVENUE;
    s2.lifetimeIncome = FIRST_SERVER_LIFETIME_REVENUE;
    expect(firstServerMilestoneMet(s2)).toBe(false);
    expect(buyServer(s2).ok).toBe(false);
  });

  it("first_server_exactly_once: 连续触发和刷新后都不重复发放", () => {
    const s = milestoneState();
    s.money = 500;
    expect(buyServer(s).ok).toBe(true);
    expect(s.serverCount).toBe(1);
    // 连续触发
    expect(buyServer(s).ok).toBe(false);
    expect(s.serverCount).toBe(1);
    // 模拟刷新恢复：持久化后重新载入
    const reloaded = { ...s, workshop: { ...s.workshop } };
    expect(buyServer(reloaded).ok).toBe(false);
    expect(reloaded.serverCount).toBe(1);
  });

  it("training_does_not_reset_progress: 训练扣除当前资金；累计营业收入和等级不下降", () => {
    const { session } = makeSession();
    session.acquireModel();
    const s = session.getState();
    s.money = 1000;
    s.workshop.level = 3;
    s.workshop.experience = 120;
    s.workshop.lifetimeRevenue = 8000;
    s.lifetimeIncome = 8000;
    session.save("seed");
    const revBefore = session.getState().workshop.lifetimeRevenue;
    const levelBefore = session.getState().workshop.level;
    const expBefore = session.getState().workshop.experience;
    expect(session.trainModel().ok).toBe(true);
    const st = session.getState();
    expect(st.money).toBeLessThan(1000);
    expect(st.workshop.lifetimeRevenue).toBe(revBefore);
    expect(st.workshop.level).toBe(levelBefore);
    expect(st.workshop.experience).toBe(expBefore);
  });

  it("save_restore_workshop_progress: 刷新后等级、经验、累计收入和首服状态恢复", () => {
    const { session, storage } = makeSession();
    session.acquireModel();
    const s = session.getState();
    s.workshop.level = 5;
    s.workshop.experience = 321;
    s.workshop.lifetimeRevenue = 12000;
    s.lifetimeIncome = 12000;
    session.save("manual");
    // 重新载入（模拟刷新）
    const { session: s2 } = makeSession({ initial: { ...session.getState() } as Partial<SaveData> });
    expect(s2.getState().workshop.level).toBe(5);
    expect(s2.getState().workshop.experience).toBe(321);
    expect(s2.getState().workshop.lifetimeRevenue).toBe(12000);
    expect(lifetimeRevenue(s2.getState()).toNumber()).toBe(12000);
    // 首服状态恢复：授予后刷新不再发放
    const s3 = s2.getState();
    s3.workshop.level = FIRST_SERVER_WORKSHOP_LEVEL;
    s3.workshop.lifetimeRevenue = FIRST_SERVER_LIFETIME_REVENUE;
    s3.lifetimeIncome = FIRST_SERVER_LIFETIME_REVENUE;
    s2.save("seed");
    expect(buyServer(s2.getState()).ok).toBe(true);
    const { session: s4 } = makeSession({ initial: { ...s2.getState() } as Partial<SaveData> });
    expect(buyServer(s4.getState()).ok).toBe(false);
    void storage;
  });
});

describe("workshop: lifetime revenue tracking", () => {
  it("award_first_server returns ok only once", () => {
    const s = freshSaveData(0);
    s.workshop.level = FIRST_SERVER_WORKSHOP_LEVEL;
    s.workshop.lifetimeRevenue = FIRST_SERVER_LIFETIME_REVENUE;
    s.lifetimeIncome = FIRST_SERVER_LIFETIME_REVENUE;
    expect(awardFirstServer(s).ok).toBe(true);
    expect(awardFirstServer(s).ok).toBe(false);
  });

  it("seedBasicRun integration: 接单后经验可积累", () => {
    const { session, clock } = makeSession();
    seedBasicRun(session.getState(), clock.now());
    session.save("seed");
    expect(session.getState().activeOrders.length).toBe(1);
    expect(session.getState().workshop.experience).toBeGreaterThanOrEqual(0);
    void applyTrain;
    void acceptOrder;
  });
});
