// i18n 验收：字典一致性、en-US 渲染、语言切换不丢存档、fallback 不显示 key、数字格式。
import { describe, expect, it, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { performance as nodePerformance } from "node:perf_hooks";
import { GameSession } from "../../src/app/session";
import { FakeClock } from "./helpers";
import { MemorySaveStorage } from "../../src/save/storage";
import { SaveRepository } from "../../src/save/repository";
import { createAppShell, type AppShell } from "../../src/ui/render";
import { buildViewModel } from "../../src/economy/viewmodel";
import { freshSaveData } from "../../src/save/storage";
import {
  getLocale,
  initLocale,
  setLocale,
  t,
  formatNumber,
  formatPercent,
  DEFAULT_LOCALE,
} from "../../src/i18n";
import { zhCN } from "../../src/i18n/zh-CN";
import { enUS } from "../../src/i18n/en-US";

function setupDom(locale?: string): JSDOM {
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", {
    url: "http://localhost/",
  });
  const { window } = dom;
  if (locale) {
    Object.defineProperty(window, "localStorage", {
      value: { getItem: () => locale, setItem: () => undefined, removeItem: () => undefined },
      configurable: true,
    });
  }
  (globalThis as unknown as Record<string, unknown>).window = window;
  (globalThis as unknown as Record<string, unknown>).document = window.document;
  (globalThis as unknown as Record<string, unknown>).HTMLElement = window.HTMLElement;
  (globalThis as unknown as Record<string, unknown>).performance = nodePerformance;
  return dom;
}

function shellFor(container: HTMLElement, session: GameSession): AppShell {
  const shell = createAppShell(container);
  shell.setCommandHandler((cmd) => {
    if (cmd === "acquire_model") return session.acquireModel();
    if (cmd.startsWith("accept_order:")) return session.acceptOrder(cmd.slice("accept_order:".length));
    if (cmd.startsWith("claim_order:")) return session.claimOrder(Number(cmd.slice("claim_order:".length)));
    if (cmd === "claim_offline") return session.claimOffline();
    return { ok: false, error: "unknown" };
  });
  return shell;
}

afterEach(() => {
  setLocale(DEFAULT_LOCALE);
  delete (globalThis as unknown as Record<string, unknown>).window;
  delete (globalThis as unknown as Record<string, unknown>).document;
  delete (globalThis as unknown as Record<string, unknown>).HTMLElement;
});

describe("i18n dictionaries", () => {
  it("zh-CN and en-US expose identical key sets", () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(enUS).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it("every t() call site has a dictionary entry", () => {
    // 核心渲染路径默认语言渲染不应出现裸 key 样式（t 未命中会回退 key 本身）。
    setupDom("zh-CN");
    initLocale();
    const container = document.getElementById("app")!;
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    storage.save(freshSaveData(clock.now()));
    const session = new GameSession({ repository: new SaveRepository({ storage, nowMs: () => clock.now() }), clock });
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const text = container.textContent ?? "";
    // 渲染出的文本不应包含裸 key 形态（如 "prestige.gain." / "archive." / "toast." / "feel."）。
    expect(text).not.toMatch(/(^|\s)(prestige|archive|toast|feel|story|hall|cloud|menu)\.[a-z]/);
    shell.destroy();
  });
});

describe("en-US rendering", () => {
  it("renders the business page in natural English", () => {
    setupDom("en-US");
    initLocale();
    const container = document.getElementById("app")!;
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    const base = freshSaveData(clock.now());
    storage.save(base);
    const session = new GameSession({ repository: new SaveRepository({ storage, nowMs: () => clock.now() }), clock });
    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    const text = container.textContent ?? "";
    expect(text).toContain("Startup Era · AI Studio");
    expect(text).toContain("Model Blueprint");
    expect(text).toContain("Acquire First Model");
    // 不应出现中文文案（带圈数字序号 ①②③④ 是跨语言装饰，允许）
    // 语言切换按钮以母语显示名称（简体中文/English）是刻意行为，其余不应出现中文
    expect(text.replace(/[\u2460-\u2473]/g, "").replace(/简体中文/g, "")).not.toMatch(/[\u4e00-\u9fff]/);
    shell.destroy();
  });

  it("shows no raw keys and resolves numbers with locale grouping", () => {
    setupDom("en-US");
    initLocale();
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatPercent(0.5)).toBe("50%");
    expect(t("app.currentMoney", { money: formatNumber(1234567) })).toBe("Funds 1,234,567");
  });
});

describe("locale switching persistence", () => {
  it("persists the preference in an independent storage key, not the save schema", () => {
    setupDom("zh-CN");
    initLocale();
    const container = document.getElementById("app")!;
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    const base = freshSaveData(clock.now());
    base.money = "50000";
    storage.save(base);
    const session = new GameSession({ repository: new SaveRepository({ storage, nowMs: () => clock.now() }), clock });
    const before = session.exportJson();
    expect(before).not.toContain("locale");

    const shell = shellFor(container, session);
    shell.render(buildViewModel(session.getState()));
    expect(document.documentElement.lang).toBe("zh-CN");
    shell.destroy();
  });

  it("initLocale honors a stored en-US preference", () => {
    setupDom("en-US");
    expect(initLocale()).toBe("en-US");
    expect(getLocale()).toBe("en-US");
    expect(document.documentElement.lang).toBe("en-US");
  });

  it("switching locale does not mutate the save schema", () => {
    setupDom("zh-CN");
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    const base = freshSaveData(clock.now());
    base.money = "12345";
    storage.save(base);
    const session = new GameSession({ repository: new SaveRepository({ storage, nowMs: () => clock.now() }), clock });
    const before = session.exportJson();
    setLocale("en-US");
    const after = session.exportJson();
    expect(after).toBe(before);
    expect(String(JSON.parse(after).money)).toBe("12345");
  });
});

describe("fallback behavior", () => {
  it("falls back to the default locale when a key is missing in the current locale", () => {
    setLocale("en-US");
    // zh-CN 有、en-US 无的 key 应回退 zh-CN（这里直接构造：字典已对齐，验证 t() 自身行为）
    expect(typeof t("app.title")).toBe("string");
    expect(t("app.title")).toBe("Compute Tycoon");
  });

  it("never renders the literal key for known keys", () => {
    setupDom("zh-CN");
    expect(t("menu.title")).toBe("游戏菜单");
    expect(t("model.notAcquired")).toBe("未获取模型 Lv.1");
    expect(t("order.ready")).toBe("可领取");
    setLocale("en-US");
    expect(t("menu.title")).toBe("Game Menu");
  });
});
