import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputPath = resolve(process.argv[3] ?? "evidence/review/browser-matrix.json");
const screenshotDirectory = resolve("evidence/review/screenshots/matrix");
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) {
  throw new Error("PLAYWRIGHT_MODULE must point to an installed Playwright package");
}

const require = createRequire(import.meta.url);
const { chromium, firefox, webkit } = require(playwrightModule);

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

const scenarios = [
  { id: "review_home", url: "", ready: ".review-home" },
  { id: "new_game", url: "?checkpoint=new_game", ready: ".app" },
  {
    id: "manual_order",
    url: "?checkpoint=new_game",
    ready: ".app",
    async prepare(page) {
      const acquire = page.locator('button[data-action="acquire_model"]');
      if (await acquire.count()) await acquire.click();
      const order = page.locator('button[data-action="accept_order:o1"]');
      if (await order.count()) await order.click();
    },
  },
  { id: "automation", url: "?checkpoint=automation_unlocked", ready: ".app" },
  { id: "first_server", url: "?checkpoint=first_server_almost", ready: ".app" },
  { id: "server3_blueprint", url: "?checkpoint=server3_blueprint", ready: ".app" },
  { id: "server8_throughput", url: "?checkpoint=server8_high_throughput", ready: ".app" },
  { id: "stage3_infrastructure", url: "?checkpoint=stage3_entry", ready: ".app" },
  { id: "room_commission", url: "?checkpoint=room2_almost", ready: ".app" },
  { id: "flagship", url: "?checkpoint=room3_final_flagship", ready: ".app" },
  {
    id: "archive",
    url: "?checkpoint=iteration_ready",
    ready: ".app",
    async prepare(page) {
      const honor = page.locator('button[data-command="page:honor"]');
      if (await honor.count()) await honor.click();
      await page.waitForSelector(".app-page-honor:not(.hidden) #section-archive:not(.hidden)");
    },
  },
  { id: "iteration", url: "?checkpoint=iteration_ready", ready: ".app" },
  { id: "second_run", url: "?checkpoint=second_run_acceleration", ready: ".app" },
  { id: "stage4_lunar", url: "?checkpoint=endgame_stage4_mid", ready: ".app" },
  { id: "stage5_dyson", url: "?checkpoint=endgame_stage5_dyson_almost", ready: ".app" },
  { id: "dyson_terminal", url: "?checkpoint=endgame_perpetual", ready: ".app" },
];

const allBrowserTypes = { chromium, firefox, webkit };
const requestedEngines = (process.env.BROWSER_ENGINES ?? "chromium,firefox,webkit")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value in allBrowserTypes);
const browserTypes = Object.fromEntries(requestedEngines.map((name) => [name, allBrowserTypes[name]]));
const result = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  engines: {},
  totals: {
    cases: 0,
    passed: 0,
    failed: 0,
    consoleErrors: 0,
    pageErrors: 0,
    unhandledRejections: 0,
    resource404s: 0,
  },
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await mkdir(screenshotDirectory, { recursive: true });

