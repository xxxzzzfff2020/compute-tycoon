// UI 渲染：只读 ViewModel → DOM。命令经 onCommand 回调，UI 不直接改状态。
// 渲染合同（v2 局部渲染）：
// - 静态结构只创建一次，保存稳定节点引用；
// - 高频字段（资金/收入/算力/经验/进度条/按钮禁用态）用 textContent/style 局部更新；
// - 每个 section 有结构签名（结构性事件才变化），签名不变时只 patch，不重建 DOM；
// - 普通订单完成、自动领取、每秒 Tick 不替换任何 section、不重建根节点；
// - 结构性事件（获取模型/解锁自动化/获得首服/阶段切换/技术迭代）才重建对应 section。
import type { ViewModel } from "../economy/viewmodel";
import type { GrowthFeedbackEvent } from "../economy/feel";
import type { ArchitectureReceipt, CommandResult, ResearchReceipt } from "../app/session";
import { AUTOMATION_ORDER_CAP } from "../data/content";
import { loadAudioPreferences, saveAudioPreferences } from "../audio/game-audio";
import { getLocale, t } from "../i18n";
import {
  contentGameIcon,
  createGameIcon,
  modelGameIcon,
  orderGameIcon,
  setIconText,
  type GameIconName,
} from "./icons";
import { createFinalFeelController } from "./final-feel";

export type CommandHandler = (command: string, payload?: unknown) => CommandResult;
type AppPage = "business" | "honor" | "sponsor" | "menu";

export interface RenderMetrics {
  fullRenderCount: number;
  partialPatchCount: number;
  orderCompletionCount: number;
  rootReplacementCount: number;
  feelStableNodeCount: number;
  feelParticleNodeCount: number;
  feelFeedbackCount: number;
  feelActionEdgeCount: number;
}

export interface PlatformPresentationStatus {
  cloud: string;
  leaderboard: string;
  platformReview: boolean;
  runtimeSpeed?: number;
}

export interface AppShell {
  render(vm: ViewModel): void;
  setCommandHandler(handler: CommandHandler): void;
  showToast(text: string): void;
  confirmDialog(options: { title: string; body: string; confirmText: string; onConfirm: () => void }): void;
  getElement(): HTMLElement;
  destroy(): void;
  getMetrics(): RenderMetrics;
  resetMetrics(): void;
  setPlatformStatus(status: PlatformPresentationStatus): void;
  showGrowthFeedback(event: GrowthFeedbackEvent): void;
  setVisualPaused(paused: boolean): void;
  /** 统计：累计订单完成数(由 session 回调驱动) */
  incrementOrderCompletion(by: number): void;
}

const hasText = (node: Node, text: string): boolean =>
  node instanceof HTMLElement && node.textContent !== null && node.textContent.includes(text);

/** VM 字段可能携带 i18n key；统一转显示文本(未知 key 原样返回)。 */
const tr = (value: string | null | undefined): string =>
  value == null || value === "" ? "" : t(value);

/** 迭代列表项：支持 "key" 或 "key:param"(动态数值追加显示)。 */
const prestigeItemText = (item: string): string => {
  const [key, param] = item.split(":");
  if (param === undefined) return t(key);
  return `${t(key)} → ${param}`;
};

