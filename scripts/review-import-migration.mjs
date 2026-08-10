import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputPath = resolve(process.argv[3] ?? "evidence/review/p0-import-migration.json");
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) throw new Error("PLAYWRIGHT_MODULE is required");

const require = createRequire(import.meta.url);
const { chromium } = require(playwrightModule);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(String(error)));

function urlFor(query) {
  return new URL(query, baseUrl).toString();
}

async function resetCheckpoint() {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "重置当前检查点", exact: true }).click(),
  ]);
  await page.waitForTimeout(100);
}

try {
  // 使用真实 Review R2 起点导出合法当前 schema，再仅移除终局字段模拟旧 R1 正式档。
  await page.goto(urlFor("?checkpoint=endgame_r2_start"), { waitUntil: "domcontentloaded" });
  await resetCheckpoint();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出存档", exact: true }).click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error("export download path unavailable");
  const legacy = JSON.parse(await readFile(downloadedPath, "utf8"));
  legacy.saveId = "legacy-owner-r1-import";
  legacy.technologyIterationCount = 1;
  legacy.permanentMultiplier = 2;
  legacy.singularity = null;
  const fixture = Buffer.from(JSON.stringify(legacy), "utf8");

  await page.goto(urlFor("?natural=1"), { waitUntil: "domcontentloaded" });
  await resetCheckpoint();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "导入存档", exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "legacy-owner-r1-import.json",
    mimeType: "application/json",
    buffer: fixture,
  });
  await page.waitForFunction(() => document.body.innerText.includes("奇点核心 1/3"));

  const afterImport = await page.evaluate(() => window.__CT_REVIEW_RUNTIME_PROBE__?.getState());
  const afterImportText = await page.locator("body").innerText();
  if (!afterImport) throw new Error("review probe unavailable after import");
  if (afterImport.technologyIterationCount !== 1) throw new Error("iteration history not restored");
  if (JSON.stringify(afterImport.singularity?.coresClaimed) !== JSON.stringify(["core_1"])) {
    throw new Error("core_1 history not restored");
  }
  if (afterImport.money < legacy.money || afterImport.lifetimeIncome < legacy.lifetimeIncome) {
    throw new Error("economic values decreased during import migration");
  }
  if (afterImportText.includes("后续技术迭代尚未开放")) {
    throw new Error("obsolete single-iteration terminal copy remains visible");
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("奇点核心 1/3"));
  const afterRefresh = await page.evaluate(() => window.__CT_REVIEW_RUNTIME_PROBE__?.getState());
  if (!afterRefresh || afterRefresh.saveId !== "legacy-owner-r1-import") {
    throw new Error("natural review refresh overwrote imported save identity");
  }
  if (JSON.stringify(afterRefresh.singularity?.coresClaimed) !== JSON.stringify(["core_1"])) {
    throw new Error("refresh lost imported core history");
  }

  // 同一旧档再次导入仍只保留一枚历史核心，不重复发奖。
  const secondChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "导入存档", exact: true }).click();
  const secondChooser = await secondChooserPromise;
  await secondChooser.setFiles({
    name: "legacy-owner-r1-import.json",
    mimeType: "application/json",
    buffer: fixture,
  });
  await page.waitForFunction(() => document.body.innerText.includes("奇点核心 1/3"));
  const afterSecondImport = await page.evaluate(() => window.__CT_REVIEW_RUNTIME_PROBE__?.getState());
  if (!afterSecondImport) throw new Error("review probe unavailable after repeated import");
  if (JSON.stringify(afterSecondImport.singularity?.coresClaimed) !== JSON.stringify(["core_1"])) {
    throw new Error("repeated import duplicated core history");
  }
  if (afterSecondImport.money < legacy.money || afterSecondImport.lifetimeIncome < legacy.lifetimeIncome) {
    throw new Error("repeated import reduced economic values");
  }

  const result = {
    status: "PASS",
    route: "?natural=1",
    fileChooserImport: true,
    legacyIterationCount: legacy.technologyIterationCount,
    restoredCores: afterSecondImport.singularity?.coresClaimed ?? [],
    economicValuesNotDecreased: afterSecondImport.money >= legacy.money
      && afterSecondImport.lifetimeIncome >= legacy.lifetimeIncome,
    obsoleteTerminalCopyVisible: (await page.locator("body").innerText()).includes("后续技术迭代尚未开放"),
    refreshPreservedImportedSaveId: afterRefresh.saveId === "legacy-owner-r1-import",
    repeatedImportIdempotent: true,
    consoleErrors,
    pageErrors,
  };
  if (consoleErrors.length || pageErrors.length) throw new Error("browser errors detected");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser.close();
}
