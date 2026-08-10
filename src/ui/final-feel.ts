import type {
  FeelActionVM,
  FeelViewModel,
  GrowthFeedbackEvent,
} from "../economy/feel";
import { t } from "../i18n";

export interface FinalFeelMetrics {
  stableNodeCount: number;
  particleNodeCount: number;
  feedbackCount: number;
  actionEdgeCount: number;
  navigationCount: number;
}

export interface FinalFeelController {
  element: HTMLElement;
  patch(feel: FeelViewModel): void;
  showFeedback(event: GrowthFeedbackEvent): void;
  setPaused(paused: boolean): void;
  getMetrics(): FinalFeelMetrics;
  destroy(): void;
}

const PARTICLE_COUNT = 10;
const ACTION_SLOT_COUNT = 4;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function exactActionTarget(root: HTMLElement, action: string): HTMLElement | null {
  const candidates = root.querySelectorAll<HTMLElement>("[data-action], [data-command]");
  for (const candidate of candidates) {
    if (candidate.dataset.action === action || candidate.dataset.command === action) return candidate;
  }
  return null;
}

export function createFinalFeelController(root: HTMLElement, moneyElement: HTMLElement): FinalFeelController {
  const element = node("section", "final-feel-panel");
  element.setAttribute("aria-label", t("feel.aria.running"));
  element.dataset.tier = "idle";
  element.dataset.running = "false";

  const engine = node("div", "compute-engine");
  const visual = node("div", "compute-engine-visual");
  visual.setAttribute("aria-hidden", "true");
  const ringOuter = node("span", "compute-ring compute-ring-outer");
  const ringMiddle = node("span", "compute-ring compute-ring-middle");
  const ringInner = node("span", "compute-ring compute-ring-inner");
  const core = node("span", "compute-core");
  const orbit = node("span", "compute-orbit");
  const particleField = node("span", "compute-particles");
  const particles: HTMLElement[] = [];
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const particle = node("i", "compute-particle");
    particle.style.setProperty("--particle-index", String(index));
    particleField.appendChild(particle);
    particles.push(particle);
  }
  visual.append(ringOuter, ringMiddle, ringInner, orbit, particleField, core);

  const readout = node("div", "compute-engine-readout");
  const label = node("div", "compute-engine-label", t("feel.computeLabel.total"));
  const value = node("strong", "compute-engine-value", "0");
  const status = node("div", "compute-engine-status", t("feel.status.idle"));
  const cosmic = node("div", "compute-engine-cosmic");
  cosmic.hidden = true;
  const cosmicNodes = node("span", "compute-cosmic-nodes");
  const cosmicMultiplier = node("span", "compute-cosmic-multiplier");
  const cosmicProject = node("span", "compute-cosmic-project");
  cosmic.append(cosmicNodes, cosmicMultiplier, cosmicProject);
  const progress = node("div", "compute-engine-progress");
  progress.hidden = true;
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  const progressBar = node("span", "compute-engine-progress-bar");
  progress.appendChild(progressBar);
  readout.append(label, value, status, cosmic, progress);
  engine.append(visual, readout);

  const feedback = node("div", "growth-feedback");
  feedback.hidden = true;
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  const feedbackTitle = node("strong", "growth-feedback-title");
  const feedbackDetail = node("span", "growth-feedback-detail");
  feedback.append(feedbackTitle, feedbackDetail);

  const actionSummary = node("div", "investment-summary");
  const actionHeader = node("div", "investment-summary-header");
  const actionTitle = node("strong", "investment-summary-title", t("feel.actions.available", { count: 0 }));
  const actionRecommendation = node("span", "investment-summary-recommendation", t("feel.actions.accumulating"));
  actionHeader.append(actionTitle, actionRecommendation);
  const actionSlots = node("div", "investment-summary-actions");
  const actionButtons: HTMLButtonElement[] = [];
  for (let index = 0; index < ACTION_SLOT_COUNT; index += 1) {
    const button = node("button", "investment-action") as HTMLButtonElement;
    button.type = "button";
    button.hidden = true;
    button.setAttribute("aria-label", t("feel.actions.locate"));
    actionSlots.appendChild(button);
    actionButtons.push(button);
  }
  actionSummary.append(actionHeader, actionSlots);

  const growthReview = node("aside", "growth-review-card");
  growthReview.hidden = true;
  const growthReviewKicker = node("div", "growth-review-kicker", t("feel.growthReview.kicker"));
  const growthReviewRoute = node("strong", "growth-review-route");
  const growthReviewMetrics = node("div", "growth-review-metrics");
  const growthReviewSummary = node("div", "growth-review-summary");
  growthReview.append(growthReviewKicker, growthReviewRoute, growthReviewMetrics, growthReviewSummary);

  element.append(engine, feedback, actionSummary, growthReview);

  let initialized = false;
  let previousActionIds = new Set<string>();
  let feedbackTimer: number | null = null;
  let moneyTimer: number | null = null;
  let paused = false;
  const edgeTimers = new Map<HTMLButtonElement, number>();
  const metrics: FinalFeelMetrics = {
    stableNodeCount: element.querySelectorAll("*").length + 1,
    particleNodeCount: particles.length,
    feedbackCount: 0,
    actionEdgeCount: 0,
    navigationCount: 0,
  };

  function pulseAction(button: HTMLButtonElement): void {
    const existing = edgeTimers.get(button);
    if (existing !== undefined) window.clearTimeout(existing);
    button.classList.remove("became-affordable");
    window.setTimeout(() => button.classList.add("became-affordable"), 0);
    const timer = window.setTimeout(() => {
      button.classList.remove("became-affordable");
      edgeTimers.delete(button);
    }, 650);
    edgeTimers.set(button, timer);
    metrics.actionEdgeCount += 1;
  }

  function patchActions(actions: FeelActionVM[]): void {
    setText(actionTitle, t("feel.actions.available", { count: actions.length }));
    const recommended = actions[0];
    setText(
      actionRecommendation,
      recommended
        ? `${t("feel.actions.recommended")}: ${recommended.label}${recommended.projectedIncomeGain ? ` · ${recommended.projectedIncomeGain}` : ""}`
        : t("feel.actions.accumulating"),
    );
    const nextIds = new Set(actions.map((action) => action.id));
    for (let index = 0; index < actionButtons.length; index += 1) {
      const button = actionButtons[index];
      const action = actions[index];
      button.hidden = action == null;
      if (!action) {
        button.removeAttribute("data-feel-anchor");
        button.removeAttribute("data-feel-action-id");
        button.textContent = "";
        continue;
      }
      button.dataset.feelAnchor = action.anchorAction;
      button.dataset.feelActionId = action.id;
      button.textContent = index === 0 ? `${t("feel.actions.goTo")} · ${action.label}` : action.label;
      if (initialized && !previousActionIds.has(action.id)) pulseAction(button);
    }
    previousActionIds = nextIds;
    initialized = true;
  }

  function patchGrowthReview(feel: FeelViewModel): void {
    const review = feel.growthReview;
    growthReview.hidden = !review.visible;
    if (!review.visible) return;
    setText(growthReviewRoute, `${review.fromLabel} → ${review.currentLabel}`);
    setText(
      growthReviewMetrics,
      `${t("feel.growthReview.elapsed")} ${review.elapsedLabel} · ${t("feel.computeLabel.total")} ${review.computeLabel} · ${t("feel.income")} ${review.incomeLabel} · ${t("feel.growthReview.milestones")} ${review.milestoneCount}`,
    );
    setText(growthReviewSummary, review.summary);
  }

  function patch(feel: FeelViewModel): void {
    element.dataset.tier = feel.computeTier;
    element.dataset.running = String(!paused && feel.activity01 > 0);
    element.style.setProperty("--feel-activity", feel.activity01.toFixed(3));
    element.style.setProperty("--feel-period", `${(6 - feel.activity01 * 2.5).toFixed(2)}s`);
    setText(label, feel.computeLabel);
    setText(value, feel.computeValue);
    setText(status, feel.activity01 > 0 ? `${t("feel.status.running")} · ${feel.incomeValue}` : t("feel.status.idle"));

    const hasCosmic = feel.cosmicNodeOwned !== null && feel.cosmicNodeTotal !== null;
    cosmic.hidden = !hasCosmic;
    if (hasCosmic) {
      setText(cosmicNodes, `${t("feel.cosmic.nodes")} ${feel.cosmicNodeOwned}/${feel.cosmicNodeTotal}`);
      setText(cosmicMultiplier, `${t("feel.cosmic.multiplier")} ${feel.cosmicMultiplier ?? "×1.00"}`);
      setText(
        cosmicProject,
        feel.activeProjectProgress01 === null
          ? t("feel.cosmic.projectIdle")
          : `${t("feel.cosmic.project")} ${Math.round(feel.activeProjectProgress01 * 100)}%`,
      );
    }
    progress.hidden = feel.activeProjectProgress01 === null;
    if (feel.activeProjectProgress01 !== null) {
      const percent = Math.max(0, Math.min(100, feel.activeProjectProgress01 * 100));
      progressBar.style.width = `${percent}%`;
      progress.setAttribute("aria-valuenow", percent.toFixed(0));
      progress.setAttribute("aria-label", `${t("feel.cosmic.projectProgress", { value: percent.toFixed(0) })}`);
    }
    patchActions(feel.affordableActions);
    patchGrowthReview(feel);
  }

  function showFeedback(event: GrowthFeedbackEvent): void {
    if (paused) return;
    if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
    feedback.dataset.kind = event.kind;
    feedback.hidden = false;
    setText(feedbackTitle, event.headline);
    setText(feedbackDetail, event.detail);
    engine.classList.remove("growth-burst");
    window.setTimeout(() => engine.classList.add("growth-burst"), 0);
    metrics.feedbackCount += 1;
    if (event.moneyIncreased) {
      if (moneyTimer !== null) window.clearTimeout(moneyTimer);
      moneyElement.classList.remove("feel-money-rise");
      window.setTimeout(() => moneyElement.classList.add("feel-money-rise"), 0);
      moneyTimer = window.setTimeout(() => moneyElement.classList.remove("feel-money-rise"), 1050);
    }
    feedbackTimer = window.setTimeout(() => {
      feedback.hidden = true;
      engine.classList.remove("growth-burst");
      feedbackTimer = null;
    }, event.durationMs);
  }

  function setPaused(next: boolean): void {
    paused = next;
    element.dataset.paused = String(next);
    if (!next) return;
    element.dataset.running = "false";
    feedback.hidden = true;
    engine.classList.remove("growth-burst");
    if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
    if (moneyTimer !== null) window.clearTimeout(moneyTimer);
    feedbackTimer = null;
    moneyTimer = null;
    moneyElement.classList.remove("feel-money-rise");
  }

  const onActionClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("button[data-feel-anchor]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.feelAnchor;
    if (!action) return;
    const destination = exactActionTarget(root, action);
    if (!destination) return;
    metrics.navigationCount += 1;
    destination.scrollIntoView?.({ behavior: "smooth", block: "center" });
    destination.focus?.({ preventScroll: true });
    destination.classList.remove("feel-target-focus");
    window.setTimeout(() => destination.classList.add("feel-target-focus"), 0);
    window.setTimeout(() => destination.classList.remove("feel-target-focus"), 900);
  };
  actionSummary.addEventListener("click", onActionClick);

  return {
    element,
    patch,
    showFeedback,
    setPaused,
    getMetrics: () => ({ ...metrics, stableNodeCount: element.querySelectorAll("*").length + 1 }),
    destroy() {
      actionSummary.removeEventListener("click", onActionClick);
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      if (moneyTimer !== null) window.clearTimeout(moneyTimer);
      for (const timer of edgeTimers.values()) window.clearTimeout(timer);
      edgeTimers.clear();
      element.remove();
    },
  };
}