for (const [engineName, browserType] of Object.entries(browserTypes)) {
  const browser = await browserType.launch({ headless: true });
  const engineResult = { status: "PASS", cases: [], consoleErrors: [], pageErrors: [], resource404s: [] };
  result.engines[engineName] = engineResult;

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") engineResult.consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => engineResult.pageErrors.push(String(error)));
      page.on("response", (response) => {
        if (response.status() === 404) engineResult.resource404s.push(response.url());
      });

      for (const scenario of scenarios) {
        const started = Date.now();
        let error = null;
        let audit = null;
        try {
          await page.goto(new URL(scenario.url, baseUrl).href, { waitUntil: "domcontentloaded" });
          await page.waitForSelector(scenario.ready, { state: "visible" });
          if (scenario.prepare) await scenario.prepare(page);
          // 终局庆典有1秒入场动画；等待稳定态后再测触控尺寸和截图，
          // 避免把动画中的缩放/透明度误判为正式布局。
          if (scenario.id === "dyson_terminal") await page.waitForTimeout(1_100);
          audit = await page.evaluate(() => {
            const visible = (element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
            };
            const smallTargets = [...document.querySelectorAll("button,a,input,select,textarea")]
              .filter(visible)
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  tag: element.tagName,
                  text: (element.textContent ?? "").trim().slice(0, 60),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                };
              })
              .filter((entry) => entry.width < 44 || entry.height < 44);
            const clippedText = [...document.querySelectorAll("h1,h2,p,span,button,a,div")]
              .filter(visible)
              .filter((element) => {
                const style = getComputedStyle(element);
                if (style.textOverflow === "ellipsis") return false;
                return style.overflow !== "visible"
                  && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1);
              })
              .slice(0, 20)
              .map((element) => ({
                tag: element.tagName,
                className: String(element.className).slice(0, 80),
                text: (element.textContent ?? "").trim().slice(0, 80),
              }));
            const dialog = document.querySelector(".dialog-overlay");
            const toolbar = document.querySelector(".toolbar");
            const toolbarRect = toolbar?.getBoundingClientRect();
            const probe = window.__CT_REVIEW_RUNTIME_PROBE__;
            return {
              title: document.title,
              checkpoint: document.body.dataset.reviewCheckpoint ?? null,
              horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
              rootCount: document.querySelectorAll("#app > .app").length,
              smallTargets,
              clippedText,
              dialogOutsideViewport: dialog
                ? (() => {
                    const rect = dialog.getBoundingClientRect();
                    return rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight;
                  })()
                : false,
              toolbarOutsideViewport: toolbarRect
                ? toolbarRect.left < 0 || toolbarRect.right > innerWidth || toolbarRect.bottom > innerHeight + 1
                : false,
              fullRenderCount: probe?.getMetrics().fullRenderCount ?? null,
              rootReplacementCount: probe?.getMetrics().rootReplacementCount ?? null,
              activeRuntime: probe ? 1 : 0,
            };
          });

          const failed = audit.horizontalOverflow
            || audit.rootCount > 1
            || audit.smallTargets.length > 0
            || audit.clippedText.length > 0
            || audit.dialogOutsideViewport
            || audit.toolbarOutsideViewport
            || (scenario.id !== "review_home" && audit.activeRuntime !== 1)
            || (audit.rootReplacementCount ?? 0) !== 0;
          if (failed) error = "layout_or_runtime_contract_failed";

          if (viewport.width === 390 && viewport.height === 844) {
            await page.screenshot({
              path: resolve(screenshotDirectory, `${engineName}-${scenario.id}-390x844.png`),
              fullPage: false,
            });
          }
        } catch (caught) {
          error = String(caught);
        }

        const caseResult = {
          scenario: scenario.id,
          viewport: `${viewport.width}x${viewport.height}`,
          status: error ? "FAIL" : "PASS",
          elapsedMs: Date.now() - started,
          error,
          audit,
        };
        engineResult.cases.push(caseResult);
        result.totals.cases += 1;
        if (error) {
          result.totals.failed += 1;
          engineResult.status = "FAIL";
        } else {
          result.totals.passed += 1;
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  result.totals.consoleErrors += engineResult.consoleErrors.length;
  result.totals.pageErrors += engineResult.pageErrors.length;
  result.totals.resource404s += engineResult.resource404s.length;
  if (engineResult.consoleErrors.length || engineResult.pageErrors.length || engineResult.resource404s.length) {
    engineResult.status = "FAIL";
  }
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ totals: result.totals, engines: Object.fromEntries(
  Object.entries(result.engines).map(([name, value]) => [name, value.status]),
) }, null, 2));

if (result.totals.failed
  || result.totals.consoleErrors
  || result.totals.pageErrors
  || result.totals.resource404s) {
  process.exitCode = 1;
}
