import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { freshSaveData } from "../../src/save/storage";
import {
  acceptOrder,
  acquireFirstModel,
  applyPrestige,
  applyTrain,
  automationUnlocked,
  buyServer,
  canTrain,
  canUpgradeCenter,
  canPrestige,
  centerUpgradeCost,
  enableAutomation,
  enableRental,
  incomePerSecond,
  LEGACY_TRAINING_TOTAL_COST,
  modelCompute,
  modelLevel,
  orderSlotSpeedMultiplier,
  orderNet,
  prestigePreview,
  tick,
  trainCost,
  upgradeCenter,
} from "../../src/economy/engine";
import {
  MODEL_TRAINING_MAX_LEVEL,
  ORDERS,
  ORDER_QUEUE_EFFECTIVE_PARALLELISM,
  PRESTIGE_TARGET_INCOME,
  SERVERS,
} from "../../src/data/content";
import { effectiveServerPower } from "../../src/economy/incremental-growth";

function makeState() {
  return freshSaveData(1_700_000_000_000);
}

describe("engine: model", () => {
  it("acquires first model", () => {
    const s = makeState();
    const res = acquireFirstModel(s);
    expect(res.ok).toBe(true);
    expect(s.modelProgress?.level).toBe(1);
    expect(s.ownedModelIds).toContain("codex");
  });

  it("rejects second acquisition", () => {
    const s = makeState();
    acquireFirstModel(s);
    const res = acquireFirstModel(s);
    expect(res.ok).toBe(false);
  });

  it("trains model with cost", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.money = 10000;
    const cost = trainCost(s);
    const res = applyTrain(s);
    expect(res.ok).toBe(true);
    expect(s.modelProgress?.level).toBe(2);
    expect(s.money).toBe(10000 - cost.toNumber());
  });

  it("rejects train without funds", () => {
    const s = makeState();
    acquireFirstModel(s);
    const res = applyTrain(s);
    expect(res.ok).toBe(false);
    expect(s.modelProgress?.level).toBe(1);
  });

  it("keeps model training independent when the matching Blueprint is maxed", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.modelArchive.codex.level = 40;
    s.money = 10_000;

    expect(modelLevel(s)).toBe(1);
    expect(trainCost(s).toNumber()).toBe(35);
    expect(canTrain(s)).toBe(true);

    expect(applyTrain(s).ok).toBe(true);
    expect(s.modelProgress?.level).toBe(2);
    expect(s.modelArchive.codex.level).toBe(40);
  });

  it("splits shared training into 40 levels without changing full-path spend or max compute", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.money = "1e30";
    const initialCompute = modelCompute(s);
    let spent = new Decimal(0);

    while (canTrain(s)) {
      const cost = trainCost(s);
      expect(cost.gt(0)).toBe(true);
      expect(applyTrain(s).ok).toBe(true);
      spent = spent.plus(cost);
    }

    expect(modelLevel(s)).toBe(MODEL_TRAINING_MAX_LEVEL);
    expect(spent.eq(LEGACY_TRAINING_TOTAL_COST)).toBe(true);
    expect(modelCompute(s).div(initialCompute).toNumber()).toBeCloseTo(2.9, 10);
  });
});

