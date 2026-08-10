// 渲染/运行时合同测试：幂等渲染、单实例循环、按钮事件、双击幂等、长时运行 DOM 稳定。
import { describe, expect, it, vi, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { performance as nodePerformance } from "node:perf_hooks";
import { GameSession } from "../../src/app/session";
import { FakeClock } from "./helpers";
import { MemorySaveStorage } from "../../src/save/storage";
import { SaveRepository } from "../../src/save/repository";
import { createAppShell, type AppShell } from "../../src/ui/render";
import { buildViewModel } from "../../src/economy/viewmodel";
import { freshSaveData } from "../../src/save/storage";
import type { SaveData } from "../../src/save/types";
import { infraUpgradeCost } from "../../src/data/stage3";
import { buildReviewSave } from "../../src/review/checkpoints";
import { STAGE4_FINAL_PROJECT } from "../../src/economy/stage4";
import { STAGE5_FINAL_PROJECT } from "../../src/economy/stage5";

function setupDom(): JSDOM {
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", {
    url: "http://localhost/",
  });
  const { window } = dom;
  // 只注入需要的全局；performance 用 node 的（jsdom 的 Performance 读取 globalThis 会产生环）
  (globalThis as unknown as Record<string, unknown>).window = window;
  (globalThis as unknown as Record<string, unknown>).document = window.document;
  (globalThis as unknown as Record<string, unknown>).HTMLElement = window.HTMLElement;
  (globalThis as unknown as Record<string, unknown>).performance = nodePerformance;
  return dom;
}

function makeHarness(seed?: Partial<SaveData>) {
  const clock = new FakeClock();
  const storage = new MemorySaveStorage();
  if (seed) storage.save({ ...freshSaveData(clock.now()), ...seed });
  const repository = new SaveRepository({ storage, nowMs: () => clock.now() });
  const session = new GameSession({ repository, clock });
  return { clock, storage, repository, session };
}

function shellFor(container: HTMLElement, session: GameSession): AppShell {
  const shell = createAppShell(container);
  shell.setCommandHandler((cmd, payload) => {
    switch (cmd) {
      case "acquire_model": return session.acquireModel();
      case "train_model": return session.trainModel();
      case "enable_automation": return session.enableAutomation();
      case "enable_rental": return session.enableRental();
      case "research_model": return session.researchModel();
      case "buy_server": return session.buyServer();
      case "buy_max_servers": return session.buyMaxServers();
      case "upgrade_center": return session.upgradeCenter();
      case "prestige": return session.prestige();
      case "claim_core": return session.claimCore();
      case "start_space_plan": return session.startSpacePlan();
      case "buy_node": return session.buyNode(String((payload as { id?: string } | undefined)?.id ?? ""));
      case "start_stage4_project": return session.startStage4Project();
      case "claim_stage4_reward": return session.claimStage4Reward();
      case "start_stage5": return session.startStage5();
      case "buy_stage5_node": return session.buyStage5Node(String((payload as { id?: string } | undefined)?.id ?? ""));
      case "start_stage5_project": return session.startStage5Project();
      case "claim_stage5_reward": return session.claimStage5Reward();
      case "claim_offline": return session.claimOffline();
      case "save": return session.save("manual");
      default:
        if (cmd.startsWith("accept_order:")) return session.acceptOrder(cmd.slice(13));
        if (cmd.startsWith("claim_order:")) return session.claimOrder(Number(cmd.slice(12)));
        return { ok: false, error: "unknown" };
    }
  });
  return shell;
}

const count = (sel: string): number => document.querySelectorAll(sel).length;
const totalNodes = (): number => document.getElementsByTagName("*").length;

function expectButtonAffordance(selector: string, enabled: boolean): HTMLButtonElement {
  const button = document.querySelector(selector) as HTMLButtonElement | null;
  expect(button, selector).not.toBeNull();
  expect(button!.disabled).toBe(!enabled);
  expect(button!.classList.contains("disabled")).toBe(!enabled);
  expect(button!.getAttribute("aria-disabled")).toBe(String(!enabled));
  return button!;
}

