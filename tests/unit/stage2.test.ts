// Stage 2 规模成长测试：三档订单表现 / 业务组合 / 模型研发 / 服务器扩张里程碑 / 阶段定义 / 结算。
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { freshSaveData } from "../../src/save/storage";
import {
  acceptOrder,
  acquireFirstModel,
  automationAutoAccept,
  buyServer,
  completeStage2Settlement,
  currentStage,
  incomePerSecond,
  modelCompute,
  orderDisplayMode,
  ordersPerSecond,
  pickAutoOrderId,
  researchModel,
  canResearchModel,
  stage3Gateway,
} from "../../src/economy/engine";
import { MODELS, ORDERS, SERVERS, SERVER_CENTER_REQUIREMENT } from "../../src/data/content";
import { addResearchFromOrder, addResearchFromLevelUp } from "../../src/economy/workshop";
import { buildViewModel } from "../../src/economy/viewmodel";
import { formatMoney } from "../../src/core/big";

function makeState() {
  return freshSaveData(1_700_000_000_000);
}

function grantFirstServer(s: ReturnType<typeof makeState>): void {
  s.workshop.level = 6;
  s.workshop.lifetimeRevenue = 24000;
  s.lifetimeIncome = 24000;
  buyServer(s);
}

describe("stage2: order display modes", () => {
  it("single_order_mode_under_1_ops", () => {
    const s = makeState();
    acquireFirstModel(s);
    expect(ordersPerSecond(s)).toBeLessThan(1);
    expect(orderDisplayMode(s)).toBe("single");
  });

  it("business_flow_mode_1_to_20_ops", () => {
    const s = makeState();
    acquireFirstModel(s);
    grantFirstServer(s);
    // serverPower = 2 → ops 仍 <1；给更高模型等级
    s.modelProgress!.level = 8; // compute ≈ 1.7 → ops = 3*1.7/12 = 0.425
    // 需要 1-20：手动调 serverPower 到 8 台水平
    s.serverPower = 32; // ops = 32*1.7/12 ≈ 4.5
    expect(ordersPerSecond(s)).toBeGreaterThanOrEqual(1);
    expect(ordersPerSecond(s)).toBeLessThanOrEqual(20);
    expect(orderDisplayMode(s)).toBe("flow");
  });

  it("compute_summary_mode_above_20_ops", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.serverPower = 512; // ops = 512*1/12 ≈ 42
    expect(ordersPerSecond(s)).toBeGreaterThan(20);
    expect(orderDisplayMode(s)).toBe("compute");
  });
});

describe("stage2: business mix", () => {
  it("business_mix_uses_multiple_orders", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.automation = true;
    // 多次调用：组合覆盖多种订单（确定性轮盘基于 completedOrders）
    const picked = new Set<string>();
    for (let i = 0; i < 200; i++) {
      s.completedOrders = i;
      picked.add(pickAutoOrderId(s));
    }
    // 长序列下应覆盖 >1 种订单；且 o1 占比最高
    expect(picked.size).toBeGreaterThan(1);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      s.completedOrders = i;
      const id = pickAutoOrderId(s);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    const o1 = counts["o1"] ?? 0;
    for (const id of Object.keys(counts)) {
      expect(counts[id]).toBeGreaterThan(0); // 所有已解锁订单非零占比
      expect(counts[id]).toBeLessThanOrEqual(o1 * 2);
    }
  });

  it("automation_auto_accept_fills_slots_with_mix", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.automation = true;
    s.serverCount = 1;
    s.unlockedOrderIds = ORDERS.map((order) => order.id);
    s.orderSlotCapacity = Object.fromEntries(ORDERS.map((order) => [order.id, 4]));
    const n = automationAutoAccept(s, 0);
    expect(n).toBe(20);
    expect(s.activeOrders).toHaveLength(20);
    for (const order of ORDERS) {
      expect(s.activeOrders.filter((active) => active.orderId === order.id)).toHaveLength(4);
    }
    expect(s.activeOrders.every((active) => ORDERS.some((order) => order.id === active.orderId))).toBe(true);
  });

  it("aggregate_income_matches_order_contributions", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.automation = true;
    s.serverCount = 7;
    s.serverPower = 209;
    s.stage3.technologyArchive = [
      { id: "tech_gpu_array", unlockedAtMs: 1 },
      { id: "tech_power_modular", unlockedAtMs: 1 },
    ];
    const vm = buildViewModel(s);
    expect(vm.orderDisplay.netPerSec).toBe(formatMoney(incomePerSecond(s)));
  });
});