export function createAppShell(container: HTMLElement): AppShell {
  const root = document.createElement("div");
  root.className = "app";
  container.appendChild(root);

  const metrics: RenderMetrics = {
    fullRenderCount: 0,
    partialPatchCount: 0,
    orderCompletionCount: 0,
    rootReplacementCount: 0,
    feelStableNodeCount: 0,
    feelParticleNodeCount: 0,
    feelFeedbackCount: 0,
    feelActionEdgeCount: 0,
  };

  let handler: CommandHandler = () => ({ ok: false, error: "no_handler" });
  let toastEl: HTMLDivElement | null = null;
  let toastTimer: number | null = null;

  const el = (tag: string, cls: string, text?: string): HTMLElement => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const section = (id: string, title: string, hidden = false): HTMLElement => {
    const s = el("section", "section" + (hidden ? " hidden" : ""));
    s.id = id;
    const h = el("h2", "section-title", title);
    const body = el("div", "section-body");
    s.append(h, body);
    return s;
  };

  // ---------- 静态结构（只创建一次） ----------
  const header = el("header", "header");
  const stageLineEl = el("div", "stage-line");
  const stageEl = el("div", "stage-badge");
  const singularityBadgeEl = el("div", "singularity-badge");
  singularityBadgeEl.hidden = true;
  const iterationBadgeEl = el("div", "iteration-badge");
  iterationBadgeEl.hidden = true;
  const moneyEl = el("div", "money", t("app.currentMoney", { money: "0" }));
  const statsEl = el("div", "stats");
  const incomeEl = el("span", "stat", t("app.incomePerSec", { value: "0" }));
  const computeEl = el("span", "stat", t("app.compute", { value: "0" }));
  const multEl = el("span", "stat", t("app.multiplier", { value: "1" }));
  const architectureEl = el("span", "stat stat-architecture", t("app.architecture", { unlocked: "0", total: "3", mult: "1.00", next: t("app.architectureNext", { count: "3", name: "" }) }));
  const workshopEl = el("span", "stat", t("app.workshop", { level: "1", exp: "0", next: "100" }));
  const revenueEl = el("span", "stat", t("app.revenue", { value: "0" }));
  incomeEl.classList.add("stat-income");
  computeEl.classList.add("stat-compute");
  multEl.classList.add("stat-multiplier");
  workshopEl.classList.add("stat-workshop");
  revenueEl.classList.add("stat-revenue");
  stageLineEl.append(stageEl, singularityBadgeEl);
  statsEl.append(incomeEl, computeEl, multEl, architectureEl, workshopEl, revenueEl);
  header.append(stageLineEl, iterationBadgeEl, moneyEl, statsEl);
  root.appendChild(header);

  const main = el("main", "main");
  root.appendChild(main);
  const businessPage = el("div", "app-page app-page-business");
  businessPage.dataset.page = "business";
  const honorPage = el("div", "app-page app-page-honor hidden");
  honorPage.dataset.page = "honor";
  const sponsorPage = el("div", "app-page app-page-sponsor hidden");
  sponsorPage.dataset.page = "sponsor";
  const menuPage = el("div", "app-page app-page-menu hidden");
  menuPage.dataset.page = "menu";
  main.append(businessPage, honorPage, sponsorPage, menuPage);

  // Level A：固定DOM算力引擎。这里只展示真实ViewModel，不创建第二套经济入口。
  const finalFeel = createFinalFeelController(root, moneyEl);
  businessPage.appendChild(finalFeel.element);

  const modelSection = section("section-model", t("section.model"));
  const modelBody = modelSection.querySelector(".section-body") as HTMLElement;
  const modelCard = el("div", "card");
  const modelNameEl = el("div", "model-name", t("model.notAcquired"));
  const modelStatsEl = el("div", "model-stats", t("model.stats", { compute: "0", cost: "-" }));
  const modelActionsEl = el("div", "model-actions");
  const trainPreviewEl = el("div", "train-preview", "");
  const researchProgressEl = el("div", "research-progress", "");
  const researchReceiptEl = el("div", "research-receipt", "");
  researchReceiptEl.hidden = true;
  modelCard.append(modelNameEl, modelStatsEl, modelActionsEl, trainPreviewEl, researchProgressEl, researchReceiptEl);
  modelBody.appendChild(modelCard);
  businessPage.appendChild(modelSection);

  const orderSection = section("section-orders", t("section.orders"), true);
  const orderBody = orderSection.querySelector(".section-body") as HTMLElement;
  const orderListEl = el("div", "order-list");
  const activeListEl = el("div", "active-orders");
  const orderSummaryEl = el("div", "order-summary", "");
  const orderHintEl = el("div", "hint", "");
  orderBody.append(orderSummaryEl, orderListEl, activeListEl, orderHintEl);
  businessPage.appendChild(orderSection);

  const serverSection = section("section-server", t("section.server"), true);
  const serverBody = serverSection.querySelector(".section-body") as HTMLElement;
  const srvBody = el("div", "server-body");
  const fleetEl = el("div", "fleet", "");
  const serverProgressEl = el("div", "server-progress", "");
  const serverActionsEl = el("div", "server-actions");
  srvBody.append(fleetEl, serverProgressEl, serverActionsEl);
  serverBody.appendChild(srvBody);
  businessPage.appendChild(serverSection);

  const centerSection = section("section-center", t("section.center"), true);
  const centerBody = centerSection.querySelector(".section-body") as HTMLElement;
  const centerInfoEl = el("div", "center-info", "");
  const centerActionsEl = el("div", "center-actions");
  centerBody.append(centerInfoEl, centerActionsEl);
  businessPage.appendChild(centerSection);

  const stage3Section = section("section-stage3", t("section.stage3"), true);
  const stage3Body = stage3Section.querySelector(".section-body") as HTMLElement;
  const stage3EntryEl = el("div", "stage3-entry", "");
  const infraGridEl = el("div", "infra-grid");
  const bottleneckEl = el("div", "bottleneck-card", "");
  const roomListEl = el("div", "room-list");
  const flagshipListEl = el("div", "flagship-list");
  const flagshipActiveEl = el("div", "flagship-active", "");
  const commissionBonusEl = el("div", "commission-bonus", "");
  stage3Body.append(stage3EntryEl, commissionBonusEl, bottleneckEl, infraGridEl, roomListEl, flagshipActiveEl, flagshipListEl);
  businessPage.appendChild(stage3Section);

  // CARD-02 Stage 4：地月算力网（隔离终局档专属；进入后取代地球经营区）
  const stage4Section = section("section-stage4", t("section.stage4"), true);
  const stage4Body = stage4Section.querySelector(".section-body") as HTMLElement;
  const stage4EntryEl = el("div", "stage4-entry", "");
  const stage4NodesEl = el("div", "stage4-nodes", "");
  const stage4ProjectEl = el("div", "stage4-project", "");
  stage4Body.append(stage4EntryEl, stage4NodesEl, stage4ProjectEl);
  businessPage.appendChild(stage4Section);

  // CARD-03 Stage 5：戴森算力纪元（进入后取代 Stage 4 经营区）
  const stage5Section = section("section-stage5", t("section.stage5"), true);
  const stage5Body = stage5Section.querySelector(".section-body") as HTMLElement;
  const stage5EntryEl = el("div", "stage5-entry", "");
  const stage5NodesEl = el("div", "stage5-nodes", "");
  const stage5ProjectEl = el("div", "stage5-project", "");
  const stage5StoryEl = el("div", "stage5-story", "");
  stage5Body.append(stage5EntryEl, stage5NodesEl, stage5ProjectEl, stage5StoryEl);
  businessPage.appendChild(stage5Section);

  // CARD-03 主线结局：戴森算力球完成全屏反馈（只触发一次；可关闭）
  const storyCompleteOverlay = el("div", "story-complete-overlay");
  const storyCompleteCard = el("div", "story-complete-card");
  const storyCompleteCloseEl = el("button", "story-complete-close", t("action.close"));
  storyCompleteCloseEl.setAttribute("data-command", "close_story_complete");
  const storyCompleteVisualEl = document.createElement("img");
  storyCompleteVisualEl.className = "story-complete-visual";
  storyCompleteVisualEl.dataset.src = `${import.meta.env.BASE_URL}assets/visuals/dyson-compute-sphere-keyart-v1.jpg`;
  storyCompleteVisualEl.alt = t("story.visualAlt");
  storyCompleteVisualEl.loading = "lazy";
  storyCompleteVisualEl.decoding = "async";
  const storyCompleteTitleEl = el("div", "story-complete-title", "");
  const storyCompleteBodyEl = el("div", "story-complete-body", "");
  const storyCompleteActionsEl = el("div", "story-complete-actions");
  storyCompleteCard.append(storyCompleteCloseEl, storyCompleteVisualEl, storyCompleteTitleEl, storyCompleteBodyEl, storyCompleteActionsEl);
  storyCompleteOverlay.append(storyCompleteCard);
  storyCompleteOverlay.hidden = true;
  root.appendChild(storyCompleteOverlay);

  // CARD-02 惊喜事件：地外算力计划全屏揭示（只触发一次；可关闭后从档案馆重新打开）
  const spaceRevealOverlay = el("div", "space-reveal-overlay");
  const spaceRevealCard = el("div", "space-reveal-card");
  const spaceRevealCloseEl = el("button", "space-reveal-close", t("action.close"));
  spaceRevealCloseEl.setAttribute("data-command", "close_space_reveal");
  const spaceRevealTitleEl = el("div", "space-reveal-title", "");
  const spaceRevealBodyEl = el("div", "space-reveal-body", "");
  const spaceRevealActionsEl = el("div", "space-reveal-actions");
  spaceRevealCard.append(spaceRevealCloseEl, spaceRevealTitleEl, spaceRevealBodyEl, spaceRevealActionsEl);
  spaceRevealOverlay.append(spaceRevealCard);
  spaceRevealOverlay.hidden = true;
  root.appendChild(spaceRevealOverlay);

  const archiveSection = section("section-archive", t("section.archive"));
  const archiveBody = archiveSection.querySelector(".section-body") as HTMLElement;
  const archiveTabsEl = el("div", "archive-tabs");
  const archivePanelEl = el("div", "archive-panel", "");
  archiveBody.append(archiveTabsEl, archivePanelEl);
  honorPage.appendChild(archiveSection);

  const prestigeSection = section("section-prestige", t("section.prestige"), true);
  const prestigeBody = prestigeSection.querySelector(".section-body") as HTMLElement;
  const prestigeInfoEl = el("div", "prestige-info", "");
  const prestigeListEl = el("ul", "prestige-list");
  const prestigeActionsEl = el("div", "prestige-actions");
  prestigeBody.append(prestigeInfoEl, prestigeListEl, prestigeActionsEl);
  businessPage.appendChild(prestigeSection);

  const sponsorSection = section("section-sponsor", t("section.sponsor"));
  const sponsorBody = sponsorSection.querySelector(".section-body") as HTMLElement;
  const sponsorIntroEl = el("div", "sponsor-intro", t("sponsor.intro"));
  const offlineSponsorCardEl = el("div", "sponsor-card");
  const incomeSponsorCardEl = el("div", "sponsor-card");
  sponsorBody.append(sponsorIntroEl, offlineSponsorCardEl, incomeSponsorCardEl);
  sponsorPage.appendChild(sponsorSection);

  const toolbar = el("div", "toolbar");
  const toolbarItems: Array<{ page: AppPage; label: string; icon: GameIconName }> = [
    { page: "business", label: t("page.business"), icon: "business" },
    { page: "honor", label: t("page.honor"), icon: "honor" },
    { page: "sponsor", label: t("page.sponsor"), icon: "sponsor" },
    { page: "menu", label: t("page.menu"), icon: "menu" },
  ];
  for (const item of toolbarItems) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn" + (item.page === "business" ? " active" : "");
    button.dataset.command = `page:${item.page}`;
    button.setAttribute("aria-label", item.label);
    setIconText(button, item.icon, item.label);
    toolbar.appendChild(button);
  }
  root.appendChild(toolbar);

  const menuCard = el("div", "game-menu-card");
  menuCard.innerHTML = `
    <div class="game-menu-heading"><strong>${t("menu.title")}</strong></div>
    <div class="game-menu-group"><span>${t("menu.sound")}</span><button type="button" class="btn" data-command="toggle_bgm"></button><button type="button" class="btn" data-command="toggle_sfx"></button></div>
    <label class="game-menu-volume">${t("menu.volume")} <input type="range" min="0" max="100" step="5" aria-label="${t("menu.volume")}"></label>
    <div class="game-menu-group"><span>${t("menu.language")}</span><button type="button" class="btn" data-command="set_locale:zh-CN">${t("menu.languageZh")}</button><button type="button" class="btn" data-command="set_locale:en-US">${t("menu.languageEn")}</button></div>
    <div class="game-menu-status">${t("menu.statusLocal")}</div>
    <div class="game-menu-group"><span>${t("menu.cloud")}</span><button type="button" class="btn" data-command="cloud_upload">${t("menu.cloudUpload")}</button><button type="button" class="btn" data-command="cloud_restore">${t("menu.cloudRestore")}</button></div>
    <div class="game-menu-group"><span>${t("menu.data")}</span><button type="button" class="btn btn-danger" data-command="reset">${t("menu.reset")}</button></div>
    <div class="game-menu-debug platform-review-debug" hidden>
      <strong>${t("menu.debugTitle")}</strong>
      <label class="game-menu-speed">${t("menu.debugSpeed")}
        <select aria-label="${t("menu.debugSpeed")}">
          <option value="1">1×</option><option value="2">2×</option><option value="4">4×</option>
          <option value="8">8×</option><option value="16">16×</option><option value="32">32×</option>
          <option value="64">64×</option><option value="128">128×</option><option value="256">256×</option>
        </select>
      </label>
    </div>
    <div class="review-tools-host" hidden aria-label="${t("menu.debugTitle")}"></div>`;
  menuPage.appendChild(menuCard);
  const menuStatusEl = menuCard.querySelector(".game-menu-status") as HTMLElement;
  let platformStatus: PlatformPresentationStatus = {
    cloud: t("menu.statusCloud"),
    leaderboard: t("menu.leaderboard"),
    platformReview: false,
  };
  const volumeInput = menuCard.querySelector("input[type='range']") as HTMLInputElement;
  const platformReviewDebugEl = menuCard.querySelector(".platform-review-debug") as HTMLElement;
  const speedSelect = menuCard.querySelector(".game-menu-speed select") as HTMLSelectElement;
  const refreshAudioMenu = () => {
    const preferences = loadAudioPreferences();
    const bgm = menuCard.querySelector("button[data-command='toggle_bgm']") as HTMLButtonElement;
    const sfx = menuCard.querySelector("button[data-command='toggle_sfx']") as HTMLButtonElement;
    bgm.textContent = preferences.bgmEnabled ? t("menu.bgmOn") : t("menu.bgmOff");
    sfx.textContent = preferences.sfxEnabled ? t("menu.sfxOn") : t("menu.sfxOff");
    volumeInput.value = String(Math.round(preferences.volume * 100));
  };
  refreshAudioMenu();
  volumeInput.addEventListener("input", () => {
    const preferences = loadAudioPreferences();
    saveAudioPreferences({ ...preferences, volume: Number(volumeInput.value) / 100 });
  });
  speedSelect.addEventListener("change", () => {
    const speed = Number(speedSelect.value);
    const result = handler("set_debug_speed", { speed });
    if (result.ok) {
      showToast(t("menu.speedChanged", { speed }));
      return;
    }
    speedSelect.value = String(platformStatus.runtimeSpeed ?? 1);
    showToast(t("menu.speedForbidden"));
  });

  // ---------- 事件委托（root 捕获，一次绑定） ----------
  // 注意：render 每帧 replaceChildren 会替换按钮节点；真实浏览器中物理点击的
  // mousedown/mouseup 可能落在不同节点，click 事件目标会退化为公共祖先。
  // 因此除了 target.closest，还要按点击坐标回退查找 [data-command]/[data-action]。
  let currentPage: AppPage = "business";
  const setPlatformStatus = (status: PlatformPresentationStatus): void => {
    platformStatus = { ...status };
    setText(menuStatusEl,
      `${status.platformReview ? t("menu.deviceBuild") + " · " : ""}${t("menu.statusLocal")}\n${t("menu.cloudBackup")}${t("common.colon")}${tr(status.cloud)}\n${t("menu.leaderboardLabel")}${t("common.colon")}${tr(status.leaderboard)}`);
    platformReviewDebugEl.hidden = !status.platformReview;
    speedSelect.value = String(status.runtimeSpeed ?? 1);
    if (currentPage === "honor" && archiveTab === "hall" && lastVm) {
      sigArchive = "";
      rebuildArchive(lastVm);
      sigArchive = sigForArchive(lastVm);
    }
  };
  const setCurrentPage = (page: AppPage): void => {
    currentPage = page;
    for (const candidate of [businessPage, honorPage, sponsorPage, menuPage]) {
      candidate.classList.toggle("hidden", candidate.dataset.page !== page);
    }
    for (const button of toolbar.querySelectorAll<HTMLButtonElement>("button[data-command^='page:']")) {
      button.classList.toggle("active", button.dataset.command === `page:${page}`);
    }
    if (page === "menu") refreshAudioMenu();
    if (page === "honor" && lastVm) {
      sigArchive = "";
      rebuildArchive(lastVm);
      sigArchive = sigForArchive(lastVm);
    }
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const runCommand = (command: string): void => {
    if (command.startsWith("page:")) {
      setCurrentPage(command.slice("page:".length) as AppPage);
      return;
    }
    if (command === "toggle_bgm" || command === "toggle_sfx") {
      const preferences = loadAudioPreferences();
      saveAudioPreferences(command === "toggle_bgm"
        ? { ...preferences, bgmEnabled: !preferences.bgmEnabled }
        : { ...preferences, sfxEnabled: !preferences.sfxEnabled });
      refreshAudioMenu();
      return;
    }
    if (command === "close_space_reveal") {
      spaceRevealOverlay.hidden = true;
      return;
    }
    if (command === "close_story_complete") {
      storyCompleteOverlay.hidden = true;
      return;
    }
    if (command === "open_space_reveal") {
      spaceRevealOverlay.hidden = false;
      return;
    }
    if (command === "reset") {
      confirmDialog({
        title: t("menu.resetTitle"),
        body: t("menu.resetBody"),
        confirmText: t("menu.resetConfirm"),
        onConfirm: () => { handler("reset"); },
      });
      return;
    }
    const result = handler(command);
    handleCommandResult(command, result);
    if (result.researchReceipt) showResearchReceipt(result.researchReceipt);
    if (result.architectureReceipt) showArchitectureReceipt(result.architectureReceipt);
  };
  // 从点击坐标回退查找（真实浏览器中 render 每帧 replaceChildren 会替换按钮，
  // mousedown/mouseup 落在不同节点时 click 目标退化为公共祖先，closest 会落空）。
  const actionFromPoint = (x: number, y: number): { command?: string; action?: string } | null => {
    if (typeof document.elementFromPoint !== "function") return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const commandTarget = el.closest("[data-command]") as HTMLButtonElement | null;
    if (commandTarget?.disabled) return null;
    const cmd = commandTarget?.getAttribute("data-command");
    if (cmd) return { command: cmd };
    const actionTarget = el.closest("[data-action]") as HTMLButtonElement | null;
    if (actionTarget?.disabled) return null;
    const act = actionTarget?.getAttribute("data-action");
    if (act) return { action: act };
    return null;
  };
  // 注意：render 每帧 replaceChildren 会替换按钮节点。真实浏览器中，若按下
  // （mousedown）与松开（mouseup）期间按钮被替换，浏览器不会合成 click 事件
  // （要求 mousedown 的目标仍存在于文档中）。因此除了 click 委托，还需在
  // pointerup 时按坐标回退处理，保证慢速/真实点击始终可用。
  let downPos: { x: number; y: number } | null = null;
  let suppressClick = false;

  root.addEventListener("pointerdown", (ev) => {
    downPos = { x: ev.clientX, y: ev.clientY };
  });

  root.addEventListener("pointerup", (ev) => {
    if (!downPos) return;
    const dist = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
    downPos = null;
    if (dist > 8) return; // 拖拽后松开，视为取消
    const fromPoint = actionFromPoint(ev.clientX, ev.clientY);
    if (!fromPoint) return;
    // 正常点击时浏览器随后会合成 click，用标志抑制避免重复处理
    suppressClick = true;
    if (fromPoint.command) {
      runCommand(fromPoint.command);
    } else if (fromPoint.action) {
      prefixedHandler(fromPoint.action);
    }
  });

  // 带前缀的动作命令：<cmd>:<arg> 由 handler 解析
  const prefixedHandler = (action: string): void => {
    if (action.startsWith("archive_tab:")) {
      archiveTab = action.slice("archive_tab:".length);
      sigArchive = "";
      if (lastVm) {
        rebuildArchive(lastVm);
        sigArchive = sigForArchive(lastVm);
      }
      return;
    }
    if (action.startsWith("archive_category:")) {
      archiveCategory = action.slice("archive_category:".length);
      sigArchive = "";
      if (lastVm) {
        rebuildArchive(lastVm);
        sigArchive = sigForArchive(lastVm);
      }
      return;
    }
    const result = handler(action);
    handleCommandResult(action, result);
    if (result.researchReceipt) showResearchReceipt(result.researchReceipt);
    if (result.architectureReceipt) showArchitectureReceipt(result.architectureReceipt);
  };

  root.addEventListener("click", (ev) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const target = ev.target as HTMLElement | null;
    if (target?.isConnected) {
      const commandTarget = target.closest("[data-command]") as HTMLButtonElement | null;
      if (commandTarget?.disabled) return;
      const dataCmd = commandTarget?.getAttribute("data-command");
      if (dataCmd) {
        runCommand(dataCmd);
        return;
      }
      const actionTarget = target.closest("[data-action]") as HTMLButtonElement | null;
      if (actionTarget?.disabled) return;
      const action = actionTarget?.getAttribute("data-action");
      if (action) {
        prefixedHandler(action);
        return;
      }
    }
    // 目标被替换（detach）→ 按坐标回退
    const fromPoint =
      typeof ev.clientX === "number" && typeof ev.clientY === "number"
        ? actionFromPoint(ev.clientX, ev.clientY)
        : null;
    if (fromPoint?.command) {
      runCommand(fromPoint.command);
      return;
    }
    if (fromPoint?.action) {
      prefixedHandler(fromPoint.action);
    }
  });

  // ---------- 渲染（v2：结构性签名 + 局部 patch） ----------
  // 每个 section 有一个签名；签名变化 = 结构性事件 → 重建该 section（full）。
  // 签名不变 → 只做高频字段局部更新（partial），不替换任何节点。
  let sigModel = "";
  let sigOrder = "";
  let sigActive = "";
  let sigServer = "";
  let sigCenter = "";
  let sigPrestige = "";
  let sigStage4 = "";
  let sigStage5 = "";
  let sigOffline = "";
  let sigStage3 = "";
  let sigArchive = "";
  let sigSponsor = "";

  const setText = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };

  function syncButtonAffordance(button: HTMLButtonElement, enabled: boolean): void {
    const disabled = !enabled;
    button.disabled = disabled;
    button.classList.toggle("disabled", disabled);
    button.setAttribute("aria-disabled", String(disabled));
  }

  function syncProgress(node: HTMLElement, percent: number): void {
    const normalized = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    node.classList.add("continuous-progress");
    node.style.setProperty("--progress-value", `${normalized}%`);
    node.setAttribute("role", "progressbar");
    node.setAttribute("aria-valuemin", "0");
    node.setAttribute("aria-valuemax", "100");
    node.setAttribute("aria-valuenow", normalized.toFixed(0));
    node.classList.toggle("near-complete", normalized >= 90 && normalized < 100);
  }

  function patchHeader(vm: ViewModel): void {
    root.dataset.stage = String(vm.stage);
    root.dataset.era = vm.stage >= 5 ? "dyson" : vm.stage === 4 ? "lunar" : "earth";
    root.dataset.iterationCount = String(Math.min(3, vm.iterationCount));
    root.dataset.iteration = vm.iterationCount > 0 ? "active" : "base";
    singularityBadgeEl.hidden = !vm.singularity.active;
    if (vm.singularity.active) {
      setText(singularityBadgeEl, t("app.singularityBadge", { label: vm.singularity.label ?? "0/3" }));
    }
    setText(stageEl, tr(vm.stageLabel) + (vm.iterationCount > 0 ? t("app.stageIteration", { count: vm.iterationCount }) : ""));
    iterationBadgeEl.hidden = vm.iterationCount === 0;
    if (vm.iterationCount > 0) {
      setText(iterationBadgeEl, t("app.iterationBadge", { count: vm.iterationCount, mult: vm.permanentMultiplier }));
    }
    setText(moneyEl, t("app.currentMoney", { money: vm.money }));
    setText(incomeEl, t("app.incomePerSec", { value: vm.incomePerSec }));
    setText(computeEl, t("app.compute", { value: vm.compute }));
    setText(multEl, t("app.multiplier", { value: vm.permanentMultiplier }));
    const nextArchitecture = vm.architecture.nextServerCount === null
      ? t("app.architectureAllUnlocked")
      : vm.architecture.nextBlueprintName
        ? t("app.architectureNext", { count: vm.architecture.nextServerCount, name: tr(vm.architecture.nextBlueprintName) })
        : t("app.architectureNextDefault", { count: vm.architecture.nextServerCount });
    setText(architectureEl,
      t("app.architecture", { unlocked: vm.architecture.unlockedCount, total: vm.architecture.total, mult: vm.architecture.multiplier, next: nextArchitecture }));
    setText(workshopEl, t("app.workshop", { level: vm.workshop.level, exp: vm.workshop.experience, next: vm.workshop.experienceToNextLevel }));
    setText(revenueEl, t("app.revenue", { value: vm.workshop.lifetimeRevenue }));
  }