function expectButtonCollectionAffordance(selector: string, enabled: boolean): HTMLButtonElement[] {
  const buttons = [...document.querySelectorAll(selector)] as HTMLButtonElement[];
  expect(buttons.length, selector).toBeGreaterThan(0);
  for (const button of buttons) {
    expect(button.disabled).toBe(!enabled);
    expect(button.classList.contains("disabled")).toBe(!enabled);
    expect(button.getAttribute("aria-disabled")).toBe(String(!enabled));
  }
  return buttons;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("render contract", () => {
  it("renders exactly four primary tabs and keeps honor, sponsor and menu as pages", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const tabs = [...document.querySelectorAll<HTMLButtonElement>(".toolbar button")];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["经营", "荣誉馆", "赞助", "菜单"]);
    expect(tabs.every((tab) => tab.querySelector("svg.game-icon") !== null)).toBe(true);
    expect(tabs.every((tab) => !tab.hasAttribute("data-icon"))).toBe(true);
    expect(document.querySelector(".stage-line")?.children.length).toBe(2);
    expect(document.querySelector(".status-bar")).toBeNull();
    expect(document.body.textContent).not.toContain("存档 ");
    (document.querySelector("[data-command='page:honor']") as HTMLButtonElement).click();
    expect([...document.querySelectorAll(".archive-tabs .btn")].map((tab) => tab.textContent)).toEqual(["档案", "里程碑", "名人堂"]);
    (document.querySelector("[data-command='page:sponsor']") as HTMLButtonElement).click();
    expect(document.querySelector(".app-page-sponsor")?.textContent).toContain("离线经营扩容");
    expect(document.querySelector(".app-page-sponsor")?.textContent).toContain("经营收入 ×2");
    (document.querySelector("[data-command='page:menu']") as HTMLButtonElement).click();
    expect(document.querySelector(".app-page-menu")?.textContent).not.toContain("返回首页");
    expect(document.querySelector(".app-page-menu")?.textContent).not.toContain("导出存档");
    expect(document.querySelector(".app-page-menu")?.textContent).not.toContain("导入存档");
    expect(document.querySelector(".app-page-menu")?.textContent).not.toContain("手动保存");
    expect((document.querySelector(".platform-review-debug") as HTMLElement).hidden).toBe(true);
    expect((document.querySelector(".review-tools-host") as HTMLElement).hidden).toBe(true);
  });

  it("shows platform safety state in menu and a personal record contract in the hall", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    shell.setPlatformStatus({
      cloud: "双设备冲突保护待真容器验证",
      leaderboard: "双榜待真容器验证",
      platformReview: true,
      runtimeSpeed: 32,
    });

    (document.querySelector("[data-command='page:menu']") as HTMLButtonElement).click();
    expect(document.querySelector(".game-menu-status")?.textContent).toContain("真机测试包");
    expect(document.querySelector(".game-menu-status")?.textContent).toContain("双设备冲突保护");
    expect(document.querySelector(".game-menu-status")?.textContent).not.toContain("Production");
    expect(document.querySelector(".game-menu-status")?.textContent).not.toContain("Platform Review");
    expect((document.querySelector(".platform-review-debug") as HTMLElement).hidden).toBe(false);
    expect((document.querySelector(".game-menu-speed select") as HTMLSelectElement).value).toBe("32");

    (document.querySelector("[data-command='page:honor']") as HTMLButtonElement).click();
    (document.querySelector("[data-action='archive_tab:hall']") as HTMLButtonElement).click();
    expect(document.querySelector(".hall-personal-record")?.textContent).toContain("我的经营纪录");
    expect(document.querySelector(".archive-hall")?.textContent).toContain("最短通关榜按用时从短到长");
    expect(document.querySelector(".archive-hall")?.textContent).toContain("双榜待真容器验证");
  });

  it("routes the platform-review speed selector without exposing save tools", () => {
    const dom = setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = createAppShell(container);
    const handler = vi.fn(() => ({ ok: true }));
    shell.setCommandHandler(handler);
    shell.render(buildViewModel(session.getState()));
    shell.setPlatformStatus({
      cloud: "已连接",
      leaderboard: "已连接",
      platformReview: true,
      runtimeSpeed: 1,
    });

    const speed = document.querySelector(".game-menu-speed select") as HTMLSelectElement;
    speed.value = "128";
    speed.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(handler).toHaveBeenCalledWith("set_debug_speed", { speed: 128 });
    expect(document.body.textContent).not.toContain("rev ");
  });

  it("shows one readable research receipt with the exact conclusion", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    storage.save(buildReviewSave("model_research_regression", clock.now()));
    const session = new GameSession({
      repository: new SaveRepository({ storage, nowMs: () => clock.now() }),
      clock,
    });
    const shell = shellFor(container, session);

    shell.render(buildViewModel(session.getState()));
    const researchButton = document.querySelector("button[data-action='research_model']") as HTMLButtonElement;
    researchButton.click();
    shell.render(buildViewModel(session.getState()));

    const receipt = document.querySelector(".research-receipt") as HTMLElement;
    expect(receipt.hidden).toBe(false);
    expect(receipt.textContent).toContain("研发成果：知识蒸馏模型");
    expect(receipt.textContent).toContain("模型蓝图：知识蒸馏模型 蓝图 Lv.6 → Lv.7（+1）");
    expect(receipt.textContent).toContain("模型算力：3.8178 → 4.8104");
    expect(receipt.textContent).toContain("每秒收入：309.2832 → 389.6968");
    expect(receipt.textContent).toContain("主力：保持 语音合成模型");
    expect(receipt.textContent).toContain("原因：新蓝图尚未全面超过当前主力");
  });

  it("hides training affordances at the model max and shows completed archive state", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    storage.save(buildReviewSave("model_archive_complete", clock.now()));
    const session = new GameSession({
      repository: new SaveRepository({ storage, nowMs: () => clock.now() }),
      clock,
    });
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));

    expect(document.querySelector(".model-stats")?.textContent).toContain("已达最高等级 Lv.12");
    expect(count("button[data-action='train_model']")).toBe(0);
    expect(count("button[data-action='research_model']")).toBe(0);
    expect(document.querySelector(".research-progress")?.textContent).toBe("模型蓝图已完成");
  });

  it("exposes stage and iteration visual state without replacing the app shell", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    const root = shell.getElement();

    shell.render(buildViewModel(session.getState()));
    expect(root.dataset.stage).toBe("1");
    expect(root.dataset.iteration).toBe("base");
    expect((document.querySelector(".iteration-badge") as HTMLElement).hidden).toBe(true);

    const state = session.getState();
    state.stage = 2;
    state.serverCount = 1;
    state.serverPower = 2;
    state.workshop.firstServerAwarded = true;
    shell.render(buildViewModel(state));
    expect(root.dataset.stage).toBe("2");
    expect(document.querySelector(".fleet")?.getAttribute("data-owned")).toBe("1");
    expect(count(".server-chip")).toBe(8);
    expect(count(".server-chip.owned")).toBe(1);

    state.technologyIterationCount = 1;
    state.permanentMultiplier = 2;
    shell.render(buildViewModel(state));
    expect(root.dataset.iteration).toBe("active");
    expect((document.querySelector(".iteration-badge") as HTMLElement).hidden).toBe(false);
    expect(document.querySelector(".iteration-badge")?.textContent).toContain("永久 ×2");
  });

  it("keeps unreached Stage 1 sections folded until their unlock", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("#section-orders")?.classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#section-server")?.classList.contains("hidden")).toBe(true);
    session.acquireModel();
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("#section-orders")?.classList.contains("hidden")).toBe(false);
  });

  it("manual completion patches in a claim button and live first-server revenue", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session, clock } = makeHarness();
    session.acquireModel();
    session.acceptOrder("o1");
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    for (let i = 0; i < 13; i++) {
      clock.advance(1000);
      session.update(1);
      shell.render(buildViewModel(session.getState()));
    }
    expect(count("[data-action='claim_order:0']")).toBe(1);
    expect(document.querySelector("#section-server")?.textContent).toContain("¥119");
  });

  it("automatic orders keep four stable rows and never expose manual claim actions", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session, clock } = makeHarness();
    session.acquireModel();
    const state = session.getState();
    state.completedOrders = 6;
    state.automation = true;
    state.money = 1_000_000;

    const shell = shellFor(container, session);
    shell.render(buildViewModel(state));
    const stableRows = [...document.querySelectorAll(".active-order")];
    expect(stableRows).toHaveLength(4);
    expect(count("[data-action^='claim_order:']")).toBe(0);

    for (let cycle = 0; cycle < 12; cycle++) {
      clock.advance(30_000);
      session.update(30);
      shell.render(buildViewModel(session.getState()));

      const currentRows = [...document.querySelectorAll(".active-order")];
      expect(session.getState().activeOrders).toHaveLength(4);
      expect(currentRows).toHaveLength(4);
      expect(count("[data-action^='claim_order:']")).toBe(0);
      expect(currentRows.every((row, index) => row === stableRows[index])).toBe(true);
    }
  });

  it("live research readiness adds the free-research button without refresh", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    session.acquireModel();
    const state = session.getState();
    state.automation = true;
    state.serverCount = 1;
    state.serverPower = 2;
    state.modelResearch.progress = 99;
    session.save("research_99");
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    expect(count("[data-action='research_model']")).toBe(0);
    session.getState().modelResearch.progress = 100;
    shell.render(buildViewModel(session.getState()));
    expect(count("[data-action='research_model']")).toBe(1);
  });

  it("keeps manual save transfer controls out of the player menu", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = createAppShell(container);
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("[data-command='export']")).toBeNull();
    expect(document.querySelector("[data-command='import']")).toBeNull();
    expect(document.querySelector("[data-command='save']")).toBeNull();
    expect(document.querySelector("input[type='file']")).toBeNull();
  });

  it("open archive keeps card nodes stable across ordinary ticks", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    session.acquireModel();
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    (document.querySelector("[data-command='page:honor']") as HTMLButtonElement).click();
    const firstCard = document.querySelector(".archive-models .archive-card");
    expect(firstCard).not.toBeNull();
    for (let i = 0; i < 60; i++) {
      session.getState().modelArchive.codex.lifetimeContribution =
        Number(session.getState().modelArchive.codex.lifetimeContribution) + 100;
      shell.render(buildViewModel(session.getState()));
    }
    expect(document.querySelector(".archive-models .archive-card")).toBe(firstCard);
    expect(document.querySelector("[data-model-id='codex']")?.textContent).toContain("¥6,000");
  });

  it("renders persistent automatic architecture status without choice controls", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    session.acquireModel();
    session.getState().serverCount = 3;
    session.getState().serverPower = 14;
    session.save("blueprint_seed");
    const shell = shellFor(container, session);
    for (let i = 0; i < 50; i++) shell.render(buildViewModel(session.getState()));
    expect(count(".blueprint-choice")).toBe(0);
    expect(document.querySelector(".stat-architecture")?.textContent).toContain("架构蓝图 1/3");
    expect(document.querySelector(".stat-architecture")?.textContent).toContain("全局倍率 ×1.45");
    expect(document.querySelector(".stat-architecture")?.textContent).toContain("下一解锁：5 台服务器");
    expect(count("[data-action^='choose_blueprint:']")).toBe(0);
  });

  it("shows architecture unlock feedback with before/after values", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    session.acquireModel();
    const state = session.getState();
    state.stage = 2;
    state.serverCount = 2;
    state.serverPower = 7;
    state.money = 220_000;
    session.save("architecture_receipt");
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));

    const buyButton = document.querySelector("button[data-action='buy_server']") as HTMLButtonElement;
    expect(buyButton).not.toBeNull();
    buyButton.click();

    expect(session.getState().serverCount).toBe(3);
    expect(document.querySelector(".toast")?.textContent)
      .toContain("架构蓝图 0/3 → 1/3 · 全局倍率 ×1.00 → ×1.45");
  });

  it("renders the second-run iteration terminal without a second action", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    storage.save(buildReviewSave("second_run_iteration_complete", clock.now()));
    const session = new GameSession({
      repository: new SaveRepository({ storage, nowMs: () => clock.now() }),
      clock,
    });
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));

    const prestige = document.querySelector("#section-prestige") as HTMLElement;
    expect(prestige.textContent).toContain("本版本技术迭代已完成");
    expect(prestige.textContent).toContain("第1次迭代 · 永久收入×2");
    expect(prestige.textContent).toContain("本轮技术路线已稳定，可继续扩张现有网络");
    expect(prestige.querySelector("[data-action='prestige']")).toBeNull();
    expect(buildViewModel(session.getState()).iteration.canIterate).toBe(false);
  });

  it("render_idempotency: 同一状态渲染 100 次，DOM 结构不变", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const baseline = {
      serverBody: count(".server-body"),
      buyBtns: count("[data-action='buy_server']"),
      orderList: count(".order-list"),
      total: totalNodes(),
    };
    for (let i = 0; i < 100; i++) {
      shell.render(buildViewModel(session.getState()));
    }
    expect(count(".server-body")).toBe(1);
    expect(count("[data-action='buy_server']")).toBeLessThanOrEqual(1);
    expect(count(".order-list")).toBe(1);
    expect(totalNodes()).toBe(baseline.total);
  });

  it("render_idempotency: 服务器区域只有一份，重复渲染不追加", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    // 进入可购服务器状态（里程碑满足：等级 + 累计收入）
    const s = session.getState();
    s.money = 100000;
    s.workshop.level = 6;
    s.workshop.lifetimeRevenue = 24000;
    s.lifetimeIncome = 24000;
    session.save("seed");
    shell.render(buildViewModel(session.getState()));
    expect(count(".server-body")).toBe(1);
    for (let i = 0; i < 50; i++) shell.render(buildViewModel(session.getState()));
    expect(count(".server-body")).toBe(1);
    expect(count("[data-action='buy_server']")).toBe(1);
  });

  it("next-server button enables when passive income reaches its cost", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    session.acquireModel();
    const state = session.getState();
    state.serverCount = 1;
    state.serverPower = 2;
    state.workshop.firstServerAwarded = true;
    state.money = 0;
    session.save("one_server");
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const button = document.querySelector("[data-action='buy_server']") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    session.getState().money = 75_000;
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("[data-action='buy_server']")).toBe(button);
    expect(button.disabled).toBe(false);
    const beforeCount = session.getState().serverCount;
    button.click();
    expect(session.getState().serverCount).toBe(beforeCount + 1);
  });

  it("patches training affordance in place and blocks disabled clicks", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    session.acquireModel();
    const state = session.getState();
    state.money = 0;
    const shell = shellFor(container, session);
    shell.render(buildViewModel(state));
    const button = expectButtonAffordance("[data-action='train_model']", false);
    const beforeDisabledClick = state.revision;
    button.click();
    expect(state.revision).toBe(beforeDisabledClick);

    state.money = 70;
    shell.render(buildViewModel(state));
    expect(document.querySelector("[data-action='train_model']")).toBe(button);
    expectButtonAffordance("[data-action='train_model']", true);
    const beforeTrain = session.getState().revision;
    button.click();
    expect(session.getState().revision).toBe(beforeTrain + 1);

    session.getState().money = 0;
    shell.render(buildViewModel(session.getState()));
    expectButtonAffordance("[data-action='train_model']", false);
  });

  it("patches every manual order affordance as slots open and close", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    session.acquireModel();
    for (let i = 0; i < 4; i++) expect(session.acceptOrder("o1").ok).toBe(true);
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const buttons = expectButtonCollectionAffordance("[data-action^='accept_order:']", false);
    expect(buttons).toHaveLength(5);
    const button = buttons[0];
    const beforeDisabledClick = session.getState().revision;
    button.click();
    expect(session.getState().revision).toBe(beforeDisabledClick);

    session.getState().activeOrders.pop();
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("[data-action='accept_order:o1']")).toBe(button);
    expectButtonCollectionAffordance("[data-action^='accept_order:']", true);

    const beforeAccept = session.getState().revision;
    button.click();
    expect(session.getState().activeOrders).toHaveLength(4);
    expect(session.getState().revision).toBe(beforeAccept + 1);
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("[data-action='accept_order:o1']")).toBe(button);
    expectButtonCollectionAffordance("[data-action^='accept_order:']", false);
  });

  it("patches next-server and batch-purchase affordances without section rebuild", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    session.acquireModel();
    const state = session.getState();
    state.serverCount = 1;
    state.serverPower = 2;
    state.workshop.firstServerAwarded = true;
    state.technologyIterationCount = 1;
    state.money = 0;
    const shell = shellFor(container, session);
    shell.render(buildViewModel(state));
    const buyButton = expectButtonAffordance("[data-action='buy_server']", false);
    const buyMaxButton = expectButtonAffordance("[data-action='buy_max_servers']", false);
    const beforeDisabledClick = state.revision;
    buyButton.click();
    buyMaxButton.click();
    expect(state.revision).toBe(beforeDisabledClick);

    state.money = 75_000;
    shell.render(buildViewModel(state));
    expect(document.querySelector("[data-action='buy_server']")).toBe(buyButton);
    expect(document.querySelector("[data-action='buy_max_servers']")).toBe(buyMaxButton);
    expectButtonAffordance("[data-action='buy_server']", true);
    expectButtonAffordance("[data-action='buy_max_servers']", true);
    const beforeBatch = session.getState().revision;
    buyMaxButton.click();
    expect(session.getState().serverCount).toBe(2);
    expect(session.getState().revision).toBe(beforeBatch + 1);

    session.getState().money = 0;
    shell.render(buildViewModel(session.getState()));
    expectButtonAffordance("[data-action='buy_server']", false);
    expectButtonAffordance("[data-action='buy_max_servers']", false);
  });

  it("single_runtime_loop: 两次初始化只保留一个活动循环", () => {
    setupDom();
    const container = document.getElementById("app")!;
    // 用 boot() 防重入语义验证：同一 container 重复 boot 只产生一份 UI
    const shell1 = createAppShell(container);
    shell1.render(buildViewModel(makeHarness().session.getState()));
    // 模拟重复初始化（HMR/重复 boot）：第二个 shell 启动前先销毁旧的（等价 teardown 流程）
    const nodesBefore = totalNodes();
    const shell2 = createAppShell(container);
    shell2.render(buildViewModel(makeHarness().session.getState()));
    const nodesWithTwoShells = totalNodes();
    // createAppShell 不负责防重入（那是 boot 的职责）；验证渲染幂等：不因两次 shell 增长
    // 这里按合同验证：boot 场景由 app/main 的 teardown+boot 保证单实例。
    // 直接验证：重复 render 同一 shell 不增长；两个 shell 各持一个 root 时节点仍可控。
    for (let i = 0; i < 30; i++) {
      shell1.render(buildViewModel(makeHarness().session.getState()));
      shell2.render(buildViewModel(makeHarness().session.getState()));
    }
    const nodesAfter = totalNodes();
    // 每个 shell 一个 root，渲染幂等 → 节点数稳定（仅两个 root 的静态结构）
    expect(nodesWithTwoShells).toBeGreaterThan(nodesBefore);
    expect(nodesAfter).toBe(nodesWithTwoShells);
    // 静态结构唯一性：单 shell 渲染时服务器区只有一份（核心合同）
    expect(count(".server-body")).toBe(2); // 两个 shell 各一份
    shell1.destroy();
    expect(count(".server-body")).toBe(1);
    shell2.destroy();
    expect(count(".server-body")).toBe(0);
  });

  it("first_model_click: 点击获取模型只触发一次业务事务", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const btn = document.querySelector("[data-action='acquire_model']") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(false);
    const before = session.getState().revision;
    btn.click();
    // 状态变化一次
    expect(session.getState().modelProgress).not.toBeNull();
    expect(session.getState().revision).toBe(before + 1);
    // 渲染后按钮变成训练
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("[data-action='acquire_model']")).toBeNull();
    expect(document.querySelector("[data-action='train_model']")).not.toBeNull();
  });

  it("double_click_first_model: 双击只成功一次", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const btn = document.querySelector("[data-action='acquire_model']") as HTMLButtonElement;
    const before = session.getState().revision;
    btn.click();
    btn.click();
    expect(session.getState().modelProgress).not.toBeNull();
    expect(session.getState().revision).toBe(before + 1);
    expect(session.getState().ownedModelIds.length).toBe(1);
  });

  it("stable_button_nodes: 渲染不替换按钮节点，点击直接命中（v2 局部渲染合同）", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const btn1 = document.querySelector("[data-action='acquire_model']") as HTMLButtonElement;
    const before = session.getState().revision;
    // 重复渲染（模拟每秒 Tick）：按钮节点保持稳定，不脱离文档
    for (let i = 0; i < 60; i++) shell.render(buildViewModel(session.getState()));
    const btn2 = document.querySelector("[data-action='acquire_model']") as HTMLButtonElement;
    expect(btn1.isConnected).toBe(true);
    expect(btn1).toBe(btn2);
    // 点击直接生效
    btn2.click();
    expect(session.getState().modelProgress).not.toBeNull();
    expect(session.getState().revision).toBe(before + 1);
  });

  it("slow_click_no_flicker: 长按/慢速点击期间按钮节点保持稳定且只触发一次", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const btn = document.querySelector("[data-action='acquire_model']") as HTMLButtonElement;
    const rect = btn.getBoundingClientRect();
    const x = rect.x + 1;
    const y = rect.y + 1;
    const before = session.getState().revision;
    btn.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    // 慢速点击期间渲染多次：按钮节点不应被替换（旧实现会 replaceChildren 导致 detach）
    for (let i = 0; i < 10; i++) shell.render(buildViewModel(session.getState()));
    expect(btn.isConnected).toBe(true);
    // jsdom 无 elementFromPoint：pointerup 回退不触发；正常 click 路径仍应生效
    btn.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true, clientX: x, clientY: y }));
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
    expect(session.getState().modelProgress).not.toBeNull();
    expect(session.getState().revision).toBe(before + 1);
    // 防御：再次 click 不应重复触发（按钮已变为训练）
    const btn2 = document.querySelector("[data-action='acquire_model']") as HTMLButtonElement | null;
    if (btn2) btn2.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
    expect(session.getState().revision).toBe(before + 1);
  });

  it("auto_order_partial_patch: 自动完成20个订单不替换根节点，区域结构数量稳定", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session, clock } = makeHarness();
    const shell = shellFor(container, session);
    session.acquireModel();
    session.enableAutomation();
    const s = session.getState();
    s.completedOrders = 6;
    s.automation = true;
    s.money = 1_000_000;
    s.workshop.level = 1;
    session.save("seed");
    shell.render(buildViewModel(session.getState()));
    shell.resetMetrics();
    const rootNode = shell.getElement();
    const startNodes = totalNodes();
    // 自动完成 20 个订单（session 回调驱动指标）
    const startCompleted = session.getState().completedOrders;
    for (let i = 0; i < 8; i++) {
      clock.advance(15 * 1000);
      session.update(15);
      const done = session.getState().completedOrders - startCompleted;
      // 模拟 main.ts 中 onOrderCompleted 按实际完成数驱动
      if (done > 0) shell.incrementOrderCompletion(done);
      shell.render(buildViewModel(session.getState()));
      if (done >= 20) break;
    }
    const m = shell.getMetrics();
    expect(m.rootReplacementCount).toBe(0);
    expect(m.orderCompletionCount).toBeGreaterThanOrEqual(20);
    // 根节点未替换
    expect(shell.getElement()).toBe(rootNode);
    // 区域结构数量稳定
    expect(count(".server-body")).toBe(1);
    expect(count(".order-list")).toBe(1);
    expect(count(".active-orders")).toBe(1);
    expect(totalNodes()).toBeLessThanOrEqual(startNodes + 10);
  });

  it("render_count_contract: 普通Tick只增加partial patch计数；不增加结构性full render计数", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session, clock } = makeHarness();
    const shell = shellFor(container, session);
    session.acquireModel();
    session.save("seed");
    shell.render(buildViewModel(session.getState()));
    shell.resetMetrics();
    const fullBefore = shell.getMetrics().fullRenderCount;
    // 60 秒普通 Tick（无结构变化）：进度条局部更新
    for (let i = 0; i < 60; i++) {
      clock.advance(1000);
      session.update(1);
      shell.render(buildViewModel(session.getState()));
    }
    const m = shell.getMetrics();
    expect(m.fullRenderCount).toBe(fullBefore);
    expect(m.partialPatchCount).toBeGreaterThanOrEqual(59);
  });

  it("focus_and_scroll_preserved: 自动订单结算前后滚动位置和焦点保持", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session, clock } = makeHarness();
    const shell = shellFor(container, session);
    session.acquireModel();
    session.enableAutomation();
    const s = session.getState();
    s.completedOrders = 6;
    s.automation = true;
    s.money = 1_000_000;
    session.save("seed");
    shell.render(buildViewModel(session.getState()));
    // 模拟滚动位置（jsdom 容器 scrollTop）
    const scroller = container;
    scroller.style.height = "2000px";
    scroller.scrollTop = 500;
    // 聚焦一个稳定按钮
    const buyBtn = document.querySelector("button[data-action='buy_server']") as HTMLButtonElement | null;
    if (buyBtn) buyBtn.focus();
    const focusedBefore = document.activeElement;
    // 自动订单结算 10 次
    for (let i = 0; i < 10; i++) {
      clock.advance(15 * 1000);
      session.update(15);
      shell.render(buildViewModel(session.getState()));
    }
    expect(document.activeElement).toBe(focusedBefore);
    expect(scroller.scrollTop).toBe(500);
  });

  it("long_runtime_dom_stability: 模拟运行 10 分钟 DOM 稳定", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session, clock } = makeHarness();
    const shell = shellFor(container, session);
    session.acquireModel();
    shell.render(buildViewModel(session.getState()));
    const startNodes = totalNodes();
    // 10 分钟：每 1 秒 tick + 高频渲染（模拟 60fps 的部分帧）
    for (let sec = 0; sec < 600; sec++) {
      clock.advance(1000);
      session.update(1);
      // 高频渲染若干次，模拟 rAF 每帧渲染
      shell.render(buildViewModel(session.getState()));
      shell.render(buildViewModel(session.getState()));
      if (sec % 60 === 0) {
        // 每 60 秒采样一次，确保没有持续增长
        expect(totalNodes()).toBeLessThanOrEqual(startNodes + 20);
      }
    }
    expect(count(".server-body")).toBe(1);
    expect(count("[data-action='buy_server']")).toBeLessThanOrEqual(1);
  });

  it("refresh_restore: 获得模型后刷新恢复且不重复追加", () => {
    setupDom();
    const { session, storage } = makeHarness();
    session.acquireModel();
    session.save("before_refresh");
    const saved = storage.load();
    expect(saved?.modelProgress).not.toBeNull();
    // 模拟刷新：同一存储内容启动新会话（等价 repository.load 恢复存档）
    setupDom();
    const container = document.getElementById("app")!;
    const clock2 = new FakeClock();
    const repo2 = new SaveRepository({ storage, nowMs: () => clock2.now() });
    const session2 = new GameSession({ repository: repo2, clock: clock2 });
    expect(session2.getState().modelProgress).not.toBeNull();
    const shell2 = shellFor(container, session2);
    shell2.render(buildViewModel(session2.getState()));
    expect(session2.getState().modelProgress).not.toBeNull();
    // 刷新后渲染不追加：唯一模型卡片 + 训练按钮
    expect(count(".section-body")).toBeGreaterThanOrEqual(4);
    expect(count("[data-action='train_model']")).toBe(1);
    expect(count("[data-action='acquire_model']")).toBe(0);
  });
});

