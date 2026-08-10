import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import {
  activityFromIncome,
  buildFeelViewModel,
  createGrowthFeedback,
  resolveComputeTier,
  type FeelViewModel,
  type GrowthFeedbackEvent,
} from "../../src/economy/feel";
import { createFinalFeelController } from "../../src/ui/final-feel";
import { createAppShell } from "../../src/ui/render";
import { buildViewModel } from "../../src/economy/viewmodel";
import { buildReviewSave } from "../../src/review/checkpoints";
import { buildEndgameReviewSave } from "../../src/review/endgame-checkpoints";

const NOW = 1_800_000_000_000;
let dom: JSDOM | null = null;

function setupDom(): HTMLElement {
  dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", {
    url: "http://localhost/",
  });
  const win = dom.window;
  (globalThis as unknown as Record<string, unknown>).window = win;
  (globalThis as unknown as Record<string, unknown>).document = win.document;
  (globalThis as unknown as Record<string, unknown>).HTMLElement = win.HTMLElement;
  return win.document.getElementById("app")!;
}

function feel(overrides: Partial<FeelViewModel> = {}): FeelViewModel {
  return {
    computeTier: "micro",
    computeLabel: "总算力",
    computeValue: "1.2",
    computeRaw: "1.2",
    incomeValue: "¥100/秒",
    incomeRaw: "100",
    moneyValue: "¥1,000",
    moneyRaw: "1000",
    activity01: 0.3,
    cosmicNodeOwned: null,
    cosmicNodeTotal: null,
    cosmicMultiplier: null,
    activeProjectProgress01: null,
    affordableActions: [],
    bottleneck: null,
    growthReview: {
      visible: false,
      fromLabel: "AI创业工作室",
      currentLabel: "AI创业工作室",
      elapsedLabel: "0秒",
      computeLabel: "1.2",
      incomeLabel: "¥100/秒",
      milestoneCount: 0,
      summary: "",
    },
    offlinePreview: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  dom?.window.close();
  dom = null;
});

describe("Level A feel selectors", () => {
  it("maps all earth boundaries and cosmic overrides without parsing display text", () => {
    const cases: Array<[number, number, string]> = [
      [0, 1, "idle"],
      [1, 1, "micro"],
      [9.999, 1, "micro"],
      [10, 1, "studio"],
      [99.999, 2, "studio"],
      [100, 2, "cluster"],
      [999.999, 3, "cluster"],
      [1000, 3, "room"],
      [9999.999, 3, "room"],
      [10000, 3, "regional"],
      [1, 4, "lunar"],
      [1, 5, "stellar"],
    ];
    for (const [value, stage, expected] of cases) {
      expect(resolveComputeTier(value, stage), `${value}@${stage}`).toBe(expected);
    }
  });

  it("derives a clamped visual activity only from real income", () => {
    expect(activityFromIncome(0)).toBe(0);
    expect(activityFromIncome(1)).toBeGreaterThanOrEqual(0.12);
    expect(activityFromIncome("1e1000")).toBe(1);
    expect(activityFromIncome(1e6)).toBeLessThan(activityFromIncome(1e12));
  });

  it("uses real review facts for earth, lunar, stellar and perpetual states", () => {
    const fresh = buildFeelViewModel(buildReviewSave("new_game", NOW));
    expect(fresh.computeTier).toBe("idle");
    expect(fresh.affordableActions[0]?.id).toBe("acquire_model");

    const lunar = buildFeelViewModel(buildEndgameReviewSave("endgame_stage4_mid", NOW));
    expect(lunar.computeTier).toBe("lunar");
    expect(lunar.computeLabel).toBe("地球基底算力");
    expect(lunar.cosmicNodeOwned).toBeGreaterThan(0);
    expect(lunar.cosmicNodeTotal).toBeGreaterThan(lunar.cosmicNodeOwned!);

    const stellar = buildFeelViewModel(buildEndgameReviewSave("endgame_stage5_dyson_almost", NOW));
    expect(stellar.computeTier).toBe("stellar");
    expect(stellar.cosmicMultiplier).toMatch(/^×/);
    expect(stellar.activeProjectProgress01).toBeGreaterThan(0);

    const perpetual = buildFeelViewModel(buildEndgameReviewSave("endgame_perpetual", NOW));
    expect(perpetual.growthReview.visible).toBe(true);
    expect(perpetual.growthReview.summary).toContain("银河网络仍在刷新");
  });

  it("previews offline money and actions without mutating the save", () => {
    const state = buildReviewSave("automation_unlocked", NOW);
    const moneyBefore = state.money;
    state.pendingOfflineReward = {
      startedAtMs: NOW - 7200_000,
      endedAtMs: NOW,
      elapsedSec: 7200,
      rawElapsedSec: 7200,
      capSec: 21600,
      money: "1000000000000",
      claimed: false,
      researchProgress: 15,
      projectProgressDelta: 0,
      projectName: null,
    };
    const preview = buildFeelViewModel(state).offlinePreview;
    expect(preview).not.toBeNull();
    expect(preview!.moneyBefore).not.toBe(preview!.moneyAfter);
    expect(preview!.computeLabel).toMatch(/^保持 /);
    expect(preview!.affordableAfterCount).toBeGreaterThan(0);
    expect(state.money).toBe(moneyBefore);
  });
});

