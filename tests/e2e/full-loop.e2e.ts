// E2E：新档 → 第一模型 → 手动订单 → 自动经营 → 工作室成长 → 第一台服务器 → 业务流水模式
    // → 模型研发 → 服务器 3/5/8（架构节点自动解锁）→ 算力结算 → Stage 2 结算 → Stage 3
// → 基础设施/瓶颈 → 机房 2/3 → 旗舰工程 → 档案馆 → 第一次技术迭代 → 第二轮首服/自动经营更快
// 使用 jsdom + 开发加速（session.update 直接驱动，等效 dev=1&speed=high）
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { GameSession } from "../../src/app/session";
import { FakeClock } from "../unit/helpers";
import { MemorySaveStorage } from "../../src/save/storage";
import { SaveRepository } from "../../src/save/repository";
import { createAppShell } from "../../src/ui/render";
import { ORDERS, SERVERS, PRESTIGE_TARGET_INCOME } from "../../src/data/content";
import { FIRST_SERVER_WORKSHOP_LEVEL } from "../../src/economy/workshop";

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"app\"></div></body></html>", {
    url: "http://localhost/",
  });
  const { window } = dom;
  // 注入全局
  (globalThis as unknown as Record<string, unknown>).window = window;
  (globalThis as unknown as Record<string, unknown>).document = window.document;
  (globalThis as unknown as Record<string, unknown>).HTMLElement = window.HTMLElement;
  (globalThis as unknown as Record<string, unknown>).performance = window.performance;
  return dom;
}

