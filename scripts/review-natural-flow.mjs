import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputPath = resolve(process.argv[3] ?? "evidence/review/natural-flow.json");
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) throw new Error("PLAYWRIGHT_MODULE is required");

const require = createRequire(import.meta.url);
const { chromium } = require(playwrightModule);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

await context.addInitScript(() => {
  const metrics = {
    activeTimeouts: new Set(),
    activeIntervals: new Set(),
    activeAnimationFrames: new Set(),
    listenerRecords: new WeakMap(),
    listenerTotal: 0,
    rootReplacementCount: 0,
    unhandledRejections: 0,
    snapshot() {
      return {
        activeTimeoutCount: this.activeTimeouts.size,
        activeIntervalCount: this.activeIntervals.size,
        activeAnimationFrameCount: this.activeAnimationFrames.size,
        listenerTotal: this.listenerTotal,
        rootReplacementCount: this.rootReplacementCount,
        unhandledRejections: this.unhandledRejections,
      };
    },
  };
  window.__CT_QA_RUNTIME_METRICS__ = metrics;

  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => {
    let handle = 0;
    handle = nativeSetTimeout((...callbackArgs) => {
      metrics.activeTimeouts.delete(handle);
      if (typeof callback === "function") callback(...callbackArgs);
    }, delay, ...args);
    metrics.activeTimeouts.add(handle);
    return handle;
  };
  window.clearTimeout = (handle) => {
    metrics.activeTimeouts.delete(handle);
    nativeClearTimeout(handle);
  };

  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  window.setInterval = (callback, delay, ...args) => {
    const handle = nativeSetInterval(callback, delay, ...args);
    metrics.activeIntervals.add(handle);
    return handle;
  };
  window.clearInterval = (handle) => {
    metrics.activeIntervals.delete(handle);
    nativeClearInterval(handle);
  };

  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancelRaf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    let handle = 0;
    handle = nativeRaf((timestamp) => {
      metrics.activeAnimationFrames.delete(handle);
      callback(timestamp);
    });
    metrics.activeAnimationFrames.add(handle);
    return handle;
  };
  window.cancelAnimationFrame = (handle) => {
    metrics.activeAnimationFrames.delete(handle);
    nativeCancelRaf(handle);
  };

  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    let byType = metrics.listenerRecords.get(this);
    if (!byType) {
      byType = new Map();
      metrics.listenerRecords.set(this, byType);
    }
    let listeners = byType.get(type);
    if (!listeners) {
      listeners = new Set();
      byType.set(type, listeners);
    }
    if (!listeners.has(listener)) {
      listeners.add(listener);
      metrics.listenerTotal += 1;
    }
    return nativeAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    const listeners = metrics.listenerRecords.get(this)?.get(type);
    if (listeners?.delete(listener)) metrics.listenerTotal -= 1;
    return nativeRemove.call(this, type, listener, options);
  };
  window.addEventListener("unhandledrejection", () => {
    metrics.unhandledRejections += 1;
  });

  document.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("app");
    if (!app) return;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target === app && mutation.removedNodes.length > 0 && mutation.addedNodes.length > 0) {
          metrics.rootReplacementCount += 1;
        }
      }
    }).observe(app, { childList: true });
  });
});

const consoleErrors = [];
const pageErrors = [];
const resource404s = [];
let page = null;

function attachPageEvents(target) {
  target.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  target.on("pageerror", (error) => pageErrors.push(String(error)));
  target.on("response", (response) => {
    if (response.status() === 404) resource404s.push(response.url());
  });
}

async function openPage() {
  page = await context.newPage();
  attachPageEvents(page);
  await page.goto(new URL("?natural=1&qa=1&speed=256", baseUrl).href, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".app", { state: "visible" });
}

async function state() {
  return page.evaluate(() => window.__CT_REVIEW_RUNTIME_PROBE__?.getState() ?? null);
}

async function metrics() {
  return page.evaluate(() => ({
    qa: window.__CT_QA_RUNTIME_METRICS__?.snapshot() ?? null,
    render: window.__CT_REVIEW_RUNTIME_PROBE__?.getMetrics() ?? null,
    domNodes: document.getElementsByTagName("*").length,
    scrollY: window.scrollY,
    heap: performance.memory?.usedJSHeapSize ?? null,
  }));
}