function sigForModel(vm: ViewModel): string {
    return `${vm.model.acquired}|${vm.model.name}|${vm.model.level}|${vm.model.roleLabel}|${vm.model.effectText}|${vm.model.atMaxLevel}|${vm.automationUnlocked}|${vm.automationEnabled}|${vm.research.canResearch}|${vm.research.archiveComplete}`;
  }
  function rebuildModel(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    setIconText(modelNameEl, modelGameIcon(vm.model.id ?? ""), t("model.nameLevel", { name: tr(vm.model.name), level: vm.model.level }));
    setText(modelStatsEl, vm.model.acquired
      ? `${t("model.statsAcquired", { role: tr(vm.model.roleLabel), effect: tr(vm.model.effectText), compute: vm.model.compute })} · ${vm.model.atMaxLevel ? t("model.maxLevel", { level: vm.model.level }) : t("model.trainCostLabel", { cost: vm.model.trainCost })}`
      : t("model.stats", { compute: vm.model.compute, cost: vm.model.trainCost }));
    modelActionsEl.replaceChildren();
    if (!vm.model.acquired) {
      modelActionsEl.appendChild(btn(t("action.acquireModel"), "acquire_model", true));
    } else {
      if (vm.model.atMaxLevel) {
        modelActionsEl.appendChild(el("div", "model-max-level", t("model.maxLevel", { level: vm.model.level })));
      } else {
        modelActionsEl.appendChild(btn(t("action.trainModel"), "train_model", false, vm.model.canTrain));
      }
      if (vm.automationUnlocked && !vm.automationEnabled) {
        modelActionsEl.appendChild(btn(t("action.enableAutomation"), "enable_automation", true));
      }
    }
    // 模型研发循环（自动经营解锁后持续保留）
    if (vm.model.acquired && vm.automationUnlocked) {
      setText(researchProgressEl,
        vm.research.archiveComplete
          ? t("model.researchComplete")
          : t(vm.research.canResearch ? "model.researchReady" : "model.researchProgress", { progress: vm.research.progressLabel }));
      researchProgressEl.style.display = "";
      syncProgress(researchProgressEl, vm.research.progress);
      if (!vm.research.archiveComplete && vm.research.canResearch) {
        modelActionsEl.appendChild(btn(t("action.researchModel"), "research_model", true));
      }
    } else {
      setText(researchProgressEl, "");
      researchProgressEl.style.display = "none";
    }
    if (vm.trainPreview) {
      setText(trainPreviewEl,
        t("model.trainPreview", { from: vm.trainPreview.computeNow, to: vm.trainPreview.computeAfter, incomeFrom: vm.trainPreview.incomeNow, incomeTo: vm.trainPreview.incomeAfter }));
      trainPreviewEl.style.display = "";
    } else {
      setText(trainPreviewEl, "");
      trainPreviewEl.style.display = "none";
    }
    // 档案馆已打开时，同步刷新模型蓝图等级（研发/训练后的收藏成长立即可见，
    // 无需先关闭再打开档案馆；未打开时由 render 的签名重建覆盖）。
    if (!archiveSection.classList.contains("hidden")) {
      patchArchive(vm);
    }
  }

function patchModel(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    setIconText(modelNameEl, modelGameIcon(vm.model.id ?? ""), t("model.nameLevel", { name: tr(vm.model.name), level: vm.model.level }));
    setText(modelStatsEl, vm.model.acquired
      ? `${t("model.statsAcquired", { role: tr(vm.model.roleLabel), effect: tr(vm.model.effectText), compute: vm.model.compute })} · ${vm.model.atMaxLevel ? t("model.maxLevel", { level: vm.model.level }) : t("model.trainCostLabel", { cost: vm.model.trainCost })}`
      : t("model.stats", { compute: vm.model.compute, cost: vm.model.trainCost }));
    // 训练/自动经营按钮禁用态
    const trainBtn = modelActionsEl.querySelector("button[data-action='train_model']") as HTMLButtonElement | null;
    if (trainBtn) syncButtonAffordance(trainBtn, vm.model.canTrain);
    const autoBtn = modelActionsEl.querySelector("button[data-action='enable_automation']") as HTMLButtonElement | null;
    if (autoBtn) syncButtonAffordance(autoBtn, true);
    const researchBtn = modelActionsEl.querySelector("button[data-action='research_model']") as HTMLButtonElement | null;
    if (researchBtn) syncButtonAffordance(researchBtn, vm.research.canResearch);
    if (vm.model.acquired && vm.automationUnlocked) {
      setText(researchProgressEl,
        vm.research.archiveComplete
          ? t("model.researchComplete")
          : t(vm.research.canResearch ? "model.researchReady" : "model.researchProgress", { progress: vm.research.progressLabel }));
      researchProgressEl.style.display = "";
      syncProgress(researchProgressEl, vm.research.progress);
    }
    if (vm.trainPreview) {
      setText(trainPreviewEl,
        t("model.trainPreview", { from: vm.trainPreview.computeNow, to: vm.trainPreview.computeAfter, incomeFrom: vm.trainPreview.incomeNow, incomeTo: vm.trainPreview.incomeAfter }));
      trainPreviewEl.style.display = "";
    } else {
      setText(trainPreviewEl, "");
      trainPreviewEl.style.display = "none";
    }
    // 档案馆已打开时，同步刷新模型蓝图等级（研发/训练后的收藏成长立即可见，
    // 无需先关闭再打开档案馆；未打开时由 render 的签名重建覆盖）。
    if (!archiveSection.classList.contains("hidden")) {
      patchArchive(vm);
    }
  }