describe("stage2: paid-only Blueprints", () => {
  it("orders and workshop levels no longer grant free Blueprint progress", () => {
    const s = makeState();
    acquireFirstModel(s);
    s.modelResearch.progress = 42;
    addResearchFromOrder(s, ORDERS[0]);
    addResearchFromLevelUp(s);
    expect(s.modelResearch.progress).toBe(42);
  });

  it("legacy full progress cannot trigger a free Blueprint level", () => {
    const s = makeState();
    acquireFirstModel(s);
    grantFirstServer(s);
    s.modelResearch.progress = 100;
    const before = structuredClone(s);
    expect(canResearchModel(s)).toBe(false);
    expect(researchModel(s)).toMatchObject({ ok: false, error: "feature_removed" });
    expect(s).toEqual(before);
  });

  it("model_passive_updates_income", () => {
    const s = makeState();
    acquireFirstModel(s);
    const before = s.modelProgress!.level;
    s.modelProgress!.level = before + 2;
    // 高等级 → compute 更高（被动效果来自 baseCompute × (1+(level-1)*gain)）
    expect(modelCompute(s).gt(modelCompute({ ...s, modelProgress: { ...s.modelProgress!, level: before } }))).toBe(true);
  });

});

describe("stage2: server expansion & stages", () => {
  it("server_2_to_8_purchase", () => {
    const s = makeState();
    grantFirstServer(s);
    expect(s.serverCount).toBe(1);
    s.money = 1e12;
    for (let i = 2; i <= 8; i++) {
      expect(buyServer(s).ok).toBe(true);
      expect(s.serverCount).toBe(i);
    }
    expect(s.serverCount).toBe(8);
    expect(buyServer(s).ok).toBe(false);
  });

  it("server_price_progression", () => {
    // 候选 E：第 2→8 台严格递增，没有第 4 台价格倒挂。
    for (let i = 1; i < 8; i++) {
      expect(SERVERS[i].cost).toBeGreaterThan(SERVERS[i - 1].cost);
    }
  });

  it("server_milestones_1_3_5_8", () => {
    const s = makeState();
    grantFirstServer(s);
    expect(s.serverCount).toBe(1);
    s.money = 1e12;
    buyServer(s); buyServer(s); // 3 台
    expect(s.serverCount).toBe(3);
    buyServer(s); buyServer(s); // 5 台
    expect(s.serverCount).toBe(5);
    buyServer(s); buyServer(s); buyServer(s); // 8 台
    expect(s.serverCount).toBe(8);
  });

  it("server_purchase_updates_income_and_compute", () => {
    const s = makeState();
    acquireFirstModel(s);
    grantFirstServer(s);
    const before = incomePerSecond(s);
    s.money = 1e12;
    buyServer(s);
    expect(incomePerSecond(s).gt(before)).toBe(true);
  });

  it("stage3_not_visible_before_8_servers", () => {
    const s = makeState();
    grantFirstServer(s);
    expect(currentStage(s)).toBe(2);
    expect(stage3Gateway(s)).toBe(false);
    s.serverCount = 7;
    expect(stage3Gateway(s)).toBe(false);
    expect(currentStage(s)).toBe(2);
  });

  it("stage3_gateway_visible_at_8_servers", () => {
    const s = makeState();
    s.serverCount = 8;
    s.serverPower = 512;
    expect(stage3Gateway(s)).toBe(true);
    // 8 台未进入 Stage 3：仍是 Stage 2（过渡状态）
    expect(currentStage(s)).toBe(2);
    // 完成 Stage 2 结算 + 进入 Stage 3 → Stage 3
    s.stage2 = { settlementShown: true, completedAtMs: 1, stageIncome: 0 };
    s.stage3 = { ...s.stage3, entered: true, enteredAtMs: 1 };
    expect(currentStage(s)).toBe(3);
  });

  it("stage2_settlement_exactly_once", () => {
    const s = makeState();
    s.serverCount = 8;
    s.serverPower = 512;
    expect(completeStage2Settlement(s).ok).toBe(true);
    expect(s.stage2!.settlementShown).toBe(true);
    expect(completeStage2Settlement(s).ok).toBe(false);
    // 未满 8 台不可结算
    const s2 = makeState();
    s2.serverCount = 7;
    expect(completeStage2Settlement(s2).ok).toBe(false);
  });
});