async function clickEnabled(selector) {
  // 240x Review 时间下，订单节点可在 Playwright 等待“稳定”时被下一帧替换。
  // 在同一页面任务中同步点击当前可见、可用的真实按钮，仍通过正式事件委托/命令链执行。
  return page.evaluate((candidateSelector) => {
    const candidates = [...document.querySelectorAll(candidateSelector)];
    const target = candidates.find((element) => {
      if (!(element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const disabled = element instanceof HTMLButtonElement && element.disabled;
      return !disabled && rect.width > 0 && rect.height > 0
        && style.display !== "none" && style.visibility !== "hidden";
    });
    if (!(target instanceof HTMLElement)) return false;
    target.click();
    return true;
  }, selector);
}

async function dismissDialog() {
  return clickEnabled('button[data-action="dialog_confirm"]');
}

async function reloadAndVerify(label, before) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app", { state: "visible" });
  const after = await state();
  const stableSnapshot = (value) => JSON.stringify({
    saveId: value?.saveId,
    serverCount: value?.serverCount,
    technologyIterationCount: value?.technologyIterationCount,
    coresClaimed: value?.singularity?.coresClaimed ?? [],
    completedEarthProjects: value?.stage3?.flagship?.completedIds ?? [],
    spacePlanRevealed: value?.singularity?.spacePlanRevealed ?? false,
    spacePlanStarted: value?.singularity?.spacePlanStarted ?? false,
    stage4Entered: value?.singularity?.stage4?.entered ?? false,
    stage4Completed: value?.singularity?.stage4?.completedProjectIds ?? [],
    stage5Entered: value?.singularity?.stage5?.entered ?? false,
    stage5Completed: value?.singularity?.stage5?.completedProjectIds ?? [],
    perpetual: value?.singularity?.perpetual != null,
  });
  if (stableSnapshot(after) !== stableSnapshot(before)) {
    throw new Error(`${label} refresh mismatch`);
  }
  return after;
}

async function closeAndReenter(label, before) {
  await page.close();
  await openPage();
  const after = await state();
  if (after?.saveId !== before?.saveId
    || after?.serverCount !== before?.serverCount
    || after?.technologyIterationCount !== before?.technologyIterationCount) {
    throw new Error(`${label} re-entry restore mismatch`);
  }
  return after;
}

await openPage();
const startedAt = Date.now();
const timeoutAt = startedAt + 360_000;
const milestones = [];
const milestoneNames = new Set();
const pointerClicks = [];
const pointerClickLabels = new Set();
let initialMetrics = await metrics();
let backgroundCycleDone = false;
let lastDiagnosticAt = 0;

async function recordMilestone(name, current) {
  if (milestoneNames.has(name)) return;
  milestoneNames.add(name);
  milestones.push({
    name,
    wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
    serverCount: current.serverCount,
    stage: current.stage,
    rooms: current.stage3?.machineRooms?.length ?? 0,
    iterationCount: current.technologyIterationCount,
    coresClaimed: [...(current.singularity?.coresClaimed ?? [])],
    spacePlanRevealed: current.singularity?.spacePlanRevealed ?? false,
    spacePlanStarted: current.singularity?.spacePlanStarted ?? false,
    stage4Entered: current.singularity?.stage4?.entered ?? false,
    stage5Entered: current.singularity?.stage5?.entered ?? false,
    perpetual: current.singularity?.perpetual != null,
    completedProjects: [...(current.stage3?.flagship?.completedIds ?? [])],
    metrics: await metrics(),
  });
  console.log(`[natural-flow] ${name} @ ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

async function pointerClick(selector, label) {
  // 高频 tick 可能在 pointerdown/up 之间替换节点；读取当前按钮中心后发送真实鼠标事件，
  // 由产品事件委托的坐标回退命中同一位置的新节点。这正是玩家快速点击时的正式链路。
  const point = await page.evaluate((candidateSelector) => {
    const candidates = [...document.querySelectorAll(candidateSelector)];
    const target = candidates.find((element) => {
      if (!(element instanceof HTMLButtonElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return !element.disabled && rect.width > 0 && rect.height > 0
        && style.display !== "none" && style.visibility !== "hidden";
    });
    if (!(target instanceof HTMLButtonElement)) return null;
    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  if (!pointerClickLabels.has(label)) {
    pointerClickLabels.add(label);
    pointerClicks.push(label);
  }
  return true;
}

while (Date.now() < timeoutAt) {
  const current = await state();
  if (!current) throw new Error("Review runtime probe unavailable");
  if (Date.now() - lastDiagnosticAt >= 10_000) {
    lastDiagnosticAt = Date.now();
    const availableActions = await page.evaluate(() => [...document.querySelectorAll("button[data-action]")]
      .filter((element) => element instanceof HTMLButtonElement && !element.disabled && element.offsetParent !== null)
      .map((element) => element.getAttribute("data-action"))
      .filter(Boolean));
    console.log("[natural-flow:state]", JSON.stringify({
      wall: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      iteration: current.technologyIterationCount,
      cores: current.singularity?.coresClaimed ?? [],
      stage: current.stage,
      servers: current.serverCount,
      rooms: current.stage3?.machineRooms?.length ?? 0,
      infrastructure: current.stage3?.infrastructure,
      activeProject: current.stage3?.flagship?.activeId,
      completedProjects: current.stage3?.flagship?.completedIds ?? [],
      pendingProject: current.stage3?.flagship?.pendingReward?.projectId ?? null,
      money: current.money,
      availableActions,
    }));
  }

  if (current.modelProgress) await recordMilestone("first_model", current);
  if (current.automation) await recordMilestone("automation", current);
  if (current.serverCount >= 1 && current.technologyIterationCount === 0) {
    await recordMilestone("first_server", current);
    if (!milestoneNames.has("first_server_refresh")) {
      await reloadAndVerify("first_server", current);
      milestoneNames.add("first_server_refresh");
      continue;
    }
  }
  if (current.serverCount >= 3 && current.technologyIterationCount === 0) {
    await recordMilestone("server3", current);
  }
  if (current.serverCount >= 3 && current.technologyIterationCount > 0 && current.technologyIterationCount < 3) {
    await recordMilestone(`r${current.technologyIterationCount + 1}_server3`, current);
  }
  if (current.serverCount >= 8 && current.technologyIterationCount === 0) {
    await recordMilestone("server8", current);
    if (!backgroundCycleDone) {
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      backgroundCycleDone = true;
    }
  }
  if (current.serverCount >= 8 && current.technologyIterationCount > 0 && current.technologyIterationCount < 3) {
    await recordMilestone(`r${current.technologyIterationCount + 1}_server8`, current);
  }
  if (current.stage3?.entered) {
    await recordMilestone("stage3_entered", current);
    if (!milestoneNames.has("stage3_reentry")) {
      await closeAndReenter("stage3", current);
      milestoneNames.add("stage3_reentry");
      continue;
    }
  }
  if (current.stage3?.entered && current.technologyIterationCount > 0 && current.technologyIterationCount < 3) {
    await recordMilestone(`r${current.technologyIterationCount + 1}_stage3`, current);
  }
  if (current.stage3?.flagship?.activeId === "project_r2") {
    await recordMilestone("r2_era_active", current);
    if (!milestoneNames.has("r2_era_refresh")) {
      await reloadAndVerify("r2_era", current);
      milestoneNames.add("r2_era_refresh");
      continue;
    }
  }
  if (current.stage3?.flagship?.activeId === "project_r3") {
    await recordMilestone("r3_era_active", current);
    if (!milestoneNames.has("r3_era_refresh")) {
      await reloadAndVerify("r3_era", current);
      milestoneNames.add("r3_era_refresh");
      continue;
    }
  }
  if ((current.stage3?.machineRooms?.length ?? 0) >= 2) await recordMilestone("room2", current);
  if ((current.stage3?.machineRooms?.length ?? 0) >= 3) await recordMilestone("room3", current);
  if (current.stage3?.flagship?.completedIds?.includes("project_3")) {
    await recordMilestone("final_flagship", current);
    if (!milestoneNames.has("final_flagship_refresh")) {
      await reloadAndVerify("final_flagship", current);
      milestoneNames.add("final_flagship_refresh");
      continue;
    }
  }
  if (current.technologyIterationCount >= 1) {
    await recordMilestone("iteration1", current);
    if (!milestoneNames.has("iteration1_refresh")) {
      await reloadAndVerify("iteration1", current);
      milestoneNames.add("iteration1_refresh");
      continue;
    }
  }
  if (current.technologyIterationCount >= 1 && current.serverCount >= 1) {
    await recordMilestone("second_run_first_server", current);
  }
  if ((current.singularity?.coresClaimed ?? []).includes("core_2")) {
    await recordMilestone("core2_claimed", current);
    if (!milestoneNames.has("core2_refresh")) {
      await reloadAndVerify("core2", current);
      milestoneNames.add("core2_refresh");
      continue;
    }
  }
  if (current.technologyIterationCount >= 2) {
    await recordMilestone("iteration2", current);
    if (!milestoneNames.has("iteration2_refresh")) {
      await reloadAndVerify("iteration2", current);
      milestoneNames.add("iteration2_refresh");
      continue;
    }
  }
  if ((current.singularity?.coresClaimed ?? []).includes("core_3")) {
    await recordMilestone("core3_claimed", current);
  }
  if (current.technologyIterationCount >= 3 && current.singularity?.spacePlanRevealed) {
    await recordMilestone("iteration3_space_reveal", current);
    if (!milestoneNames.has("iteration3_refresh")) {
      await reloadAndVerify("iteration3", current);
      milestoneNames.add("iteration3_refresh");
      continue;
    }
  }
  if (current.singularity?.stage4?.entered) {
    await recordMilestone("stage4_entered", current);
    if (!milestoneNames.has("stage4_refresh")) {
      await reloadAndVerify("stage4", current);
      milestoneNames.add("stage4_refresh");
      continue;
    }
  }
  if ((current.singularity?.stage4?.completedProjectIds ?? []).includes("moon_network")) {
    await recordMilestone("stage4_complete", current);
  }
  if (current.singularity?.stage5?.entered) {
    await recordMilestone("stage5_entered", current);
    if (!milestoneNames.has("stage5_refresh")) {
      await reloadAndVerify("stage5", current);
      milestoneNames.add("stage5_refresh");
      continue;
    }
  }
  if (current.singularity?.perpetual != null) {
    await recordMilestone("stage5_ending", current);
    if (!milestoneNames.has("ending_refresh")) {
      await reloadAndVerify("ending", current);
      milestoneNames.add("ending_refresh");
      continue;
    }
    break;
  }

  if (await dismissDialog()) continue;

  if ((current.singularity?.coresClaimed?.length ?? 0) < 3
    && await pointerClick('button[data-action="claim_core"]', `claim_core_${(current.singularity?.coresClaimed?.length ?? 0) + 1}`)) continue;
  if (await pointerClick('button[data-action="prestige"]', `prestige_${current.technologyIterationCount + 1}`)) continue;
  if (await pointerClick('button[data-action="start_space_plan"]', "start_space_plan")) continue;

  if (current.singularity?.stage5?.entered) {
    if (await pointerClick('button[data-action="claim_stage5_reward"]', "claim_stage5_reward")) continue;
    if (await clickEnabled('button[data-action^="buy_stage5_node:"]')) continue;
    if (await pointerClick('button[data-action="start_stage5_project"]', "start_stage5_project")) continue;
    await page.waitForTimeout(50);
    continue;
  }

  if (current.singularity?.stage4?.entered) {
    if (await pointerClick('button[data-action="claim_stage4_reward"]', "claim_stage4_reward")) continue;
    if (await pointerClick('button[data-action="start_stage5"]', "start_stage5")) continue;
    if (await clickEnabled('button[data-action^="buy_node:"]:not([data-action="buy_node:verified_nodes"])')) continue;
    if (await pointerClick('button[data-action="start_stage4_project"]', "start_stage4_project")) continue;
    await page.waitForTimeout(50);
    continue;
  }

  if (!current.modelProgress) {
    if (await clickEnabled('button[data-action="acquire_model"]')) continue;
  }

  if (!current.automation) {
    if (await clickEnabled('button[data-action="enable_rental"]')) continue;
    if (await clickEnabled('button[data-action="enable_automation"]')) continue;
    if (await clickEnabled('button[data-action^="claim_order:"]')) continue;
    if (current.activeOrders.length < 4
      && await clickEnabled('button[data-action="accept_order:o1"]')) continue;
  }

  if (current.modelResearch?.progress >= 100
    && await clickEnabled('button[data-action="research_model"]')) continue;

  if (await clickEnabled('button[data-action^="choose_blueprint:"]')) continue;

  if (!current.stage3?.entered) {
    if (await clickEnabled('button[data-action="buy_max_servers"]')) continue;
    if (current.serverCount < 8 && await clickEnabled('button[data-action="buy_server"]')) continue;
    if (await clickEnabled('button[data-action="complete_stage2_settlement"]')) continue;
    if (await clickEnabled('button[data-action="enter_stage3"]')) continue;
  } else {
    if (await clickEnabled('button[data-action="claim_flagship_reward"]')) continue;
    if (await clickEnabled('button[data-action^="commission_room:"]')) continue;
    if (await clickEnabled('button[data-action^="start_flagship:"]')) continue;

    const roomCount = current.stage3.machineRooms.length;
    const completed = current.stage3.flagship.completedIds;
    const target = roomCount <= 1
      ? { power: 3, computeCards: 3, optical: 3, storage: 2 }
      : roomCount === 2
        ? { power: 6, computeCards: 7, optical: 5, storage: 5 }
        : { power: 6, computeCards: 7, optical: 5, storage: 8 };
    for (const id of ["power", "computeCards", "optical", "storage"]) {
      if ((current.stage3.infrastructure[id] ?? 0) < target[id]
        && await clickEnabled(`button[data-action="upgrade_infra:${id}"]`)) {
        break;
      }
    }
    const refreshed = await state();
    if (refreshed.stage3.flagship.completedIds.length !== completed.length
      || refreshed.stage3.machineRooms.length !== roomCount) continue;
  }

  await page.waitForTimeout(50);
}

const finalState = await state();
const finalMetrics = await metrics();
const requiredMilestones = [
  "first_model",
  "automation",
  "first_server",
  "server3",
  "server8",
  "stage3_entered",
  "room2",
  "room3",
  "final_flagship",
  "iteration1",
  "second_run_first_server",
  "r2_era_active",
  "core2_claimed",
  "iteration2",
  "r3_era_active",
  "core3_claimed",
  "iteration3_space_reveal",
  "stage4_entered",
  "stage4_complete",
  "stage5_entered",
  "stage5_ending",
];
const missingMilestones = requiredMilestones.filter((name) => !milestoneNames.has(name));

const result = {
  generatedAt: new Date().toISOString(),
  reviewSpeed: 256,
  wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
  requiredMilestones,
  missingMilestones,
  milestones,
  refreshChecks: ["first_server", "final_flagship", "iteration1", "r2_era", "core2", "iteration2", "r3_era", "iteration3", "stage4", "stage5", "ending"],
  closeAndReenterChecks: ["stage3"],
  backgroundPauseResume: backgroundCycleDone,
  initialMetrics,
  finalMetrics,
  finalState: finalState && {
    stage: finalState.stage,
    serverCount: finalState.serverCount,
    iterationCount: finalState.technologyIterationCount,
    permanentMultiplier: finalState.permanentMultiplier,
  },
  consoleErrors,
  pageErrors,
  resource404s,
  pointerClicks,
  status: missingMilestones.length === 0
    && consoleErrors.length === 0
    && pageErrors.length === 0
    && resource404s.length === 0
    && finalMetrics?.qa?.rootReplacementCount === 0
      ? "PASS"
      : "FAIL",
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: result.status,
  wallSeconds: result.wallSeconds,
  missingMilestones,
  finalState: result.finalState,
  consoleErrors: consoleErrors.length,
  pageErrors: pageErrors.length,
  resource404s: resource404s.length,
  pointerClicks,
  initialMetrics,
  finalMetrics,
}, null, 2));

await context.close();
await browser.close();
if (result.status !== "PASS") process.exitCode = 1;
