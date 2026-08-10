// boot 运行时合同：防重入 + 单实例循环 + teardown 清理。
import { describe, expect, it, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { performance as nodePerformance } from "node:perf_hooks";
import type { teardown as TeardownFn } from "../../src/app/main";

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
  delete (globalThis as unknown as Record<string, unknown>).HTMLElement;
  delete (globalThis as unknown as Record<string, unknown>).requestAnimationFrame;
  delete (globalThis as unknown as Record<string, unknown>).cancelAnimationFrame;
});

describe("boot runtime contract", () => {
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