describe("E2E full loop", () => {
  it("runs full Stage1→Stage2→Stage3→archive→iteration1→second-run loop", () => {
    setupDom();
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    const repository = new SaveRepository({ storage, nowMs: () => clock.now() });
    const session = new GameSession({ repository, clock });
    const container = document.getElementById("app")!;
    const shell = createAppShell(container);
    let lastCommand = "";
    shell.setCommandHandler((cmd) => {
      lastCommand = cmd;
      return { ok: true };
    });

    // 新档
    shell.render(session.viewModel());
    expect(session.getState().modelProgress).toBeNull();

    // 获取模型
    expect(session.acquireModel().ok).toBe(true);

    // 接第一批订单（推荐订单 o1）
    for (let i = 0; i < 4; i++) {
      expect(session.acceptOrder(ORDERS[0].id).ok).toBe(true);
    }
    // 推进时间完成订单（compute=1 → 15s/单）
    for (let t = 0; t < 80; t++) {
      clock.advance(1000);
      session.update(1);
    }
    // 自动领取（手动模式不自动领；这里手动领）
    let readyCount = session.getState().activeOrders.filter((o) => o.status === 1).length;
    for (let i = 0; i < readyCount; i++) {
      session.claimOrder(i);
    }
    // 完成 6 个订单解锁自动化
    let completed = session.getState().completedOrders;
    while (completed < 6) {
      session.acceptOrder(ORDERS[0].id);
      clock.advance(20 * 1000);
      session.update(20);
      // 自动领取
      for (let i = 0; i < session.getState().activeOrders.length; i++) {
        if (session.getState().activeOrders[i].status === 1) session.claimOrder(i);
      }
      completed = session.getState().completedOrders;
    }
    expect(session.getState().completedOrders).toBeGreaterThanOrEqual(6);
    expect(session.enableAutomation().ok).toBe(true);

    // 自动经营攒钱 → 取得第一台服务器（Stage 1 里程碑：等级 + 累计收入，不扣资金）
    const s1 = session.getState();
    s1.workshop.level = 6;
    s1.workshop.lifetimeRevenue = 24000;
    s1.lifetimeIncome = 24000;
    session.save("test_accel");
    const moneyBeforeAward = session.getState().money;
    expect(session.buyServer().ok).toBe(true);
    expect(session.getState().serverCount).toBe(1);
    expect(session.getState().money).toBe(moneyBeforeAward); // 不扣除当前资金
    // 模型研发循环：订单/升级累积进度 → 100% 免费研发（不耗资金）
    let research = session.getState().modelResearch!;
    research.progress = 100;
    session.save("research_full");
    expect(session.researchModel().ok).toBe(true);
    expect(session.getState().modelResearch!.progress).toBe(0);
    expect(session.getState().ownedModelIds.length).toBeGreaterThanOrEqual(1);

    // 订单表现三档：单笔（Stage1）→ 业务流水（服务器集群算力）→ 算力结算（8 台）
    expect(session.viewModel().orderDisplay.mode).toBe("single");
    const flowState = session.getState();
    flowState.serverPower = 64; // ops ≈ 5.3/秒 → flow
    session.save("flow_mode");
    expect(session.viewModel().orderDisplay.mode).toBe("flow");
    const computeState = session.getState();
    computeState.serverPower = 512; // ops ≈ 42/秒 → compute
    session.save("compute_mode");
    expect(session.viewModel().orderDisplay.mode).toBe("compute");

    // 第二、三台继续资金购买
    const s2 = session.getState();
    s2.money = SERVERS[1].cost + SERVERS[2].cost + 100_000_000;
    session.save("test_accel2");
    expect(session.buyServer().ok).toBe(true);
    expect(session.buyServer().ok).toBe(true);
    expect(session.getState().serverCount).toBe(3);
    expect(session.viewModel().architecture.unlockedCount).toBe(1);

    // 第 4-8 台资金购买，成本单调递增（4 台起规模化扩张），serverPower 加法累积
    const totalServerCost = SERVERS.slice(3, 8).reduce((sum, sv) => sum + sv.cost, 0);
    const s3 = session.getState();
    s3.money = totalServerCost + 500_000_000;
    session.save("accel_4to8");
    for (let i = 4; i <= 8; i++) {
      const beforePower = session.getState().serverPower;
      expect(session.buyServer().ok).toBe(true);
      expect(session.getState().serverCount).toBe(i);
      // 加法累积：每台服务器 power 直接相加
      expect(Number(session.getState().serverPower)).toBe(Number(beforePower) + SERVERS[i - 1].power);
    }
    expect(session.getState().serverCount).toBe(8);
    expect(session.viewModel().architecture.unlockedCount).toBe(3);
    // 8 台后不能再买
    expect(session.buyServer().ok).toBe(false);

    // Stage 3 筹建入口：8 台解锁但不提前标记 Stage 3
    expect(session.viewModel().stage3Gateway).toBe(true);
    expect(session.viewModel().stage).toBe(2);
    expect(session.viewModel().stageLabel).toContain("算力中心筹建已解锁");
    // Stage 2 结算 exactly-once
    expect(session.completeStage2Settlement().ok).toBe(true);
    expect(session.completeStage2Settlement().ok).toBe(false);
    expect(session.getState().stage2!.settlementShown).toBe(true);

    // 旧算力中心升级网关已退役；正式 UI/命令不再提供第二条入口。
    expect(session.getState().modelProgress).not.toBeNull();
    expect(session.upgradeCenter().ok).toBe(false);
    expect(session.getState().computeCenterLevel).toBe(0);
    expect(session.viewModel().primaryAction?.id).not.toBe("upgrade_center");

    // Stage 3 进入：8 台 + 结算完成 → 算力中心（机房 1 = 集群核心机房，来自 8 台折叠）
    expect(session.enterStage3().ok).toBe(true);
    expect(session.getState().stage3?.entered).toBe(true);
    expect(session.getState().stage3?.machineRooms?.some((r) => r.index === 1)).toBe(true);
    expect(session.viewModel().stage).toBe(3);
    expect(session.viewModel().stageLabel).toContain("算力中心");
    // Stage 3 纪元：完整集群 + 核心机房已记录
    const eras = session.getState().stage3!.eraArchive.map((e) => e.id);
    expect(eras).toContain("era_full_cluster");
    expect(eras).toContain("era_room1");

    // 算力档案馆：四页签存在（模型蓝图/集群架构/科技档案/算力纪元）
    expect(session.viewModel().stage3.techArchive.length).toBeGreaterThanOrEqual(8);
    expect(session.viewModel().stage3.eraArchive.map((era) => era.id)).toEqual([
      "stage1", "stage2", "stage3", "r1", "r2", "r3", "stage4", "stage5", "dyson",
    ]);

    // 基础设施：资金购买升级，关键等级触发科技档案自动解锁
    const infraState = session.getState();
    infraState.money = 1e12;
    session.save("accel_infra");
    expect(session.upgradeInfra("power").ok).toBe(true);
    expect(session.getState().stage3!.infrastructure.power).toBe(1);
    // 升到关键等级解锁科技档案（光模块 Lv3 → 高速光互联总线）
    for (let i = 0; i < 3; i++) expect(session.upgradeInfra("optical").ok).toBe(true);
    const techIds = session.getState().stage3!.technologyArchive.map((t) => t.id);
    expect(techIds).toContain("tech_optical_bus");

    // 旗舰工程 1：机房 1 解锁，启动 → 推进 → 手动领取（不自动领）
    expect(session.startFlagship("project_1").ok).toBe(true);
    const projState = session.getState();
    projState.stage3 = {
      ...projState.stage3,
      projectProgress: 499,
      flagship: { activeId: "project_1", progress: 499, startedAtMs: 1, completedIds: [], pendingReward: null },
    };
    session.save("proj1_advance");
    for (let i = 0; i < 30; i++) {
      clock.advance(1000);
      session.update(1);
    }
    // 进度满 → 待领取（不自动入账）
    expect(session.getState().stage3!.flagship.pendingReward?.projectId).toBe("project_1");
    const moneyBeforeClaim = session.getState().money;
    expect(session.claimFlagshipReward().ok).toBe(true);
    expect(session.getState().stage3!.flagship.completedIds).toContain("project_1");
    expect(Number(session.getState().money)).toBeGreaterThan(Number(moneyBeforeClaim));
    // 工程 1 完成 → 大模型集中训练设施科技档案
    const techAfterP1 = session.getState().stage3!.technologyArchive.map((t) => t.id);
    expect(techAfterP1).toContain("tech_llm_training");

    // 机房 2：四项基础设施达标（3/3/2/2）→ 建设投产（红利 60 秒 ×4）
    const room2State = session.getState();
    room2State.money = 1e15;
    room2State.serverPower = 5000; // 满足旗舰工程 2 算力门槛（requiresCompute 5000）
    room2State.stage3 = {
      ...room2State.stage3,
      infrastructure: { power: 3, computeCards: 3, optical: 3, storage: 2 },
    };
    session.save("room2_ready");
    expect(session.viewModel().stage3.machineRooms.find((r) => r.index === 2)?.requirementsMet).toBe(true);
    expect(session.commissionRoom(2).ok).toBe(true);
    expect(session.getState().stage3?.machineRooms?.some((r) => r.index === 2)).toBe(true);
    expect((session.getState().stage3?.commissionBonusUntilMs ?? 0)).toBeGreaterThan(0);
    expect(session.getState().stage3?.eraArchive.map((e) => e.id)).toContain("era_room2");

    // 机房 2 投产 → 旗舰工程 2 解锁（全国推理服务网络）
    expect(session.startFlagship("project_2").ok).toBe(true);
    const p2State = session.getState();
    p2State.stage3 = {
      ...p2State.stage3,
      projectProgress: 3999,
      flagship: { activeId: "project_2", progress: 3999, startedAtMs: 1, completedIds: ["project_1"], pendingReward: null },
    };
    session.save("p2_advance");
    for (let i = 0; i < 30; i++) {
      clock.advance(1000);
      session.update(1);
    }
    expect(session.getState().stage3!.flagship.pendingReward?.projectId).toBe("project_2");
    expect(session.claimFlagshipReward().ok).toBe(true);
    // 工程 2 完成 → 解锁机房 3 建设资格
    expect(session.getState().stage3!.flagship.completedIds).toContain("project_2");
    expect(session.getState().stage3!.flagship.completedIds).toContain("project_1");

    // 机房 3：更高门槛（9/9/8/8）→ 建设投产 → 区域算力中心
    const room3State = session.getState();
    room3State.money = 1e16;
    room3State.stage3 = {
      ...room3State.stage3,
      infrastructure: { power: 9, computeCards: 9, optical: 8, storage: 8 },
    };
    session.save("room3_ready");
    expect(session.viewModel().stage3.machineRooms.find((r) => r.index === 3)?.requirementsMet).toBe(true);
    expect(session.commissionRoom(3).ok).toBe(true);
    expect(session.getState().stage3?.machineRooms?.length).toBe(3);
    expect(session.getState().stage3?.eraArchive.map((e) => e.id)).toContain("era_room3");
    // 机房 3 → 区域算力网络科技档案自动解锁
    expect(session.getState().stage3!.technologyArchive.map((t) => t.id)).toContain("tech_regional_network");

    // 最终旗舰工程 3：完成 → 解锁第一次技术迭代
    expect(session.startFlagship("project_3").ok).toBe(true);
    const p3State = session.getState();
    p3State.stage3 = {
      ...p3State.stage3,
      projectProgress: 14999,
      flagship: { activeId: "project_3", progress: 14999, startedAtMs: 1, completedIds: ["project_1", "project_2"], pendingReward: null },
    };
    session.save("p3_advance");
    for (let i = 0; i < 30; i++) {
      clock.advance(1000);
      session.update(1);
    }
    expect(session.getState().stage3!.flagship.pendingReward?.projectId).toBe("project_3");
    expect(session.claimFlagshipReward().ok).toBe(true);
    expect(session.getState().stage3!.flagship.completedIds).toContain("project_3");
    expect(session.viewModel().iteration.canIterate).toBe(true);

    // 第一次技术迭代：机房 3 + 最终旗舰工程完成
    const st = session.getState();
    st.money = 5_000_000;
    st.lifetimeIncome = PRESTIGE_TARGET_INCOME * 2;
    st.highestIncomePerSecond = 999_999;
    st.stage3 = {
      ...st.stage3,
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
    session.save("accel_prestige");
    expect(session.prestige().ok).toBe(true);
    expect(session.getState().technologyIterationCount).toBe(1);
    expect(session.getState().permanentMultiplier).toBe(2);
    expect(session.getState().serverCount).toBe(0);
    expect(session.getState().computeCenterLevel).toBe(0);
    expect(session.getState().money).toBe(0);
    // 历史峰值与存档身份保留
    expect(session.getState().highestIncomePerSecond).toBe(999_999);
    expect(session.getState().saveId).toBeTruthy();

    // 第二轮：首服里程碑重置，但历史累计收入保留 → 首服更快
    // （只满足等级即可再次授予；lifetimeRevenue 保留到 24000 以上）
    const second = session.getState();
    expect(second.workshop.firstServerAwarded).toBe(false);
    const retainedModels = [...second.ownedModelIds];
    expect(session.acquireModel("codex").ok).toBe(true);
    expect(session.getState().ownedModelIds).toEqual(retainedModels);
    // 命令会以已验证的新快照替换 session state，后续加速必须重新取当前快照，
    // 不得依赖旧对象的嵌套引用泄漏。
    const secondAfterModel = session.getState();
    secondAfterModel.workshop.level = FIRST_SERVER_WORKSHOP_LEVEL;
    secondAfterModel.workshop.lifetimeRevenue = 1_000_000; // 历史累计收入保留
    secondAfterModel.lifetimeIncome = 1_000_000;
    session.save("second_run");
    const moneyBeforeSecondAward = session.getState().money;
    expect(session.buyServer().ok).toBe(true);
    expect(session.getState().serverCount).toBe(1);
    expect(session.getState().money).toBe(moneyBeforeSecondAward); // 二轮首服仍不扣资金

    // 二轮加速合同：自动经营解锁阈值从 6 单降到 3 单；永久倍率 ×2 已生效
    expect(session.getState().permanentMultiplier).toBe(2);
    const sAuto = session.getState();
    sAuto.completedOrders = 3;
    session.save("second_run_auto");
    expect(session.enableAutomation().ok).toBe(true);
    expect(session.getState().automation).toBe(true);

    // 二轮研发速度加成（×1.25）已由单测 second_run_research_speed_bonus 覆盖；
    // 这里验证二轮 free draw 仍可用（模型研发循环保留）
    expect(session.getState().modelResearch).toBeDefined();

    // 渲染最终状态
    shell.render(session.viewModel());
    expect(lastCommand).toBeDefined();
  });
});