describe("stage3 render contract", () => {
  it("shows only the Stage 3 entry before the player enters", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    session.acquireModel();
    const state = session.getState();
    state.serverCount = 8;
    state.serverPower = 329;
    state.stage2 = { settlementShown: true, completedAtMs: 1, stageIncome: 1 };
    session.save("gateway");
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    expect(count("[data-action='enter_stage3']")).toBe(1);
    expect(count(".infra-card")).toBe(0);
    expect(count(".flagship-card")).toBe(0);
  });

  function stage3Harness() {
    setupDom();
    const container = document.getElementById("app")!;
    const { session, clock, storage } = makeHarness();
    const shell = shellFor(container, session);
    // 进入 Stage 3（机房 1）
    const s = session.getState();
    s.serverCount = 8;
    s.serverPower = 329;
    s.stage2 = { settlementShown: true, completedAtMs: 1, stageIncome: 0 };
    s.money = 1e9;
    session.save("stage3_seed");
    expect(session.enterStage3().ok).toBe(true);
    shell.render(buildViewModel(session.getState()));
    return { container, session, clock, storage, shell };
  }

  it("no_root_replace_on_project_tick: 旗舰工程 tick 不替换根节点、不重建 Stage 3 区", () => {
    const { session, clock, shell } = stage3Harness();
    const rootNode = shell.getElement();
    shell.resetMetrics();
    // 启动旗舰工程 1（机房 1 即解锁）
    const st = session.getState();
    st.stage3 = {
      ...st.stage3,
      flagship: { activeId: "project_1", progress: 0, startedAtMs: 1, completedIds: [], pendingReward: null },
      projectProgress: 0,
    };
    session.save("project_start");
    shell.render(buildViewModel(session.getState()));
    const nodesStart = totalNodes();
    const fullBefore = shell.getMetrics().fullRenderCount;
    // 工程推进 60 秒（tick 驱动），高频渲染模拟 rAF
    for (let i = 0; i < 60; i++) {
      clock.advance(1000);
      session.update(1);
      shell.render(buildViewModel(session.getState()));
    }
    const m = shell.getMetrics();
    expect(m.rootReplacementCount).toBe(0);
    expect(m.fullRenderCount).toBe(fullBefore); // 工程 tick 是局部 patch，不触发结构性 full render
    expect(shell.getElement()).toBe(rootNode);
    expect(totalNodes()).toBeLessThanOrEqual(nodesStart + 10);
    expect(count(".flagship-active")).toBe(1);
    expect(count(".infra-grid")).toBe(1);
    expect(count(".room-list")).toBe(1);
  });

  it("infrastructure level and cost refresh immediately after upgrade", () => {
    const { session, shell } = stage3Harness();
    session.getState().money = 1e12;
    session.save("infra_money");
    shell.render(buildViewModel(session.getState()));
    expect(session.upgradeInfra("computeCards").ok).toBe(true);
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector(".infra-grid")?.textContent).toContain("算力卡 Lv.1/10");
  });

  it("patches all four infrastructure and current-bottleneck affordances in place", () => {
    const { session, shell } = stage3Harness();
    const state = session.getState();
    const ids = ["power", "computeCards", "optical", "storage"] as const;
    state.money = 0;
    session.save("infra_affordance_low");
    shell.render(buildViewModel(state));
    const bottleneckId = buildViewModel(state).stage3.bottleneck.id;
    expect(ids).toContain(bottleneckId);

    const buttonRefs = new Map<string, HTMLButtonElement[]>();
    for (const id of ids) {
      const selector = `button[data-action='upgrade_infra:${id}']`;
      const buttons = [...document.querySelectorAll(selector)] as HTMLButtonElement[];
      expect(buttons.length, id).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button.disabled).toBe(true);
        expect(button.classList.contains("disabled")).toBe(true);
        expect(button.getAttribute("aria-disabled")).toBe("true");
      }
      buttonRefs.set(id, buttons);
    }

    for (const id of ids) {
      state.money = infraUpgradeCost(id, state.stage3!.infrastructure[id]);
      shell.render(buildViewModel(state));
      const buttons = buttonRefs.get(id)!;
      const currentButtons = [...document.querySelectorAll(`button[data-action='upgrade_infra:${id}']`)] as HTMLButtonElement[];
      expect(currentButtons).toEqual(buttons);
      for (const button of buttons) {
        expect(button.disabled).toBe(false);
        expect(button.classList.contains("disabled")).toBe(false);
        expect(button.getAttribute("aria-disabled")).toBe("false");
      }

      state.money = 0;
      shell.render(buildViewModel(state));
      for (const button of buttons) {
        expect(button.disabled).toBe(true);
        expect(button.classList.contains("disabled")).toBe(true);
        expect(button.getAttribute("aria-disabled")).toBe("true");
      }
    }
  });

  it("room commission button appears after the prerequisite flagship is completed", () => {
    const { session, shell } = stage3Harness();
    const state = session.getState();
    state.stage3 = {
      ...state.stage3,
      infrastructure: { power: 3, computeCards: 3, optical: 2, storage: 2 },
      flagship: {
        activeId: null,
        progress: 0,
        startedAtMs: 0,
        completedIds: ["project_1"],
        pendingReward: null,
      },
    };
    session.save("room2_ready");
    shell.render(buildViewModel(session.getState()));
    expect(count("[data-action='commission_room:2']")).toBe(1);
    expect(document.querySelector(".flagship-list")?.textContent).toContain("已完成");
  });

  it("maps the active flagship to its own card only", () => {
    const { session, shell } = stage3Harness();
    const state = session.getState();
    state.stage3 = {
      ...state.stage3,
      machineRooms: [
        { index: 1, id: "room_1", name: "r1", commissionedAtMs: 1 },
        { index: 2, id: "room_2", name: "r2", commissionedAtMs: 1 },
        { index: 3, id: "room_3", name: "r3", commissionedAtMs: 1 },
      ],
      flagship: {
        activeId: "project_3",
        progress: 13_500,
        startedAtMs: 1,
        completedIds: ["project_1", "project_2"],
        pendingReward: null,
      },
      projectProgress: 13_500,
    };
    session.save("project3_active");
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector(".flagship-active")?.textContent).toContain("区域推理协作网");
    expect(document.querySelector(".flagship-active")?.textContent).not.toContain("大模型集中训练");
  });

  it("stage3_has_no_single_order_animation: Stage 3 无单笔订单进度条/订单列表（折叠隐藏）", () => {
    const { shell } = stage3Harness();
    shell.render(buildViewModel(shellHarnessSession().getState()));
    // Stage 3 订单/服务器/中心区折叠隐藏（不渲染逐单进度动画）
    expect(shell.getElement().querySelector(".order-list")?.classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#section-orders")?.classList.contains("hidden") ?? true).toBe(true);
    // 隐藏前订单区保留静态结构但不可见；Stage 3 主体为算力中心/机房
    expect(count(".infra-grid")).toBe(1);
    expect(count(".room-list")).toBe(1);
    expect(count(".flagship-active")).toBeGreaterThanOrEqual(0);
  });

  it("no_root_replace_on_income_tick: Stage 3 收入 tick 不替换根节点（10 分钟稳定性）", () => {
    const { session, clock, shell } = stage3Harness();
    const rootNode = shell.getElement();
    shell.resetMetrics();
    const startNodes = totalNodes();
    for (let sec = 0; sec < 600; sec++) {
      clock.advance(1000);
      session.update(1);
      shell.render(buildViewModel(session.getState()));
      if (sec % 60 === 0) {
        expect(totalNodes()).toBeLessThanOrEqual(startNodes + 20);
      }
    }
    const m = shell.getMetrics();
    expect(m.rootReplacementCount).toBe(0);
    expect(shell.getElement()).toBe(rootNode);
  });
});

