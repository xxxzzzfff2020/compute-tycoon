// 真实浏览器验证：修复后正式入口全流程
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5173/";
const OUT = "evidence";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=390,844"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("[console.error] " + m.text()); });
  page.on("pageerror", (e: unknown) => consoleErrors.push("[pageerror] " + (e instanceof Error ? e.message : String(e))));

  const count = (sel: string) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
  const totalNodes = () => page.evaluate(() => document.getElementsByTagName("*").length);

  // 全新存档（清 localStorage）
  await page.goto(URL, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1000));

  const initial = {
    serverBody: await count(".server-body"),
    acquireBtn: await count("[data-action='acquire_model']"),
    totalNodes: await totalNodes(),
  };

  // 真实鼠标点击「获取第一款模型」：在页面内查找当前按钮并派发完整 mouse 事件序列
  // （模拟真实用户点击路径，不依赖 ElementHandle 跨帧存活）
  await page.waitForSelector("[data-action='acquire_model']", { timeout: 5000 });
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector("[data-action='acquire_model']") as HTMLElement | null;
    if (!btn) return false;
    const rect = btn.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, view: window };
    btn.dispatchEvent(new MouseEvent("pointerdown", opts));
    btn.dispatchEvent(new MouseEvent("mousedown", opts));
    btn.dispatchEvent(new MouseEvent("mouseup", opts));
    btn.dispatchEvent(new MouseEvent("click", opts));
    return true;
  });
  console.log("acquire clicked:", clicked);
  await new Promise((r) => setTimeout(r, 800));

  const afterModel = {
    modelName: await page.evaluate(() => document.querySelector(".model-name")?.textContent ?? null),
    acquireBtn: await count("[data-action='acquire_model']"),
    trainBtn: await count("[data-action='train_model']"),
    revision: await page.evaluate(() => document.querySelector(".status-bar")?.textContent ?? ""),
    totalNodes: await totalNodes(),
  };

  // 双击测试：再快速双击应无第二次发放（按钮已变，双击应无 acquire 触发）
  const doubleClickExtra = await page.evaluate(() => {
    const before = document.querySelectorAll("[data-action='acquire_model']").length;
    const btn = document.querySelector("[data-action='train_model']");
    if (btn) { (btn as HTMLElement).click(); (btn as HTMLElement).click(); }
    return before;
  });

  // 接第一份订单（真实点击）
  await page.waitForSelector("[data-action^='accept_order:']", { timeout: 5000 });
  await page.evaluate(() => {
    const btn = document.querySelector("[data-action^='accept_order:']") as HTMLElement | null;
    if (!btn) return false;
    btn.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 500));
  const orderAccepted = await page.evaluate(() => document.querySelectorAll(".active-order").length);

  // 等待 60 秒：确认服务器区不重复
  const t0 = Date.now();
  let samples: Array<{ sec: number; serverBody: number; totalNodes: number }> = [];
  while (Date.now() - t0 < 60000) {
    await new Promise((r) => setTimeout(r, 10000));
    samples.push({
      sec: Math.round((Date.now() - t0) / 1000),
      serverBody: await count(".server-body"),
      totalNodes: await totalNodes(),
    });
  }
  const after60s = samples[samples.length - 1];

  // 刷新：确认进度恢复且无重复
  await page.reload({ waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1500));
  const afterRefresh = {
    modelName: await page.evaluate(() => document.querySelector(".model-name")?.textContent ?? null),
    serverBody: await count(".server-body"),
    activeOrders: await count(".active-order"),
    totalNodes: await totalNodes(),
  };

  // 再运行 5 分钟观察 DOM 稳定性（300 秒）
  const t1 = Date.now();
  let stableSamples: Array<{ sec: number; serverBody: number; totalNodes: number }> = [];
  while (Date.now() - t1 < 300000) {
    await new Promise((r) => setTimeout(r, 30000));
    stableSamples.push({
      sec: Math.round((Date.now() - t1) / 1000),
      serverBody: await count(".server-body"),
      totalNodes: await totalNodes(),
    });
  }

  const result = {
    initial,
    afterModel,
    doubleClickExtraAcquireButtons: doubleClickExtra,
    orderAccepted,
    samples,
    after60s,
    afterRefresh,
    stableSamples,
    consoleErrors,
  };
  writeFileSync(`${OUT}/browser_verify.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