describe("Level A true before/after feedback", () => {
  it("ignores high-frequency or unchanged minor events", () => {
    expect(createGrowthFeedback("claim_order:0", feel(), feel())).toBeNull();
    expect(createGrowthFeedback("train_model", feel(), feel())).toBeNull();
  });

  it("distinguishes production gain, bottleneck transfer and release", () => {
    const before = feel({
      bottleneck: { id: "computeCards", name: "算力卡", efficiency: 0.63 },
    });
    const production = feel({
      incomeRaw: "120",
      incomeValue: "¥120/秒",
      bottleneck: { id: "computeCards", name: "算力卡", efficiency: 0.72 },
    });
    expect(createGrowthFeedback("upgrade_infra:computeCards", before, production)?.headline).toBe("产能提升");

    const transferred = feel({
      incomeRaw: "140",
      incomeValue: "¥140/秒",
      bottleneck: { id: "power", name: "供电", efficiency: 0.7 },
    });
    expect(createGrowthFeedback("upgrade_infra:computeCards", before, transferred)?.headline).toContain("瓶颈转移");

    const released = feel({
      incomeRaw: "160",
      incomeValue: "¥160/秒",
      bottleneck: { id: "computeCards", name: "算力卡", efficiency: 1 },
    });
    expect(createGrowthFeedback("upgrade_infra:computeCards", before, released)?.headline).toContain("瓶颈解除");
  });

  it("uses real raw values for scale and offline feedback", () => {
    const scale = createGrowthFeedback(
      "buy_server",
      feel({ computeTier: "studio", computeRaw: "99", computeValue: "99" }),
      feel({ computeTier: "cluster", computeRaw: "120", computeValue: "120", incomeRaw: "200", incomeValue: "¥200/秒" }),
    );
    expect(scale?.kind).toBe("scale");
    expect(scale?.tierChanged).toBe(true);
    expect(scale?.detail).toContain("算力 99 → 120");

    const offline = createGrowthFeedback(
      "claim_offline",
      feel({ moneyRaw: "1000", moneyValue: "¥1,000" }),
      feel({ moneyRaw: "5000", moneyValue: "¥5,000" }),
    );
    expect(offline?.kind).toBe("offline");
    expect(offline?.moneyIncreased).toBe(true);
  });
});