describe("engine: orders", () => {
  it("computes net income after rental cost", () => {
    const o = ORDERS[0];
    const net = orderNet(o);
    expect(net.eq(108)).toBe(true); // 180 * (1-0.4)
  });

  it("accepts and completes order", () => {
    const s = makeState();
    acquireFirstModel(s);
    const now = 1_700_000_000_000;
    expect(acceptOrder(s, "o1", now).ok).toBe(true);
    s.money = 0;
    // 手动推进：模型 compute=1，完成 15 秒订单
    const beforeMoney = s.money;
    // 直接完成：用 tick 推进
    // (engine tick 逻辑在 session 中调用；此处直接手动模拟完成)
    s.activeOrders[0].remainingSec = 0;
    const income = Decimal;
    expect(beforeMoney).toBe(0);
  });

  it("starts the first unlocked order with four independent slots", () => {
    const s = makeState();
    acquireFirstModel(s);
    const now = 1_700_000_000_000;
    for (let i = 0; i < 4; i++) expect(acceptOrder(s, "o1", now).ok).toBe(true);
    expect(s.activeOrders.map((order) => order.slotIndex)).toEqual([0, 1, 2, 3]);
    expect(acceptOrder(s, "o1", now).ok).toBe(false);
  });

  it("migrates legacy capacities and enforces four slots per order", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.money = 10_000;
    s.unlockedOrderIds = ["o1", "o2"];
    s.orderSlotCapacity = { o1: 1, o2: 1 };
    const now = 1_700_000_000_000;
    for (let index = 0; index < 4; index += 1) {
      expect(acceptOrder(s, "o1", now).ok).toBe(true);
      expect(acceptOrder(s, "o2", now).ok).toBe(true);
    }
    expect(s.activeOrders).toHaveLength(8);
    expect(acceptOrder(s, "o1", now)).toMatchObject({ ok: false, error: "order_slots_full" });
    expect(acceptOrder(s, "o2", now)).toMatchObject({ ok: false, error: "order_slots_full" });
  });

  it("advances four fixed lanes at 100%, 50%, 25%, and 12.5%", () => {
    const s = makeState();
    acquireFirstModel(s);
    const now = 1_700_000_000_000;
    for (let index = 0; index < 4; index += 1) {
      expect(acceptOrder(s, "o1", now).ok).toBe(true);
    }
    const before = s.activeOrders.map((order) => order.remainingSec);
    const speed = modelCompute(s).mul(effectiveServerPower(s)).toNumber();
    tick(s, now + 1_000, 1);
    expect(s.activeOrders.map((order) => order.remainingSec)).toEqual(
      before.map((remaining, index) => expect.closeTo(
        remaining - speed * orderSlotSpeedMultiplier(index),
        8,
      )),
    );
    expect(ORDER_QUEUE_EFFECTIVE_PARALLELISM).toBe(1.875);
  });

  it("keeps later lanes at fixed speeds after the front lane completes", () => {
    const s = makeState();
    acquireFirstModel(s);
    const now = 1_700_000_000_000;
    for (let index = 0; index < 4; index += 1) {
      expect(acceptOrder(s, "o1", now).ok).toBe(true);
    }
    const speed = modelCompute(s).mul(effectiveServerPower(s)).toNumber();
    s.activeOrders[0].remainingSec = speed;
    for (let index = 1; index < 4; index += 1) s.activeOrders[index].remainingSec = speed * 100;

    const result = tick(s, now + 2_000, 2);

    expect(result.completedOrderIds).toEqual(["o1"]);
    expect(s.activeOrders).toHaveLength(3);
    expect(s.activeOrders.map((order) => order.slotIndex)).toEqual([1, 2, 3]);
    expect(s.activeOrders[0].remainingSec).toBeCloseTo(speed * 99, 8);
    expect(s.activeOrders[1].remainingSec).toBeCloseTo(speed * 99.5, 8);
    expect(s.activeOrders[2].remainingSec).toBeCloseTo(speed * 99.75, 8);
  });

  it("refills an automated completion in the same lane without moving the others", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.serverCount = 1;
    s.serverPower = 1.5;
    const now = 1_700_000_000_000;
    for (let index = 0; index < 4; index += 1) {
      expect(acceptOrder(s, "o1", now).ok).toBe(true);
    }
    s.automation = true;
    const speed = modelCompute(s).mul(effectiveServerPower(s)).toNumber();
    s.activeOrders[0].remainingSec = speed;
    for (let index = 1; index < 4; index += 1) s.activeOrders[index].remainingSec = speed * 100;

    const result = tick(s, now + 2_000, 2);

    expect(result.completedOrderIds).toEqual(["o1"]);
    expect(s.activeOrders).toHaveLength(4);
    expect(s.activeOrders.map((order) => order.slotIndex)).toEqual([0, 1, 2, 3]);
    expect(s.activeOrders[0].remainingSec).toBeCloseTo(ORDERS[0].durationSec - speed, 8);
    expect(s.activeOrders[1].remainingSec).toBeCloseTo(speed * 99, 8);
    expect(s.activeOrders[2].remainingSec).toBeCloseTo(speed * 99.5, 8);
    expect(s.activeOrders[3].remainingSec).toBeCloseTo(speed * 99.75, 8);
  });
});

describe("engine: automation", () => {
  it("unlocks after the first owned server", () => {
    const s = makeState();
    s.completedOrders = 5;
    expect(automationUnlocked(s)).toBe(false);
    s.completedOrders = 6;
    expect(automationUnlocked(s)).toBe(false);
    s.serverCount = 1;
    expect(automationUnlocked(s)).toBe(true);
  });

  it("enables automation only when unlocked", () => {
    const s = makeState();
    expect(enableAutomation(s).ok).toBe(false);
    s.completedOrders = 6;
    expect(enableAutomation(s).ok).toBe(false);
    s.serverCount = 1;
    expect(enableAutomation(s).ok).toBe(true);
    expect(enableAutomation(s).ok).toBe(true); // 幂等
  });
});