function sigForOrders(vm: ViewModel): string {
    // 静态订单列表只随结构性事件重建：模型获得/自动化解锁/自动化开关。
    // canAcceptAnyOrder（含空槽状态）不在此签名内：满槽/空槽只重建 active 子区，
    // 静态列表与按钮禁用态走局部 patch，避免订单区闪烁。
    return `${vm.model.acquired}|${vm.automationUnlocked}|${vm.automationEnabled}`;
  }
  function sigForActive(vm: ViewModel): string {
    if (vm.automationEnabled) return `automation:${AUTOMATION_ORDER_CAP}`;
    return `${vm.activeOrders.length}|${vm.activeOrders.map((o) => o.orderId).join(",")}`;
  }
  function patchActiveRow(
    row: HTMLElement,
    ao: ViewModel["activeOrders"][number] | undefined,
    automationEnabled: boolean,
  ): void {
    const name = row.querySelector(".ao-name") as HTMLElement;
    const bar = row.querySelector(".progress-fill") as HTMLElement;
    const status = row.querySelector(".ao-status") as HTMLElement;
    const claim = row.querySelector("button[data-action^='claim_order:']") as HTMLButtonElement | null;

    if (!ao) {
      row.classList.add("auto-waiting");
      setIconText(name, "business", t("order.autoWaiting"));
      bar.style.width = "0%";
      delete bar.dataset.key;
      setText(status, t("order.fillingSlots"));
      claim?.remove();
      return;
    }

    row.classList.remove("auto-waiting");
    setIconText(name, orderGameIcon(ao.orderId), tr(ao.name));
    bar.style.width = (ao.progress * 100).toFixed(1) + "%";
    bar.dataset.key = `${ao.orderId}:${ao.orderIndex}`;
    setText(status, automationEnabled
      ? (ao.status === "ready" ? t("order.automationSettling") : ao.remainingLabel)
      : (ao.status === "ready" ? t("order.ready") : ao.remainingLabel));

    if (!automationEnabled && ao.status === "ready" && !claim) {
      row.appendChild(btn(t("order.claim"), `claim_order:${ao.orderIndex}`, true));
    } else if ((automationEnabled || ao.status !== "ready") && claim) {
      claim.remove();
    }
  }
  function buildActiveRows(vm: ViewModel): void {
    activeListEl.replaceChildren();
    const rowCount = vm.automationEnabled ? AUTOMATION_ORDER_CAP : vm.activeOrders.length;
    for (let index = 0; index < rowCount; index++) {
      const row = el("div", "active-order");
      row.dataset.slot = String(index + 1);
      const barWrap = el("div", "progress-wrap");
      const bar = el("div", "progress-fill");
      barWrap.appendChild(bar);
      row.append(el("div", "ao-name", ""), barWrap, el("div", "ao-status", ""));
      patchActiveRow(row, vm.activeOrders[index], vm.automationEnabled);
      activeListEl.appendChild(row);
    }
  }
  function renderOrderSummary(vm: ViewModel): void {
    const d = vm.orderDisplay;
    if (d.mode === "single") {
      setText(orderSummaryEl, "");
      orderSummaryEl.style.display = "none";
    } else if (d.mode === "flow") {
      setText(orderSummaryEl,
        `${t("order.flowSummary", { ops: d.opsPerSec, gross: d.grossPerSec, cost: d.costPerSec, net: d.netPerSec })}`);
      orderSummaryEl.style.display = "";
    } else {
      setText(orderSummaryEl,
        `${t("order.computeSummary", { ops: d.opsPerSec, income: d.netPerSec, total: d.totalCompute })}`);
      orderSummaryEl.style.display = "";
    }
  }
  function rebuildOrderList(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    orderSection.classList.toggle("hidden", !vm.canAcceptAnyOrder && vm.activeOrders.length === 0 && !vm.automationUnlocked);
    orderListEl.replaceChildren();
    for (const row of vm.orders) {
      const r = el("div", "order-row" + (row.recommended ? " recommended" : ""));
      const info = el("div", "order-info");
      const orderName = el("div", "order-name");
      setIconText(orderName, orderGameIcon(row.order.id), tr(row.order.name));
      info.appendChild(orderName);
      info.appendChild(el("div", "order-meta",
        `${t("order.meta", { sec: row.order.durationSec, gross: row.gross, rental: row.rentalCost, net: row.netIncome })}${row.recommended ? t("order.recommended") : ""}`));
      r.append(info, btn(t("order.accept"), `accept_order:${row.order.id}`, true, row.canAccept));
      orderListEl.appendChild(r);
    }
    // 三档表现：flow/compute 模式折叠单笔列表为只读业务分布摘要
    if (vm.orderDisplay.mode === "flow" || vm.orderDisplay.mode === "compute") {
      orderListEl.classList.add("collapsed");
      activeListEl.classList.add("collapsed");
    } else {
      orderListEl.classList.remove("collapsed");
      activeListEl.classList.remove("collapsed");
    }
    renderOrderSummary(vm);
    buildActiveRows(vm);
    sigActive = sigForActive(vm);
    setText(orderHintEl, vm.automationEnabled
      ? t("order.automationRunning")
      : t("order.hintManual", { count: `${Math.min(vm.automationCompletedOrders, vm.automationThreshold)}/${vm.automationThreshold}` }));
  }
  function patchOrders(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    orderSection.classList.toggle("hidden", !vm.canAcceptAnyOrder && vm.activeOrders.length === 0 && !vm.automationUnlocked);
    // 折叠态与聚合摘要：流水/算力模式每秒更新一次（不重建任何节点）
    const collapsed = vm.orderDisplay.mode === "flow" || vm.orderDisplay.mode === "compute";
    orderListEl.classList.toggle("collapsed", collapsed);
    activeListEl.classList.toggle("collapsed", collapsed);
    renderOrderSummary(vm);
    setText(orderHintEl, vm.automationEnabled
      ? t("order.automationRunning")
      : t("order.hintManual", { count: `${Math.min(vm.automationCompletedOrders, vm.automationThreshold)}/${vm.automationThreshold}` }));
    const orderButtons = orderListEl.querySelectorAll("button[data-action^='accept_order:']");
    for (let i = 0; i < orderButtons.length; i++) {
      syncButtonAffordance(orderButtons[i] as HTMLButtonElement, vm.orders[i]?.canAccept ?? false);
    }
    // 流水/算力模式：单笔订单区折叠为只读聚合，跳过单笔行重建（避免高频频闪）
    if (collapsed) return;
    // 手动模式的接单/领取会改变行结构；自动模式固定四个槽位，签名恒定。
    const sActive = sigForActive(vm);
    if (sActive !== sigActive) {
      sigActive = sActive;
      buildActiveRows(vm);
      return;
    }
    // 行结构不变：名称、进度和状态都在原节点局部更新。
    const rows = activeListEl.querySelectorAll(".active-order");
    for (let i = 0; i < rows.length; i++) {
      patchActiveRow(rows[i] as HTMLElement, vm.activeOrders[i], vm.automationEnabled);
    }
  }

  function sigForServer(vm: ViewModel): string {
    return `${vm.server.ownedCount}|${vm.server.nextName ?? ""}|${vm.rental.active}|${vm.center.unlocked}|${vm.workshop.firstServer.met}|${vm.server.batchUnlocked}`;
  }
  function rebuildServer(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    serverSection.classList.toggle("hidden", !vm.server.nextName && !vm.rental.active && vm.server.ownedCount === 0 && !vm.center.unlocked);
    fleetEl.replaceChildren();
    fleetEl.dataset.phase = vm.server.phase;
    fleetEl.dataset.owned = String(vm.server.ownedCount);
    for (const s of vm.server.servers) {
      const chip = el("div", "server-chip" + (s.owned ? " owned" : ""), `${tr(s.name)}${s.owned ? " ✓" : ""}(${s.power}×)`);
      chip.dataset.serverIndex = String(s.index);
      chip.dataset.owned = s.owned ? "true" : "false";
      fleetEl.appendChild(chip);
    }
    // 阶段进度 + 首服里程碑
    serverProgressEl.replaceChildren();
    if (vm.server.ownedCount === 0 && !vm.workshop.firstServer.awarded) {
      serverProgressEl.appendChild(el("div", "server-progress-title", t("server.firstMilestone")));
      const levelProgress = el("div", "server-progress-line",
        `${t("server.studioLevel")}${t("common.colon")}Lv.${vm.workshop.firstServer.levelCurrent} / Lv.${vm.workshop.firstServer.levelTarget}`);
      const revenueProgress = el("div", "server-progress-line",
        `${t("server.lifetimeRevenue")}${t("common.colon")}${vm.workshop.firstServer.revenueCurrent} / ${vm.workshop.firstServer.revenueTarget}`);
      syncProgress(levelProgress, vm.workshop.firstServer.levelProgress * 100);
      syncProgress(revenueProgress, vm.workshop.firstServer.revenueProgress * 100);
      serverProgressEl.append(levelProgress, revenueProgress);
    } else if (vm.server.ownedCount >= 1) {
      serverProgressEl.appendChild(el("div", "server-progress-title",
        `${t("server.fleet", { owned: vm.server.ownedCount, max: vm.server.maxCount })} · ${tr(vm.server.phaseLabel)}`));
      const next = vm.server.nextName ? t("server.next", { name: tr(vm.server.nextName), cost: vm.server.nextCost ?? "" }) : t("server.fullCluster");
      const fleetProgress = el("div", "server-progress-line", next);
      syncProgress(fleetProgress, (vm.server.ownedCount / Math.max(1, vm.server.maxCount)) * 100);
      serverProgressEl.appendChild(fleetProgress);
    }
    serverActionsEl.replaceChildren();
    if (!vm.rental.active && vm.server.ownedCount === 0 && vm.rental.canEnable) {
      serverActionsEl.appendChild(btn(t("action.enableRental"), "enable_rental", false));
    }
    if (vm.server.nextName) {
      const label = vm.server.ownedCount === 0 ? t("server.getFirst") : t("action.buyServer") + ` ${tr(vm.server.nextName ?? "")}(${vm.server.nextCost})`;
      serverActionsEl.appendChild(btn(label, "buy_server", true, vm.server.canBuy));
    }
    if (vm.server.batchUnlocked && vm.server.ownedCount >= 1 && vm.server.ownedCount < vm.server.maxCount) {
      serverActionsEl.appendChild(btn(t("server.buyAffordable"), "buy_max_servers", false, vm.server.canBuyMax));
    }
  }
  function patchServer(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    if (vm.server.ownedCount === 0 && !vm.workshop.firstServer.awarded) {
      const lines = serverProgressEl.querySelectorAll(".server-progress-line");
      if (lines[0]) setText(lines[0] as HTMLElement,
        `${t("server.studioLevel")}${t("common.colon")}Lv.${vm.workshop.firstServer.levelCurrent} / Lv.${vm.workshop.firstServer.levelTarget}`);
      if (lines[1]) setText(lines[1] as HTMLElement,
        `${t("server.lifetimeRevenue")}${t("common.colon")}${vm.workshop.firstServer.revenueCurrent} / ${vm.workshop.firstServer.revenueTarget}`);
      if (lines[0]) syncProgress(lines[0] as HTMLElement, vm.workshop.firstServer.levelProgress * 100);
      if (lines[1]) syncProgress(lines[1] as HTMLElement, vm.workshop.firstServer.revenueProgress * 100);
    }
    const buyBtn = serverActionsEl.querySelector("button[data-action='buy_server']") as HTMLButtonElement | null;
    if (buyBtn) syncButtonAffordance(buyBtn, vm.server.canBuy);
    const buyMaxBtn = serverActionsEl.querySelector("button[data-action='buy_max_servers']") as HTMLButtonElement | null;
    if (buyMaxBtn) syncButtonAffordance(buyMaxBtn, vm.server.canBuyMax);
  }

  function sigForCenter(vm: ViewModel): string {
    return `${vm.center.unlocked}|${vm.center.level}|${vm.stage3Gateway}|${vm.stage2Settlement.shown}`;
  }
  function rebuildCenter(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    // 旧算力中心升级网关已退役；Stage 3 筹建与进入只由 Stage3 区负责。
    centerSection.classList.add("hidden");
    centerInfoEl.replaceChildren();
    centerActionsEl.replaceChildren();
  }
  function patchCenter(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    void vm;
    centerSection.classList.add("hidden");
  }

  function sigForPrestige(vm: ViewModel): string {
    return `${vm.prestige.canPrestige}|${vm.prestige.count}|${vm.singularity.active}|${vm.singularity.coreClaimable}|${vm.singularity.iterationReady}|${vm.singularity.round}|${vm.singularity.spacePlanRevealed}`;
  }

  function sigForStage4(vm: ViewModel): string {
    const s4 = vm.stage4;
    return [
      s4.active,
      s4.ownedNodeCount,
      s4.batchUnlocked,
      s4.canBuyMaxNodes,
      s4.nodes.map((n) => `${n.id}:${n.owned}:${n.canBuy}`).join("|"),
      s4.finalProject.active,
      s4.finalProject.canStart,
      s4.finalProject.pendingReward,
      s4.finalProject.completed,
    ].join("|");
  }

  function rebuildStage4(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    const s4 = vm.stage4;
    stage4Section.classList.toggle("hidden", !s4.active);
    if (!s4.active) return;

    // 身份/进入信息
    stage4EntryEl.replaceChildren();
    const stage4Identity = el("div", "stage4-identity");
    setIconText(stage4Identity, "moon", tr(s4.identity));
    stage4EntryEl.appendChild(stage4Identity);
    stage4EntryEl.appendChild(el("div", "stage4-motivation-title", tr(s4.motivationTitle)));
    stage4EntryEl.appendChild(el("div", "stage4-motivation", tr(s4.motivationText)));
    stage4EntryEl.appendChild(el("div", "stage4-cosmic-model", t("stage4.cosmicModel", { name: tr(s4.cosmicModelName ?? "—") })));
    stage4EntryEl.appendChild(el("div", "stage4-income", `${t("stage4.income")} ${s4.incomePerSec} · ${t("stage4.nodeMult")} ${s4.nodeMult}`));
    if (s4.batchUnlocked) {
      stage4EntryEl.appendChild(btn(t("stage4.batchDeploy"), "buy_node:verified_nodes", false, s4.canBuyMaxNodes));
    }

    // 轨道节点阵列
    stage4NodesEl.replaceChildren();
    for (const n of s4.nodes) {
      const card = el("div", "stage4-node" + (n.owned ? " owned" : n.canBuy ? " available" : " locked"));
      card.dataset.nodeId = n.id;
      const nodeName = el("div", "stage4-node-name");
      setIconText(nodeName, contentGameIcon(n.id, "satellite"), n.name);
      card.appendChild(nodeName);
      card.appendChild(el("div", "stage4-node-cost", n.owned ? t("stage4.deployed") : n.cost));
      if (n.canBuy) {
        card.appendChild(btn(t("stage4.deployNode"), `buy_node:${n.id}`, true));
      } else if (!n.owned) {
        card.appendChild(el("div", "stage4-node-locked", n.id === "moon_base" ? t("stage4.firstPaidNode") : t("stage4.needPreviousNode")));
      }
      stage4NodesEl.appendChild(card);
    }

    // 地月一体化算力网
    stage4ProjectEl.replaceChildren();
    const fp = s4.finalProject;
    const projectTitle = el("div", "stage4-project-title");
    setIconText(projectTitle, "orbit", fp.name);
    stage4ProjectEl.appendChild(projectTitle);
    if (fp.active) {
      const progress = el("div", "stage4-project-progress", `${t("stage4.projectProgress")}${t("common.colon")}${fp.progressLabel}`);
      syncProgress(progress, Number.parseFloat(fp.progressLabel));
      stage4ProjectEl.appendChild(progress);
    } else if (fp.pendingReward) {
      const reward = el("div", "stage4-project-reward");
      setIconText(reward, "reward", t("stage4.moonNetworkDone"));
      stage4ProjectEl.appendChild(reward);
      stage4ProjectEl.appendChild(btn(t("stage4.claimMilestone"), "claim_stage4_reward", true));
    } else if (fp.completed) {
      const done = el("div", "stage4-project-done");
      setIconText(done, "complete", t("stage4.moonStoryDone"));
      stage4ProjectEl.appendChild(done);
      if (!vm.stage5.entered) {
        stage4ProjectEl.appendChild(btn(t("stage4.enterDyson"), "start_stage5", true));
      }
    } else {
      stage4ProjectEl.appendChild(el("div", "stage4-project-desc", tr(fp.rewardText)));
      if (fp.canStart) {
        stage4ProjectEl.appendChild(btn(t("stage4.startMoonNetwork"), "start_stage4_project", true));
      } else {
        stage4ProjectEl.appendChild(el("div", "stage4-project-locked", `${t("stage4.nodesLabel")} ${s4.ownedNodeCount}/${s4.nodes.length} · ${t("stage4.allNodesToStart")}`));
      }
    }
  }

  function patchStage4(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    const s4 = vm.stage4;
    // 高频：收入/进度文本局部更新
    const income = stage4EntryEl.querySelector(".stage4-income");
    if (income) setText(income as HTMLElement, `${t("stage4.income")} ${s4.incomePerSec} · ${t("stage4.nodeMult")} ${s4.nodeMult}`);
    const prog = stage4ProjectEl.querySelector(".stage4-project-progress");
    if (prog) {
      setText(prog as HTMLElement, `${t("stage4.projectProgress")}${t("common.colon")}${s4.finalProject.progressLabel}`);
      syncProgress(prog as HTMLElement, Number.parseFloat(s4.finalProject.progressLabel));
    }
    // 节点按钮禁用态（结构性变化由签名重建处理）
    for (const n of s4.nodes) {
      const btns = stage4Section.querySelectorAll(`button[data-action='buy_node:${n.id}']`);
      for (const b of btns) syncButtonAffordance(b as HTMLButtonElement, n.canBuy);
    }
    const batch = stage4Section.querySelector("button[data-action='buy_node:verified_nodes']") as HTMLButtonElement | null;
    if (batch) syncButtonAffordance(batch, s4.canBuyMaxNodes);
    const start = stage4Section.querySelector("button[data-action='start_stage4_project']") as HTMLButtonElement | null;
    if (start) syncButtonAffordance(start, s4.finalProject.canStart);
  }

  function sigForStage5(vm: ViewModel): string {
    const s5 = vm.stage5;
    return [
      s5.active,
      s5.ownedNodeCount,
      s5.nodes.map((n) => `${n.id}:${n.owned}:${n.canBuy}`).join("|"),
      s5.finalProject.active,
      s5.finalProject.canStart,
      s5.finalProject.pendingReward,
      s5.finalProject.completed,
      s5.storyCompleted,
    ].join("|");
  }

  function rebuildStage5(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    const s5 = vm.stage5;
    stage5Section.classList.toggle("hidden", !s5.active);
    if (!s5.active) return;

    stage5EntryEl.replaceChildren();
    const stage5Identity = el("div", "stage5-identity");
    setIconText(stage5Identity, "orbit", tr(s5.identity));
    stage5EntryEl.appendChild(stage5Identity);
    stage5EntryEl.appendChild(el("div", "stage5-cosmic-model", t("stage4.cosmicModel", { name: tr(s5.cosmicModelName ?? "—") })));
    stage5EntryEl.appendChild(el("div", "stage5-income", `${t("stage5.income")} ${s5.incomePerSec} · ${t("stage5.nodeMult")} ${s5.nodeMult}`));

    stage5NodesEl.replaceChildren();
    for (const n of s5.nodes) {
      const card = el("div", "stage5-node" + (n.owned ? " owned" : n.canBuy ? " available" : " locked"));
      card.dataset.nodeId = n.id;
      const nodeName = el("div", "stage5-node-name");
      setIconText(nodeName, contentGameIcon(n.id, "sparkles"), n.name);
      card.appendChild(nodeName);
      card.appendChild(el("div", "stage5-node-cost", n.owned ? t("stage4.deployed") : n.cost));
      if (n.canBuy) {
        card.appendChild(btn(t("stage4.deployNode"), `buy_stage5_node:${n.id}`, true));
      } else if (!n.owned) {
        card.appendChild(el("div", "stage5-node-locked", t("stage4.needPreviousNode")));
      }
      stage5NodesEl.appendChild(card);
    }

    stage5ProjectEl.replaceChildren();
    const fp = s5.finalProject;
    const projectTitle = el("div", "stage5-project-title");
    setIconText(projectTitle, "dyson_sphere", fp.name);
    stage5ProjectEl.appendChild(projectTitle);
    if (fp.active) {
      const progress = el("div", "stage5-project-progress", `${t("stage4.projectProgress")}${t("common.colon")}${fp.progressLabel}`);
      syncProgress(progress, Number.parseFloat(fp.progressLabel));
      stage5ProjectEl.appendChild(progress);
    } else if (fp.pendingReward) {
      const reward = el("div", "stage5-project-reward");
      setIconText(reward, "reward", t("stage5.dysonDone"));
      stage5ProjectEl.appendChild(reward);
      stage5ProjectEl.appendChild(btn(t("stage4.claimMilestone"), "claim_stage5_reward", true));
    } else if (fp.completed) {
      const done = el("div", "stage5-project-done");
      setIconText(done, "complete", t("stage5.storyDonePerpetual"));
      stage5ProjectEl.appendChild(done);
    } else {
      stage5ProjectEl.appendChild(el("div", "stage5-project-desc", tr(fp.rewardText)));
      if (fp.canStart) {
        stage5ProjectEl.appendChild(btn(t("stage5.startDyson"), "start_stage5_project", true));
      } else {
        stage5ProjectEl.appendChild(el("div", "stage5-project-locked", t("stage5.lockedHint")));
      }
    }

    stage5StoryEl.replaceChildren();
    if (s5.storyCompleted) {
      const story = el("div", "stage5-story-done");
      setIconText(story, "celebration",
        t("stage5.storyCelebration"));
      stage5StoryEl.appendChild(story);

      const growth = el("div", "perpetual-growth");
      const growthHeading = el("div", "perpetual-growth-heading");
      setIconText(growthHeading, "terminal", t("stage5.liveSettlement"));
      const growthValues = el("div", "perpetual-growth-values");
      const liveMoney = el("div", "perpetual-growth-money", vm.money);
      liveMoney.dataset.perpetualMoney = "true";
      const liveIncome = el("div", "perpetual-growth-income", `${t("stage5.injectPerSec")} ${s5.incomePerSec}`);
      liveIncome.dataset.perpetualIncome = "true";
      growthValues.append(liveMoney, liveIncome);
      const pulse = el("div", "perpetual-growth-pulse");
      pulse.setAttribute("aria-hidden", "true");
      pulse.appendChild(el("span", "perpetual-growth-beam"));
      growth.append(
        growthHeading,
        growthValues,
        pulse,
        el("div", "perpetual-growth-note", t("stage5.perpetualNote")),
      );
      stage5StoryEl.appendChild(growth);
    }
  }

  function patchStage5(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    const s5 = vm.stage5;
    const income = stage5EntryEl.querySelector(".stage5-income");
    if (income) setText(income as HTMLElement, `${t("stage5.income")} ${s5.incomePerSec} · ${t("stage5.nodeMult")} ${s5.nodeMult}`);
    const prog = stage5ProjectEl.querySelector(".stage5-project-progress");
    if (prog) {
      setText(prog as HTMLElement, `${t("stage4.projectProgress")}${t("common.colon")}${s5.finalProject.progressLabel}`);
      syncProgress(prog as HTMLElement, Number.parseFloat(s5.finalProject.progressLabel));
    }
    const liveMoney = stage5StoryEl.querySelector("[data-perpetual-money]");
    if (liveMoney) setText(liveMoney as HTMLElement, vm.money);
    const liveIncome = stage5StoryEl.querySelector("[data-perpetual-income]");
    if (liveIncome) setText(liveIncome as HTMLElement, `${t("stage5.injectPerSec")} ${s5.incomePerSec}`);
    for (const n of s5.nodes) {
      const btns = stage5Section.querySelectorAll(`button[data-action='buy_stage5_node:${n.id}']`);
      for (const b of btns) syncButtonAffordance(b as HTMLButtonElement, n.canBuy);
    }
    const start = stage5Section.querySelector("button[data-action='start_stage5_project']") as HTMLButtonElement | null;
    if (start) syncButtonAffordance(start, s5.finalProject.canStart);
  }
  function rebuildPrestige(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    const endgame = vm.singularity.active;
    const showPrestige = endgame
      ? vm.singularity.coreClaimable || vm.singularity.iterationReady || vm.singularity.spacePlanRevealed
      : vm.prestige.canPrestige || vm.prestige.count > 0;
    prestigeSection.classList.toggle("hidden", !showPrestige);
    prestigeInfoEl.replaceChildren();
    prestigeListEl.replaceChildren();
    prestigeActionsEl.replaceChildren();
    if (endgame) {
      prestigeSection.dataset.state = vm.singularity.spacePlanRevealed
        ? "space-revealed"
        : vm.singularity.coreClaimable
          ? "core-ready"
          : vm.singularity.iterationReady
            ? "iteration-ready"
            : "round-active";
      const round = vm.singularity.round ?? 1;
      const nextMult = round === 1 ? 1.5 : 2.0;
      prestigeInfoEl.appendChild(el("div", "prestige-kicker",
        vm.singularity.spacePlanRevealed
          ? t("prestige.earthComplete")
          : t("prestige.singularityCore", { round })));
      if (vm.singularity.spacePlanRevealed) {
        prestigeInfoEl.appendChild(el("div", "prestige-multiplier", t("prestige.spacePlanRevealed")));
        prestigeInfoEl.appendChild(el("div", "prestige-info-text",
          t("prestige.spacePlanRevealedBody")));
        prestigeActionsEl.appendChild(commandBtn(t("prestige.viewSpacePlan"), "page:honor", true));
      } else if (vm.singularity.coreClaimable) {
        prestigeInfoEl.appendChild(el("div", "prestige-multiplier", t("prestige.multiplierNext", { mult: nextMult })));
        prestigeInfoEl.appendChild(el("div", "prestige-info-text",
          t("prestige.roundReward2", { round })));
        vm.prestige.gainItems.forEach((item) => prestigeListEl.appendChild(el("li", "prestige-gain", t("prestige.gainPrefix") + prestigeItemText(item))));
        prestigeActionsEl.appendChild(btn(t("prestige.claimCore", { round }), "claim_core", true));
      } else if (vm.singularity.iterationReady) {
        prestigeInfoEl.appendChild(el("div", "prestige-multiplier", t("prestige.multiplierNext", { mult: nextMult })));
        prestigeInfoEl.appendChild(el("div", "prestige-info-text",
          round === 3
            ? t("prestige.thirdIteration")
            : t("prestige.iterationReady")));
        vm.prestige.resetItems.forEach((item) => prestigeListEl.appendChild(el("li", "prestige-reset", t("prestige.resetPrefix") + prestigeItemText(item))));
        vm.prestige.gainItems.forEach((item) => prestigeListEl.appendChild(el("li", "prestige-gain", t("prestige.gainPrefix") + prestigeItemText(item))));
        prestigeActionsEl.appendChild(btn(
          round === 3 ? t("core.revealPlan") : t("prestige.execute", { round }),
          "prestige",
          true,
        ));
      } else {
        prestigeInfoEl.appendChild(el("div", "prestige-multiplier", t("app.singularityBadge", { label: vm.singularity.label ?? "0/3" })));
        prestigeInfoEl.appendChild(el("div", "prestige-info-text",
          round === 1
            ? t("prestige.hintRound1")
            : t("prestige.hintRound", { round })));
      }
      return;
    }
    prestigeSection.dataset.state = vm.prestige.canPrestige ? "ready" : vm.prestige.count > 0 ? "earned" : "hidden";
    if (vm.prestige.canPrestige) {
      prestigeInfoEl.appendChild(el("div", "prestige-kicker", t("prestige.kickerReady")));
      prestigeInfoEl.appendChild(el("div", "prestige-multiplier", t("prestige.permanentX2")));
      prestigeInfoEl.appendChild(el("div", "prestige-info-text",
        t("prestige.readyBody")));
      vm.prestige.resetItems.forEach((item) => prestigeListEl.appendChild(el("li", "prestige-reset", t("prestige.resetPrefix") + prestigeItemText(item))));
      vm.prestige.gainItems.forEach((item) => prestigeListEl.appendChild(el("li", "prestige-gain", t("prestige.gainPrefix") + prestigeItemText(item))));
      prestigeActionsEl.appendChild(btn(t("prestige.startWithX2"), "prestige", true));
    } else if (vm.prestige.count > 0) {
      prestigeInfoEl.appendChild(el("div", "prestige-kicker", t("prestige.kickerDone")));
      prestigeInfoEl.appendChild(el("div", "prestige-multiplier", t("prestige.firstIterationDone")));
      prestigeInfoEl.appendChild(el("div", "prestige-info-text",
        t("prestige.doneBody")));
    }
  }

  function patchOffline(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    const existing = main.querySelector(".offline-card");
    if (vm.offline.hasPending && !existing) {
      const oc = el("div", "offline-card");
      // CARD-04 回归回执：展示 本次离线/有效结算/上限/超出未计入/资金/研发/工程
      const lines: string[] = [t("offline.rawElapsed", { value: vm.offline.rawElapsedLabel })];
      lines.push(t("offline.elapsed", { value: vm.offline.elapsedLabel }));
      lines.push(t("offline.cap", { value: vm.offline.capLabel }));
      if (vm.offline.excessLabel) lines.push(t("offline.excess", { value: vm.offline.excessLabel }));
      lines.push(t("offline.money", { value: vm.offline.money }));
      const feelPreview = vm.feel.offlinePreview;
      if (feelPreview) {
        lines.push(t("offline.moneyBefore", { value: feelPreview.moneyBefore }));
        lines.push(t("offline.moneyAfter", { value: feelPreview.moneyAfter }));
        lines.push(t("offline.compute", { value: feelPreview.computeLabel }));
      }
      lines.push(t("offline.researchProgress", { value: vm.offline.researchProgress.toFixed(1) }));
      lines.push(
        vm.offline.projectName && vm.offline.projectProgressDelta > 0
          ? t("offline.projectProgress", { name: tr(vm.offline.projectName), delta: vm.offline.projectProgressDelta.toFixed(0) })
          : t("offline.projectNone")
      );
      if (feelPreview) {
        lines.push(
          feelPreview.affordableAfterCount > 0
            ? t("offline.affordable", { count: feelPreview.affordableAfterCount, recommended: feelPreview.recommendedAfterLabel ? tr(feelPreview.recommendedAfterLabel) : t("offline.viewCurrent") })
            : t("offline.noneAffordable"),
        );
      }
      oc.appendChild(el("div", "offline-receipt-title", t("offline.receiptTitle")));
      lines.forEach((line) => oc.appendChild(el("div", "offline-receipt-line", line)));
      oc.appendChild(btn(t("action.claimOffline"), "claim_offline", true));
      businessPage.insertBefore(oc, businessPage.firstChild);
    } else if (!vm.offline.hasPending && existing) {
      existing.remove();
    }
  }

  function renderSponsor(vm: ViewModel): void {
    const nextSignature = JSON.stringify(vm.sponsor);
    if (nextSignature === sigSponsor) return;
    sigSponsor = nextSignature;
    const sponsor = vm.sponsor;

    offlineSponsorCardEl.replaceChildren();
    if (sponsor.pendingAdKind) {
      const pending = el("div", "sponsor-pending");
      pending.appendChild(el("div", "sponsor-pending-title", t("sponsor.pendingTitle")));
      pending.appendChild(el("div", "sponsor-card-copy",
        sponsor.pendingAdKind === "offline_capacity"
          ? t("sponsor.offlinePending")
          : t("sponsor.incomePending")));
      const pendingActions = el("div", "sponsor-actions");
      pendingActions.appendChild(btn(t("sponsor.resume"), "resume_sponsor_ad", true));
      pendingActions.appendChild(btn(t("common.cancel"), "cancel_pending_sponsor_ad"));
      pending.appendChild(pendingActions);
      offlineSponsorCardEl.appendChild(pending);
    }
    const offlineTitle = el("div", "sponsor-card-title");
    setIconText(offlineTitle, "moon", t("sponsor.offlineCardTitle"));
    offlineSponsorCardEl.appendChild(offlineTitle);
    offlineSponsorCardEl.appendChild(el("div", "sponsor-card-copy",
      t("sponsor.offlineHint")));
    const offlineProgress = el("div", "sponsor-progress",
      `${t("sponsor.offlineCap")} ${sponsor.offlineCapacityLabel} · ${t("sponsor.todayAds")} ${sponsor.offlineAdsUsed}/${sponsor.offlineAdsMax}`);
    syncProgress(offlineProgress, sponsor.offlineCapacityProgress * 100);
    offlineSponsorCardEl.appendChild(offlineProgress);
    offlineSponsorCardEl.appendChild(btn(
      sponsor.canWatchOfflineAd ? t("sponsor.watchOffline") : t("sponsor.offlineFull"),
      "prepare_sponsor_ad:offline_capacity",
      true,
      sponsor.canWatchOfflineAd,
    ));

    incomeSponsorCardEl.replaceChildren();
    const incomeTitle = el("div", "sponsor-card-title");
    setIconText(incomeTitle, "sponsor", t("sponsor.incomeCardTitle"));
    incomeSponsorCardEl.appendChild(incomeTitle);
    incomeSponsorCardEl.appendChild(el("div", "sponsor-card-copy",
      t("sponsor.incomeHint")));
    const incomeProgress = el("div", "sponsor-progress",
      `${t("sponsor.remaining")} ${sponsor.incomeBoostRemainingLabel} · ${t("sponsor.free")} ${sponsor.incomeFreeUsed}/${sponsor.incomeFreeMax} · ${t("sponsor.ads")} ${sponsor.incomeAdsUsed}/${sponsor.incomeAdsMax}`);
    syncProgress(incomeProgress, sponsor.incomeBoostProgress * 100);
    incomeSponsorCardEl.appendChild(incomeProgress);
    const actions = el("div", "sponsor-actions");
    actions.appendChild(btn(
      sponsor.canClaimFreeIncome ? t("sponsor.claimFree") : t("sponsor.freeClaimed"),
      "claim_free_income_sponsor",
      false,
      sponsor.canClaimFreeIncome,
    ));
    actions.appendChild(btn(
      sponsor.canWatchIncomeAd ? t("sponsor.watchIncome") : t("sponsor.incomeFull"),
      "prepare_sponsor_ad:income_boost",
      true,
      sponsor.canWatchIncomeAd,
    ));
    incomeSponsorCardEl.appendChild(actions);
  }

  function render(vm: ViewModel): void {
    // 高频局部字段：永不重建
    patchHeader(vm);
    finalFeel.patch(vm.feel);
    renderSponsor(vm);

    // 模型区：结构性签名（获取模型/训练升级/解锁自动）→ 重建；否则局部
    const sModel = sigForModel(vm);
    if (sModel !== sigModel) {
      sigModel = sModel;
      rebuildModel(vm);
    } else {
      patchModel(vm);
    }

    // 订单区：静态签名变化（可接单/自动化）→ 重建整区；否则局部 patch。
    // active 子区自身签名（行数/构成）变化在 patchOrders 内只重建 active 子区。
    const sOrder = sigForOrders(vm);
    if (sOrder !== sigOrder) {
      sigOrder = sOrder;
      rebuildOrderList(vm);
    } else {
      patchOrders(vm);
    }

    // 服务器区
    const sServer = sigForServer(vm);
    if (sServer !== sigServer) {
      sigServer = sServer;
      rebuildServer(vm);
    } else {
      patchServer(vm);
    }

    // 算力中心
    const sCenter = sigForCenter(vm);
    if (sCenter !== sigCenter) {
      sigCenter = sCenter;
      rebuildCenter(vm);
    } else {
      patchCenter(vm);
    }

    // Stage 3：算力中心与机房（结构性签名 + 局部 patch）
    const sStage3 = sigForStage3(vm);
    if (sStage3 !== sigStage3) {
      sigStage3 = sStage3;
      rebuildStage3(vm);
    } else {
      patchStage3(vm);
    }

    // CARD-02 Stage 4：地月算力网（结构性签名 + 局部 patch）
    const sStage4 = sigForStage4(vm);
    if (sStage4 !== sigStage4) {
      sigStage4 = sStage4;
      rebuildStage4(vm);
    } else {
      patchStage4(vm);
    }

    // CARD-03 Stage 5：戴森算力纪元（结构性签名 + 局部 patch）
    const sStage5 = sigForStage5(vm);
    if (sStage5 !== sigStage5) {
      sigStage5 = sStage5;
      rebuildStage5(vm);
    } else {
      patchStage5(vm);
    }

    // 主线结局：戴森算力球完成后全屏反馈（只触发一次；可关闭）
    if (vm.stage5.storyCompleted && vm.stage5.perpetualActive && !storyCompleteOverlay.dataset.shown) {
      storyCompleteOverlay.dataset.shown = "1";
      if (!storyCompleteVisualEl.src) storyCompleteVisualEl.src = storyCompleteVisualEl.dataset.src ?? "";
      storyCompleteCard.classList.add("dyson-celebration");
      setText(storyCompleteTitleEl, t("story.celebrationTitle"));
      const legendary = vm.legendaryArchive;
      setText(storyCompleteBodyEl,
        [
          t("story.dysonOnline"),
          "",
          t("story.journey"),
          "",
          `${t("story.coresAndStudio", { level: vm.workshop.level })}`,
          `${t("story.maxCompute")}${t("common.colon")}${legendary?.maxCompute ?? vm.compute}`,
          `${t("story.maxIncome")}${t("common.colon")}${legendary?.maxIncome ?? vm.incomePerSec}`,
          legendary?.completedAtMs ? `${t("story.completedAt")}${t("common.colon")}${new Date(legendary.completedAtMs).toLocaleString(getLocale(), { timeZone: "Asia/Shanghai" })}` : "",
          "",
          t("story.perpetualContinue"),
        ].filter(Boolean).join("\n"));
      storyCompleteActionsEl.replaceChildren();
      storyCompleteActionsEl.appendChild(commandBtn(t("story.continueBusiness"), "close_story_complete", true));
      storyCompleteOverlay.hidden = false;
    }

    // 惊喜事件：地外算力计划揭示后自动弹出一次（只触发一次；可关闭后从档案馆重开）
    if (vm.singularity.spacePlanRevealed && !vm.singularity.spacePlanStarted) {
      if (!spaceRevealOverlay.hidden) {
        // 已在展示中：保持内容同步
        setText(spaceRevealTitleEl, t("spaceReveal.title"));
        setText(spaceRevealBodyEl,
          t("spaceReveal.body"));
        spaceRevealActionsEl.replaceChildren();
        spaceRevealActionsEl.appendChild(btn(t("spaceReveal.start"), "start_space_plan", true));
      } else if (!spaceRevealOverlay.dataset.shown) {
        spaceRevealOverlay.dataset.shown = "1";
        setText(spaceRevealTitleEl, t("spaceReveal.title"));
        setText(spaceRevealBodyEl,
          t("spaceReveal.body"));
        spaceRevealActionsEl.replaceChildren();
        spaceRevealActionsEl.appendChild(btn(t("spaceReveal.start"), "start_space_plan", true));
        spaceRevealOverlay.hidden = false;
      }
    }

    // Stage 5 隐藏 Stage 4 与地球经营区；Stage 4 隐藏地球经营区。
    const isStage5 = vm.stage5.active;
    const isStage4 = vm.stage4.active && !isStage5;
    if (isStage5) {
      stage4Section.classList.add("hidden");
      stage3Section.classList.add("hidden");
      orderSection.classList.add("hidden");
      serverSection.classList.add("hidden");
      centerSection.classList.add("hidden");
      prestigeSection.classList.add("hidden");
      const mt = modelSection.querySelector(".section-title");
      if (mt) mt.textContent = t("section.stage4Model");
      modelSection.classList.remove("hidden");
    }
    if (isStage4) {
      orderSection.classList.add("hidden");
      serverSection.classList.add("hidden");
      centerSection.classList.add("hidden");
      stage3Section.classList.add("hidden");
      prestigeSection.classList.add("hidden");
      // 模型区转为“宇宙模型包装”：只读展示（沿用地球图鉴收藏加成，不新增抽取/配置）
      const mt = modelSection.querySelector(".section-title");
      if (mt) mt.textContent = t("section.stage4Model");
      modelSection.classList.remove("hidden");
    }

    // Stage 3 隐藏 Stage 1/2 的订单/服务器/中心细节（保持模型训练/研发区）
    const isStage3 = vm.stage === 3;
    // Stage 3 强制隐藏旧阶段区；非 Stage 3 时保留各 section 自己的解锁可见性判断。
    if (isStage3) {
      orderSection.classList.add("hidden");
      serverSection.classList.add("hidden");
      centerSection.classList.add("hidden");
    }
    if (isStage3) {
      modelSection.querySelector(".section-title")!.textContent = t("section.stage3Model");
    } else {
      modelSection.querySelector(".section-title")!.textContent = t("section.model");
    }

    // 自动经营解锁后，把服务器增长放到聚合订单之前；只在顺序真正变化时移动既有节点。
    const stage2Automated = vm.stage === 2 && vm.automationEnabled;
    if (stage2Automated && serverSection.nextElementSibling !== orderSection) {
      businessPage.insertBefore(serverSection, orderSection);
    } else if (!stage2Automated && orderSection.nextElementSibling !== serverSection) {
      businessPage.insertBefore(orderSection, serverSection);
    }
    if (stage2Automated) {
      modelSection.querySelector(".section-title")!.textContent = t("section.stage3Model");
      serverSection.querySelector(".section-title")!.textContent = t("section.serverAutomated");
      orderSection.querySelector(".section-title")!.textContent = t("section.ordersAutomated");
    } else {
      serverSection.querySelector(".section-title")!.textContent = t("section.server");
      orderSection.querySelector(".section-title")!.textContent = t("section.orders");
    }

    // 算力档案馆：打开时只在档案数据或标签变化后重建，普通 tick 不替换节点。
    archiveSection.classList.toggle("hidden", !archiveOpen);
    if (archiveOpen) {
      const sArchive = sigForArchive(vm);
      if (sArchive !== sigArchive) {
        rebuildArchive(vm);
        sigArchive = sArchive;
      }
      patchArchive(vm);
    }

    // 技术迭代
    const sPrestige = sigForPrestige(vm);
    if (sPrestige !== sigPrestige) {
      sigPrestige = sPrestige;
      rebuildPrestige(vm);
    } else {
      // 无高频字段
    }

    // 离线卡（结构性出现/消失）
    patchOffline(vm);

    // Stage 2 结算：8 台后首次 render 触发（引擎 exactly-once）
    lastVm = vm;
    maybeShowStage2Settlement(vm);
  }

  let lastVm: ViewModel | null = null;

  function btn(label: string, action: string, primary = false, enabled = true): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn" + (primary ? " btn-primary" : "");
    b.textContent = label;
    b.setAttribute("data-action", action);
    syncButtonAffordance(b, enabled);
    return b;
  }

  function commandBtn(label: string, command: string, primary = false, enabled = true): HTMLButtonElement {
    const button = btn(label, command, primary, enabled);
    button.removeAttribute("data-action");
    button.setAttribute("data-command", command);
    return button;
  }

  /** 通关用时：按当前语言输出「X小时Y分钟」/「Xh Ym」。 */
  function formatDuration(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (getLocale() === "en-US") {
      const parts: string[] = [];
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
      return parts.join(" ");
    }
    const partsZh: string[] = [];
    if (hours > 0) partsZh.push(`${hours}小时`);
    if (minutes > 0 || partsZh.length === 0) partsZh.push(`${minutes}分钟`);
    return partsZh.join("");
  }

  function maybeShowStage2Settlement(vm: ViewModel): void {
    if (vm.stage2Settlement.shown || vm.stage3Gateway === false || vm.server.ownedCount < 8) return;
    const res = handler("complete_stage2_settlement");
    if (res?.ok) {
      confirmDialog({
        title: t("stage2.title"),
        body:
          t("stage2.body", {
            servers: vm.server.ownedCount,
            models: vm.stage2Settlement.modelCount,
            compute: vm.stage2Settlement.totalCompute,
            income: vm.stage2Settlement.incomePerSec,
            stageIncome: vm.stage2Settlement.stageIncome,
          }),
        confirmText: t("stage2.continue"),
        onConfirm: () => {},
      });
    }
  }

  function showToast(text: string): void {
    if (!toastEl) {
      toastEl = el("div", "toast") as HTMLDivElement;
      root.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add("show");
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl?.classList.remove("show"), 2000);
  }

  function showResearchReceipt(receipt: ResearchReceipt): void {
    researchReceiptEl.textContent = [
      t("receipt.researchResult", { name: tr(receipt.resultModelName) }),
      t("receipt.blueprint", { name: tr(receipt.resultModelName), before: receipt.archiveLevelBefore, after: receipt.archiveLevelAfter, delta: receipt.archiveLevelDelta }),
      t("receipt.compute", { before: receipt.computeBefore, after: receipt.computeAfter, delta: receipt.computeDelta }),
      t("receipt.income", { before: receipt.incomeBefore, after: receipt.incomeAfter, delta: receipt.incomeDelta }),
      receipt.switched
        ? t("receipt.switched", { oldName: tr(receipt.oldModelName), newName: tr(receipt.resultModelName) })
        : t("receipt.kept", { name: tr(receipt.oldModelName) }),
      t("receipt.reason", { reason: tr(receipt.switchReason) }),
    ].join("\n");
    researchReceiptEl.hidden = false;
  }

  function showArchitectureReceipt(receipt: ArchitectureReceipt): void {
    showToast(
      t("receipt.architecture", { before: receipt.beforeCount, after: receipt.afterCount }) + " · " +
      t("receipt.architectureMult", { before: receipt.beforeMultiplier, after: receipt.afterMultiplier }),
    );
  }

  function handleCommandResult(command: string, result: CommandResult): void {
    if (command === "start_space_plan") {
      if (result.ok) {
        spaceRevealOverlay.hidden = true;
        window.requestAnimationFrame(() => {
          stage4Section.scrollIntoView?.({ behavior: "smooth", block: "start" });
        });
      } else {
        showToast(result.error === "already_started" ? t("spacePlan.alreadyStarted") : t("spacePlan.startFailed", { reason: result.error ?? t("error.unknown") }));
      }
    }
    if (command === "claim_core" && result.ok) {
      const round = lastVm?.singularity.round ?? 1;
      const nextMult = round === 1 ? "×1.5" : "×2.0";
      const isFinalEarthRound = round === 3;
      confirmDialog({
        title: t("core.claimTitle", { round }),
        body: isFinalEarthRound
          ? t("core.claimBodyFinal", { mult: nextMult })
          : t("core.claimBody", { mult: nextMult }),
        confirmText: isFinalEarthRound ? t("core.revealPlan") : t("core.nextRound"),
        cancelText: t("core.stayRound"),
        onConfirm: () => {
          if (isFinalEarthRound) {
            handler("prestige");
            return;
          }
          confirmDialog({
            title: t("core.confirmRound", { round: round + 1 }),
            body: t("core.resetBody"),
            confirmText: t("core.confirmReset"),
            cancelText: t("common.cancel"),
            onConfirm: () => { handler("prestige"); },
          });
        },
      });
    }
  }

  function confirmDialog(options: { title: string; body: string; confirmText: string; cancelText?: string; onConfirm: () => void }): void {
    const overlay = el("div", "dialog-overlay") as HTMLDivElement;
    const dialog = el("div", "dialog");
    dialog.appendChild(el("div", "dialog-title", options.title));
    dialog.appendChild(el("div", "dialog-body", options.body));
    const row = el("div", "dialog-actions");
    row.appendChild(btn(options.cancelText ?? t("common.cancel"), "dialog_cancel"));
    row.appendChild(btn(options.confirmText, "dialog_confirm", true));
    dialog.appendChild(row);
    overlay.appendChild(dialog);
    root.appendChild(overlay);
    overlay.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-action='dialog_cancel']")) overlay.remove();
      if (t.closest("[data-action='dialog_confirm']")) {
        overlay.remove();
        options.onConfirm();
      }
    });
  }

  function destroy(): void {
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    finalFeel.destroy();
    root.remove();
  }


  // ============ Stage 3 渲染 ============
  let archiveOpen = true;
  let archiveTab = "catalog";
  let archiveCategory = "models";

  function sigForStage3(vm: ViewModel): string {
    const st = vm.stage3;
    return [
      st.entered,
      st.entryMet,
      st.roomsOwned,
      st.infrastructure.map((i) => `${i.id}:${i.level}`).join(","),
      st.blueprintChoice ?? "",
      st.flagship.map((f) => `${f.id}:${f.unlocked}:${f.canStart}:${f.activeId ?? ""}:${f.pendingRewardId ?? ""}`).join("|"),
      vm.stage3.bottleneck.id,
      st.effectiveEfficiency.toFixed(2),
    ].join("|");
  }

  function rebuildStage3(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    const st = vm.stage3;
    stage3Section.classList.toggle("hidden", !st.entered);

    // 进入入口（Stage 3 条件满足但未进入）
    stage3EntryEl.replaceChildren();
    if (!st.entered && st.entryMet) {
      stage3EntryEl.appendChild(el("div", "stage3-entry-title", t("stage3.entryTitle")));
      stage3EntryEl.appendChild(el("div", "stage3-entry-text", t("stage3.entryText")));
      stage3EntryEl.appendChild(btn(t("stage3.enterCenter"), "enter_stage3", true));
      stage3Section.classList.remove("hidden");
      return;
    } else if (!st.entered) {
      stage3Section.classList.add("hidden");
      return;
    }

    // 投产红利
    setText(commissionBonusEl, "");
    commissionBonusEl.style.display = "none";
    if (st.commissionBonusActive) {
      setIconText(commissionBonusEl, "celebration", t("stage3.commissionBonus", { remaining: st.commissionBonusRemaining }));
      commissionBonusEl.style.display = "";
    }

    // 瓶颈
    bottleneckEl.replaceChildren();
    if (st.bottleneck.id) {
      bottleneckEl.appendChild(el("div", "bottleneck-title",
        t("stage3.bottleneckLabel", { name: tr(st.bottleneck.name) })));
      bottleneckEl.appendChild(el("div", "bottleneck-line",
        `${t("stage3.effectiveEfficiency")}${t("common.colon")}${(st.bottleneck.efficiency * 100).toFixed(0)}% · ${t("stage3.upgradeEfficiency")}${t("common.colon")}${(st.bottleneck.upgradeEfficiency * 100).toFixed(0)}% · ${t("stage3.projectedIncome")}${t("common.colon")}${st.bottleneck.projectedIncomeGain}`));
      syncProgress(bottleneckEl.lastElementChild as HTMLElement, st.bottleneck.efficiency * 100);
      bottleneckEl.appendChild(btn(t("stage3.upgradeBottleneck"), `upgrade_infra:${st.bottleneck.id}`, true,
        st.infrastructure.find((i) => i.id === st.bottleneck.id)?.canUpgrade ?? false));
    } else {
      bottleneckEl.appendChild(el("div", "bottleneck-title", t("stage3.noBottleneck")));
    }

    // 基础设施
    infraGridEl.replaceChildren();
    for (const inf of st.infrastructure) {
      const card = el("div", "infra-card");
      card.dataset.infrastructure = inf.id;
      const infraName = el("div", "infra-name");
      setIconText(infraName, contentGameIcon(inf.id, "server"), `${tr(inf.name)} Lv.${inf.level}/${inf.maxLevel}`);
      card.appendChild(infraName);
      card.appendChild(el("div", "infra-desc", tr(inf.desc)));
      if (inf.detail) card.appendChild(el("div", "infra-detail", inf.detail));
      card.appendChild(btn(`${t("action.upgrade")}(${inf.upgradeCost})`, `upgrade_infra:${inf.id}`, false, inf.canUpgrade));
      infraGridEl.appendChild(card);
    }

    // 机房
    roomListEl.replaceChildren();
    for (const r of st.machineRooms) {
      const card = el("div", "room-card" + (r.commissioned ? " owned" : ""));
      card.dataset.roomIndex = String(r.index);
      card.dataset.commissioned = r.commissioned ? "true" : "false";
      const roomName = el("div", "room-name");
      setIconText(roomName, r.commissioned ? "complete" : "server", tr(r.name));
      card.appendChild(roomName);
      if (r.commissioned) {
        card.appendChild(el("div", "room-scale", tr(r.scaleName)));
      } else if (r.index === 2 || r.index === 3) {
        card.appendChild(el("div", "room-require",
          `${t("infra.power.name")} Lv${r.requirements.power} · ${t("infra.computeCards.name")} Lv${r.requirements.computeCards} · ${t("infra.optical.name")} Lv${r.requirements.optical} · ${t("infra.storage.name")} Lv${r.requirements.storage}`));
        const prerequisiteDone = r.index === 2
          ? st.flagship.some((f) => f.id === "project_1" && f.completed)
          : st.flagship.some((f) => f.id === "project_2" && f.completed);
        if (r.index === 2 && !prerequisiteDone) {
          card.appendChild(el("div", "room-gate", `${t("stage3.needPrereq")}${t("common.colon")}${t("flagship.1.name")}`));
        } else if (r.index === 3 && !prerequisiteDone) {
          card.appendChild(el("div", "room-gate", `${t("stage3.needPrereq")}${t("common.colon")}${t("flagship.2.name")}`));
        } else if (r.requirementsMet) {
          card.appendChild(btn(t("stage3.commissionRoom", { name: tr(r.name) }), `commission_room:${r.index}`, true));
        }
      }
      roomListEl.appendChild(card);
    }

    // 旗舰工程进行中
    flagshipActiveEl.replaceChildren();
    const active = st.flagship.find((f) => f.activeId);
    if (active) {
      const activeName = el("div", "flagship-active-name");
      setIconText(activeName, contentGameIcon(active.id, "project_1"), tr(active.name));
      flagshipActiveEl.appendChild(activeName);
      const progress = el("div", "flagship-active-progress", `${t("stage3.progressLabel")}${t("common.colon")}${active.progressLabel} · ${t("stage3.contributeCompute")}${t("common.colon")}${active.totalCompute}`);
      syncProgress(progress, Number.parseFloat(active.progressLabel));
      flagshipActiveEl.appendChild(progress);
    } else {
      flagshipActiveEl.style.display = "none";
    }
    const pending = st.flagship.find((f) => f.pendingRewardId);
    if (pending) {
      const pendingReward = el("div", "flagship-reward-ready");
      setIconText(pendingReward, "reward", `${tr(pending.pendingRewardName)} · ${t("common.pendingClaim")}`);
      flagshipActiveEl.appendChild(pendingReward);
      flagshipActiveEl.appendChild(btn(t("stage3.claimFlagshipReward"), "claim_flagship_reward", true));
      flagshipActiveEl.style.display = "";
    } else if (!active) {
      flagshipActiveEl.style.display = "none";
    }

    // 旗舰工程列表
    flagshipListEl.replaceChildren();
    for (const f of st.flagship) {
      if (f.pendingRewardId) continue;
      if (f.activeId) continue;
      const stateClass = f.canStart ? " available" : f.completed ? " completed" : !f.unlocked ? " locked" : "";
      const card = el("div", "flagship-card" + stateClass);
      card.dataset.projectId = f.id;
      const flagshipName = el("div", "flagship-name");
      setIconText(flagshipName, contentGameIcon(f.id, "project_1"), tr(f.name));
      card.appendChild(flagshipName);
      card.appendChild(el("div", "flagship-reward", tr(f.rewardText)));
      if (f.canStart) {
        card.appendChild(btn(t("stage3.startProject"), `start_flagship:${f.id}`, true));
      } else if (f.completed) {
        const completed = el("div", "flagship-completed");
        setIconText(completed, "complete", t("common.done"));
        card.appendChild(completed);
      } else if (!f.unlocked) {
        card.appendChild(el("div", "flagship-locked", f.requirementsText));
      } else {
        card.appendChild(el("div", "flagship-locked", t("stage3.started")));
      }
      flagshipListEl.appendChild(card);
    }

  }

  function patchStage3(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    const st = vm.stage3;
    // 投产红利（高频文本）
    if (st.commissionBonusActive) {
      setIconText(commissionBonusEl, "celebration", t("stage3.commissionBonus", { remaining: st.commissionBonusRemaining }));
      commissionBonusEl.style.display = "";
    } else {
      setText(commissionBonusEl, "");
      commissionBonusEl.style.display = "none";
    }
    // 旗舰工程进行中进度
    const active = st.flagship.find((f) => f.activeId);
    if (active) {
      flagshipActiveEl.style.display = "";
      const prog = flagshipActiveEl.querySelector(".flagship-active-progress");
      if (prog) {
        setText(prog as HTMLElement, `${t("stage3.progressLabel")}${t("common.colon")}${active.progressLabel} · ${t("stage3.contributeCompute")}${t("common.colon")}${active.totalCompute}`);
        syncProgress(prog as HTMLElement, Number.parseFloat(active.progressLabel));
      }
    } else if (!st.flagship.some((f) => f.pendingRewardId)) {
      flagshipActiveEl.style.display = "none";
    }
    // 基础设施按钮禁用态（含当前瓶颈卡中的同一升级动作）
    for (const inf of st.infrastructure) {
      const btns = stage3Section.querySelectorAll(`button[data-action='upgrade_infra:${inf.id}']`);
      for (const b of btns) {
        syncButtonAffordance(b as HTMLButtonElement, inf.canUpgrade);
      }
    }
  }

  // ============ 算力档案馆 ============
  function sigForArchive(vm: ViewModel): string {
    return JSON.stringify({
      tab: archiveTab,
      category: archiveCategory,
      models: vm.modelArchive.map((m) => [m.id, m.owned, m.current, m.archiveLevel, m.researchCount, m.lifetimeTrainingCount]),
      blueprints: vm.stage3.blueprints.map((b) => [b.id, b.owned, b.active, b.level]),
      tech: vm.stage3.techArchive.map((t) => [t.id, t.unlocked]),
      eras: vm.stage3.eraArchive.map((e) => [e.id, e.reached]),
      growth: vm.growthHistory.enabled
        ? [
            vm.growthHistory.iterationHistory,
            vm.growthHistory.singularityCores,
            vm.growthHistory.civilizationStages,
            vm.growthHistory.galacticEras,
          ]
        : null,
      legendary: vm.legendaryArchive,
      achievements: vm.achievements.map((achievement) => [achievement.id, achievement.achieved]),
      singularity: vm.singularity.active
        ? [vm.singularity.label, vm.singularity.round, vm.singularity.coreClaimable, vm.singularity.spacePlanRevealed]
        : null,
    });
  }

  function rebuildArchive(vm: ViewModel | null): void {
    if (!vm) return;
    archiveTabsEl.replaceChildren();
    archivePanelEl.replaceChildren();
    const tabs = [
      { id: "catalog", label: "archive.tab.catalog", icon: "archive" as GameIconName },
      { id: "achievements", label: "archive.tab.achievements", icon: "achieved" as GameIconName },
      { id: "hall", label: "archive.tab.hall", icon: "honor" as GameIconName },
    ];
    const activeTab = tabs.some((t) => t.id === archiveTab) ? archiveTab : "catalog";

    for (const t of tabs) {
      const b = btn(tr(t.label), `archive_tab:${t.id}`, activeTab === t.id);
      setIconText(b, t.icon, tr(t.label));
      archiveTabsEl.appendChild(b);
    }

    if (activeTab === "catalog") {
      const categories = [
        { id: "models", label: "archive.category.models", icon: "models" as GameIconName },
        { id: "blueprints", label: "archive.category.blueprints", icon: "blueprints" as GameIconName },
        { id: "tech", label: "archive.category.tech", icon: "tech" as GameIconName },
        { id: "eras", label: "archive.category.eras", icon: "eras" as GameIconName },
        ...(vm.singularity.active ? [{ id: "singularity", label: "archive.category.singularity", icon: "singularity" as GameIconName }] : []),
        ...(vm.growthHistory.enabled ? [{ id: "growth", label: "archive.category.growth", icon: "growth" as GameIconName }] : []),
        ...(vm.growthHistory.enabled ? [{ id: "legendary", label: "archive.category.legendary", icon: "legendary" as GameIconName }] : []),
      ];
      const categoryBar = el("div", "archive-categories");
      const activeCategory = categories.some((item) => item.id === archiveCategory) ? archiveCategory : "models";
      archiveCategory = activeCategory;
      for (const category of categories) {
        const categoryButton = btn(category.label, `archive_category:${category.id}`, activeCategory === category.id);
        setIconText(categoryButton, category.icon, tr(category.label));
        categoryBar.appendChild(categoryButton);
      }
      archivePanelEl.appendChild(categoryBar);
    }

    const contentTab = activeTab === "catalog" ? archiveCategory : activeTab;

    if (contentTab === "models") {
      const list = el("div", "archive-models");
      for (const model of vm.modelArchive) {
        const card = el("div", "archive-card" + (model.owned ? "" : " locked") + (model.current ? " current" : ""));
        const title = el("div", "archive-card-title");
        setIconText(title, modelGameIcon(model.id),
          `${model.owned ? tr(model.name) : t("archive.notOwned")}${model.current ? t("archive.currentActive") : ""}`);
        card.appendChild(title);
        card.appendChild(el("div", "archive-card-line", `${tr(model.roleLabel)} · ${tr(model.effectText)}`));
        const details = el("div", "archive-card-line", model.owned
          ? `${t("archive.blueprintLevel")} Lv.${model.archiveLevel} · ${t("archive.researchCount")} ${model.researchCount} · ${t("archive.lifetimeTraining")} ${model.lifetimeTrainingCount} · ${t("archive.lifetimeContribution")} ${model.lifetimeContribution}`
          : t("archive.continueResearch"));
        details.dataset.modelId = model.id;
        card.appendChild(details);
        list.appendChild(card);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "blueprints") {
      const list = el("div", "archive-blueprints");
      for (const bp of vm.stage3.blueprints) {
        const card = el("div", "archive-card" + (bp.active ? " active" : ""));
        const title = el("div", "archive-card-title");
        setIconText(title, contentGameIcon(bp.id, "blueprints"), `${tr(bp.name)}${bp.owned ? t("archive.unlocked") : t("archive.locked")}`);
        card.appendChild(title);
        card.appendChild(el("div", "archive-card-line", tr(bp.desc)));
        list.appendChild(card);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "tech") {
      const list = el("div", "archive-tech");
      for (const t of vm.stage3.techArchive) {
        const card = el("div", "archive-card" + (t.unlocked ? "" : " locked"));
        const title = el("div", "archive-card-title");
        setIconText(title, t.unlocked ? "unlocked" : "locked", tr(t.name));
        card.appendChild(title);
        card.appendChild(el("div", "archive-card-line", tr(t.desc)));
        list.appendChild(card);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "eras") {
      const list = el("div", "archive-eras");
      for (const e of vm.stage3.eraArchive) {
        const card = el("div", "archive-card" + (e.reached ? "" : " locked"));
        const title = el("div", "archive-card-title");
        setIconText(title, e.reached ? "achieved" : "locked", tr(e.name));
        card.appendChild(title);
        list.appendChild(card);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "singularity") {
      const list = el("div", "archive-singularity");
      const claimed = vm.singularity.label ?? "0/3";
      list.appendChild(el("div", "archive-card",
        `${t("app.singularityBadge", { label: `${claimed}/3` })}${vm.singularity.coreClaimable ? t("archive.claimable") : ""}`));
      if (vm.singularity.spacePlanRevealed) {
        list.appendChild(el("div", "archive-card",
          t("archive.spacePlanRevealed")));
        if (vm.singularity.spacePlanStarted) {
          list.appendChild(el("div", "archive-card",
            vm.stage5.entered
              ? t("archive.spacePlanStartedGalaxy")
              : t("archive.spacePlanStartedLunar")));
        } else {
          list.appendChild(btn(t("archive.startSpacePlan"), "start_space_plan", true));
        }
      } else if (vm.singularity.round != null) {
        list.appendChild(el("div", "archive-card",
          t("archive.roundHint", { round: vm.singularity.round })));
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "growth") {
      const list = el("div", "archive-growth");
      const history = vm.growthHistory;
      list.appendChild(el("div", "archive-subtitle", t("archive.subtitle.models")));
      list.appendChild(el("div", "archive-card-line", `${t("archive.recordedModels")}${t("common.colon")}${history.modelHistory.filter((m) => m.owned).length}/${history.modelHistory.length}`));
      list.appendChild(el("div", "archive-subtitle", t("archive.subtitle.iterations")));
      if (history.iterationHistory.length === 0) list.appendChild(el("div", "archive-card-line", t("archive.noIterations")));
      for (const iteration of history.iterationHistory) {
        list.appendChild(el("div", "archive-card", `${tr(iteration.label)} · ${t("archive.permanentIncome")} ${iteration.multiplier}`));
      }
      list.appendChild(el("div", "archive-subtitle", t("archive.subtitle.cores")));
      for (const core of history.singularityCores) {
        const coreCard = el("div", "archive-card" + (core.claimed ? "" : " locked"));
        setIconText(coreCard, core.claimed ? "singularity" : "locked", tr(core.label));
        list.appendChild(coreCard);
      }
      list.appendChild(el("div", "archive-subtitle", t("archive.subtitle.civilization")));
      for (const stage of history.civilizationStages) {
        const card = el("div", "archive-card" + (stage.reached ? "" : " locked"));
        const title = el("div", "archive-card-title");
        setIconText(title, stage.reached ? "achieved" : "locked", tr(stage.name));
        card.appendChild(title);
        if (stage.reached && stage.reachedAtMs > 0) {
          card.appendChild(el("div", "archive-card-line", `${t("archive.reachedAt")}${t("common.colon")}${new Date(stage.reachedAtMs).toLocaleString(getLocale(), { timeZone: "Asia/Shanghai" })}`));
        }
        list.appendChild(card);
      }
      list.appendChild(el("div", "archive-subtitle", t("archive.subtitle.galacticEras")));
      if (history.galacticEras.length === 0) list.appendChild(el("div", "archive-card-line", t("archive.noGalacticEras")));
      for (const era of history.galacticEras) {
        const eraCard = el("div", "archive-card");
        setIconText(eraCard, "eras", tr(era.name));
        list.appendChild(eraCard);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "legendary") {
      const list = el("div", "archive-legendary");
      if (vm.legendaryArchive) {
        const archive = vm.legendaryArchive;
        const title = el("div", "archive-card-title");
        setIconText(title, "legendary", t("archive.legendaryTitle"));
        list.appendChild(title);
        list.appendChild(el("div", "archive-card-line", `${t("archive.completedAt")}${t("common.colon")}${new Date(archive.completedAtMs).toLocaleString(getLocale())}`));
        list.appendChild(el("div", "archive-card-line", `${t("archive.maxCompute")}${t("common.colon")}${archive.maxCompute}`));
        list.appendChild(el("div", "archive-card-line", `${t("archive.maxIncome")}${t("common.colon")}${archive.maxIncome}/s`));
        list.appendChild(el("div", "archive-card-line", `${t("archive.reachedEra")}${t("common.colon")}${tr(archive.reachedEra)}`));
      } else {
        list.appendChild(el("div", "archive-card locked", t("archive.legendaryLocked")));
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "achievements") {
      const list = el("div", "archive-achievements");
      const achieved = vm.achievements.filter((item) => item.achieved).length;
      list.appendChild(el("div", "archive-subtitle", `${t("archive.milestones")} ${achieved}/${vm.achievements.length}`));
      for (const item of vm.achievements) {
        const card = el("div", "archive-card" + (item.achieved ? "" : " locked"));
        const title = el("div", "archive-card-title");
        setIconText(title, item.achieved ? "achieved" : "locked", tr(item.name));
        card.appendChild(title);
        card.appendChild(el("div", "archive-card-line", item.description));
        if (item.achievedAtMs > 0) {
          card.appendChild(el("div", "archive-card-line", `${t("archive.achievedAt")}${t("common.colon")}${new Date(item.achievedAtMs).toLocaleString(getLocale(), { timeZone: "Asia/Shanghai" })}`));
        }
        list.appendChild(card);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "hall") {
      const list = el("div", "archive-hall");
      const hallTitle = el("div", "archive-card-title");
      setIconText(hallTitle, "honor", t("hall.title"));
      list.appendChild(hallTitle);
      const personal = el("div", "archive-card hall-personal-record");
      personal.appendChild(el("div", "archive-card-title", t("archive.myRecords")));
      personal.appendChild(el("div", "archive-card-line", `${t("archive.currentWealth")}${t("common.colon")}${vm.money} · ${t("app.workshop", { level: vm.workshop.level, exp: "", next: "" })}`));
      if (vm.legendaryArchive) {
        const elapsedMs = Math.max(0, vm.legendaryArchive.completedAtMs - vm.createdAtMs);
        const totalMinutes = Math.floor(elapsedMs / 60_000);
        const duration = formatDuration(totalMinutes);
        personal.appendChild(el("div", "archive-card-line", `${t("archive.dysonCompletedAt")}${t("common.colon")}${new Date(vm.legendaryArchive.completedAtMs).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`));
        personal.appendChild(el("div", "archive-card-line", `${t("archive.clearTime")}${t("common.colon")}${duration} · ${t("archive.maxCompute")}${t("common.colon")}${vm.legendaryArchive.maxCompute}`));
      } else {
        personal.appendChild(el("div", "archive-card-line", t("archive.clearTimeHint")));
      }
      list.appendChild(personal);
      list.appendChild(el("div", "archive-card hall-board-contract",
        t("hall.rules")));
      list.appendChild(el("div", "archive-card-line", `${t("hall.serviceStatus")}${t("common.colon")}${tr(platformStatus.leaderboard)}`));
      list.appendChild(btn(t("hall.viewFastest"), "open_leaderboard:fastest", true));
      list.appendChild(btn(t("hall.viewWealth"), "open_leaderboard:wealth", true));
      archivePanelEl.appendChild(list);
    }
  }

  function patchArchive(vm: ViewModel): void {
    if (archiveTab !== "catalog" || archiveCategory !== "models") return;
    for (const model of vm.modelArchive) {
      const details = archivePanelEl.querySelector(`[data-model-id="${model.id}"]`) as HTMLElement | null;
      if (!details) continue;
      setText(details, model.owned
        ? `${t("archive.blueprintLevel")} Lv.${model.archiveLevel} · ${t("archive.researchCount")} ${model.researchCount} · ${t("archive.lifetimeTraining")} ${model.lifetimeTrainingCount} · ${t("archive.lifetimeContribution")} ${model.lifetimeContribution}`
        : t("archive.continueResearch"));
    }
  }

  return {
    render,
    setCommandHandler(h) { handler = h; },
    showToast,
    confirmDialog,
    getElement() { return root; },
    destroy,
    getMetrics() {
      const feelMetrics = finalFeel.getMetrics();
      return {
        ...metrics,
        feelStableNodeCount: feelMetrics.stableNodeCount,
        feelParticleNodeCount: feelMetrics.particleNodeCount,
        feelFeedbackCount: feelMetrics.feedbackCount,
        feelActionEdgeCount: feelMetrics.actionEdgeCount,
      };
    },
    resetMetrics() {
      metrics.fullRenderCount = 0;
      metrics.partialPatchCount = 0;
      metrics.orderCompletionCount = 0;
      metrics.rootReplacementCount = 0;
    },
    setPlatformStatus,
    showGrowthFeedback(event) { finalFeel.showFeedback(event); },
    setVisualPaused(paused) { finalFeel.setPaused(paused); },
    incrementOrderCompletion(by: number) {
      metrics.orderCompletionCount += by;
    },
  };
}
