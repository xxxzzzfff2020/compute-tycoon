// UI 渲染：只读 ViewModel → DOM。命令经 onCommand 回调，UI 不直接改状态。
// 渲染合同（v2 局部渲染）：
// - 静态结构只创建一次，保存稳定节点引用；
// - 高频字段（资金/收入/算力/经验/进度条/按钮禁用态）用 textContent/style 局部更新；
// - 每个 section 有结构签名（结构性事件才变化），签名不变时只 patch，不重建 DOM；
// - 普通订单完成自动结算；每秒 Tick 不替换任何 section、不重建根节点；
// - 结构性事件（获取模型/解锁自动化/获得首服/阶段切换/技术迭代）才重建对应 section。
import type { ViewModel } from "../economy/viewmodel";
import type { GrowthFeedbackEvent } from "../economy/feel";
import type { ArchitectureReceipt, CommandResult } from "../app/session";
import { TALENT_POINT_CAP } from "../economy/incremental-growth";
import { ORDER_QUEUE_CAP } from "../data/content";
import { loadAudioPreferences, saveAudioPreferences, type InteractionFeedbackKind } from "../audio/game-audio";
import { getLocale, t } from "../i18n";
import {
  blueprintGameIcon,
  contentGameIcon,
  createGameIcon,
  createGameObjectHeader,
  modelGameIcon,
  orderGameIcon,
  serverGameIcon,
  setIconText,
  setNavigationIconText,
  type GameIconName,
} from "./icons";
import { createFinalFeelController } from "./final-feel";