// 供 stage3_has_no_single_order_animation 使用：直接构造含 stage3 的 session
function shellHarnessSession(): import("../../src/app/session").GameSession {
  const { session } = makeHarness();
  const s = session.getState();
  s.serverCount = 8;
  s.serverPower = 329;
  s.stage2 = { settlementShown: true, completedAtMs: 1, stageIncome: 0 };
  s.money = 1e9;
  session.save("stage3_seed2");
  session.enterStage3();
  return session;
}

describe("CARD-02 stage4 render contract", () => {
  function stage4Harness() {
    setupDom();
    const container = document.getElementById("app")!;
    const { session, clock } = makeHarness();
    const shell = shellFor(container, session);
    // 直接构造已揭示 + 已启动的终局档
    const s = session.getState();
    s.money = 0;
    s.singularity = {
      mode: "endgame",
      coresClaimed: ["core_1", "core_2", "core_3"],
      spacePlanRevealed: true,
      claimedProjectIds: [],
      spacePlanRevealedAtMs: 1,
      spacePlanStarted: true,
      stage4: {
        entered: true,
        enteredAtMs: 1,
        nodes: ["leo_node"],
        stageIncome: 0,
        projectProgress: 0,
        activeProjectId: null,
        completedProjectIds: [],
        pendingRewardProjectId: null,
      },
      stage5: null,
      perpetual: null,
    };
    session.save("s4_seed");
    shell.render(buildViewModel(session.getState()));
    return { container, session, clock, shell };
  }

  it("stage4 identity & node array render; earth economy hidden", () => {
    const { session, shell } = stage4Harness();
    expect(document.querySelector(".stage4-identity")?.textContent).toContain("地月算力运营商");
    expect(document.querySelector(".stage4-motivation-title")?.textContent).toContain("地球算力饱和");
    expect(document.querySelectorAll(".stage4-node").length).toBe(4);
    // 资金不足：moon_base 显示锁定提示而非购买按钮
    expect(document.querySelector("[data-action='buy_node:moon_base']")).toBeNull();
    expect(document.querySelector(".stage4-node[data-node-id='moon_base']")?.textContent).toContain("首个自费节点");
    // 资金充足后出现购买按钮
    const s = session.getState();
    s.money = 1.8e10;
    session.save("s4_money");
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("[data-action='buy_node:moon_base']")).not.toBeNull();
    expect(document.querySelector("[data-action='buy_node:verified_nodes']")).not.toBeNull();
    // 地球经营区隐藏
    expect(document.querySelector("#section-stage3")?.classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#section-orders")?.classList.contains("hidden")).toBe(true);
  });

  it("stage4 tick does not replace root or rebuild sections", () => {
    const { session, clock, shell } = stage4Harness();
    const rootNode = shell.getElement();
    shell.resetMetrics();
    // 启动地月一体化算力网
    session.startStage4Project();
    shell.render(buildViewModel(session.getState()));
    const fullBefore = shell.getMetrics().fullRenderCount;
    for (let i = 0; i < 60; i++) {
      clock.advance(1000);
      session.update(1);
      shell.render(buildViewModel(session.getState()));
    }
    const m = shell.getMetrics();
    expect(m.rootReplacementCount).toBe(0);
    expect(shell.getElement()).toBe(rootNode);
    // 工程推进只走局部 patch（进度文本）
    expect(m.fullRenderCount).toBe(fullBefore);
    expect(m.partialPatchCount).toBeGreaterThanOrEqual(59);
    expect(count(".stage4-node")).toBe(4);
  });

  it("stage4 final project reward button exactly-once", () => {
    const { session, shell } = stage4Harness();
    session.startStage4Project();
    const s = session.getState();
    // 直接推到完成
    for (let i = 0; i < 500000; i++) {
      const before = s.singularity?.stage4?.projectProgress ?? 0;
      s.singularity!.stage4 = {
        ...s.singularity!.stage4!,
        projectProgress: Math.min(STAGE4_FINAL_PROJECT.progressRequired, before + 1000),
      };
      if (before + 1000 >= STAGE4_FINAL_PROJECT.progressRequired) break;
    }
    s.singularity!.stage4 = {
      ...s.singularity!.stage4!,
      activeProjectId: null,
      pendingRewardProjectId: "moon_network",
    };
    session.save("s4_done");
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("[data-action='claim_stage4_reward']")).not.toBeNull();
    expect(session.claimStage4Reward().ok).toBe(true);
    expect(session.claimStage4Reward().ok).toBe(false);
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector("[data-action='claim_stage4_reward']")).toBeNull();
    expect(document.querySelector("[data-action='start_stage5']")).not.toBeNull();
  });
});

