import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputPath = resolve(process.argv[3] ?? "evidence/review/runtime-soak.json");
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) throw new Error("PLAYWRIGHT_MODULE is required");
const require = createRequire(import.meta.url);
const { chromium } = require(playwrightModule);

const scenarios = [
  { id: "stage1_automation", checkpoint: "automation_unlocked" },
  { id: "stage2_high_throughput", checkpoint: "server8_high_throughput" },
  {
    id: "stage3_commission_bonus",
    checkpoint: "stage3_entry",
    expectBonusExpiry: true,
    wallDurationMs: 65_000,
  },
  { id: "stage3_flagship", checkpoint: "room3_final_flagship", expectManualFlagshipClaim: true },
  { id: "iteration_before", checkpoint: "iteration_ready" },
  { id: "iteration_after", checkpoint: "iteration_ready", action: "prestige" },
];
const speed = 120;
const wallDurationMs = 5_000;
const browser = await chromium.launch({ headless: true });
const results = [];

for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    const qa = {
      timeouts: new Set(),
      intervals: new Set(),
      frames: new Set(),
      listenerRecords: new WeakMap(),
      listenerTotal: 0,
      rootReplacements: 0,
      unhandledRejections: 0,
      snapshot() {
        return {
          activeTimeoutCount: this.timeouts.size,
          activeIntervalCount: this.intervals.size,
          activeAnimationFrameCount: this.frames.size,
          listenerTotal: this.listenerTotal,
          rootReplacementCount: this.rootReplacements,
          unhandledRejections: this.unhandledRejections,
        };
      },
    };
    window.__CT_QA_SOAK__ = qa;

    const nativeTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => {
      let handle = 0;
      handle = nativeTimeout((...callbackArgs) => {
        qa.timeouts.delete(handle);
        if (typeof callback === "function") callback(...callbackArgs);
      }, delay, ...args);
      qa.timeouts.add(handle);
      return handle;
    };
    window.clearTimeout = (handle) => {
      qa.timeouts.delete(handle);
      nativeClearTimeout(handle);
    };

    const nativeInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      const handle = nativeInterval(callback, delay, ...args);
      qa.intervals.add(handle);
      return handle;
    };
    window.clearInterval = (handle) => {
      qa.intervals.delete(handle);
      nativeClearInterval(handle);
    };

    const nativeRaf = window.requestAnimationFrame.bind(window);
    const nativeCancelRaf = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      let handle = 0;
      handle = nativeRaf((time) => {
        qa.frames.delete(handle);
        callback(time);
      });
      qa.frames.add(handle);
      return handle;
    };
    window.cancelAnimationFrame = (handle) => {
      qa.frames.delete(handle);
      nativeCancelRaf(handle);
    };

    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      let byType = qa.listenerRecords.get(this);
      if (!byType) {
        byType = new Map();
        qa.listenerRecords.set(this, byType);
      }
      let listeners = byType.get(type);
      if (!listeners) {
        listeners = new Set();
        byType.set(type, listeners);
      }
      if (!listeners.has(listener)) {
        listeners.add(listener);
        qa.listenerTotal += 1;
      }
      return nativeAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const listeners = qa.listenerRecords.get(this)?.get(type);
      if (listeners?.delete(listener)) qa.listenerTotal -= 1;
      return nativeRemove.call(this, type, listener, options);
    };
    window.addEventListener("unhandledrejection", () => {
      qa.unhandledRejections += 1;
    });
    document.addEventListener("DOMContentLoaded", () => {
      const app = document.getElementById("app");
      if (!app) return;
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.target === app && mutation.removedNodes.length > 0 && mutation.addedNodes.length > 0) {
            qa.rootReplacements += 1;
          }
        }
      }).observe(app, { childList: true });
    });
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const resource404s = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() === 404) resource404s.push(response.url());
  });

  await page.goto(new URL(`?checkpoint=${scenario.checkpoint}&qa=1&speed=${speed}`, baseUrl).href, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".app", { state: "visible" });

  const read = () => page.evaluate(() => {
    const probe = window.__CT_REVIEW_RUNTIME_PROBE__;
    const state = probe?.getState();
    return {
      qa: window.__CT_QA_SOAK__?.snapshot() ?? null,
      render: probe?.getMetrics() ?? null,
      domNodes: document.getElementsByTagName("*").length,
      heap: performance.memory?.usedJSHeapSize ?? null,
      state: state && {
        revision: state.revision,
        stage: state.stage,
        serverCount: state.serverCount,
        iterationCount: state.technologyIterationCount,
        commissionBonusActive: Date.now() < (state.stage3?.commissionBonusUntilMs ?? 0),
        activeProject: state.stage3?.flagship?.activeId ?? null,
        pendingProject: state.stage3?.flagship?.pendingReward?.projectId ?? null,
        completedProjects: [...(state.stage3?.flagship?.completedIds ?? [])],
      },
    };
  });

  const start = await read();
  if (scenario.action === "prestige") {
    const clicked = await page.evaluate(() => {
      const button = document.querySelector('button[data-action="prestige"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    });
    if (!clicked) throw new Error("Prestige action unavailable in iteration_after soak");
  }

  const scenarioWallDurationMs = scenario.wallDurationMs ?? wallDurationMs;
  const samples = [start];
  for (let sample = 0; sample < Math.ceil(scenarioWallDurationMs / 1_000); sample++) {
    await page.waitForTimeout(1_000);
    samples.push(await read());
  }
  const end = samples[samples.length - 1];
  const domSeries = samples.map((sample) => sample.domNodes);
  const listenerSeries = samples.map((sample) => sample.qa?.listenerTotal ?? -1);
  const frameSeries = samples.map((sample) => sample.qa?.activeAnimationFrameCount ?? -1);
  const memorySeries = samples.map((sample) => sample.heap).filter((value) => typeof value === "number");
  const expectedGameSeconds = speed * scenarioWallDurationMs / 1000;
  const saveDelta = (end.state?.revision ?? 0) - (start.state?.revision ?? 0);

  const assertions = {
    domBounded: Math.max(...domSeries) - Math.min(...domSeries) <= 40,
    timersStable: frameSeries.every((value) => value === 1)
      && (end.qa?.activeIntervalCount ?? 0) === (start.qa?.activeIntervalCount ?? 0)
      && (end.qa?.activeTimeoutCount ?? 0) <= (start.qa?.activeTimeoutCount ?? 0) + 1,
    listenersStable: new Set(listenerSeries).size === 1,
    rootStable: end.qa?.rootReplacementCount === 0 && end.render?.rootReplacementCount === 0,
    consoleClean: consoleErrors.length === 0 && pageErrors.length === 0,
    resourcesClean: resource404s.length === 0,
    saveFrequencyBounded: saveDelta >= Math.floor(expectedGameSeconds / 20)
      && saveDelta <= Math.ceil(expectedGameSeconds / 10) + 5,
    memoryNonExplosive: memorySeries.length === 0
      || memorySeries[memorySeries.length - 1] <= memorySeries[0] * 1.5 + 2_000_000,
    commissionBonusExpired: !scenario.expectBonusExpiry
      || (start.state?.commissionBonusActive === true && end.state?.commissionBonusActive === false),
    flagshipRequiresManualClaim: !scenario.expectManualFlagshipClaim
      || (end.state?.pendingProject === "project_3" && !end.state.completedProjects.includes("project_3")),
    iterationAppliedOnce: scenario.action !== "prestige"
      || (end.state?.iterationCount === 1 && end.state?.serverCount === 0),
  };
  const status = Object.values(assertions).every(Boolean) ? "PASS" : "FAIL";
  results.push({
    id: scenario.id,
    checkpoint: scenario.checkpoint,
    speed,
    wallDurationMs: scenarioWallDurationMs,
    expectedGameSeconds,
    start,
    end,
    domSeries,
    listenerSeries,
    frameSeries,
    memorySeries,
    saveDelta,
    saveWritesPerGameMinute: saveDelta / (expectedGameSeconds / 60),
    consoleErrors,
    pageErrors,
    resource404s,
    assertions,
    status,
  });

  await context.close();
}

await browser.close();
const output = {
  generatedAt: new Date().toISOString(),
  equivalentMinutesPerScenario: speed * wallDurationMs / 60_000,
  result: results.every((scenario) => scenario.status === "PASS") ? "PASS" : "FAIL",
  scenarios: results,
};
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  result: output.result,
  equivalentMinutesPerScenario: output.equivalentMinutesPerScenario,
  scenarios: results.map((scenario) => ({
    id: scenario.id,
    status: scenario.status,
    dom: `${scenario.domSeries[0]}->${scenario.domSeries.at(-1)}`,
    listeners: `${scenario.listenerSeries[0]}->${scenario.listenerSeries.at(-1)}`,
    saveDelta: scenario.saveDelta,
    assertions: scenario.assertions,
  })),
}, null, 2));
if (output.result !== "PASS") process.exitCode = 1;