export type CommandHandler = (command: string, payload?: unknown) => CommandResult;
type AppPage = "business" | "honor" | "sponsor" | "menu";
/** 正式交付包不创建调速 DOM；普通开发/验收构建保持原能力。 */
const RELEASE_PACKAGE_MODE = import.meta.env.VITE_RELEASE_PACKAGE === "1";
/** 方案 E 专用本地验收层；不进入正式构建。 */
const CANDIDATE_E_DEBUG_MODE = import.meta.env.VITE_CANDIDATE_E_DEBUG === "1";

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
  setInteractionFeedbackHandler(handler: (kind: InteractionFeedbackKind) => void): void;
  showToast(text: string): void;
  confirmDialog(options: { title: string; body: string; confirmText: string; onConfirm: () => void }): void;
  getElement(): HTMLElement;
  destroy(): void;
  getMetrics(): RenderMetrics;
  resetMetrics(): void;
  setPlatformStatus(status: PlatformPresentationStatus): void;
  /** 方案 E 专用：更新本次加速测试的时间轴与变量快照，不写存档。 */
  setDebugRuntime(vm: ViewModel, elapsedGameSec: number, runtimeSpeed: number): void;
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
  let interactionFeedbackHandler: (kind: InteractionFeedbackKind) => void = () => undefined;
  const emitInteractionFeedback = (kind: InteractionFeedbackKind): void => interactionFeedbackHandler(kind);
  let toastEl: HTMLDivElement | null = null;
  let toastTimer: number | null = null;
  let honorTabBubbleEl: HTMLElement | null = null;
  let sponsorTabBubbleEl: HTMLElement | null = null;

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
  const companyEl = el("span", "stat");
  const companyIdentityEl = el("span", "stat-company-line stat-company-identity", t("app.companyIdentity", {
    level: "1",
    title: t("company.title.startupStudio"),
  }));
  const companyExperienceEl = el("span", "stat-company-line stat-company-experience", t("app.companyExperience", {
    exp: "0",
    next: "100",
  }));
  const revenueEl = el("span", "stat", t("app.revenue", { value: "0" }));
  incomeEl.classList.add("stat-income");
  computeEl.classList.add("stat-compute");
  multEl.classList.add("stat-multiplier");
  companyEl.classList.add("stat-company");
  companyEl.append(companyIdentityEl, companyExperienceEl);
  revenueEl.classList.add("stat-revenue");
  stageLineEl.append(stageEl, singularityBadgeEl);
  statsEl.append(incomeEl, computeEl, multEl, architectureEl, companyEl, revenueEl);
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
  // 推荐操作先定位到真实按钮，再通过同一命令总线执行；不创建第二套经济入口。
  let revealFeelAction: ((action: string) => void) | null = null;
  let executeFeelAction: ((action: string) => void) | null = null;
  const finalFeel = createFinalFeelController(root, moneyEl, {
    beforeNavigate: (action) => revealFeelAction?.(action),
    executeAction: (action) => executeFeelAction?.(action),
  });
  businessPage.appendChild(finalFeel.element);

  // 经营页拆成订单/模型/蓝图/机房/天赋/时代；模型和订单不再挤在同一屏。
  const BUSINESS_TAB_DEFS: ReadonlyArray<{ id: string; labelKey: string; icon: GameIconName }> = [
    { id: "operations", labelKey: "business.tab.operations", icon: "business" },
    { id: "models", labelKey: "business.tab.models", icon: "models" },
    { id: "blueprints", labelKey: "business.tab.blueprints", icon: "blueprints" },
    { id: "facility", labelKey: "business.tab.facility", icon: "server" },
    { id: "talents", labelKey: "business.tab.talents", icon: "growth" },
    { id: "era", labelKey: "business.tab.era", icon: "eras" },
  ];
  let businessTab = "operations";
  const businessPanels: Record<string, HTMLElement> = {};
  const businessTabButtons: Record<string, HTMLButtonElement> = {};
  const businessTabBubbles: Record<string, HTMLElement> = {};
  let lastScrolledBusinessTabButton: HTMLButtonElement | null = null;
  let eraEntryRevealKey = "";
  const businessTabsEl = el("div", "business-tabs");
  businessPage.appendChild(businessTabsEl);
  for (const tab of BUSINESS_TAB_DEFS) {
    const panel = el("div", "business-tab-panel");
    panel.id = `business-panel-${tab.id}`;
    panel.dataset.tab = tab.id;
    panel.classList.toggle("hidden", tab.id !== businessTab);
    businessPanels[tab.id] = panel;
    businessPage.appendChild(panel);
  }
  const buildBusinessTabs = (): void => {
    businessTabsEl.replaceChildren();
    for (const tab of BUSINESS_TAB_DEFS) {
      const button = btn(t(tab.labelKey), `business_tab:${tab.id}`, false, true);
      button.classList.add("business-tab");
      const selected = businessTab === tab.id;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-controls", `business-panel-${tab.id}`);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
      setNavigationIconText(button, tab.icon, t(tab.labelKey));
      const bubble = el("span", "tab-bubble");
      bubble.hidden = true;
      button.appendChild(bubble);
      businessTabButtons[tab.id] = button;
      businessTabBubbles[tab.id] = bubble;
      businessTabsEl.appendChild(button);
    }
  };
  const ensureBusinessTabVisible = (tabId = businessTab): void => {
    const button = businessTabButtons[tabId];
    if (!button || button === lastScrolledBusinessTabButton) return;
    lastScrolledBusinessTabButton = button;
    const reveal = () => button.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(reveal);
    else window.setTimeout(reveal, 0);
  };
  buildBusinessTabs();

  revealFeelAction = (action: string): void => {
    const tab = action === "acquire_model" || action === "train_model"
      ? "models"
      : action.startsWith("upgrade_blueprint:")
      ? "blueprints"
      : action.startsWith("expand_server_scale:") || action === "buy_server" || action === "buy_max_servers" || action === "enable_rental"
        ? "facility"
      : action.startsWith("allocate_talent:")
          ? "talents"
          : action.startsWith("start_flagship:") || action.startsWith("upgrade_infra:") || action.startsWith("commission_room:")
            || action.startsWith("buy_node:") || action.startsWith("buy_stage5_node:")
            || action === "start_stage4_project" || action === "start_stage5_project" || action === "start_stage5"
            || action === "claim_flagship_reward" || action === "claim_stage4_reward" || action === "claim_stage5_reward"
            || action === "claim_core" || action === "prestige" || action === "start_space_plan"
            || action === "complete_stage2_settlement" || action === "enter_stage3"
            ? "era"
            : "operations";
    if (businessTab === tab) return;
    businessTab = tab;
    buildBusinessTabs();
    if (lastVm) syncBusinessTabs(lastVm);
    ensureBusinessTabVisible();
  };

  const modelSection = section("section-model", t("section.model"));
  const modelBody = modelSection.querySelector(".section-body") as HTMLElement;
  const modelCard = el("div", "card");
  // 当前主力只保留文字同高的小图标；下方模型目录才使用完整大图，避免同屏重复。
  const modelHeaderEl = el("div", "model-summary-header");
  const modelIconPlateEl = el("span", "model-summary-icon");
  modelIconPlateEl.appendChild(createGameIcon("models", "game-icon"));
  modelIconPlateEl.dataset.objectIcon = "models";
  const syncModelObjectIcon = (name: GameIconName): void => {
    if (modelIconPlateEl.dataset.objectIcon === name) return;
    modelIconPlateEl.dataset.objectIcon = name;
    modelIconPlateEl.replaceChildren(createGameIcon(name, "game-icon"));
  };
  const modelCopyEl = el("div", "model-summary-copy");
  const modelNameEl = el("div", "model-name model-summary-title", t("model.notAcquired"));
  const modelStatsEl = el("div", "model-stats model-summary-subtitle", t("model.stats", { compute: "0", cost: "-" }));
  modelCopyEl.append(modelNameEl, modelStatsEl);
  modelHeaderEl.append(modelIconPlateEl, modelCopyEl);
  const modelActionsEl = el("div", "model-actions");
  const trainPreviewEl = el("div", "train-preview", "");
  const modelCatalogEl = el("div", "model-catalog");
  modelCard.append(modelHeaderEl, modelActionsEl, trainPreviewEl);
  modelBody.append(modelCard, modelCatalogEl);
  businessPanels.models.appendChild(modelSection);

  // CARD-02：六蓝图全局算力（独立于服务器，不再逐服切换）。
  const blueprintGrowthSection = section("section-blueprint-growth", t("growth.blueprints.title"), true);
  const blueprintGrowthBody = blueprintGrowthSection.querySelector(".section-body") as HTMLElement;
  const blueprintGrowthSummaryEl = el("div", "growth-summary");
  const blueprintGrowthGridEl = el("div", "blueprint-growth-grid");
  const blueprintRecommendEl = el("div", "growth-actions blueprint-quick-actions");
  // 推荐付费升级是蓝图页的首要行动；放在总览之后、卡片列表之前。
  blueprintGrowthBody.append(
    blueprintGrowthSummaryEl,
    blueprintRecommendEl,
    blueprintGrowthGridEl,
  );
  businessPanels.blueprints.appendChild(blueprintGrowthSection);

  const orderSection = section("section-orders", t("section.orders"), true);
  const orderBody = orderSection.querySelector(".section-body") as HTMLElement;
  const orderListEl = el("div", "order-list");
  const orderSummaryEl = el("div", "order-summary", "");
  const orderAutomationEl = el("div", "order-automation-panel");
  // 自动经营每秒都会变更队列数。保留这两个稳定节点，只补丁文案，
  // 避免随着自动接单/结算反复卸载并重建整个提示面板。
  let orderAutomationMode: "locked" | "ready" | "running" | null = null;
  let orderAutomationStatusEl: HTMLElement | null = null;
  type OrderRowRefs = {
    row: HTMLElement;
    queueLabel: HTMLElement;
    slots: Array<{
      slot: HTMLElement;
      fill: HTMLElement;
      label: HTMLElement;
    }>;
    acceptButton: HTMLButtonElement | null;
    unlockButton: HTMLButtonElement | null;
  };
  const orderRowRefs = new Map<string, OrderRowRefs>();
  orderBody.classList.add("order-board");
  orderListEl.dataset.role = "available-orders";
  orderBody.append(orderAutomationEl, orderSummaryEl, orderListEl);
  businessPanels.operations.appendChild(orderSection);

  const serverSection = section("section-server", t("section.server"), true);
  const serverBody = serverSection.querySelector(".section-body") as HTMLElement;
  const srvBody = el("div", "server-body");
  const fleetEl = el("div", "fleet", "");
  const serverProgressEl = el("div", "server-progress", "");
  const serverActionsEl = el("div", "server-actions");
  srvBody.append(fleetEl, serverProgressEl, serverActionsEl);
  serverBody.appendChild(srvBody);
  businessPanels.facility.appendChild(serverSection);

  // CARD-02：服务器横滑世代 + 单详情卡。第1单元仍等于原服务器，继续投资扩规模。
  const scaleGrowthSection = section("section-scale-growth", t("growth.scale.title"), true);
  const scaleGrowthBody = scaleGrowthSection.querySelector(".section-body") as HTMLElement;
  const scaleSummaryEl = el("div", "growth-summary");
  const scaleRailEl = el("div", "scale-generation-rail");
  const scaleRailHintEl = el("div", "scale-generation-hint");
  const scaleDetailEl = el("div", "scale-detail-card");
  scaleGrowthBody.append(scaleSummaryEl, scaleRailHintEl, scaleRailEl, scaleDetailEl);
  businessPanels.facility.appendChild(scaleGrowthSection);

  const talentSection = section("section-talents", t("growth.talent.title"), true);
  const talentBody = talentSection.querySelector(".section-body") as HTMLElement;
  const talentSummaryEl = el("div", "growth-summary");
  const talentGridEl = el("div", "talent-grid");
  const talentActionsEl = el("div", "growth-actions");
  talentBody.append(talentSummaryEl, talentGridEl, talentActionsEl);
  businessPanels.talents.appendChild(talentSection);

  const centerSection = section("section-center", t("section.center"), true);
  const centerBody = centerSection.querySelector(".section-body") as HTMLElement;
  const centerInfoEl = el("div", "center-info", "");
  const centerActionsEl = el("div", "center-actions");
  centerBody.append(centerInfoEl, centerActionsEl);
  businessPanels.era.appendChild(centerSection);

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
  businessPanels.era.appendChild(stage3Section);

  // CARD-02 Stage 4：地月算力网（隔离终局档专属；进入后取代地球经营区）
  const stage4Section = section("section-stage4", t("section.stage4"), true);
  const stage4Body = stage4Section.querySelector(".section-body") as HTMLElement;
  const stage4EntryEl = el("div", "stage4-entry", "");
  const stage4NodesEl = el("div", "stage4-nodes", "");
  const stage4ProjectEl = el("div", "stage4-project", "");
  stage4Body.append(stage4EntryEl, stage4NodesEl, stage4ProjectEl);
  businessPanels.era.appendChild(stage4Section);

  // CARD-03 Stage 5：戴森算力纪元（进入后取代 Stage 4 经营区）
  const stage5Section = section("section-stage5", t("section.stage5"), true);
  const stage5Body = stage5Section.querySelector(".section-body") as HTMLElement;
  const stage5EntryEl = el("div", "stage5-entry", "");
  const stage5NodesEl = el("div", "stage5-nodes", "");
  const stage5ProjectEl = el("div", "stage5-project", "");
  const stage5StoryEl = el("div", "stage5-story", "");
  stage5Body.append(stage5EntryEl, stage5NodesEl, stage5ProjectEl, stage5StoryEl);
  businessPanels.era.appendChild(stage5Section);

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
  businessPanels.era.appendChild(prestigeSection);

  const sponsorSection = section("section-sponsor", t("section.sponsor"));
  const sponsorBody = sponsorSection.querySelector(".section-body") as HTMLElement;
  const sponsorIntroEl = el("div", "sponsor-intro", t("standalone.adsDisabled"));
  const offlineSponsorCardEl = el("div", "sponsor-card sponsor-card--offline");
  const incomeSponsorCardEl = el("div", "sponsor-card sponsor-card--income");
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
    setNavigationIconText(button, item.icon, item.label);
    // CARD-06 负责人反馈：荣誉馆底部气泡（有成就可领取时显示红点计数）。
    if (item.page === "honor") {
      honorTabBubbleEl = el("span", "tab-bubble");
      honorTabBubbleEl.hidden = true;
      button.appendChild(honorTabBubbleEl);
    }
    if (item.page === "sponsor") {
      sponsorTabBubbleEl = el("span", "tab-bubble");
      sponsorTabBubbleEl.hidden = true;
      button.appendChild(sponsorTabBubbleEl);
    }
    toolbar.appendChild(button);
  }
  root.appendChild(toolbar);

  const menuCard = el("div", "game-menu-card");
  menuCard.innerHTML = `
    <div class="game-menu-heading"><strong>${t("menu.title")}</strong></div>
    <div class="game-menu-group game-menu-sensory" aria-label="${t("menu.sound")}"><button type="button" class="btn" data-command="toggle_bgm"></button><button type="button" class="btn" data-command="toggle_haptics"></button></div>
    <label class="game-menu-volume">${t("menu.volume")} <input type="range" min="0" max="100" step="5" aria-label="${t("menu.volume")}"></label>
    <div class="game-menu-group"><span>${t("menu.language")}</span><button type="button" class="btn" data-command="set_locale:zh-CN">${t("menu.languageZh")}</button><button type="button" class="btn" data-command="set_locale:en-US">${t("menu.languageEn")}</button></div>
    <div class="game-menu-status">${t("standalone.status")}</div>
    <div class="game-menu-status">${t("standalone.backupHint")}</div>
    <div class="game-menu-group"><span>${t("menu.data")}</span><button type="button" class="btn" data-command="export_json">${t("common.export")}</button><button type="button" class="btn" data-command="import_json">${t("common.import")}</button><button type="button" class="btn btn-danger" data-command="reset">${t("menu.reset")}</button></div>
    ${RELEASE_PACKAGE_MODE ? "" : `<div class="game-menu-debug platform-review-debug" hidden>
      <strong>${t("menu.debugTitle")}</strong>
      <label class="game-menu-speed">${t("menu.debugSpeed")}
        <select aria-label="${t("menu.debugSpeed")}">
          <option value="1">1×</option><option value="2">2×</option><option value="4">4×</option>
          <option value="8">8×</option><option value="16">16×</option><option value="32">32×</option>
          <option value="64">64×</option><option value="128">128×</option><option value="256">256×</option>
        </select>
      </label>
      ${CANDIDATE_E_DEBUG_MODE ? `<section class="candidate-e-debug-panel" aria-label="方案 E 时间轴与变量调试">
        <div class="candidate-e-debug-heading"><strong>方案 E · 时间轴 / 变量</strong><span data-debug-speed>1×</span></div>
        <div class="candidate-e-debug-clock"><span>本次运行经营时间</span><strong data-debug-time>T+00:00:00</strong></div>
        <dl class="candidate-e-debug-grid">
          <div><dt>阶段 / 轮次</dt><dd data-debug-phase>- </dd></div>
          <div><dt>公司等级</dt><dd data-debug-company>- </dd></div>
          <div><dt>资金</dt><dd data-debug-money>- </dd></div>
          <div><dt>收入 / 秒</dt><dd data-debug-income>- </dd></div>
          <div><dt>服务器</dt><dd data-debug-servers>- </dd></div>
          <div><dt>下台服务器</dt><dd data-debug-next-server>- </dd></div>
          <div><dt>模型</dt><dd data-debug-model>- </dd></div>
          <div><dt>工作室</dt><dd data-debug-workshop>- </dd></div>
          <div><dt>当前工程</dt><dd data-debug-project>- </dd></div>
          <div><dt>太空节点</dt><dd data-debug-nodes>- </dd></div>
          <div><dt>永久倍率</dt><dd data-debug-permanent>- </dd></div>
          <div><dt>离线待领</dt><dd data-debug-offline>- </dd></div>
        </dl>
        <div class="candidate-e-debug-timeline-title">阶段时间轴（本次运行）</div>
        <ol class="candidate-e-debug-timeline" data-debug-timeline></ol>
      </section>` : ""}
    </div>
    <div class="review-tools-host" hidden aria-label="${t("menu.debugTitle")}"></div>`}`;
  menuPage.appendChild(menuCard);
  let destroyed = false;
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.hidden = true;
  importInput.setAttribute("aria-label", t("common.import"));
  menuCard.appendChild(importInput);
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("save_too_large");
      const text = await file.text();
      if (destroyed) return;
      confirmDialog({
        title: t("standalone.importTitle"),
        body: t("standalone.importBody"),
        confirmText: t("common.import"),
        onConfirm: () => {
          const result = handler("import_json", { text });
          if (result.ok) showToast(t("save.imported"));
        },
      });
    } catch {
      if (!destroyed) showToast(t("save.importFailed"));
    }
  });
  const menuStatusEl = menuCard.querySelector(".game-menu-status") as HTMLElement;
  let platformStatus: PlatformPresentationStatus = {
    cloud: t("standalone.status"),
    leaderboard: t("standalone.status"),
    platformReview: false,
  };
  const volumeInput = menuCard.querySelector("input[type='range']") as HTMLInputElement;
  const platformReviewDebugEl = RELEASE_PACKAGE_MODE
    ? null
    : menuCard.querySelector<HTMLElement>(".platform-review-debug");
  const speedSelect = RELEASE_PACKAGE_MODE
    ? null
    : menuCard.querySelector<HTMLSelectElement>(".game-menu-speed select");
  const candidateDebugEl = RELEASE_PACKAGE_MODE
    ? null
    : menuCard.querySelector<HTMLElement>(".candidate-e-debug-panel");
  const debugField = (name: string): HTMLElement | null =>
    candidateDebugEl?.querySelector<HTMLElement>(`[data-debug-${name}]`) ?? null;
  const debugTimelineEl = debugField("timeline");
  const debugEvents: Array<{ elapsedGameSec: number; label: string }> = [];
  let previousDebugMilestone: {
    stage: number;
    iterationCount: number;
    serverCount: number;
    activeProject: string;
    stage4Nodes: number;
    stage5Nodes: number;
    storyCompleted: boolean;
  } | null = null;
  const refreshAudioMenu = () => {
    const preferences = loadAudioPreferences();
    const bgm = menuCard.querySelector("button[data-command='toggle_bgm']") as HTMLButtonElement;
    const haptics = menuCard.querySelector("button[data-command='toggle_haptics']") as HTMLButtonElement;
    bgm.textContent = preferences.bgmEnabled ? t("menu.bgmOn") : t("menu.bgmOff");
    haptics.textContent = preferences.hapticsEnabled ? t("menu.hapticsOn") : t("menu.hapticsOff");
    volumeInput.value = String(Math.round(preferences.volume * 100));
  };
  refreshAudioMenu();
  volumeInput.addEventListener("input", () => {
    const preferences = loadAudioPreferences();
    saveAudioPreferences({ ...preferences, volume: Number(volumeInput.value) / 100 });
  });
  if (speedSelect) {
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
  }

  // ---------- 事件委托（root 捕获，一次绑定） ----------
  // 注意：render 每帧 replaceChildren 会替换按钮节点；真实浏览器中物理点击的
  // mousedown/mouseup 可能落在不同节点，click 事件目标会退化为公共祖先。
  // 因此除了 target.closest，还要按点击坐标回退查找 [data-command]/[data-action]。
  let currentPage: AppPage = "business";
  const setPlatformStatus = (status: PlatformPresentationStatus): void => {
    platformStatus = { ...status };
    setText(menuStatusEl, t("standalone.status"));
    if (platformReviewDebugEl) platformReviewDebugEl.hidden = RELEASE_PACKAGE_MODE || !status.platformReview;
    if (speedSelect) speedSelect.value = String(status.runtimeSpeed ?? 1);
  };
  const formatDebugElapsed = (elapsedGameSec: number): string => {
    const total = Math.max(0, Math.floor(elapsedGameSec));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };
  const setDebugRuntime = (vm: ViewModel, elapsedGameSec: number, runtimeSpeed: number): void => {
    if (!candidateDebugEl) return;
    const activeStage3Project = vm.stage3.flagship.find((project) => project.activeId !== null);
    const activeProject = vm.stage5.finalProject.active
      ? tr(vm.stage5.finalProject.name)
      : vm.stage4.finalProject.active
        ? tr(vm.stage4.finalProject.name)
        : activeStage3Project
          ? tr(activeStage3Project.activeName ?? activeStage3Project.name)
          : "暂无";
    const activeProjectProgress = vm.stage5.finalProject.active
      ? vm.stage5.finalProject.progressLabel
      : vm.stage4.finalProject.active
        ? vm.stage4.finalProject.progressLabel
        : activeStage3Project?.progressLabel ?? "";
    const roundLabel = vm.prestige.round == null ? `迭代 ${vm.iterationCount}` : `R${vm.prestige.round}`;
    const currentMilestone = {
      stage: vm.stage,
      iterationCount: vm.iterationCount,
      serverCount: vm.server.ownedCount,
      activeProject,
      stage4Nodes: vm.stage4.ownedNodeCount,
      stage5Nodes: vm.stage5.ownedNodeCount,
      storyCompleted: vm.stage5.storyCompleted,
    };
    const milestoneLabels: string[] = [];
    if (previousDebugMilestone === null) {
      milestoneLabels.push(`开始：${tr(vm.stageLabel)} · 服务器 ${vm.server.ownedCount}/${vm.server.maxCount}`);
    } else {
      if (currentMilestone.serverCount !== previousDebugMilestone.serverCount) {
        milestoneLabels.push(`服务器 ${currentMilestone.serverCount}/${vm.server.maxCount}`);
      }
      if (currentMilestone.iterationCount !== previousDebugMilestone.iterationCount) {
        milestoneLabels.push(`技术迭代 ${currentMilestone.iterationCount}`);
      }
      if (currentMilestone.stage !== previousDebugMilestone.stage) {
        milestoneLabels.push(`进入 ${tr(vm.stageLabel)}`);
      }
      if (currentMilestone.activeProject !== previousDebugMilestone.activeProject && activeProject !== "暂无") {
        milestoneLabels.push(`启动 ${activeProject}`);
      }
      if (currentMilestone.stage4Nodes !== previousDebugMilestone.stage4Nodes) {
        milestoneLabels.push(`地月节点 ${currentMilestone.stage4Nodes}/${vm.stage4.nodes.length}`);
      }
      if (currentMilestone.stage5Nodes !== previousDebugMilestone.stage5Nodes) {
        milestoneLabels.push(`恒星节点 ${currentMilestone.stage5Nodes}/${vm.stage5.nodes.length}`);
      }
      if (currentMilestone.storyCompleted && !previousDebugMilestone.storyCompleted) {
        milestoneLabels.push("主线通关");
      }
    }
    previousDebugMilestone = currentMilestone;
    if (milestoneLabels.length > 0) {
      debugEvents.push({ elapsedGameSec, label: milestoneLabels.join(" · ") });
      if (debugEvents.length > 16) debugEvents.splice(0, debugEvents.length - 16);
      if (debugTimelineEl) {
        debugTimelineEl.replaceChildren(...debugEvents.map((event) => {
          const item = document.createElement("li");
          item.textContent = `T+${formatDebugElapsed(event.elapsedGameSec)}  ${event.label}`;
          return item;
        }));
      }
    }
    const fields: Record<string, string> = {
      speed: `${runtimeSpeed}×`,
      time: `T+${formatDebugElapsed(elapsedGameSec)}`,
      phase: `${tr(vm.stageLabel)} · ${roundLabel}`,
      company: `Lv.${vm.company.level} · ${tr(vm.company.title)}`,
      money: vm.money,
      income: vm.incomePerSec,
      servers: `${vm.server.ownedCount}/${vm.server.maxCount} · ${tr(vm.server.phaseLabel)}`,
      "next-server": vm.server.nextName ? `${tr(vm.server.nextName)} · ${vm.server.nextCost ?? "-"}` : "已全部解锁",
      model: `${tr(vm.model.name)} Lv.${vm.model.level}/${vm.model.maxLevel} · 算力 ${vm.compute}`,
      workshop: `Lv.${vm.workshop.level} · 经验 ${vm.workshop.experience}/${vm.workshop.experienceToNextLevel}`,
      project: activeProjectProgress ? `${activeProject} · ${activeProjectProgress}` : activeProject,
      nodes: `地月 ${vm.stage4.ownedNodeCount}/${vm.stage4.nodes.length} · 恒星 ${vm.stage5.ownedNodeCount}/${vm.stage5.nodes.length}`,
      permanent: vm.permanentMultiplier,
      offline: vm.offline.hasPending ? `${vm.offline.remainingLabel} · ${vm.offline.money}` : "无",
    };
    for (const [name, value] of Object.entries(fields)) {
      const field = debugField(name);
      if (field) field.textContent = value;
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
    refreshVisualMotionBudget();
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const runCommand = (command: string): void => {
    if (command === "import_json") {
      importInput.click();
      return;
    }
    if (command.startsWith("page:")) {
      setCurrentPage(command.slice("page:".length) as AppPage);
      emitInteractionFeedback("click");
      return;
    }
    if (command.startsWith("select_scale:")) {
      selectedScaleServerId = command.slice("select_scale:".length);
      if (lastVm) {
        sigGrowth = "";
        renderGrowth(lastVm);
        sigGrowth = sigForGrowth(lastVm);
      }
      emitInteractionFeedback("click");
      return;
    }
    if (command === "toggle_bgm" || command === "toggle_haptics") {
      const preferences = loadAudioPreferences();
      saveAudioPreferences(command === "toggle_bgm"
        ? { ...preferences, bgmEnabled: !preferences.bgmEnabled }
        : { ...preferences, hapticsEnabled: !preferences.hapticsEnabled });
      refreshAudioMenu();
      emitInteractionFeedback("click");
      return;
    }
    if (command === "close_space_reveal") {
      spaceRevealOverlay.hidden = true;
      emitInteractionFeedback("click");
      return;
    }
    if (command === "close_story_complete") {
      storyCompleteOverlay.hidden = true;
      emitInteractionFeedback("click");
      return;
    }
    if (command === "open_space_reveal") {
      spaceRevealOverlay.hidden = false;
      emitInteractionFeedback("click");
      return;
    }
    if (command === "reset") {
      confirmDialog({
        title: t("menu.resetTitle"),
        body: t("menu.resetBody"),
        confirmText: t("menu.resetConfirm"),
        onConfirm: () => { handler("reset"); },
      });
      emitInteractionFeedback("click");
      return;
    }
    if (command === "prestige") {
      showPrestigeConfirmation(false);
      emitInteractionFeedback("click");
      return;
    }
    const result = handler(command);
    handleCommandResult(command, result);
    if (result.ok) scheduleVisualBurst(command);
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
  let longPressTimer: number | null = null;
  let longPressRepeat: number | null = null;
  let longPressAction: string | null = null;
  let longPressFired = false;

  const stopLongPress = (): void => {
    if (longPressTimer !== null) window.clearTimeout(longPressTimer);
    if (longPressRepeat !== null) window.clearInterval(longPressRepeat);
    longPressTimer = null;
    longPressRepeat = null;
    longPressAction = null;
  };

  root.addEventListener("pointerdown", (ev) => {
    downPos = { x: ev.clientX, y: ev.clientY };
    longPressFired = false;
    const target = ev.target as HTMLElement | null;
    const action = target?.closest<HTMLElement>("[data-action]")?.dataset.action ?? null;
    // 《暴富》式长按只用于最小投资按钮，批量/MAX仍保持一次确认一次交易。
    if (action && /^(upgrade_blueprint|expand_server_scale):[^:]+:1$/.test(action)) {
      longPressAction = action;
      longPressTimer = window.setTimeout(() => {
        if (!longPressAction) return;
        longPressFired = true;
        suppressClick = true;
        prefixedHandler(longPressAction);
        longPressRepeat = window.setInterval(() => {
          if (longPressAction) prefixedHandler(longPressAction);
        }, 140);
      }, 450);
    }
  });

  root.addEventListener("pointermove", (ev) => {
    if (!downPos) return;
    if (Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y) > 8) stopLongPress();
  });

  root.addEventListener("pointerup", (ev) => {
    if (!downPos) return;
    const dist = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
    const repeated = longPressFired;
    stopLongPress();
    downPos = null;
    if (repeated) return;
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
  root.addEventListener("pointercancel", () => {
    stopLongPress();
    downPos = null;
  });

  // 带前缀的动作命令：<cmd>:<arg> 由 handler 解析
  const prefixedHandler = (action: string): void => {
    if (action.startsWith("business_tab:")) {
      const next = action.slice("business_tab:".length);
      if (BUSINESS_TAB_DEFS.some((candidate) => candidate.id === next)) businessTab = next;
      buildBusinessTabs();
      if (lastVm) syncBusinessTabs(lastVm);
      ensureBusinessTabVisible();
      refreshVisualMotionBudget();
      emitInteractionFeedback("click");
      return;
    }
    if (action.startsWith("archive_tab:")) {
      archiveTab = action.slice("archive_tab:".length);
      sigArchive = "";
      if (lastVm) {
        rebuildArchive(lastVm);
        sigArchive = sigForArchive(lastVm);
      }
      refreshVisualMotionBudget();
      emitInteractionFeedback("click");
      return;
    }
    if (action.startsWith("archive_category:")) {
      archiveCategory = action.slice("archive_category:".length);
      sigArchive = "";
      if (lastVm) {
        rebuildArchive(lastVm);
        sigArchive = sigForArchive(lastVm);
      }
      refreshVisualMotionBudget();
      emitInteractionFeedback("click");
      return;
    }
    if (action === "offline_panel:toggle") {
      offlinePanelCollapsed = !offlinePanelCollapsed;
      try {
        window.localStorage.setItem(OFFLINE_PANEL_KEY, offlinePanelCollapsed ? "1" : "0");
      } catch {
        // 折叠偏好不可写时不影响游戏；下次打开仍可折叠。
      }
      sigOffline = "";
      return;
    }
    if (action === "prestige") {
      showPrestigeConfirmation(false);
      return;
    }
    const result = handler(action);
    handleCommandResult(action, result);
    if (result.ok) scheduleVisualBurst(action);
    if (result.architectureReceipt) showArchitectureReceipt(result.architectureReceipt);
  };
  executeFeelAction = (action: string): void => {
    prefixedHandler(action);
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
  let sigServer = "";
  let sigGrowth = "";
  let sigCenter = "";
  let sigPrestige = "";
  let sigStage4 = "";
  let sigStage5 = "";
  let sigOffline = "";
  let selectedScaleServerId: string | null = null;

  function sigForGrowth(vm: ViewModel): string {
    return JSON.stringify({
      b: vm.growth.blueprints.map((item) => [item.id, item.level]),
      s: vm.growth.serverLines.map((item) => [item.id, item.owned, item.units]),
      t: vm.growth.talent.nodes.map((item) => [item.id, item.level, item.canAllocate]),
      p: [vm.growth.talent.earned, vm.growth.talent.available],
    });
  }

  function growthBatchLabel(
    title: string,
    count: number,
    cost: string,
    mode: "batch" | "max",
  ): string {
    const detail = mode === "max"
      ? t("growth.maxEstimate", { count, cost })
      : t("growth.batchEstimate", { count, cost });
    return `${title}\n${detail}`;
  }

  function serverBatchLabel(vm: ViewModel): string {
    const detail = vm.server.buyMaxCount > 0
      ? t("server.buyMaxAvailable", {
          count: vm.server.buyMaxCount,
          cost: vm.server.buyMaxCost,
        })
      : t("server.buyMaxUnavailable", { cost: vm.server.nextCost ?? "-" });
    return `${t("server.buyAffordable")}\n${detail}`;
  }

  function patchGrowth(vm: ViewModel): void {
    for (const item of vm.growth.blueprints) {
      const card = blueprintGrowthSection.querySelector<HTMLElement>(`[data-blueprint-id="${item.id}"]`);
      const one = card?.querySelector<HTMLButtonElement>(`[data-action="upgrade_blueprint:${item.id}:1"]`) ?? null;
      const ten = card?.querySelector<HTMLButtonElement>(`[data-action="upgrade_blueprint:${item.id}:10"]`) ?? null;
      const max = card?.querySelector<HTMLButtonElement>(`[data-action="upgrade_blueprint:${item.id}:max"]`) ?? null;
      if (one) {
        one.textContent = `${t("growth.buyOne")} · ${item.nextCost}`;
        syncButtonAffordance(one, item.canBuy);
      }
      if (ten) {
        ten.textContent = growthBatchLabel(t("growth.buyTen"), item.tenCount, item.tenCost, "batch");
      }
      if (max) {
        max.textContent = growthBatchLabel(t("growth.buyMax"), item.maxCount, item.maxCost, "max");
      }
      const preview = card?.querySelector<HTMLElement>(`[data-growth-preview="${item.id}"]`) ?? null;
      if (preview) setText(preview, t("growth.projected", { compute: item.projectedCompute, income: item.projectedIncome }));
      if (ten) syncButtonAffordance(ten, item.canBuy);
      if (max) syncButtonAffordance(max, item.canBuy);
      if (card) {
        card.classList.toggle("is-upgradeable", item.canBuy);
        if (item.canBuy) card.dataset.visualMotion = "ready";
        else delete card.dataset.visualMotion;
      }
    }
    const recommended = vm.growth.recommendedBlueprintId;
    const recommendedItem = recommended
      ? vm.growth.blueprints.find((item) => item.id === recommended)
      : undefined;
    if (recommendedItem) {
      const one = blueprintRecommendEl.querySelector<HTMLButtonElement>(`[data-action="upgrade_blueprint:${recommendedItem.id}:1"]`);
      const ten = blueprintRecommendEl.querySelector<HTMLButtonElement>(`[data-action="upgrade_blueprint:${recommendedItem.id}:10"]`);
      const max = blueprintRecommendEl.querySelector<HTMLButtonElement>(`[data-action="upgrade_blueprint:${recommendedItem.id}:max"]`);
      if (one) {
        one.textContent = `${t("growth.buyOne")} · ${recommendedItem.nextCost}`;
        syncButtonAffordance(one, recommendedItem.canBuy);
      }
      if (ten) {
        ten.textContent = growthBatchLabel(t("growth.buyTen"), recommendedItem.tenCount, recommendedItem.tenCost, "batch");
        syncButtonAffordance(ten, recommendedItem.canBuy);
      }
      if (max) {
        max.textContent = growthBatchLabel(t("growth.buyMax"), recommendedItem.maxCount, recommendedItem.maxCost, "max");
        syncButtonAffordance(max, recommendedItem.canBuy);
      }
    }
    const selected = vm.growth.serverLines.find((item) => item.id === selectedScaleServerId);
    if (selected) {
      const one = scaleDetailEl.querySelector<HTMLButtonElement>(`[data-action="expand_server_scale:${selected.id}:1"]`);
      const ten = scaleDetailEl.querySelector<HTMLButtonElement>(`[data-action="expand_server_scale:${selected.id}:10"]`);
      const max = scaleDetailEl.querySelector<HTMLButtonElement>(`[data-action="expand_server_scale:${selected.id}:max"]`);
      if (one) {
        one.textContent = `${t("growth.buyOne")} · ${selected.nextCost}`;
        syncButtonAffordance(one, selected.canBuy);
      }
      if (ten) {
        ten.textContent = growthBatchLabel(t("growth.buyTen"), selected.tenCount, selected.tenCost, "batch");
      }
      if (max) {
        max.textContent = growthBatchLabel(t("growth.buyMax"), selected.maxCount, selected.maxCost, "max");
      }
      const preview = scaleDetailEl.querySelector<HTMLElement>("[data-growth-preview]");
      if (preview) setText(preview, t("growth.projected", { compute: selected.projectedCompute, income: selected.projectedIncome }));
      if (ten) syncButtonAffordance(ten, selected.canBuy);
      if (max) syncButtonAffordance(max, selected.canBuy);
      scaleDetailEl.classList.toggle("is-upgradeable", selected.canBuy);
      scaleDetailEl.dataset.visualMotion = selected.canBuy ? "ready" : "running";
      const visual = scaleDetailEl.querySelector<HTMLElement>(".server-rack-visual-panel");
      visual?.classList.toggle("is-upgradeable", selected.canBuy);
    }
    for (const node of vm.growth.talent.nodes) {
      const card = talentSection.querySelector<HTMLElement>(`[data-talent-id="${node.id}"]`);
      if (!card) continue;
      card.classList.toggle("is-upgradeable", node.canAllocate);
      if (node.canAllocate) card.dataset.visualMotion = "ready";
      else delete card.dataset.visualMotion;
    }
  }

  function renderGrowth(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    blueprintGrowthSection.classList.toggle("hidden", vm.growth.blueprints.every((item) => !item.owned));
    setText(blueprintGrowthSummaryEl,
      t("growth.blueprints.summary", { multiplier: vm.growth.blueprintMultiplier }));
    blueprintGrowthGridEl.replaceChildren();
    for (const item of vm.growth.blueprints) {
      const card = el("div", `growth-card${item.owned ? "" : " investable"}${item.canBuy ? " is-upgradeable" : ""}${item.id === vm.growth.recommendedBlueprintId ? " recommended" : ""}`);
      card.dataset.blueprintId = item.id;
      if (item.canBuy) card.dataset.visualMotion = "ready";
      const milestone = item.nextMilestone == null
        ? t("growth.milestone.complete")
        : t("growth.milestone.next", { value: item.nextMilestone });
      const progress = el("div", "growth-progress", milestone);
      syncProgress(progress, item.milestoneProgress * 100);
      const actions = el("div", "growth-batch-actions");
      const projectedText = item.level < item.maxLevel && item.nextCost !== "—"
        ? t("growth.projected", { compute: item.projectedCompute, income: item.projectedIncome })
        : undefined;
      const header = createGameObjectHeader(blueprintGameIcon(item.id), tr(item.name), {
        subtitle: t("growth.blueprints.role"),
        value: projectedText,
        badge: `Lv.${item.level}/${item.maxLevel}`,
      });
      const projected = header.querySelector<HTMLElement>(".game-object-value");
      if (projected) projected.dataset.growthPreview = item.id;
      if (item.level < item.maxLevel && item.nextCost !== "—") {
        actions.append(
          btn(`${t("growth.buyOne")} · ${item.nextCost}`, `upgrade_blueprint:${item.id}:1`, true, item.canBuy),
          btn(growthBatchLabel(t("growth.buyTen"), item.tenCount, item.tenCost, "batch"), `upgrade_blueprint:${item.id}:10`, false, item.canBuy),
          btn(growthBatchLabel(t("growth.buyMax"), item.maxCount, item.maxCost, "max"), `upgrade_blueprint:${item.id}:max`, false, item.canBuy),
        );
      } else {
        actions.appendChild(el("div", "growth-locked-label", item.owned ? t("growth.maxed") : t("growth.locked")));
      }
      card.append(header, progress, actions);
      blueprintGrowthGridEl.appendChild(card);
    }
    blueprintRecommendEl.replaceChildren();
    if (vm.growth.recommendedBlueprintId) {
      const recommended = vm.growth.blueprints.find((item) => item.id === vm.growth.recommendedBlueprintId);
      if (recommended && recommended.level < recommended.maxLevel && recommended.nextCost !== "—") {
        blueprintRecommendEl.append(
          btn(`${t("growth.buyOne")} · ${recommended.nextCost}`, `upgrade_blueprint:${recommended.id}:1`, true, recommended.canBuy),
          btn(growthBatchLabel(t("growth.buyTen"), recommended.tenCount, recommended.tenCost, "batch"), `upgrade_blueprint:${recommended.id}:10`, false, recommended.canBuy),
          btn(growthBatchLabel(t("growth.buyMax"), recommended.maxCount, recommended.maxCost, "max"), `upgrade_blueprint:${recommended.id}:max`, false, recommended.canBuy),
          el("div", "growth-hold-hint", t("growth.holdHint")),
        );
      }
    }

    scaleGrowthSection.classList.toggle("hidden", vm.server.ownedCount <= 0);
    setText(scaleSummaryEl, t("growth.scale.summary", { multiplier: vm.growth.scaleMultiplier }));
    scaleRailEl.replaceChildren();
    const ownedLines = vm.growth.serverLines.filter((item) => item.owned);
    if (!selectedScaleServerId || !ownedLines.some((item) => item.id === selectedScaleServerId)) {
      selectedScaleServerId = ownedLines[ownedLines.length - 1]?.id ?? null;
    }
    setText(scaleRailHintEl, t("growth.scale.swipeHint", { current: ownedLines.length, total: vm.growth.serverLines.length }));
    for (const item of vm.growth.serverLines) {
      // 代际选择只切换本地展示，不应进入经济命令总线。
      const chip = commandBtn(`${item.index} · ${tr(item.name)}`, `select_scale:${item.id}`, false, item.owned);
      chip.classList.add("scale-generation-chip");
      setNavigationIconText(chip, serverGameIcon(item.index), `${item.index} · ${tr(item.name)}`);
      chip.classList.toggle("active", item.id === selectedScaleServerId);
      scaleRailEl.appendChild(chip);
    }
    scaleDetailEl.replaceChildren();
    scaleDetailEl.classList.remove("is-upgradeable");
    delete scaleDetailEl.dataset.scaleServerId;
    delete scaleDetailEl.dataset.visualMotion;
    const selected = vm.growth.serverLines.find((item) => item.id === selectedScaleServerId);
    if (selected) {
      scaleDetailEl.classList.toggle("is-upgradeable", selected.canBuy);
      scaleDetailEl.dataset.scaleServerId = selected.id;
      scaleDetailEl.dataset.visualMotion = selected.canBuy ? "ready" : "running";
      const visual = el("div", `server-rack-visual-panel${selected.canBuy ? " is-upgradeable" : ""}`);
      const visualImage = document.createElement("img");
      visualImage.src = `${import.meta.env.BASE_URL}assets/visuals/server-rack-array-v1.svg`;
      visualImage.alt = t("growth.scale.visualAlt");
      visualImage.loading = "lazy";
      visualImage.decoding = "async";
      // 插图自身已经包含唯一的中央“+”扩建标记；不再叠加运行时前景加号。
      visual.append(visualImage, el("div", "server-rack-unit-badge", t("growth.scale.runningUnits", { value: selected.units })));
      const milestone = selected.nextMilestone == null
        ? t("growth.milestone.complete")
        : t("growth.milestone.next", { value: selected.nextMilestone });
      const progress = el("div", "growth-progress", milestone);
      syncProgress(progress, selected.milestoneProgress * 100);
      const actions = el("div", "growth-batch-actions");
      const header = createGameObjectHeader(serverGameIcon(selected.index), tr(selected.name), {
        subtitle: t("growth.scale.role"),
        value: t("growth.projected", { compute: selected.projectedCompute, income: selected.projectedIncome }),
        badge: t("growth.scale.units", { value: selected.units }),
      });
      // 保留既有确定性渲染测试选择器；视觉结构由 game-object-header 接管。
      header.classList.add("growth-card-title");
      const projected = header.querySelector<HTMLElement>(".game-object-value");
      if (projected) projected.dataset.growthPreview = selected.id;
      actions.append(
        btn(`${t("growth.buyOne")} · ${selected.nextCost}`, `expand_server_scale:${selected.id}:1`, true, selected.canBuy),
        btn(growthBatchLabel(t("growth.buyTen"), selected.tenCount, selected.tenCost, "batch"), `expand_server_scale:${selected.id}:10`, false, selected.canBuy),
        btn(growthBatchLabel(t("growth.buyMax"), selected.maxCount, selected.maxCost, "max"), `expand_server_scale:${selected.id}:max`, false, selected.canBuy),
      );
      scaleDetailEl.append(visual, header, progress, actions, el("div", "growth-hold-hint", t("growth.holdHint")));
    }

    talentSection.classList.toggle("hidden", !vm.model.acquired);
    setText(talentSummaryEl, t("growth.talent.summary", {
      available: vm.growth.talent.available,
      earned: vm.growth.talent.earned,
      claimable: vm.growth.talent.claimableAchievements,
    }));
    talentGridEl.replaceChildren();
    for (const branch of ["blueprint", "scale"] as const) {
      const branchEl = el("div", `talent-branch talent-${branch}`);
      branchEl.appendChild(el("div", "talent-branch-title", t(`growth.talent.branch.${branch}`)));
      for (const node of vm.growth.talent.nodes.filter((candidate) => candidate.branch === branch)) {
        const card = el("div", `talent-node${node.level >= node.maxLevel ? " maxed" : ""}${node.canAllocate ? " is-upgradeable" : ""}`);
        card.dataset.talentId = node.id;
        if (node.canAllocate) card.dataset.visualMotion = "ready";
        const header = createGameObjectHeader(
          contentGameIcon(node.id, branch === "blueprint" ? "models" : "server"),
          t(node.nameKey),
          {
            subtitle: t(node.descriptionKey),
            badge: `${node.level}/${node.maxLevel}`,
          },
        );
        card.appendChild(header);
        if (node.level < node.maxLevel) {
          card.appendChild(btn(t("growth.talent.allocate"), `allocate_talent:${node.id}`, true, node.canAllocate));
        }
        branchEl.appendChild(card);
      }
      talentGridEl.appendChild(branchEl);
    }
    talentActionsEl.replaceChildren(btn(t("growth.talent.reset"), "reset_talents", false, vm.growth.talent.spent > 0));
  }
  let sigStage3 = "";
  let sigArchive = "";
  let sigSponsor = "";
  // CARD-04 反馈：离线收益面板常驻且可折叠；折叠状态按设备记忆。
  const OFFLINE_PANEL_KEY = "compute_tycoon_h5_offline_panel_collapsed";
  let offlinePanelCollapsed = (() => {
    try {
      return window.localStorage.getItem(OFFLINE_PANEL_KEY) === "1";
    } catch {
      return false;
    }
  })();

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

  /**
   * P0/P1 动效预算：真实游戏对象才可持续呼吸，且同屏最多六个。
   * 这避免“所有卡片一起闪”造成视觉噪声，也避免隐藏页继续消耗动画资源。
   */
  let visualMotionRefreshFrame: number | null = null;

  function refreshVisualMotionBudget(): void {
    const priority = (node: HTMLElement): number => {
      const base = node.dataset.visualMotion === "claim"
        ? 30
        : node.dataset.visualMotion === "ready"
          ? 20
          : node.dataset.visualMotion === "running"
            ? 10
            : 0;
      const structuralPriority = node.matches(".scale-detail-card, .infra-card, .stage4-node, .stage4-project, .stage5-node, .stage5-project")
        ? 4
        : 0;
      return base + structuralPriority + (node.classList.contains("recommended") ? 5 : 0);
    };
    const allNodes = [...root.querySelectorAll<HTMLElement>("[data-visual-motion]")];
    // 动画预算必须随玩家实际滚动的可见区域迁移。只按 DOM 顺序挑选会让
    // 首屏以外的对象永远没有呼吸效果，表现成“资源已接入但游戏里没看到”。
    for (const node of allNodes) node.classList.remove("visual-motion-active");
    if (document.visibilityState === "hidden") return;
    const candidates = allNodes
      .filter((node) => {
        if (node.closest(".hidden, [hidden]")) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      })
      .sort((a, b) => priority(b) - priority(a));
    for (const [index, node] of candidates.entries()) {
      node.classList.toggle("visual-motion-active", index < 6);
    }
  }

  const requestVisualMotionBudgetRefresh = (): void => {
    if (visualMotionRefreshFrame !== null) return;
    const refresh = (): void => {
      visualMotionRefreshFrame = null;
      refreshVisualMotionBudget();
    };
    visualMotionRefreshFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(refresh)
      : window.setTimeout(refresh, 0);
  };
  // 只在滚动/尺寸变更后的下一帧重算，既让后续 P0/P1 对象可见即呼吸，
  // 又避免滚动时逐像素触发布局工作。
  window.addEventListener("scroll", requestVisualMotionBudgetRefresh, { passive: true });
  window.addEventListener("resize", requestVisualMotionBudgetRefresh, { passive: true });

  function scheduleVisualBurst(command: string): void {
    if (!command) return;
    const selectors: string[] = [];
    const idAfter = (prefix: string): string | null => command.startsWith(prefix) ? command.slice(prefix.length).split(":")[0] : null;
    const blueprintId = idAfter("upgrade_blueprint:");
    const scaleId = idAfter("expand_server_scale:");
    const talentId = idAfter("allocate_talent:");
    const infraId = idAfter("upgrade_infra:");
    const orderId = idAfter("accept_order:") ?? idAfter("unlock_order:") ?? idAfter("expand_order_slot:");
    const nodeId = idAfter("buy_node:") ?? idAfter("buy_stage5_node:");
    const achievementId = idAfter("claim_achievement:");
    if (blueprintId) selectors.push(`[data-blueprint-id="${blueprintId}"]`);
    if (scaleId) selectors.push(`[data-scale-server-id="${scaleId}"]`);
    if (talentId) selectors.push(`[data-talent-id="${talentId}"]`);
    if (infraId) selectors.push(`[data-infrastructure="${infraId}"]`);
    if (orderId) selectors.push(`[data-order-id="${orderId}"]`);
    if (nodeId) selectors.push(`[data-node-id="${nodeId}"]`);
    if (achievementId) selectors.push(`[data-achievement-id="${achievementId}"]`);
    if (command === "buy_server" || command === "buy_max_servers") selectors.push("#section-scale-growth .scale-detail-card", "#section-server");
    if (command.startsWith("commission_room:")) selectors.push(`[data-room-index="${command.slice("commission_room:".length)}"]`);
    if (command.startsWith("start_flagship:") || command === "claim_flagship_reward") selectors.push("#section-stage3 .flagship-active", "#section-stage3 .flagship-card");
    if (command === "start_stage4_project" || command === "claim_stage4_reward") selectors.push("#section-stage4 .stage4-project");
    if (command === "start_stage5_project" || command === "claim_stage5_reward") selectors.push("#section-stage5 .stage5-project");
    if (command === "claim_core" || command === "prestige") selectors.push("#section-prestige");
    if (command === "claim_offline") selectors.push(".offline-card");
    if (command.startsWith("prepare_sponsor_ad:")) selectors.push(command.endsWith("offline_capacity") ? ".sponsor-card--offline" : ".sponsor-card--income");

    const animate = (): void => {
      const target = selectors
        .map((selector) => root.querySelector<HTMLElement>(selector))
        .find((node): node is HTMLElement => node !== null);
      if (!target) return;
      target.classList.remove("visual-feedback-burst");
      // 强制重排只发生于玩家单次购买，不能进入 Tick 路径。
      void target.offsetWidth;
      target.classList.add("visual-feedback-burst");
      window.setTimeout(() => target.classList.remove("visual-feedback-burst"), 720);
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(animate);
    else window.setTimeout(animate, 0);
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
    const companyIdentityText = t("app.companyIdentity", {
      level: vm.company.level,
      title: tr(vm.company.title),
    });
    const companyExperienceText = t("app.companyExperience", {
      exp: vm.company.experience,
      next: vm.company.experienceToNextLevel,
    });
    setText(companyIdentityEl, companyIdentityText);
    setText(companyExperienceEl, companyExperienceText);
    companyEl.title = `${companyIdentityText}\n${companyExperienceText}`;
    // 累计营业额走主账本 ViewModel；它与可消费资金不同，允许在大数阶段换行而不截断。
    const revenueText = t("app.revenue", { value: vm.chronicle.cumulativeIncome });
    setText(revenueEl, revenueText);
    revenueEl.title = revenueText;
    revenueEl.dataset.cumulativeIncome = vm.chronicle.cumulativeIncome;
  }

function sigForModel(vm: ViewModel): string {
    const archive = vm.modelArchive.map((item) => `${item.id}:${item.owned ? 1 : 0}:${item.current ? 1 : 0}`).join(",");
    return `${vm.model.acquired}|${vm.model.id ?? ""}|${vm.model.name}|${vm.model.level}|${vm.model.blueprintLevel}|${vm.model.roleLabel}|${vm.model.effectText}|${vm.model.atMaxLevel}|${archive}`;
  }
  function rebuildModel(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    // P0：可训练时，只让当前主力模型呈现低频提示；
    // 其余五款图鉴模型保持静态，避免同屏“全都在闪”。
    if (vm.model.canTrain) modelCard.dataset.visualMotion = "ready";
    else delete modelCard.dataset.visualMotion;
    syncModelObjectIcon("training");
    setText(modelNameEl, vm.model.acquired
      ? t("model.sharedTrainingTitle", { level: vm.model.level, max: vm.model.maxLevel })
      : t("model.notAcquired"));
    setText(modelStatsEl, vm.model.acquired
      ? t("model.sharedTrainingStats", {
          compute: vm.model.compute,
          state: vm.model.atMaxLevel ? t("model.maxLevel", { level: vm.model.level }) : t("model.trainCostLabel", { cost: vm.model.trainCost }),
        })
      : t("model.stats", { compute: vm.model.compute, cost: vm.model.trainCost }));
    modelActionsEl.replaceChildren();
    if (!vm.model.acquired) {
      modelActionsEl.appendChild(btn(t("action.acquireModel"), "acquire_model", true));
    } else {
      if (vm.model.atMaxLevel) {
        modelActionsEl.appendChild(el("div", "model-max-level", t("model.maxLevel", { level: vm.model.level })));
      } else {
        modelActionsEl.appendChild(btn(
          `${t("action.trainModel")} · ${vm.model.trainCost}`,
          "train_model",
          false,
          vm.model.canTrain,
        ));
      }
    }
    patchTrainPreview(vm);
    // 模型页同时展示完整模型目录：未解锁模型也显示职责与解锁条件，
    // 避免玩家只能看到当前主力而无法理解后续成长路线。
    modelCatalogEl.replaceChildren();
    for (const model of vm.modelArchive) {
      const card = el("article", "model-catalog-card" + (model.owned ? "" : " locked") + (model.current ? " current" : ""));
      card.appendChild(createGameObjectHeader(modelGameIcon(model.id), tr(model.name), {
        subtitle: tr(model.description),
        value: `${tr(model.roleLabel)} · ${tr(model.effectText)}`,
        badge: model.current
          ? t("model.catalogCurrent")
          : model.owned
            ? t("model.catalogOwned")
            : t("growth.locked"),
      }));
      card.appendChild(el("div", "model-catalog-status",
        model.owned
          ? t("model.catalogOwnedStatus")
          : t("model.catalogLocked", { condition: tr(model.unlockHint) })));
      modelCatalogEl.appendChild(card);
    }
    // 档案馆已打开时，同步刷新模型蓝图等级（研发/训练后的收藏成长立即可见，
    // 无需先关闭再打开档案馆；未打开时由 render 的签名重建覆盖）。
    if (!archiveSection.classList.contains("hidden")) {
      patchArchive(vm);
    }
  }

function patchModel(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    if (vm.model.canTrain) modelCard.dataset.visualMotion = "ready";
    else delete modelCard.dataset.visualMotion;
    syncModelObjectIcon("training");
    setText(modelNameEl, vm.model.acquired
      ? t("model.sharedTrainingTitle", { level: vm.model.level, max: vm.model.maxLevel })
      : t("model.notAcquired"));
    setText(modelStatsEl, vm.model.acquired
      ? t("model.sharedTrainingStats", {
          compute: vm.model.compute,
          state: vm.model.atMaxLevel ? t("model.maxLevel", { level: vm.model.level }) : t("model.trainCostLabel", { cost: vm.model.trainCost }),
        })
      : t("model.stats", { compute: vm.model.compute, cost: vm.model.trainCost }));
    // 训练按钮禁用态；自动经营入口位于订单页顶部。
    const trainBtn = modelActionsEl.querySelector("button[data-action='train_model']") as HTMLButtonElement | null;
    if (trainBtn) {
      setText(trainBtn, `${t("action.trainModel")} · ${vm.model.trainCost}`);
      syncButtonAffordance(trainBtn, vm.model.canTrain);
    }
    patchTrainPreview(vm);
    // 档案馆已打开时，同步刷新模型蓝图等级（研发/训练后的收藏成长立即可见，
    // 无需先关闭再打开档案馆；未打开时由 render 的签名重建覆盖）。
    if (!archiveSection.classList.contains("hidden")) {
      patchArchive(vm);
    }
  }

  function sigForOrders(vm: ViewModel): string {
    return `${vm.model.acquired}|${vm.automationUnlocked}|${vm.automationEnabled}|${vm.orders.map((row) =>
      `${row.order.id}:${row.unlocked}`).join(",")}`;
  }
  /**
   * 保留训练预览的版位：能训练时显示真实预览，达到上限时只隐藏内容，
   * 不收缩卡片高度，避免研发/图鉴状态切换令下方内容跳动。
   */
  function patchTrainPreview(vm: ViewModel): void {
    if (vm.trainPreview) {
      setText(trainPreviewEl,
        t("model.trainPreview", { from: vm.trainPreview.computeNow, to: vm.trainPreview.computeAfter, incomeFrom: vm.trainPreview.incomeNow, incomeTo: vm.trainPreview.incomeAfter }));
      trainPreviewEl.classList.remove("is-empty");
      trainPreviewEl.setAttribute("aria-hidden", "false");
    } else {
      setText(trainPreviewEl, "\u00a0");
      trainPreviewEl.classList.add("is-empty");
      trainPreviewEl.setAttribute("aria-hidden", "true");
    }
  }
  function renderOrderSummary(vm: ViewModel): void {
    const d = vm.orderDisplay;
    if (d.mode === "single") {
      setText(orderSummaryEl, "");
      orderSummaryEl.style.display = "none";
    } else if (d.mode === "flow") {
      setText(orderSummaryEl,
        // The flow copy uses the player-facing `income` placeholder. Keep the
        // display contract aligned with the ViewModel so no raw `{income}`
        // token can leak into the order page.
        `${t("order.flowSummary", { ops: d.opsPerSec, gross: d.grossPerSec, cost: d.costPerSec, income: d.netPerSec })}`);
      orderSummaryEl.style.display = "";
    } else {
      setText(orderSummaryEl,
        `${t("order.computeSummary", { ops: d.opsPerSec, income: d.netPerSec, total: d.totalCompute })}`);
      orderSummaryEl.style.display = "";
    }
  }
  function renderOrderAutomation(vm: ViewModel): void {
    const mode = vm.automationEnabled ? "running" : vm.automationUnlocked ? "ready" : "locked";
    if (orderAutomationMode !== mode || orderAutomationStatusEl === null) {
      orderAutomationMode = mode;
      orderAutomationEl.replaceChildren();
      orderAutomationEl.classList.toggle("running", mode === "running");
      orderAutomationStatusEl = el("div", "order-automation-status");
      const identity = createGameObjectHeader(
        "business",
        mode === "running" ? t("order.automationRunning") : t("order.automationTitle"),
        { subtitle: "" },
      );
      identity.classList.add("order-automation-identity");
      const copy = identity.querySelector<HTMLElement>(".game-object-copy");
      copy?.appendChild(orderAutomationStatusEl);
      orderAutomationEl.append(identity);
      if (mode === "ready") {
        orderAutomationEl.appendChild(btn(t("action.enableAutomation"), "enable_automation", true, true));
      }
    }
    if (orderAutomationStatusEl === null) return;
    if (mode === "running") {
      const capacity = vm.orders.reduce((total, order) => total + (order.unlocked ? order.queueCapacity : 0), 0);
      const ready = vm.automationReadyCount > 0
        ? t("order.readyCount", { count: vm.automationReadyCount })
        : t("order.automationQueueHint", { count: vm.activeOrders.length, capacity });
      setText(orderAutomationStatusEl, ready);
    } else if (mode === "locked") {
      setText(orderAutomationStatusEl, t("order.automationNeedServer"));
    } else {
      setText(orderAutomationStatusEl, t("order.automationReadyHint"));
    }
  }

  function patchOrderTaskSlots(
    refs: OrderRowRefs,
    item: ViewModel["orders"][number],
  ): void {
    setText(refs.queueLabel, item.unlocked
      ? t("order.queueCount", { count: item.queueCount, capacity: item.queueCapacity })
      : t("order.slotsIncluded", { count: ORDER_QUEUE_CAP }));
    refs.slots.forEach(({ slot, fill, label }, index) => {
      const task = item.unlocked ? item.tasks[index] : undefined;
      slot.classList.toggle("locked", !item.unlocked);
      slot.classList.toggle("empty", item.unlocked && !task);
      slot.classList.toggle("running", !!task && task.progress < 1);
      fill.style.width = `${task ? (task.progress * 100).toFixed(1) : "0"}%`;
      setText(label, !item.unlocked ? t("order.slotLocked") : task?.progressLabel ?? t("order.slotEmpty"));
    });
    if (item.readyCount > 0) refs.row.dataset.visualMotion = "ready";
    else if (item.unlocked && item.tasks[0]) refs.row.dataset.visualMotion = "running";
    else delete refs.row.dataset.visualMotion;
  }

  function buildOrderTaskSlots(): { element: HTMLElement; slots: OrderRowRefs["slots"] } {
    const element = el("div", "order-task-list");
    const slots: OrderRowRefs["slots"] = [];
    for (let index = 0; index < ORDER_QUEUE_CAP; index += 1) {
      const slot = el("div", "order-task-item");
      slot.dataset.slot = String(index + 1);
      const progress = el("div", "progress-wrap order-task-progress");
      const fill = el("div", "progress-fill");
      const label = el("div", "order-task-label");
      progress.appendChild(fill);
      slot.append(progress, label);
      element.appendChild(slot);
      slots.push({ slot, fill, label });
    }
    return { element, slots };
  }

  function rebuildOrderList(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    orderSection.classList.toggle("hidden", !vm.model.acquired);
    orderListEl.replaceChildren();
    orderRowRefs.clear();
    for (const row of vm.orders) {
      const r = el("div", "order-row" + (row.recommended ? " recommended" : "") + (row.unlocked ? "" : " locked"));
      r.dataset.orderId = row.order.id;
      const info = el("div", "order-info");
      const orderName = el("div", "order-name");
      setIconText(orderName, orderGameIcon(row.order.id), tr(row.order.name));
      info.appendChild(orderName);
      info.appendChild(el("div", "order-meta",
        `${t("order.meta", { sec: row.order.durationSec, gross: row.gross, rental: row.rentalCost, net: row.netIncome })}${row.recommended ? t("order.recommended") : ""}`));
      const queueLabel = el("div", "order-queue-label");
      info.appendChild(queueLabel);
      const taskSlots = buildOrderTaskSlots();
      const actions = el("div", "order-actions");
      let acceptButton: HTMLButtonElement | null = null;
      let unlockButton: HTMLButtonElement | null = null;
      if (!row.unlocked) {
        unlockButton = btn(t("order.unlock", { cost: row.unlockCost }), `unlock_order:${row.order.id}`, true, row.canUnlock);
        actions.appendChild(unlockButton);
      } else if (vm.automationEnabled) {
        actions.appendChild(el("div", "order-auto-queueing", t("order.autoQueueing")));
      } else {
        acceptButton = btn(t("order.accept"), `accept_order:${row.order.id}`, true, row.canAccept);
        actions.appendChild(acceptButton);
      }
      r.append(info, taskSlots.element, actions);
      const refs = { row: r, queueLabel, slots: taskSlots.slots, acceptButton, unlockButton };
      orderRowRefs.set(row.order.id, refs);
      patchOrderTaskSlots(refs, row);
      r.classList.toggle("has-ready", row.readyCount > 0);
      orderListEl.appendChild(r);
    }
    orderListEl.classList.remove("collapsed");
    renderOrderSummary(vm);
    renderOrderAutomation(vm);
  }
  function patchOrders(vm: ViewModel): void {
    metrics.partialPatchCount += 1;
    orderSection.classList.toggle("hidden", !vm.model.acquired);
    orderListEl.classList.remove("collapsed");
    renderOrderSummary(vm);
    renderOrderAutomation(vm);
    for (const item of vm.orders) {
      const refs = orderRowRefs.get(item.order.id);
      if (!refs) continue;
      refs.row.classList.toggle("has-ready", item.readyCount > 0);
      patchOrderTaskSlots(refs, item);
      if (refs.acceptButton) syncButtonAffordance(refs.acceptButton, item.canAccept);
      if (refs.unlockButton) syncButtonAffordance(refs.unlockButton, item.canUnlock);
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
      const chip = el("div", "server-chip" + (s.owned ? " owned" : ""));
      // 列表芯片空间有限，使用旧版简洁服务器线标；详细机柜母版留给下方大卡。
      setNavigationIconText(chip, serverGameIcon(s.index), `${tr(s.name)}${s.owned ? " ✓" : ""}(${s.power}×)`);
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
      serverActionsEl.appendChild(btn(
        serverBatchLabel(vm),
        "buy_max_servers",
        false,
        vm.server.canBuyMax,
      ));
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
    if (buyMaxBtn) {
      buyMaxBtn.textContent = serverBatchLabel(vm);
      syncButtonAffordance(buyMaxBtn, vm.server.canBuyMax);
    }
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
      s4.batchCount,
      s4.batchCost,
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
      stage4EntryEl.appendChild(btn(
        growthBatchLabel(t("stage4.batchDeploy"), s4.batchCount, s4.batchCost, "max"),
        "buy_node:verified_nodes",
        false,
        s4.canBuyMaxNodes,
      ));
    }

    // 轨道节点阵列
    stage4NodesEl.replaceChildren();
    for (const n of s4.nodes) {
      const card = el("div", "stage4-node" + (n.owned ? " owned" : n.canBuy ? " available" : " locked"));
      card.dataset.nodeId = n.id;
      if (n.canBuy) card.dataset.visualMotion = "ready";
      const lockedHint = n.id === "moon_base" ? t("stage4.firstPaidNode") : t("stage4.needPreviousNode");
      card.appendChild(createGameObjectHeader(contentGameIcon(n.id, "satellite"), tr(n.name), {
        subtitle: n.owned ? t("stage4.deployed") : n.canBuy ? t("stage4.deployNode") : lockedHint,
        value: n.owned ? undefined : n.cost,
        badge: n.owned ? t("common.done") : n.canBuy ? t("stage4.deployNode") : t("growth.locked"),
      }));
      if (n.canBuy) {
        card.appendChild(btn(`${t("stage4.deployNode")} · ${n.cost}`, `buy_node:${n.id}`, true));
      } else if (!n.owned) {
        card.appendChild(el("div", "stage4-node-locked", lockedHint));
      }
      stage4NodesEl.appendChild(card);
    }

    // 地月一体化算力网
    stage4ProjectEl.replaceChildren();
    const fp = s4.finalProject;
    if (fp.active) stage4ProjectEl.dataset.visualMotion = "running";
    else if (fp.pendingReward) stage4ProjectEl.dataset.visualMotion = "claim";
    else if (fp.canStart) stage4ProjectEl.dataset.visualMotion = "ready";
    else delete stage4ProjectEl.dataset.visualMotion;
    stage4ProjectEl.appendChild(createGameObjectHeader(contentGameIcon("moon_network", "orbit"), tr(fp.name), {
      subtitle: `${tr(fp.rewardText)} · ${t("stage3.constructionCost")} ${fp.constructionCost}`,
      badge: fp.active
        ? fp.progressLabel
        : fp.pendingReward
          ? t("common.pendingClaim")
          : fp.completed
            ? t("common.done")
            : fp.canStart
              ? t("stage4.startMoonNetwork")
              : t("growth.locked"),
    }));
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
      if (fp.canStart) {
        stage4ProjectEl.appendChild(btn(`${t("stage4.startMoonNetwork")} · ${fp.constructionCost}`, "start_stage4_project", true));
      } else {
        stage4ProjectEl.appendChild(el("div", "stage4-project-locked", `${t("stage4.nodesLabel")} ${s4.ownedNodeCount}/${s4.nodes.length} · ${t("stage4.allNodesToStart")} · ${t("stage3.constructionCost")} ${fp.constructionCost}`));
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
      const card = stage4Section.querySelector<HTMLElement>(`[data-node-id="${n.id}"]`);
      if (card) {
        card.classList.toggle("available", n.canBuy);
        if (n.canBuy) card.dataset.visualMotion = "ready";
        else delete card.dataset.visualMotion;
      }
    }
    const batch = stage4Section.querySelector("button[data-action='buy_node:verified_nodes']") as HTMLButtonElement | null;
    if (batch) {
      batch.textContent = growthBatchLabel(t("stage4.batchDeploy"), s4.batchCount, s4.batchCost, "max");
      syncButtonAffordance(batch, s4.canBuyMaxNodes);
    }
    const start = stage4Section.querySelector("button[data-action='start_stage4_project']") as HTMLButtonElement | null;
    if (start) syncButtonAffordance(start, s4.finalProject.canStart);
    if (s4.finalProject.active) stage4ProjectEl.dataset.visualMotion = "running";
    else if (s4.finalProject.pendingReward) stage4ProjectEl.dataset.visualMotion = "claim";
    else if (s4.finalProject.canStart) stage4ProjectEl.dataset.visualMotion = "ready";
    else delete stage4ProjectEl.dataset.visualMotion;
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
      if (n.canBuy) card.dataset.visualMotion = "ready";
      card.appendChild(createGameObjectHeader(contentGameIcon(n.id, "sparkles"), tr(n.name), {
        subtitle: n.owned ? t("stage4.deployed") : n.canBuy ? t("stage4.deployNode") : t("stage4.needPreviousNode"),
        value: n.owned ? undefined : n.cost,
        badge: n.owned ? t("common.done") : n.canBuy ? t("stage4.deployNode") : t("growth.locked"),
      }));
      if (n.canBuy) {
        card.appendChild(btn(`${t("stage4.deployNode")} · ${n.cost}`, `buy_stage5_node:${n.id}`, true));
      } else if (!n.owned) {
        card.appendChild(el("div", "stage5-node-locked", t("stage4.needPreviousNode")));
      }
      stage5NodesEl.appendChild(card);
    }

    stage5ProjectEl.replaceChildren();
    const fp = s5.finalProject;
    if (fp.active) stage5ProjectEl.dataset.visualMotion = "running";
    else if (fp.pendingReward) stage5ProjectEl.dataset.visualMotion = "claim";
    else if (fp.canStart) stage5ProjectEl.dataset.visualMotion = "ready";
    else delete stage5ProjectEl.dataset.visualMotion;
    stage5ProjectEl.appendChild(createGameObjectHeader("dyson_sphere", tr(fp.name), {
      subtitle: `${tr(fp.rewardText)} · ${t("stage3.constructionCost")} ${fp.constructionCost}`,
      badge: fp.active
        ? fp.progressLabel
        : fp.pendingReward
          ? t("common.pendingClaim")
          : fp.completed
            ? t("common.done")
            : fp.canStart
              ? t("stage5.startDyson")
              : t("growth.locked"),
    }));
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
      if (fp.canStart) {
        stage5ProjectEl.appendChild(btn(`${t("stage5.startDyson")} · ${fp.constructionCost}`, "start_stage5_project", true));
      } else {
        stage5ProjectEl.appendChild(el("div", "stage5-project-locked", `${t("stage5.lockedHint")} · ${t("stage3.constructionCost")} ${fp.constructionCost}`));
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
      const card = stage5Section.querySelector<HTMLElement>(`[data-node-id="${n.id}"]`);
      if (card) {
        card.classList.toggle("available", n.canBuy);
        if (n.canBuy) card.dataset.visualMotion = "ready";
        else delete card.dataset.visualMotion;
      }
    }
    const start = stage5Section.querySelector("button[data-action='start_stage5_project']") as HTMLButtonElement | null;
    if (start) syncButtonAffordance(start, s5.finalProject.canStart);
    if (s5.finalProject.active) stage5ProjectEl.dataset.visualMotion = "running";
    else if (s5.finalProject.pendingReward) stage5ProjectEl.dataset.visualMotion = "claim";
    else if (s5.finalProject.canStart) stage5ProjectEl.dataset.visualMotion = "ready";
    else delete stage5ProjectEl.dataset.visualMotion;
  }
  function rebuildPrestige(vm: ViewModel): void {
    metrics.fullRenderCount += 1;
    const endgame = vm.singularity.active;
    const showPrestige = endgame
      ? vm.singularity.coreClaimable || vm.singularity.iterationReady || vm.singularity.spacePlanRevealed
      : vm.prestige.canPrestige || vm.prestige.count > 0;
    prestigeSection.classList.toggle("hidden", !showPrestige);
    if (vm.singularity.coreClaimable) prestigeSection.dataset.visualMotion = "claim";
    else if (vm.singularity.iterationReady || vm.singularity.spacePlanRevealed || vm.prestige.canPrestige) {
      prestigeSection.dataset.visualMotion = "ready";
    } else {
      delete prestigeSection.dataset.visualMotion;
    }
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
      const coreKicker = el("div", "prestige-kicker");
      setIconText(coreKicker, "singularity",
        vm.singularity.spacePlanRevealed
          ? t("prestige.earthComplete")
          : t("prestige.singularityCore", { round }));
      prestigeInfoEl.appendChild(coreKicker);
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
    // 面板常驻：只随离线报价内容变化重建（领取/扩容/替换/折叠），普通帧不重建。
    const nextSig = JSON.stringify([
      vm.offline.hasPending,
      vm.offline.paidLabel,
      vm.offline.remainingLabel,
      vm.offline.allSettled,
      vm.offline.canWatchOfflineAd,
      vm.offline.canClaim,
      vm.offline.money,
      vm.offline.rawElapsedLabel,
      vm.offline.eligibleLabel,
      vm.offline.adUnlocksUsed,
      vm.offline.adUnlocksMax,
      vm.offline.excessLabel,
      vm.offline.projectProgressDelta,
      vm.offline.projectName,
      offlinePanelCollapsed,
    ]);
    const existing = main.querySelector(".offline-card");
    if (!vm.offline.hasPending) {
      sigOffline = nextSig;
      existing?.remove();
      return;
    }
    if (nextSig === sigOffline) return;
    sigOffline = nextSig;
    existing?.remove();
    const oc = el("div", "offline-card" + (offlinePanelCollapsed ? " collapsed" : ""));
    if (vm.offline.canClaim) oc.dataset.visualMotion = "claim";
    const header = el("div", "offline-card-header");
    const headerTitle = el("div", "offline-receipt-title", t("offline.title"));
    headerTitle.classList.add("offline-card-header-title");
    header.appendChild(headerTitle);
    const foldBtn = btn(offlinePanelCollapsed ? t("offline.expand") : t("offline.fold"), "offline_panel:toggle");
    foldBtn.classList.add("offline-fold-btn");
    header.appendChild(foldBtn);
    oc.appendChild(header);
    if (!offlinePanelCollapsed) {
      const body = el("div", "offline-card-body");
      // 新账单只有原免费额度，历史已解锁收益仍按存档回执展示。
      const lines: string[] = [t("offline.rawElapsed", { value: vm.offline.rawElapsedLabel })];
      lines.push(t("standalone.offlineHint"));
      lines.push(t("offline.elapsed", { value: vm.offline.elapsedLabel }));
      lines.push(t("offline.claimed", { paid: vm.offline.paidLabel, remaining: vm.offline.remainingLabel }));
      lines.push(t("offline.cap", { value: vm.offline.capLabel }));
      if (vm.offline.excessLabel) lines.push(t("offline.excess", { value: vm.offline.excessLabel }));
      if (vm.offline.allSettled) {
        lines.push(t("offline.allClaimed"));
      } else {
        lines.push(t("offline.money", { value: vm.offline.money }));
      }
      const feelPreview = vm.feel.offlinePreview;
      if (feelPreview) {
        lines.push(t("offline.moneyBefore", { value: feelPreview.moneyBefore }));
        lines.push(t("offline.moneyAfter", { value: feelPreview.moneyAfter }));
        lines.push(t("offline.compute", { value: feelPreview.computeLabel }));
      }
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
      lines.forEach((line) => body.appendChild(el("div", "offline-receipt-line", line)));
      if (!vm.offline.allSettled) {
        const actions = el("div", "offline-actions");
        actions.appendChild(btn(
          t("offline.claimAvailable", { value: vm.offline.money }),
          "claim_offline",
          true,
          vm.offline.canClaim,
        ));
        actions.appendChild(btn(
          t("standalone.adsButton"),
          "prepare_sponsor_ad:offline_capacity",
          false,
          false,
        ));
        body.appendChild(actions);
      }
      oc.appendChild(body);
    }
    businessPage.insertBefore(oc, businessPage.firstChild);
  }

  function renderSponsor(vm: ViewModel): void {
    const nextSignature = JSON.stringify(vm.sponsor);
    if (nextSignature === sigSponsor) return;
    sigSponsor = nextSignature;
    offlineSponsorCardEl.replaceChildren();
    const offlineTitle = el("div", "sponsor-card-title");
    setIconText(offlineTitle, "moon", t("sponsor.offlineCardTitle"));
    offlineSponsorCardEl.append(
      offlineTitle,
      el("div", "sponsor-card-copy", t("standalone.offlineHint")),
      btn(t("standalone.adsButton"), "prepare_sponsor_ad:offline_capacity", true, false),
    );
    incomeSponsorCardEl.replaceChildren();
    const incomeTitle = el("div", "sponsor-card-title");
    setIconText(incomeTitle, "sponsor", t("sponsor.incomeCardTitle"));
    incomeSponsorCardEl.append(
      incomeTitle,
      el("div", "sponsor-card-copy", t("standalone.incomeHint")),
      btn(t("standalone.adsButton"), "prepare_sponsor_ad:income_boost", true, false),
    );
    if (vm.sponsor.incomeBoostActive) {
      incomeSponsorCardEl.appendChild(el("div", "sponsor-progress",
        t("standalone.legacyBoost", { remaining: vm.sponsor.incomeBoostRemainingLabel })));
    }
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

    const sGrowth = sigForGrowth(vm);
    if (sGrowth !== sigGrowth) {
      sigGrowth = sGrowth;
      renderGrowth(vm);
    } else {
      patchGrowth(vm);
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

    // 主线结局：按“存档 + 完成时刻”只展示一次。Shell 会跨完整重置/导入复用，
    // 不能用 DOM 生命周期的布尔值拦截另一份存档的新庆典。
    const storyMilestoneKey = `${vm.saveId}:${vm.legendaryArchive?.completedAtMs ?? 0}`;
    const storyPending = vm.stage5.storyCompleted && vm.stage5.perpetualActive;
    if (!storyPending) storyCompleteOverlay.hidden = true;
    if (storyPending && storyCompleteOverlay.dataset.shown !== storyMilestoneKey) {
      storyCompleteOverlay.dataset.shown = storyMilestoneKey;
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
          `${t("story.coresAndCompany", { cores: vm.singularity.coreCount, level: vm.company.level })}`,
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

    // 惊喜事件：按“存档 + 揭示时刻”自动弹出一次。关闭后可从档案馆重开；
    // 换档/完整重置后，相同里程碑不会被上一份存档的 DOM 标记吞掉。
    const spaceRevealMilestoneKey = `${vm.saveId}:${vm.singularity.spacePlanRevealedAtMs}`;
    const spaceRevealPending = vm.singularity.spacePlanRevealed && !vm.singularity.spacePlanStarted;
    if (!spaceRevealPending) spaceRevealOverlay.hidden = true;
    if (spaceRevealPending) {
      if (!spaceRevealOverlay.hidden) {
        // 已在展示中：保持内容同步
        setText(spaceRevealTitleEl, t("spaceReveal.title"));
        setText(spaceRevealBodyEl,
          t("spaceReveal.body"));
        spaceRevealActionsEl.replaceChildren();
        spaceRevealActionsEl.appendChild(btn(t("spaceReveal.start"), "start_space_plan", true));
      } else if (spaceRevealOverlay.dataset.shown !== spaceRevealMilestoneKey) {
        spaceRevealOverlay.dataset.shown = spaceRevealMilestoneKey;
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

    // CARD-06：经营页按子 Tab 分组（经营/蓝图/机房/天赋/时代），
    // 组内顺序由创建顺序固定，不再做跨组的 DOM 移动。
    const stage2Automated = vm.stage === 2 && vm.automationEnabled;
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
    syncBusinessTabs(vm);
    refreshVisualMotionBudget();
    lastVm = vm;
    maybeShowStage2Settlement(vm);
  }

  let lastVm: ViewModel | null = null;

  // CARD-06：子 Tab 可见性 + 气泡计数。每帧执行（只做 class/text 局部更新）。
  function syncBusinessTabs(vm: ViewModel): void {
    // 荣誉馆底部气泡：可领取成就数（红点计数）。
    const claimableAchievements = vm.achievements.filter((item) => item.claimable).length;
    if (honorTabBubbleEl) {
      honorTabBubbleEl.hidden = claimableAchievements <= 0;
      setText(honorTabBubbleEl, claimableAchievements > 0 ? String(claimableAchievements) : "");
    }
    // 赞助页红点显示当前仍可观看的广告次数（两类权益合计）。
    if (sponsorTabBubbleEl) {
      const sponsorCount = vm.sponsor.availableAdCount;
      sponsorTabBubbleEl.hidden = sponsorCount <= 0;
      setText(sponsorTabBubbleEl, sponsorCount > 99 ? "99+" : sponsorCount > 0 ? String(sponsorCount) : "");
    }
    const sectionGroups: Record<string, HTMLElement[]> = {
      operations: [orderSection],
      models: [modelSection],
      blueprints: [blueprintGrowthSection],
      facility: [serverSection, scaleGrowthSection],
      talents: [talentSection],
      era: [centerSection, stage3Section, stage4Section, stage5Section, prestigeSection],
    };
    // 组内 section 全部隐藏（阶段/所有权规则）时，该 Tab 视为空组。
    const emptyGroups: Record<string, boolean> = {};
    for (const tab of BUSINESS_TAB_DEFS) {
      const sections = sectionGroups[tab.id] ?? [];
      emptyGroups[tab.id] = sections.length > 0 && sections.every((candidate) => candidate.classList.contains("hidden"));
    }
    const eraEntryReady = !vm.stage3.entered && vm.stage3.entryMet;
    if (eraEntryReady) emptyGroups.operations = true;
    const visibleCount = BUSINESS_TAB_DEFS.filter((tab) => !emptyGroups[tab.id]).length;
    businessTabsEl.dataset.visibleCount = String(visibleCount);
    businessTabsEl.dataset.overflow = String(visibleCount > 5);
    const nextEraEntryRevealKey = eraEntryReady ? `${vm.saveId}:stage3-entry` : "";
    if (nextEraEntryRevealKey && nextEraEntryRevealKey !== eraEntryRevealKey) {
      eraEntryRevealKey = nextEraEntryRevealKey;
      businessTab = "era";
      buildBusinessTabs();
    } else if (!nextEraEntryRevealKey) {
      eraEntryRevealKey = "";
    }
    if (emptyGroups[businessTab]) {
      businessTab = eraEntryReady && !emptyGroups.era
        ? "era"
        : BUSINESS_TAB_DEFS.find((tab) => !emptyGroups[tab.id])?.id ?? "operations";
      buildBusinessTabs();
    }
    for (const tab of BUSINESS_TAB_DEFS) {
      const panel = businessPanels[tab.id];
      if (panel) panel.classList.toggle("hidden", tab.id !== businessTab);
      const button = businessTabButtons[tab.id];
      if (button) {
        const selected = tab.id === businessTab;
        button.classList.toggle("active", selected);
        button.classList.toggle("hidden", emptyGroups[tab.id] && !selected);
        button.setAttribute("aria-pressed", String(selected));
        if (selected) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
    }
    const stage3ImmediateAction = vm.center.canUpgrade
      || vm.stage3.infrastructure.some((item) => item.canUpgrade)
      || vm.stage3.machineRooms.some((item) => item.canCommission)
      || vm.stage3.flagship.some((item) => item.canStart || item.pendingRewardId != null);
    const bubbleCounts: Record<string, number> = {
      // 订单页红点代表所有订单队列的空余槽位；尚未获得模型时不提示不可用操作。
      // Before automation, an empty slot is a useful next action. Once
      // automation owns the FIFO lanes, accepting the next task is automatic;
      // suppress the order-tab bubble to avoid a persistent flashing “1”.
      operations: vm.model.acquired && !vm.automationEnabled && vm.orderEmptySlotCount > 0 ? 1 : 0,
      models: vm.model.canTrain ? 1 : 0,
      // 每页只有一个“最佳下一步”提示；其余可买项目不能把红点膨胀成噪声。
      blueprints: vm.growth.recommendedBlueprintId
        && vm.growth.blueprints.some((item) => item.id === vm.growth.recommendedBlueprintId && item.canBuy)
        ? 1
        : 0,
      // 首服、后续服务器代际与规模扩容都属于机房页的下一步。
      facility: (vm.server.canBuy || vm.growth.serverLines.some((item) => item.canBuy)) ? 1 : 0,
      talents: vm.growth.talent.available,
      // 红点只表示可以立即执行的推进动作；已进入的阶段和永续终局不能留下常亮提示。
      era: vm.stage5.perpetualActive
        ? 0
        : (vm.prestige.canPrestige ? 1 : 0)
          + (!vm.stage3.entered && vm.stage3.entryMet ? 1 : 0)
          + (vm.stage3.entered && stage3ImmediateAction ? 1 : 0)
          + (vm.stage4.active && !vm.stage5.entered && (vm.stage4.nodes.some((item) => item.canBuy)
            || vm.stage4.finalProject.canStart || vm.stage4.finalProject.pendingReward) ? 1 : 0)
          + (vm.stage5.active && !vm.stage5.perpetualActive && (vm.stage5.nodes.some((item) => item.canBuy)
            || vm.stage5.finalProject.canStart || vm.stage5.finalProject.pendingReward) ? 1 : 0),
    };
    for (const tab of BUSINESS_TAB_DEFS) {
      const bubble = businessTabBubbles[tab.id];
      if (!bubble) continue;
      const count = bubbleCounts[tab.id] ?? 0;
      bubble.hidden = count <= 0;
      setText(bubble, count > 99 ? "99+" : count > 0 ? String(count) : "");
    }
    ensureBusinessTabVisible(eraEntryReady ? "era" : businessTab);
  }

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

  function showArchitectureReceipt(receipt: ArchitectureReceipt): void {
    showToast(
      t("receipt.architecture", { before: receipt.beforeCount, after: receipt.afterCount }) + " · " +
      t("receipt.architectureMult", { before: receipt.beforeMultiplier, after: receipt.afterMultiplier }),
    );
  }

  function commitPrestige(): void {
    const result = handler("prestige");
    handleCommandResult("prestige", result);
    if (result.ok) scheduleVisualBurst("prestige");
  }

  /**
   * 技术迭代只有这一层确认。确认前不调用状态机，取消时资金、阶段与主题均保持原样。
   * 刚领取核心时复用同一个庆典弹窗；直接从“执行迭代”入口进入时仍走相同门禁。
   */
  function showPrestigeConfirmation(coreJustClaimed: boolean): void {
    const vm = lastVm;
    const endgame = vm?.singularity.active === true;
    const round = vm?.singularity.round ?? 1;
    const isFinalEarthRound = endgame && round === 3;
    const nextMult = round === 1 ? "×1.5" : "×2.0";
    const title = coreJustClaimed
      ? t("core.claimTitle", { round })
      : isFinalEarthRound
        ? t("core.confirmReveal")
        : endgame
          ? t("core.confirmRound", { round: Math.min(3, round + 1) })
          : t("prestige.confirmTitle");
    const body = isFinalEarthRound
      ? t("core.claimBodyFinal", { mult: nextMult })
      : coreJustClaimed
        ? t("core.claimBody", { mult: nextMult })
        : endgame
          ? t("core.resetBody")
          : t("prestige.readyBody");
    const confirmText = isFinalEarthRound
      ? t("core.revealPlan")
      : endgame
        ? t("core.confirmReset")
        : t("action.prestige");

    confirmDialog({
      title,
      body,
      confirmText,
      cancelText: coreJustClaimed ? t("core.stayRound") : t("common.cancel"),
      onConfirm: commitPrestige,
    });
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
      showPrestigeConfirmation(true);
    }
  }

  function confirmDialog(options: { title: string; body: string; confirmText: string; cancelText?: string; onConfirm: () => void }): void {
    // 重复指针事件或连续命令最多保留一个弹窗，避免旧确认层叠在新确认上。
    root.querySelectorAll(".dialog-overlay").forEach((existing) => existing.remove());
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
    for (const eventName of ["pointerdown", "pointerup", "pointercancel"] as const) {
      overlay.addEventListener(eventName, (ev) => ev.stopPropagation());
    }
    let settled = false;
    overlay.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (settled) return;
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-action='dialog_cancel']")) {
        settled = true;
        overlay.remove();
      }
      if (t.closest("[data-action='dialog_confirm']")) {
        settled = true;
        overlay.remove();
        options.onConfirm();
      }
    });
  }

  function destroy(): void {
    destroyed = true;
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    window.removeEventListener("scroll", requestVisualMotionBudgetRefresh);
    window.removeEventListener("resize", requestVisualMotionBudgetRefresh);
    if (visualMotionRefreshFrame !== null) {
      window.cancelAnimationFrame(visualMotionRefreshFrame);
      window.clearTimeout(visualMotionRefreshFrame);
      visualMotionRefreshFrame = null;
    }
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
      st.infrastructure.map((i) => `${i.id}:${i.level}:${i.pressure.toFixed(3)}:${i.nextRequirement ?? "done"}:${i.isBottleneck}:${i.projectedIncomeGain}`).join(","),
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
      const entryHeader = createGameObjectHeader("compute_center", t("stage3.entryTitle"), {
        subtitle: t("stage3.entryText"),
      });
      entryHeader.classList.add("stage3-entry-header");
      stage3EntryEl.appendChild(entryHeader);
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
      commissionBonusEl.dataset.visualMotion = "running";
    } else {
      delete commissionBonusEl.dataset.visualMotion;
    }

    // 瓶颈
    bottleneckEl.replaceChildren();
    if (st.bottleneck.id) {
      const bottleneckInfrastructure = st.infrastructure.find((i) => i.id === st.bottleneck.id);
      bottleneckEl.appendChild(el("div", "bottleneck-title",
        t("stage3.bottleneckLabel", { name: tr(st.bottleneck.name) })));
      bottleneckEl.appendChild(el("div", "bottleneck-line",
        `${t("stage3.effectiveEfficiency")}${t("common.colon")}${(st.bottleneck.efficiency * 100).toFixed(0)}% · ${t("stage3.upgradeEfficiency")}${t("common.colon")}${(st.bottleneck.upgradeEfficiency * 100).toFixed(0)}% · ${t("stage3.projectedIncome")}${t("common.colon")}${st.bottleneck.projectedIncomeGain}`));
      syncProgress(bottleneckEl.lastElementChild as HTMLElement, st.bottleneck.efficiency * 100);
      bottleneckEl.appendChild(btn(
        bottleneckInfrastructure
          ? `${t("stage3.upgradeBottleneck")} · ${bottleneckInfrastructure.upgradeCost}`
          : t("stage3.upgradeBottleneck"),
        `upgrade_infra:${st.bottleneck.id}`,
        true,
        bottleneckInfrastructure?.canUpgrade ?? false,
      ));
    } else {
      bottleneckEl.appendChild(el("div", "bottleneck-title", t("stage3.noBottleneck")));
    }

    // 基础设施
    infraGridEl.replaceChildren();
    for (const inf of st.infrastructure) {
      const card = el("div", `infra-card${inf.canUpgrade ? " is-upgradeable" : ""}${inf.isBottleneck ? " is-bottleneck" : ""}`);
      card.dataset.infrastructure = inf.id;
      if (inf.canUpgrade) card.dataset.visualMotion = "ready";
      card.appendChild(createGameObjectHeader(contentGameIcon(inf.id, "server"), `${tr(inf.name)} Lv.${inf.level}/${inf.maxLevel}`, {
        subtitle: tr(inf.desc),
        value: inf.detail || undefined,
        badge: inf.upgradeCost,
      }));
      const levelPercent = Math.round(Math.min(1, inf.level / Math.max(1, inf.maxLevel)) * 100);
      const pressurePercent = Math.round(inf.pressure * 100);
      const warningEndPercent = Math.min(100, pressurePercent + 18);
      const nextRequirement = inf.nextRequirement;
      const gateStatus = nextRequirement == null
        ? t("stage3.infrastructureRequirementsMet")
        : t("stage3.infrastructureNextRequirement", { level: nextRequirement });
      if (inf.isBottleneck) {
        card.appendChild(el("div", "infra-bottleneck-badge", t("stage3.infrastructureCurrentBottleneck")));
      }
      const pressureHead = el("div", "infra-pressure-head");
      pressureHead.append(
        el("span", "infra-pressure-label", t("stage3.infrastructurePressure", { percent: pressurePercent })),
        el("span", "infra-pressure-value", t("stage3.infrastructureLevelScale", {
          current: inf.level,
          max: inf.maxLevel,
        })),
      );
      const pressureMeter = el("div", "infra-pressure-meter");
      pressureMeter.setAttribute("role", "progressbar");
      pressureMeter.setAttribute("aria-valuemin", "0");
      pressureMeter.setAttribute("aria-valuemax", "100");
      pressureMeter.setAttribute("aria-valuenow", String(levelPercent));
      pressureMeter.setAttribute("aria-valuetext", t("stage3.infrastructurePressureAria", {
        name: tr(inf.name),
        current: inf.level,
        max: inf.maxLevel,
        pressure: pressurePercent,
        status: gateStatus,
      }));
      pressureMeter.style.setProperty("--level-position", `${levelPercent}%`);
      pressureMeter.style.setProperty("--pressure-red-end", `${pressurePercent}%`);
      pressureMeter.style.setProperty("--pressure-warning-end", `${warningEndPercent}%`);
      pressureMeter.appendChild(el("span", "infra-pressure-pointer"));
      const impactText = inf.level >= inf.maxLevel
        ? t("stage3.infrastructureMaxed")
        : inf.id === "storage"
          ? t("stage3.infrastructureStorageEffect")
          : inf.hasImmediateIncomeGain
            ? t("stage3.infrastructureIncomeGain", { gain: inf.projectedIncomeGain })
            : t("stage3.infrastructureNoIncomeGain");
      card.append(
        pressureHead,
        pressureMeter,
        el("div", "infra-stage-gate", gateStatus),
        el("div", "infra-upgrade-impact", impactText),
      );
      card.appendChild(btn(`${t("action.upgrade")}(${inf.upgradeCost})`, `upgrade_infra:${inf.id}`, false, inf.canUpgrade));
      infraGridEl.appendChild(card);
    }

    // 机房
    roomListEl.replaceChildren();
    for (const r of st.machineRooms) {
      const card = el("div", "room-card" + (r.commissioned ? " owned" : ""));
      card.dataset.roomIndex = String(r.index);
      card.dataset.commissioned = r.commissioned ? "true" : "false";
      const requirementText = `${t("infra.power.name")} Lv${r.requirements.power} · ${t("infra.computeCards.name")} Lv${r.requirements.computeCards} · ${t("infra.optical.name")} Lv${r.requirements.optical} · ${t("infra.storage.name")} Lv${r.requirements.storage}`;
      // P1：机房保留各自的主题图标；投产状态由卡片状态表达，
      // 不再让三座已投产机房退回为相同的通用勾选图标。
      card.appendChild(createGameObjectHeader(contentGameIcon(`room_${r.index}`, "server"), tr(r.name), {
        subtitle: r.commissioned ? tr(r.scaleName) : r.index === 1 ? t("stage3.commissionRoom", { name: tr(r.name) }) : requirementText,
        badge: r.commissioned ? t("stage4.deployed") : `0${r.index}`,
      }));
      if (r.commissioned) {
      } else if (r.index === 2 || r.index === 3) {
        const prerequisiteDone = r.index === 2
          ? st.flagship.some((f) => f.id === "project_1" && f.completed)
          : st.flagship.some((f) => f.id === "project_2" && f.completed);
        if (r.index === 2 && !prerequisiteDone) {
          card.appendChild(el("div", "room-gate", `${t("stage3.needPrereq")}${t("common.colon")}${t("flagship.1.name")}`));
        } else if (r.index === 3 && !prerequisiteDone) {
          card.appendChild(el("div", "room-gate", `${t("stage3.needPrereq")}${t("common.colon")}${t("flagship.2.name")}`));
        } else if (r.requirementsMet) {
          card.dataset.visualMotion = "ready";
          card.appendChild(btn(t("stage3.commissionRoom", { name: tr(r.name) }), `commission_room:${r.index}`, true));
        }
      }
      roomListEl.appendChild(card);
    }

    // 旗舰工程进行中
    flagshipActiveEl.replaceChildren();
    delete flagshipActiveEl.dataset.visualMotion;
    const active = st.flagship.find((f) => f.activeId);
    if (active) {
      flagshipActiveEl.dataset.visualMotion = "running";
      const activeHeader = createGameObjectHeader(contentGameIcon(active.id, "project_1"), tr(active.name), {
        subtitle: `${t("stage3.contributeCompute")}${t("common.colon")}${active.totalCompute}`,
        value: `${t("stage3.progressLabel")}${t("common.colon")}${active.progressLabel}`,
        valueClassName: "flagship-active-progress",
        badge: active.progressLabel,
      });
      flagshipActiveEl.appendChild(activeHeader);
      const progress = activeHeader.querySelector<HTMLElement>(".flagship-active-progress");
      if (progress) syncProgress(progress, Number.parseFloat(active.progressLabel));
    } else {
      flagshipActiveEl.style.display = "none";
    }
    const pending = st.flagship.find((f) => f.pendingRewardId);
    if (pending) {
      flagshipActiveEl.dataset.visualMotion = "claim";
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
      if (f.canStart) card.dataset.visualMotion = "ready";
      card.appendChild(createGameObjectHeader(contentGameIcon(f.id, "project_1"), tr(f.name), {
        subtitle: `${tr(f.rewardText)} · ${t("stage3.constructionCost")} ${f.constructionCost}`,
        badge: f.canStart
          ? t("stage3.startProject")
          : f.completed
            ? t("common.done")
            : !f.unlocked
              ? t("growth.locked")
              : t("stage3.started"),
      }));
      if (f.canStart) {
        card.appendChild(btn(`${t("stage3.startProject")} · ${f.constructionCost}`, `start_flagship:${f.id}`, true));
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
      const card = stage3Section.querySelector<HTMLElement>(`[data-infrastructure="${inf.id}"]`);
      if (card) {
        card.classList.toggle("is-upgradeable", inf.canUpgrade);
        if (inf.canUpgrade) card.dataset.visualMotion = "ready";
        else delete card.dataset.visualMotion;
      }
    }
    if (active) flagshipActiveEl.dataset.visualMotion = "running";
    else if (st.flagship.some((f) => f.pendingRewardId)) flagshipActiveEl.dataset.visualMotion = "claim";
    else delete flagshipActiveEl.dataset.visualMotion;
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
      achievements: vm.achievements.map((achievement) => [achievement.id, achievement.achieved, achievement.claimed]),
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
      { id: "chronicle", label: "archive.tab.chronicle", icon: "honor" as GameIconName },
    ];
    const activeTab = tabs.some((t) => t.id === archiveTab) ? archiveTab : "catalog";

    for (const t of tabs) {
      const b = btn(tr(t.label), `archive_tab:${t.id}`, activeTab === t.id);
      setNavigationIconText(b, t.icon, tr(t.label));
      b.classList.toggle("active", activeTab === t.id);
      b.setAttribute("aria-pressed", String(activeTab === t.id));
      // CARD-06：里程碑 Tab 气泡（可领取成就数）。
      if (t.id === "achievements") {
        const claimable = vm.achievements.filter((item) => item.claimable).length;
        if (claimable > 0) {
          const bubble = el("span", "tab-bubble");
          bubble.textContent = String(claimable);
          b.appendChild(bubble);
        }
      }
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
        setNavigationIconText(categoryButton, category.icon, tr(category.label));
        categoryButton.classList.toggle("active", activeCategory === category.id);
        categoryButton.setAttribute("aria-pressed", String(activeCategory === category.id));
        categoryBar.appendChild(categoryButton);
      }
      archivePanelEl.appendChild(categoryBar);
    }

    const contentTab = activeTab === "catalog" ? archiveCategory : activeTab;

    if (contentTab === "models") {
      const list = el("div", "archive-models");
      for (const model of vm.modelArchive) {
        const card = el("div", "archive-card" + (model.owned ? "" : " locked") + (model.current ? " current" : ""));
        const detailsText = model.owned
          ? `${t("archive.blueprintLevel")} Lv.${model.archiveLevel} · ${t("archive.researchCount")} ${model.researchCount} · ${t("archive.lifetimeTraining")} ${model.lifetimeTrainingCount} · ${t("archive.lifetimeContribution")} ${model.lifetimeContribution}`
          : t("archive.continueResearch");
        const header = createGameObjectHeader(modelGameIcon(model.id), tr(model.name), {
          subtitle: `${tr(model.roleLabel)} · ${tr(model.effectText)}`,
          value: detailsText,
          badge: model.current
            ? t("archive.currentActive")
            : model.owned
              ? `Lv.${model.archiveLevel}`
              : t("archive.notOwned"),
        });
        const details = header.querySelector<HTMLElement>(".game-object-value") ?? el("div", "game-object-value", detailsText);
        details.dataset.modelId = model.id;
        card.appendChild(header);
        list.appendChild(card);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "blueprints") {
      const list = el("div", "archive-blueprints");
      for (const bp of vm.stage3.blueprints) {
        const card = el("div", "archive-card" + (bp.active ? " active" : ""));
        card.appendChild(createGameObjectHeader(contentGameIcon(bp.id, "blueprints"), tr(bp.name), {
          subtitle: tr(bp.desc),
          badge: bp.active
            ? t("archive.currentActive")
            : bp.owned
              ? t("archive.unlocked")
              : t("archive.locked"),
        }));
        list.appendChild(card);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "tech") {
      const list = el("div", "archive-tech");
      for (const tech of vm.stage3.techArchive) {
        const card = el("div", "archive-card" + (tech.unlocked ? "" : " locked"));
        card.appendChild(createGameObjectHeader(contentGameIcon(tech.id, tech.unlocked ? "tech" : "locked"), tr(tech.name), {
          subtitle: tr(tech.desc),
          badge: tech.unlocked ? t("archive.unlocked") : t("archive.locked"),
        }));
        list.appendChild(card);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "eras") {
      const list = el("div", "archive-eras");
      for (const e of vm.stage3.eraArchive) {
        const card = el("div", "archive-card" + (e.reached ? "" : " locked"));
        card.appendChild(createGameObjectHeader(e.reached ? contentGameIcon(e.id, "eras") : "locked", tr(e.name), {
          badge: e.reached ? t("archive.unlocked") : t("archive.locked"),
        }));
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
        if (!core.claimed && vm.singularity.coreClaimable) coreCard.dataset.visualMotion = "claim";
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
      const claimable = vm.achievements.filter((item) => item.claimable).length;
      list.appendChild(el("div", "archive-subtitle",
        `${t("archive.milestones")} ${achieved}/${vm.achievements.length}${t("archive.claimable")} ${claimable}`));
      for (const item of vm.achievements) {
        // CARD-06 负责人反馈：成就改为手动领取天赋点（可领取/已领取/未达成三态）。
        const card = el("div", "archive-card"
          + (item.claimable ? " claimable" : item.claimed ? " claimed" : item.achieved ? "" : " locked"));
        card.dataset.achievementId = item.id;
        if (item.claimable) card.dataset.visualMotion = "claim";
        const achievedAt = item.achievedAtMs > 0
          ? `${t("archive.achievedAt")}${t("common.colon")}${new Date(item.achievedAtMs).toLocaleString(getLocale(), { timeZone: "Asia/Shanghai" })}`
          : undefined;
        card.appendChild(createGameObjectHeader(contentGameIcon(item.id, item.achieved ? "achieved" : "locked"), tr(item.name), {
          subtitle: tr(item.description),
          value: achievedAt,
          badge: item.claimable
            ? t("archive.claimable")
            : item.claimed
              ? t("ach.claimed", { points: item.talentPoints })
              : item.achieved
                ? t("archive.unlocked")
                : t("archive.locked"),
        }));
        if (item.achievedAtMs > 0) {
          // 达成时间已经进入统一卡头；保留后续阶段快照作为第二层信息。
        }
        // CARD-03：达成时快照的阶段与工作室等级（旧档无记录时不展示）。
        if (item.achieved && item.stage > 0) {
          const stageName = t(`civilization.stage${Math.min(5, item.stage)}`);
          card.appendChild(el("div", "archive-card-line",
            `${t("ach.recordStage")}${t("common.colon")}${stageName} · ${t("ach.recordWorkshop")}${item.workshopLevel}`));
        }
        if (item.claimable) {
          if (vm.growth.talent.earned >= TALENT_POINT_CAP) {
            card.appendChild(el("div", "archive-card-line", t("ach.capReached")));
          } else {
            card.appendChild(btn(t("ach.claim", { points: item.talentPoints }), `claim_achievement:${item.id}`, true));
          }
        } else if (item.claimed) {
          card.appendChild(el("div", "archive-card-line claimable-label", t("ach.claimed", { points: item.talentPoints })));
        } else {
          card.appendChild(el("div", "archive-card-line", t("ach.lockedHint")));
        }
        list.appendChild(card);
      }
      archivePanelEl.appendChild(list);
    } else if (contentTab === "chronicle") {
      const list = el("div", "archive-hall");
      const hallTitle = el("div", "archive-card-title");
      setIconText(hallTitle, "honor", t("standalone.chronicleTitle"));
      list.appendChild(hallTitle);
      const personal = el("div", "archive-card hall-personal-record");
      personal.appendChild(createGameObjectHeader("growth", t("archive.myRecords"), {
        subtitle: `${t("hall.companyTitle")}${t("common.colon")}${tr(vm.company.title)}`,
        value: `${t("hall.cumulativeIncome")}${t("common.colon")}${vm.chronicle.cumulativeIncome}`,
        badge: `Lv.${vm.company.level}`,
      }));
      personal.appendChild(el("div", "archive-card-line", `${t("hall.companyLevel")}${t("common.colon")}Lv.${vm.company.level} · ${tr(vm.company.title)}`));
      personal.appendChild(el("div", "archive-card-line", `${t("hall.currentStage")}${t("common.colon")}${tr(vm.chronicle.stageLabel)} · ${t("hall.currentWorkshopLevel", { level: vm.chronicle.workshopLevel })}`));
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

      // 个人历程只来自当前本地存档，不提交到任何排行榜。
      const chronicle = el("div", "archive-card hall-chronicle");
      chronicle.appendChild(createGameObjectHeader("growth", t("hall.chronicleTitle"), {
        subtitle: t("standalone.chronicleIntro"),
        badge: String(vm.chronicle.milestones.filter((entry) => entry.achievedAtMs > 0).length),
      }));
      const recordedMilestones = vm.chronicle.milestones.filter((entry) => entry.achievedAtMs > 0);
      if (recordedMilestones.length === 0) {
        chronicle.appendChild(el("div", "archive-card-line", t("hall.chronicleEmpty")));
      } else {
        for (const entry of recordedMilestones) {
          chronicle.appendChild(el(
            "div",
            "archive-card-line",
            `${t(`hall.milestone.${entry.id}`)}${t("common.colon")}${new Date(entry.achievedAtMs).toLocaleString(getLocale(), { timeZone: "Asia/Shanghai" })}`,
          ));
        }
      }
      if (vm.chronicle.clockAdjustmentCount > 0) {
        chronicle.appendChild(el("div", "archive-card-line", t("hall.clockAdjusted", { count: vm.chronicle.clockAdjustmentCount })));
      }
      list.appendChild(chronicle);
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
    setInteractionFeedbackHandler(h) { interactionFeedbackHandler = h; },
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
    setDebugRuntime,
    showGrowthFeedback(event) { finalFeel.showFeedback(event); },
    setVisualPaused(paused) {
      root.classList.toggle("visual-paused", paused);
      finalFeel.setPaused(paused);
    },
    incrementOrderCompletion(by: number) {
      metrics.orderCompletionCount += by;
    },
  };
}