describe("Level A stable presentation controller", () => {
  it("keeps a fixed DOM and fixed ten-particle pool across 600 patches", () => {
    const root = setupDom();
    const money = document.createElement("div");
    root.appendChild(money);
    const controller = createFinalFeelController(root, money);
    root.appendChild(controller.element);
    controller.patch(feel());
    const before = controller.getMetrics();
    for (let index = 0; index < 600; index += 1) {
      controller.patch(feel({ activity01: (index % 100) / 100, incomeValue: `¥${100 + index}/秒` }));
    }
    const after = controller.getMetrics();
    expect(after.stableNodeCount).toBe(before.stableNodeCount);
    expect(after.particleNodeCount).toBe(10);
    expect(controller.element.querySelectorAll(".compute-particle")).toHaveLength(10);
    controller.destroy();
  });

  it("pulses only on false-to-true action edges and never executes the target action", () => {
    const root = setupDom();
    const money = document.createElement("div");
    const target = document.createElement("button");
    target.dataset.action = "buy_server";
    const onEconomicClick = vi.fn();
    target.addEventListener("click", onEconomicClick);
    root.append(money, target);
    const controller = createFinalFeelController(root, money);
    root.appendChild(controller.element);

    controller.patch(feel());
    const action = { id: "buy_server", label: "购买服务器", anchorAction: "buy_server", priority: 90 };
    controller.patch(feel({ affordableActions: [action] }));
    expect(controller.getMetrics().actionEdgeCount).toBe(1);
    for (let index = 0; index < 100; index += 1) controller.patch(feel({ affordableActions: [action] }));
    expect(controller.getMetrics().actionEdgeCount).toBe(1);

    const locator = controller.element.querySelector("button[data-feel-anchor]") as HTMLButtonElement;
    locator.click();
    expect(onEconomicClick).not.toHaveBeenCalled();
    expect(controller.getMetrics().navigationCount).toBe(1);

    controller.patch(feel());
    controller.patch(feel({ affordableActions: [action] }));
    expect(controller.getMetrics().actionEdgeCount).toBe(2);
    controller.destroy();
  });

  it("pauses all visual feedback while hidden and resumes without replay", () => {
    const root = setupDom();
    const money = document.createElement("div");
    root.appendChild(money);
    const controller = createFinalFeelController(root, money);
    root.appendChild(controller.element);
    controller.patch(feel());
    controller.setPaused(true);
    const event: GrowthFeedbackEvent = {
      command: "buy_server",
      kind: "major",
      headline: "服务器集群扩容",
      detail: "算力 1 → 2",
      durationMs: 1800,
      tierChanged: false,
      moneyIncreased: false,
    };
    controller.showFeedback(event);
    expect(controller.element.dataset.running).toBe("false");
    expect(controller.element.querySelector<HTMLElement>(".growth-feedback")!.hidden).toBe(true);
    expect(controller.getMetrics().feedbackCount).toBe(0);
    controller.setPaused(false);
    controller.patch(feel());
    expect(controller.element.dataset.running).toBe("true");
    controller.destroy();
  });

  it("keeps the visual budget and reduced-motion contract in CSS", () => {
    const css = readFileSync(new URL("../../src/styles/final-feel.css", import.meta.url), "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation-play-state: paused");
    expect(css).toContain(".final-feel-panel [hidden]");
    expect(css).toContain("display: none !important");
    expect(css).not.toMatch(/\.gif|<canvas|<video/i);
  });

  it("reorders Stage2 automation to model, server, aggregated orders", () => {
    const container = setupDom();
    const shell = createAppShell(container);
    shell.render(buildViewModel(buildReviewSave("server3_blueprint", NOW)));
    const page = document.querySelector(".app-page-business")!;
    const model = document.getElementById("section-model")!;
    const server = document.getElementById("section-server")!;
    const orders = document.getElementById("section-orders")!;
    const nodes = [...page.children];
    expect(nodes.indexOf(model)).toBeLessThan(nodes.indexOf(server));
    expect(nodes.indexOf(server)).toBeLessThan(nodes.indexOf(orders));
    expect(server.querySelector(".section-title")?.textContent).toContain("②");
    expect(orders.querySelector(".section-title")?.textContent).toContain("③");
    shell.destroy();
  });
});