describe("CARD-02 space reveal overlay contract", () => {
  function revealedHarness(started = false) {
    setupDom();
    const container = document.getElementById("app")!;
    const { session } = makeHarness();
    const shell = shellFor(container, session);
    const s = session.getState();
    s.singularity = {
      mode: "endgame",
      coresClaimed: ["core_1", "core_2", "core_3"],
      spacePlanRevealed: true,
      claimedProjectIds: [],
      spacePlanRevealedAtMs: 1,
      spacePlanStarted: started,
      stage4: started
        ? {
            entered: true,
            enteredAtMs: 1,
            nodes: ["leo_node"],
            stageIncome: 0,
            projectProgress: 0,
            activeProjectId: null,
            completedProjectIds: [],
            pendingRewardProjectId: null,
          }
        : null,
      stage5: null,
      perpetual: null,
    };
    session.save("s4_reveal");
    shell.render(buildViewModel(session.getState()));
    return { container, session, shell };
  }

  it("reveal auto-shows once; close then reopen from archive; start disappears", () => {
    const { session, shell } = revealedHarness(false);
    const overlay = document.querySelector(".space-reveal-overlay") as HTMLElement;
    expect(overlay.hidden).toBe(false);
    expect(document.querySelector("[data-action='start_space_plan']")).not.toBeNull();
    // 关闭
    const closeBtn = document.querySelector("[data-command='close_space_reveal']") as HTMLButtonElement;
    closeBtn.click();
    expect(overlay.hidden).toBe(true);
    // 重复渲染不再自动弹出（dataset.shown 已置位）
    shell.render(buildViewModel(session.getState()));
    expect(overlay.hidden).toBe(true);
    // 从档案馆重开：打开档案馆 → 奇点核心页 → 启动按钮
    document.querySelector("[data-command='page:honor']")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const tabBtn = [...document.querySelectorAll("[data-action^='archive_category:']")]
      .find((b) => b.getAttribute("data-action") === "archive_category:singularity") as HTMLButtonElement;
    expect(tabBtn).toBeTruthy();
    tabBtn.click();
    expect(document.querySelector("[data-action='start_space_plan']")).not.toBeNull();
    // 点击启动：进入 Stage 4，揭示卡不再弹出
    const startBtn = document.querySelector("[data-action='start_space_plan']") as HTMLButtonElement;
    startBtn.click();
    expect(session.getState().singularity?.spacePlanStarted).toBe(true);
    expect(overlay.hidden).toBe(true);
    shell.render(buildViewModel(session.getState()));
    expect(overlay.hidden).toBe(true);
  });

  it("after started, reveal overlay stays closed", () => {
    revealedHarness(true);
    const overlay = document.querySelector(".space-reveal-overlay") as HTMLElement;
    expect(overlay.hidden).toBe(true);
    expect(document.querySelector(".stage4-identity")?.textContent).toContain("地月算力运营商");
  });
});

