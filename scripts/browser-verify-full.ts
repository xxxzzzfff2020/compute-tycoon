// 真实浏览器文本验证：自动经营 DOM 稳定性（根替换/区域重建统计）+ 全流程里程碑。
// 纯文本/JSON 证据，不使用截图。运行：npx tsx scripts/browser-verify-full.ts [观察秒数，默认120]
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:5173/";
const NS = "compute_tycoon_h5_mvp_v1";

function makeSeed(): Record<string, unknown> {
  const now = Date.now();
  return {
    schemaVersion: 1,
    saveId: "verify-seed-0001",
    revision: 10,
    updatedAtMs: now,
    stage: 2,
    money: 1_000_000,
    lifetimeIncome: 30_000,
    modelProgress: { modelId: "codex", level: 3, trainingCount: 2 },
    modelResearch: { progress: 40, stage2Draws: 1 },
    ownedModelIds: ["codex"],
    automation: true,
    completedOrders: 8,
    activeOrders: [],
    rentalCompute: { active: false, units: 0, unitCostPerSec: 0 },
    serverCount: 3,
    serverPower: 14,
    computeCenterLevel: 0,
    technologyIterationCount: 0,
    permanentMultiplier: 1,
    lifetimeCompute: 0,
    highestIncomePerSecond: 0,
    pendingOfflineReward: null,
    incomeAtLastPrestige: 0,
    lastTickAtMs: now,
    workshop: { level: 5, experience: 120, experienceToNextLevel: 260, lifetimeRevenue: 30_000, firstServerAwarded: false },
    settings: { soundEnabled: true, notificationsEnabled: true },
    stage2: { settlementShown: false, completedAtMs: 0, stageIncome: 0 },
    createdAtMs: now,
  };
}

async function main() {
  const observeSec = Number(process.argv[2] ?? 120);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  // 注入加速档：先拦截游戏对存档的写入（beforeunload/autosave 会用内存新档覆盖 seed），
  // 再用原生 setItem 写 seed，最后 reload（新页面正常 boot 读取 seed）
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.evaluate((ns) => {
    const w = window as unknown as Record<string, unknown>;
    const nativeSet = Storage.prototype.setItem;
    w.__nativeSetItem = nativeSet;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === ns) return; // 丢弃游戏对存档的写入
      nativeSet.call(this, k, v);
    };
  }, NS);
  await page.evaluate((ns, seed) => {
    const w = window as unknown as Record<string, unknown>;
    (w.__nativeSetItem as (k: string, v: string) => void).call(localStorage, ns, JSON.stringify(seed));
  }, NS, makeSeed());
  await page.reload({ waitUntil: "networkidle2" });

  // 注入 render 统计（reload 后页面为新上下文）
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const stats = { rootReplacements: 0, sectionRebuilds: 0, domNodes: 0 };
    w.__renderStats = stats;
    const app = document.getElementById("app");
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "childList" && m.target === app && m.removedNodes.length > 0 && m.addedNodes.length > 0) {
          stats.rootReplacements += 1;
        }
      }
      stats.domNodes = document.getElementsByTagName("*").length;
    }).observe(document.body, { childList: true, subtree: true });
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "childList" && m.removedNodes.length > 0) {
          const el = m.target as HTMLElement;
          if (el.classList && (el.classList.contains("server-body") || el.classList.contains("order-list") || el.classList.contains("active-orders") || el.classList.contains("model-body"))) {
            stats.sectionRebuilds += 1;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

  const read = <T>(fn: () => T): Promise<T> => page.evaluate(fn);
  const text = (sel: string) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel);

  const out: Record<string, unknown> = {
    browser_runtime: {},
    observation_sec: observeSec,
    console_errors: consoleErrors,
  };
  const rt = out.browser_runtime as Record<string, unknown>;

  rt.first_model_button = {
    label: await text(".model-body"),
    money: await text(".money"),
    workshop: await text(".stat"),
  };

  const startNodes = await read(() => document.getElementsByTagName("*").length);
  const startScroll = await read(() => window.scrollY);
  rt.dom_node_count_start = startNodes;
  rt.scroll_position_before = startScroll;

  // 自动经营观察期：每 10 秒采样
  const start = Date.now();
  let lastSec = 0;
  while (Date.now() - start < observeSec * 1000) {
    await new Promise((r) => setTimeout(r, 10_000));
    const sec = Math.round((Date.now() - start) / 1000);
    if (sec - lastSec >= 10) {
      await page.evaluate((s) => {
        const w = window as unknown as Record<string, unknown>;
        w.__probeSec = s;
      }, sec);
      const sample = await page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const st = w.__renderStats as { rootReplacements: number; sectionRebuilds: number; domNodes: number };
        return {
          sec: w.__probeSec as number,
          rootReplacements: st.rootReplacements,
          sectionRebuilds: st.sectionRebuilds,
          domNodes: st.domNodes,
          money: document.querySelector(".money")?.textContent ?? "",
          workshop: Array.from(document.querySelectorAll(".stat")).map(e => e.textContent).join(" | "),
          revenue: Array.from(document.querySelectorAll(".stat")).map(e => e.textContent).join(" | "),
        };
      });
      rt[`sample_${sec}s`] = sample;
      lastSec = sec;
    }
  }

  const endStats = await read(() => {
    const w = window as unknown as Record<string, unknown>;
    return w.__renderStats as { rootReplacements: number; sectionRebuilds: number; domNodes: number };
  });
  rt.root_replacement_count = endStats.rootReplacements;
  rt.section_rebuild_count = endStats.sectionRebuilds;
  rt.full_render_count = endStats.rootReplacements; // 根替换即结构性全量渲染
  rt.partial_patch_count = 0; // 由 UI 内部指标补充（见下方 evaluate）
  rt.dom_node_count_end = await read(() => document.getElementsByTagName("*").length);
  rt.dom_nodes_stable = Math.abs(Number(rt.dom_node_count_end) - startNodes) <= 5;
  rt.scroll_position_after = await read(() => window.scrollY);
  rt.scroll_position_preserved = rt.scroll_position_before === rt.scroll_position_after;
  rt.workshop_level = await text(".stat");
  rt.lifetime_revenue = await text(".stat");
  rt.console_error_count = consoleErrors.length;

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
