import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputPath = resolve(process.argv[3] ?? "evidence/release/high-speed-soak.json");
const durationMs = Number(process.env.SOAK_MS ?? 600_000);
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) throw new Error("PLAYWRIGHT_MODULE is required");
const require = createRequire(import.meta.url);
const { chromium } = require(playwrightModule);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const resource404s = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("response", (response) => { if (response.status() === 404) resource404s.push(response.url()); });

await page.goto(new URL("?checkpoint=endgame_stage5_dyson_almost&qa=1&speed=256", baseUrl).href, {
  waitUntil: "domcontentloaded",
});
await page.waitForSelector(".app", { state: "visible" });

const read = () => page.evaluate(() => {
  const probe = window.__CT_REVIEW_RUNTIME_PROBE__;
  const state = probe?.getState();
  return {
    at: Date.now(),
    domNodes: document.getElementsByTagName("*").length,
    rootCount: document.querySelectorAll("#app > .app").length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    render: probe?.getMetrics() ?? null,
    revision: state?.revision ?? null,
    money: state?.money ?? null,
    stage5ActiveProject: state?.singularity?.stage5?.activeProjectId ?? null,
    stage5Completed: state?.singularity?.stage5?.completedProjectIds ?? [],
  };
});

const startedAt = Date.now();
const samples = [await read()];
while (Date.now() - startedAt < durationMs) {
  await page.waitForTimeout(Math.min(30_000, durationMs - (Date.now() - startedAt)));
  samples.push(await read());
}

const domValues = samples.map((sample) => sample.domNodes);
const result = {
  durationMs,
  speed: 256,
  normalizedGameSeconds: durationMs / 1000 * 256,
  samples,
  consoleErrors,
  pageErrors,
  resource404s,
  assertions: {
    singleRoot: samples.every((sample) => sample.rootCount === 1),
    noHorizontalOverflow: samples.every((sample) => !sample.horizontalOverflow),
    domBounded: Math.max(...domValues) - Math.min(...domValues) <= 60,
    noRootReplacement: samples.every((sample) => (sample.render?.rootReplacementCount ?? 0) === 0),
    noRuntimeErrors: consoleErrors.length === 0 && pageErrors.length === 0 && resource404s.length === 0,
  },
};
result.status = Object.values(result.assertions).every(Boolean) ? "PASS" : "FAIL";
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: result.status, durationMs, assertions: result.assertions }, null, 2));
await context.close();
await browser.close();
if (result.status !== "PASS") process.exitCode = 1;