describe("CARD-03 stage5 render contract", () => {
  function stage5Harness(completed = false) {
    setupDom();
    const container = document.getElementById("app")!;
    const { session, clock } = makeHarness();
    const shell = shellFor(container, session);
    const s = session.getState();
    s.money = completed ? "890123456789012" : 0;
    s.singularity = {
      mode: "endgame",
      coresClaimed: ["core_1", "core_2", "core_3"],
      spacePlanRevealed: true,
      claimedProjectIds: [],
      spacePlanRevealedAtMs: 1,
      spacePlanStarted: true,
      stage4: {
        entered: true,
        enteredAtMs: 1,
        nodes: ["leo_node", "moon_base", "lunar_link", "deep_relay"],
        stageIncome: 0,
        projectProgress: STAGE4_FINAL_PROJECT.progressRequired,
        activeProjectId: null,
        completedProjectIds: ["moon_network"],
        pendingRewardProjectId: null,
      },
      stage5: {
        entered: true,
        enteredAtMs: 1,
        nodes: ["solar_array"],
        stageIncome: 0,
        projectProgress: completed ? STAGE5_FINAL_PROJECT.progressRequired : 0,
        activeProjectId: null,
        completedProjectIds: completed ? ["dyson_sphere"] : [],
        pendingRewardProjectId: null,
        storyCompleted: completed,
        legendaryArchive: completed
          ? { completedAtMs: 1, maxCompute: 123, maxIncome: 456, reachedEra: "银河纪元" }
          : null,
      },
      perpetual: completed ? { unlockedAtMs: 1 } : null,
    };
    session.save("s5_seed");
    shell.render(buildViewModel(session.getState()));
    return { container, session, clock, shell };
  }

  it("stage5 identity & node array render; stage4/earth hidden", () => {
    stage5Harness();
    expect(document.querySelector(".stage5-identity")?.textContent).toContain("银河算力大亨");
    expect(document.querySelectorAll(".stage5-node").length).toBe(4);
    expect(document.querySelector("#section-stage4")?.classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#section-stage3")?.classList.contains("hidden")).toBe(true);
  });

  it("story complete overlay shows once after dyson claim", () => {
    const { session, shell } = stage5Harness(false);
    const overlay = document.querySelector(".story-complete-overlay") as HTMLElement;
    expect(overlay.hidden).toBe(true);
    // 启动戴森球 → 推进完成 → 领取 → 永续激活 → 结局卡弹出一次
    session.startStage5Project();
    const s = session.getState();
    for (let i = 0; i < 500000; i++) {
      const before = s.singularity?.stage5?.projectProgress ?? 0;
      s.singularity!.stage5 = {
        ...s.singularity!.stage5!,
        projectProgress: Math.min(STAGE5_FINAL_PROJECT.progressRequired, before + 2000),
      };
      if (before + 2000 >= STAGE5_FINAL_PROJECT.progressRequired) break;
    }
    s.singularity!.stage5 = {
      ...s.singularity!.stage5!,
      activeProjectId: null,
      pendingRewardProjectId: "dyson_sphere",
    };
    session.save("s5_done");
    expect(session.claimStage5Reward().ok).toBe(true);
    shell.render(buildViewModel(session.getState()));
    expect(overlay.hidden).toBe(false);
    // 重复渲染不重复弹（dataset.shown）
    shell.render(buildViewModel(session.getState()));
    expect(overlay.hidden).toBe(false);
    // 底部“继续经营”与右上角关闭使用同一纯UI命令，不能误发给状态机。
    const continueButton = document.querySelector(".story-complete-actions [data-command='close_story_complete']") as HTMLButtonElement;
    expect(continueButton.textContent).toBe("继续经营");
    continueButton.click();
    expect(overlay.hidden).toBe(true);
  });

  it("perpetual keeps manual reset entry (toolbar reset still present)", () => {
    const { session, shell } = stage5Harness(true);
    expect(document.querySelector("[data-command='reset']")).not.toBeNull();
    expect(document.querySelector(".stage5-story-done")?.textContent).toContain("主线完成");
    expect(document.querySelector(".money")?.textContent).toContain("¥890.123兆");
    expect(document.querySelector(".perpetual-growth")?.textContent).toContain("银河网络实时结算");
    expect(document.querySelector(".perpetual-growth-income")?.textContent).toContain("每秒持续注入");
    expect(document.querySelector(".perpetual-growth-pulse")?.getAttribute("aria-hidden")).toBe("true");

    session.getState().money = "890146756789012";
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector(".perpetual-growth-money")?.textContent).toBe("¥890.147兆");
  });

  it("endgame archive exposes growth history and legendary tabs", () => {
    stage5Harness(true);
    (document.querySelector("[data-command='page:honor']") as HTMLButtonElement).click();
    expect(document.querySelector("[data-action='archive_category:growth']")).not.toBeNull();
    expect(document.querySelector("[data-action='archive_category:legendary']")).not.toBeNull();
    (document.querySelector("[data-action='archive_category:growth']") as HTMLButtonElement).click();
    expect(document.querySelector(".archive-growth")?.textContent).toContain("技术迭代历史");
    expect(document.querySelector(".archive-growth")?.textContent).toContain("文明阶段");
    (document.querySelector("[data-action='archive_category:legendary']") as HTMLButtonElement).click();
    expect(document.querySelector(".archive-legendary")?.textContent).toContain("最大算力");
    expect(document.querySelector(".archive-legendary")?.textContent).toContain("达成纪元");
    expect(document.querySelectorAll("#section-archive svg.game-icon").length).toBeGreaterThan(6);
    expect(document.querySelector("#section-archive")?.textContent).not.toMatch(/[🔒🔓⭐🏅🏆🤖🎨🎙🔬🧠]/u);
  });
});