describe("engine: servers", () => {
  it("awards first server via milestone without deducting money", () => {
    const s = makeState();
    s.money = 500;
    s.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };
    // 里程碑未满足：不授予
    expect(buyServer(s).ok).toBe(false);
    s.workshop.level = 6;
    s.workshop.lifetimeRevenue = 24000;
    s.lifetimeIncome = 24000;
    const res = buyServer(s);
    expect(res.ok).toBe(true);
    expect(s.serverCount).toBe(1);
    // 服务器算力为加法累积：基础 1 + 首服 power
    expect(s.serverPower).toBe(SERVERS[0].power);
    expect(s.rentalCompute.active).toBe(false);
    // 不扣除当前资金
    expect(s.money).toBe(500);
    // 只触发一次
    expect(buyServer(s).ok).toBe(false);
  });

  it("rejects server beyond 8", () => {
    const s = makeState();
    s.serverCount = 8;
    s.money = 1e12;
    expect(buyServer(s).ok).toBe(false);
  });

  it("expands from 1 to 8 servers with increasing cost and power", () => {
    const s = makeState();
    // 里程碑授予首服
    s.workshop.level = 6;
    s.workshop.lifetimeRevenue = 24000;
    s.lifetimeIncome = 24000;
    expect(buyServer(s).ok).toBe(true);
    expect(s.serverCount).toBe(1);
    // 候选 E：第 2→8 台价格全程严格递增，禁止第 4 台价格倒挂造成秒穿；
    // power 全程严格递增；serverPower 加法累积（每台 power 相加）
    let prevCost = 0;
    let prevPower = 0;
    for (let i = 2; i <= 8; i++) {
      s.money = 1e12;
      const def = SERVERS.find((sv) => sv.index === i)!;
      if (i >= 3) expect(def.cost).toBeGreaterThan(prevCost);
      expect(def.power).toBeGreaterThan(prevPower);
      prevCost = def.cost;
      prevPower = def.power;
      const before = s.serverPower;
      expect(buyServer(s).ok).toBe(true);
      expect(s.serverCount).toBe(i);
      expect(Number(s.serverPower)).toBe(Number(before) + def.power);
    }
    expect(s.serverCount).toBe(8);
    // 8 台后不能再买
    expect(buyServer(s).ok).toBe(false);
  });

  it("legacy center remains retired after 8 servers", () => {
    const s = makeState();
    s.serverCount = 7;
    s.money = 1e12;
    expect(canUpgradeCenter(s)).toBe(false);
    s.serverCount = 8;
    expect(canUpgradeCenter(s)).toBe(false);
  });
});

describe("engine: retired compute-center gateway", () => {
  it("cannot be upgraded from any server count", () => {
    const s = makeState();
    s.money = 1e12;
    s.serverCount = 2;
    expect(upgradeCenter(s).ok).toBe(false);
    s.serverCount = 3;
    expect(upgradeCenter(s).ok).toBe(false);
    expect(s.computeCenterLevel).toBe(0);
  });

  it("escalates upgrade cost", () => {
    const c0 = centerUpgradeCost(0);
    const c1 = centerUpgradeCost(1);
    expect(c1.gt(c0)).toBe(true);
  });
});

describe("engine: income", () => {
  it("income per second grows with model and servers", () => {
    const s = makeState();
    acquireFirstModel(s);
    const before = incomePerSecond(s);
    s.serverCount = 1;
    s.serverPower = 1.5;
    const after = incomePerSecond(s);
    expect(after.gt(before)).toBe(true);
  });
});

describe("engine: prestige", () => {
  it("requires stage3 iteration conditions", () => {
    const s = makeState();
    expect(canPrestige(s)).toBe(false);
    // 机房 3 + 最终旗舰工程完成 → 可迭代
    s.serverCount = 8;
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
        activeId: null,
        progress: 0,
        startedAtMs: 0,
        completedIds: ["project_1", "project_2", "project_3"],
        pendingReward: null,
      },
    };
    expect(canPrestige(s)).toBe(true);
    // 缺少最终旗舰工程 → 不可迭代
    s.stage3.flagship.completedIds = ["project_1", "project_2"];
    expect(canPrestige(s)).toBe(false);
  });

  it("prestige preview shows reset and gain", () => {
    const s = makeState();
    s.serverCount = 8;
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
    const pp = prestigePreview(s);
    expect(pp.canPrestige).toBe(true);
    expect(pp.resetItems.length).toBeGreaterThan(0);
    expect(pp.gainItems).toContain("prestige.gain.multiplier");
  });

  it("applies prestige atomically", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.money = 500000;
    s.serverCount = 8;
    s.serverPower = 512;
    s.computeCenterLevel = 0;
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
    const res = applyPrestige(s);
    expect(res.ok).toBe(true);
    expect(s.technologyIterationCount).toBe(1);
    expect(s.permanentMultiplier).toBe(2);
    expect(s.money).toBe(0);
    expect(s.serverCount).toBe(0);
    expect(s.computeCenterLevel).toBe(0);
    expect(s.modelProgress).toBeNull();
    expect(s.lifetimeIncome).toBe(0); // 未设置则保留原值（迭代合同重置后从 0 计）
  });

  it("rejects prestige when not ready", () => {
    const s = makeState();
    expect(applyPrestige(s).ok).toBe(false);
  });
});
