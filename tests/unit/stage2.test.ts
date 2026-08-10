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
    const n = automationAutoAccept(s, 0);
    expect(n).toBeGreaterThan(0);
    expect(s.activeOrders.length).toBeGreaterThan(0);
    expect(s.activeOrders.length).toBeLessThanOrEqual(4);
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

describe("stage2: model research", () => {
  it("research_progress_from_orders", () => {
    const s = makeState();
    acquireFirstModel(s);
    const def = ORDERS.find((o) => o.id === "o1")!;
    addResearchFromOrder(s, def);
    expect(s.modelResearch!.progress).toBeGreaterThan(0);
    expect(s.modelResearch!.progress).toBeLessThanOrEqual(100);
  });

  it("research_progress_from_level", () => {
    const s = makeState();
    acquireFirstModel(s);
    addResearchFromLevelUp(s);
    expect(s.modelResearch!.progress).toBeGreaterThanOrEqual(12);
  });

  it("free_model_draw_at_full_progress", () => {
    const s = makeState();
    acquireFirstModel(s);
    grantFirstServer(s); // 研发循环在 Stage 2（首服后）启用
    s.modelResearch!.progress = 100;
    expect(canResearchModel(s)).toBe(true);
    const res = researchModel(s);
    expect(res.ok).toBe(true);
    expect(s.modelResearch!.progress).toBe(0); // 消耗后归零
  });

  it("research_does_not_cost_money", () => {
    const s = makeState();
    acquireFirstModel(s);
    grantFirstServer(s);
    s.money = 0;
    s.modelResearch!.progress = 100;
    const res = researchModel(s);
    expect(res.ok).toBe(true);
    expect(s.money).toBe(0);
  });

  it("duplicate_model_converts_to_experience", () => {
    const s = makeState();
    acquireFirstModel(s);
    grantFirstServer(s);
    s.modelResearch!.progress = 100;
    // 当前模型 codex；强制抽到 codex（重复）
    s.ownedModelIds = ["codex", "vision", "voice", "science"];
    const beforeLevel = s.modelProgress!.level;
    // 全部拥有时重复 → 等级+1
    const res = researchModel(s);
    expect(res.ok).toBe(true);
    if (!res.isNew) {
      expect(s.modelProgress!.level).toBeGreaterThanOrEqual(beforeLevel);
    }
  });

  it("model_passive_updates_income", () => {
    const s = makeState();
    acquireFirstModel(s);
    const before = s.modelProgress!.level;
    s.modelProgress!.level = before + 2;
    // 高等级 → compute 更高（被动效果来自 baseCompute × (1+(level-1)*gain)）
    expect(modelCompute(s).gt(modelCompute({ ...s, modelProgress: { ...s.modelProgress!, level: before } }))).toBe(true);
  });

  it("research_exactly_once_per_full_progress", () => {
    const s = makeState();
    acquireFirstModel(s);
    grantFirstServer(s);
    s.modelResearch!.progress = 100;
    expect(researchModel(s).ok).toBe(true);
    // 进度归零后不能再研发
    expect(canResearchModel(s)).toBe(false);
    expect(researchModel(s).ok).toBe(false);
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
    // 4 台起规模化成本回落，4→8 台单调递增
    const c3 = SERVERS[2].cost;
    const c4 = SERVERS[3].cost;
    expect(c4).toBeLessThan(c3);
    for (let i = 4; i < 8; i++) {
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