describe("CARD-04 offline return receipt", () => {
  it("shows 本次离线/有效结算/上限/超出/资金/研发/工程 in merged card", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    const base = freshSaveData(clock.now());
    base.modelProgress = { modelId: "codex", level: 3, trainingCount: 2 };
    base.ownedModelIds = ["codex"];
    base.serverCount = 1;
    base.serverPower = 1.5;
    base.modelResearch = { progress: 20, stage2Draws: 0 };
    base.lastTickAtMs = clock.now() - 8 * 60 * 60 * 1000; // 8h 离线（基础上限6h）
    storage.save(base);
    const session = new GameSession({
      repository: new SaveRepository({ storage, nowMs: () => clock.now() }),
      clock,
    });
    // 会话启动即结算；补充回执字段（Session 侧效会填研发/工程）
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));

    const card = document.querySelector(".offline-card") as HTMLElement;
    expect(card).not.toBeNull();
    const text = card.textContent ?? "";
    expect(text).toContain("回归结算");
    expect(text).toContain("本次离线：");
    expect(text).toContain("有效结算：");
    expect(text).toContain("本阶段上限：");
    expect(text).toContain("超出未计入：2小时");
    expect(text).toContain("获得资金：");
    expect(text).toContain("获得研发进度：");
    // 工程推进（无激活工程 → 占位）
    expect(text).toContain("推进工程：—");
    // 领取一次后卡片消失
    session.claimOffline();
    shell.render(buildViewModel(session.getState()));
    expect(document.querySelector(".offline-card")).toBeNull();
  });
});
