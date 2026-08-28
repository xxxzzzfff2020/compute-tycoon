// boot 运行时合同：防重入 + 单实例循环 + teardown 清理。
import { describe, expect, it, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { performance as nodePerformance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SAVE_NAMESPACE, MAX_SUPPORTED_SCHEMA_VERSION } from "../../src/save/types";

let teardownRef: (() => void) | null = null;

function setupDom(): JSDOM {
  // jsdom 构造需要 performance 全局
  (globalThis as unknown as Record<string, unknown>).performance = nodePerformance;
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", {
    url: "http://localhost/",
  });
  const { window } = dom;
  (globalThis as unknown as Record<string, unknown>).window = window;
  (globalThis as unknown as Record<string, unknown>).document = window.document;
  (globalThis as unknown as Record<string, unknown>).localStorage = window.localStorage;
  (globalThis as unknown as Record<string, unknown>).HTMLElement = window.HTMLElement;
  (globalThis as unknown as Record<string, unknown>).performance = nodePerformance;
  // rAF 桩：直接同步驱动（不真正排帧），便于断言单实例
  let rafCb: ((t: number) => void) | null = null;
  (globalThis as unknown as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
    rafCb = cb;
    return 1;
  };
  (globalThis as unknown as Record<string, unknown>).cancelAnimationFrame = () => {
    rafCb = null;
  };
  return dom;
}

const totalNodes = (): number => document.getElementsByTagName("*").length;

afterEach(() => {
  vi.restoreAllMocks();
  teardownRef?.();
  teardownRef = null;
  document.body.innerHTML = "";
  delete (globalThis as unknown as Record<string, unknown>).window;
  delete (globalThis as unknown as Record<string, unknown>).document;
  delete (globalThis as unknown as Record<string, unknown>).localStorage;
  delete (globalThis as unknown as Record<string, unknown>).HTMLElement;
  delete (globalThis as unknown as Record<string, unknown>).requestAnimationFrame;
  delete (globalThis as unknown as Record<string, unknown>).cancelAnimationFrame;
});

describe("boot runtime contract", () => {
  it("单机启动不装配账号、云档、广告或排行榜适配器", () => {
    setupDom();
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const main = readFileSync(`${root}/src/app/main.ts`, "utf8");
    expect(main).not.toMatch(/taptap-|bootstrapPlatformAccount|accountBootstrap|createRewardedVideoAd|getCloudStorage|getUserInfo/);
    expect(main).not.toContain("account-bootstrap-modal");
    expect(main).toContain("new LocalStorageSaveStorage");
  });

  it("即使宿主存在 SDK 也不读取它，不联网，直接以本地档启动", async () => {
    const dom = setupDom();
    const sdkRead = vi.fn(() => { throw new Error("platform SDK must not be read"); });
    const network = vi.fn(() => { throw new Error("network must not be used for boot"); });
    Object.defineProperty(dom.window, "tap", { configurable: true, get: sdkRead });
    Object.defineProperty(globalThis, "tap", { configurable: true, get: sdkRead });
    vi.stubGlobal("fetch", network);
    try {
      const { boot, teardown } = await import("../../src/app/main");
      teardownRef = teardown;
      boot();
      expect(document.querySelectorAll("#app > .app")).toHaveLength(1);
      expect(sdkRead).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
      expect(dom.window.localStorage.getItem(SAVE_NAMESPACE)).not.toBeNull();
      expect(Object.keys(dom.window.localStorage).some((key) => /uid|account|cloud/i.test(key))).toBe(false);
    } finally {
      delete (globalThis as unknown as Record<string, unknown>).tap;
      vi.unstubAllGlobals();
    }
  });

  it("未知未来存档在启动迁移和自动保存时都不被覆盖", async () => {
    const dom = setupDom();
    const future = JSON.stringify({ schemaVersion: MAX_SUPPORTED_SCHEMA_VERSION + 1, saveId: "future", money: 123 });
    dom.window.localStorage.setItem(SAVE_NAMESPACE, future);
    const { boot, teardown } = await import("../../src/app/main");
    teardownRef = teardown;
    boot();
    expect(dom.window.localStorage.getItem(SAVE_NAMESPACE)).toBe(future);
    teardown();
    expect(dom.window.localStorage.getItem(SAVE_NAMESPACE)).toBe(future);
  });

  it("正式 shell 启动时会替换账号预检 modal，不会与经营 UI 共存", async () => {
    setupDom();
    const container = document.getElementById("app")!;
    const bootstrap = document.createElement("section");
    bootstrap.className = "account-bootstrap-screen";
    container.appendChild(bootstrap);
    const { boot, teardown } = await import("../../src/app/main");
    teardownRef = teardown;

    boot();

    expect(document.querySelector(".account-bootstrap-screen")).toBeNull();
    expect(document.querySelectorAll("#app > .app")).toHaveLength(1);
  });

  it("boot 防重入：同一容器重复 boot 只初始化一次", async () => {
    setupDom();
    const { boot, activeLoopCount, teardown } = await import("../../src/app/main");
    teardownRef = teardown;
    boot();
    const nodesAfterFirst = totalNodes();
    const loopCountAfterFirst = activeLoopCount();
    boot(); // 重复 boot（HMR/误调用）
    boot();
    expect(totalNodes()).toBe(nodesAfterFirst);
    expect(activeLoopCount()).toBe(loopCountAfterFirst);
    expect(document.querySelectorAll(".app").length).toBe(1);
    teardown();
    expect(activeLoopCount()).toBe(0);
    expect(document.querySelectorAll(".app").length).toBe(0);
  });

  it("teardown 清理旧循环后再 boot 可重建单实例", async () => {
    setupDom();
    const { boot, activeLoopCount, teardown } = await import("../../src/app/main");
    teardownRef = teardown;
    boot();
    const nodes1 = totalNodes();
    expect(activeLoopCount()).toBe(1);
    teardown();
    expect(activeLoopCount()).toBe(0);
    boot();
    expect(activeLoopCount()).toBe(1);
    // 重建后仍然只有一份 UI
    expect(document.querySelectorAll(".app").length).toBe(1);
    expect(totalNodes()).toBeLessThanOrEqual(nodes1 + 10);
    teardown();
  });

  it("重复初始化不产生重复节点（HMR 场景）", async () => {
    setupDom();
    const { boot, teardown } = await import("../../src/app/main");
    teardownRef = teardown;
    boot();
    const baseline = totalNodes();
    for (let i = 0; i < 5; i++) {
      teardown();
      boot();
    }
    expect(document.querySelectorAll(".app").length).toBe(1);
    expect(totalNodes()).toBeLessThanOrEqual(baseline + 10);
    teardown();
  });
});
