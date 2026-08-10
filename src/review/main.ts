import {
  REVIEW_CHECKPOINTS,
  buildReviewSave,
  isReviewCheckpointId,
  reviewCheckpointById,
  reviewStorageNamespace,
} from "./checkpoints";
import {
  ENDGAME_REVIEW_CHECKPOINTS,
  buildEndgameReviewSave,
  isEndgameReviewCheckpointId,
  endgameReviewCheckpointById,
  endgameReviewStorageNamespace,
  type EndgameReviewCheckpointId,
} from "./endgame-checkpoints";
import {
  REVIEW_EXPERIENCE_SPEEDS,
  resolveReviewSpeed,
  type ReviewRuntimeOverride,
} from "./runtime-contract";
import { ensureEndgameSingularity } from "../economy/singularity";
import { freshSaveData } from "../save/storage";
import {
  consumeReviewResetMarker,
  REVIEW_RESET_MESSAGE,
  resetReviewCheckpoint,
} from "./reset";
import "../styles/main.css";
import "./review.css";

type StandardReviewCheckpointId = (typeof REVIEW_CHECKPOINTS)[number]["id"];

function buttonLink(label: string, checkpoint: string, className: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.className = className;
  anchor.href = `?checkpoint=${encodeURIComponent(checkpoint)}`;
  anchor.textContent = label;
  return anchor;
}

function renderReviewHome(message?: string): void {
  const container = document.getElementById("app");
  if (!container) throw new Error("#app missing");
  document.title = "算力大亨 · 创始人集中评审";
  document.body.dataset.reviewBuild = "true";
  container.className = "review-home";

  const eyebrow = document.createElement("div");
  eyebrow.className = "review-eyebrow";
  eyebrow.textContent = "FOUNDER CONCENTRATED REVIEW · V2";

  const title = document.createElement("h1");
  title.textContent = "算力大亨";
  const subtitle = document.createElement("p");
  subtitle.className = "review-subtitle";
  subtitle.textContent = "一次看完 Stage 1–3、第一次技术迭代与第二轮加速。每个检查点都是真实状态机，且互不污染。";

  const buildCommit = document.createElement("p");
  buildCommit.className = "review-build-commit";
  const shortCommit = import.meta.env.VITE_REVIEW_COMMIT?.trim().slice(0, 7) || "local";
  buildCommit.dataset.commit = shortCommit;
  buildCommit.textContent = `Review candidate · ${shortCommit}`;

  const primary = buttonLink("从新档完整开始", "new_game", "review-primary");
  const natural = document.createElement("a");
  natural.className = "review-primary";
  natural.href = "?natural=1";
  natural.textContent = "P0 · 从全新档自然运行至终局";

  const intro = document.createElement("section");
  intro.className = "review-intro";
  intro.append(eyebrow, title, subtitle, buildCommit, primary, natural);
  if (message) {
    const notice = document.createElement("p");
    notice.className = "review-notice";
    notice.textContent = message;
    intro.appendChild(notice);
  }

  const checkpointSection = document.createElement("section");
  checkpointSection.className = "review-checkpoints";
  const heading = document.createElement("div");
  heading.className = "review-section-heading";
  heading.innerHTML = "<h2>评审检查点</h2><p>可从任一关键时刻开始，刷新后继续当前进度。</p>";
  const grid = document.createElement("div");
  grid.className = "review-grid";
  for (const checkpoint of REVIEW_CHECKPOINTS) {
    const card = buttonLink("", checkpoint.id, "review-card");
    card.innerHTML = `
      <span class="review-code">${checkpoint.code}</span>
      <span class="review-card-title">${checkpoint.label}</span>
      <span class="review-card-description">${checkpoint.description}</span>
      <span class="review-card-focus">${checkpoint.focus}</span>`;
    grid.appendChild(card);
  }
  checkpointSection.append(heading, grid);

  // CARD-06 终局集中复验：A–M（隔离终局命名空间）
  const endgameSection = document.createElement("section");
  endgameSection.className = "review-checkpoints review-endgame-section";
  const egHeading = document.createElement("div");
  egHeading.className = "review-section-heading";
  egHeading.innerHTML = "<h2>终局复验检查点（CARD-06 · A–M）</h2><p>覆盖 R1–R3 时代工程、奇点核心、地外揭示、Stage 4/5 与永续入口；全部使用隔离终局存档。</p>";
  const egGrid = document.createElement("div");
  egGrid.className = "review-grid";
  for (const checkpoint of ENDGAME_REVIEW_CHECKPOINTS) {
    const card = buttonLink("", checkpoint.id, "review-card review-card-endgame");
    card.innerHTML = `
      <span class="review-code">${checkpoint.code}</span>
      <span class="review-card-title">${checkpoint.label}</span>
      <span class="review-card-description">${checkpoint.description}</span>
      <span class="review-card-focus">${checkpoint.focus}</span>`;
    egGrid.appendChild(card);
  }
  endgameSection.append(egHeading, egGrid);

  const boundary = document.createElement("footer");
  boundary.className = "review-boundary";
  boundary.textContent = "本站点是私密产品评审候选，不代表真人、真机或发布通过。";

  container.replaceChildren(intro, checkpointSection, endgameSection, boundary);
}

async function startCheckpoint(
  id: StandardReviewCheckpointId | EndgameReviewCheckpointId
): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const naturalRun = params.get("natural") === "1";
  // CARD-06：终局检查点走隔离终局命名空间与构建器；其余保持 Review v2。
  const isEndgame = !naturalRun && isEndgameReviewCheckpointId(id);
  const checkpoint = naturalRun
    ? {
        code: "P0",
        label: "全新档自然终局流程",
      }
    : isEndgame
    ? endgameReviewCheckpointById(id as EndgameReviewCheckpointId)
    : reviewCheckpointById(id as StandardReviewCheckpointId);
  const namespace = naturalRun
    ? "compute_tycoon_h5_p0_natural_review_v1"
    : isEndgame
    ? endgameReviewStorageNamespace(id as EndgameReviewCheckpointId)
    : reviewStorageNamespace(id as StandardReviewCheckpointId);
  const resetNotice = consumeReviewResetMarker({
    search: window.location.search,
    pathname: window.location.pathname,
    hash: window.location.hash,
    replaceState: (url) => window.history.replaceState(null, "", url),
  });
  const speed = resolveReviewSpeed(params);
  const initialSave = naturalRun
    ? (() => {
        const fresh = freshSaveData(Date.now());
        fresh.saveId = "p0-natural-review-v1";
        ensureEndgameSingularity(fresh);
        return fresh;
      })()
    : isEndgame
      ? buildEndgameReviewSave(id as EndgameReviewCheckpointId, Date.now())
      : buildReviewSave(id as StandardReviewCheckpointId, Date.now());

  document.title = `算力大亨 · ${checkpoint.code} ${checkpoint.label}`;
  document.body.dataset.reviewBuild = "true";
  document.body.dataset.reviewCheckpoint = naturalRun ? "p0_natural" : id;

  const app = document.getElementById("app");
  if (!app) throw new Error("#app missing");
  app.classList.add("review-game-host");

  const bar = document.createElement("nav");
  bar.className = "review-session-bar";
  bar.setAttribute("aria-label", "集中评审导航");
  const identity = document.createElement("div");
  identity.className = "review-session-identity";
  identity.innerHTML = `<span>${checkpoint.code}</span><strong>${checkpoint.label}</strong>`;
  if (resetNotice) {
    const notice = document.createElement("small");
    notice.className = "review-reset-notice";
    notice.setAttribute("role", "status");
    notice.textContent = REVIEW_RESET_MESSAGE;
    identity.appendChild(notice);
  }

  const actions = document.createElement("div");
  actions.className = "review-session-actions";
  if (params.get("qa") !== "1") {
    const speedControl = document.createElement("label");
    speedControl.className = "review-speed-control";
    const speedLabel = document.createElement("span");
    speedLabel.textContent = "调试";
    const speedSelect = document.createElement("select");
    speedSelect.setAttribute("aria-label", "整体游戏时间倍率");
    for (const value of REVIEW_EXPERIENCE_SPEEDS) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value}×`;
      option.selected = value === speed;
      speedSelect.appendChild(option);
    }
    speedSelect.addEventListener("change", () => {
      const nextSpeed = Number(speedSelect.value);
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete("qa");
      if (nextSpeed === 1) {
        nextParams.delete("debug");
        nextParams.delete("speed");
      } else {
        nextParams.set("debug", "1");
        nextParams.set("speed", String(nextSpeed));
      }
      window.location.search = nextParams.toString();
    });
    speedControl.append(speedLabel, speedSelect);
    actions.appendChild(speedControl);
  }
  const home = document.createElement("button");
  home.type = "button";
  home.textContent = "返回评审首页";
  home.addEventListener("click", () => {
    window.location.href = window.location.pathname;
  });
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "重置当前检查点";
  let teardownActiveApp: () => void = () => undefined;
  reset.addEventListener("click", () => {
    resetReviewCheckpoint(naturalRun ? "p0_natural" : id, namespace, {
      search: window.location.search,
      pathname: window.location.pathname,
      hash: window.location.hash,
      teardown: teardownActiveApp,
      removeItem: (key) => window.localStorage.removeItem(key),
      navigate: (url) => window.location.assign(url),
    });
  });
  actions.append(home, reset);
  bar.append(identity, actions);

  const override: ReviewRuntimeOverride = {
    kind: "founder-review-v2",
    checkpointId: naturalRun ? "p0_natural" : id,
    checkpointLabel: checkpoint.label,
    namespace,
    initialSave,
    speed,
    preserveImportedSave: naturalRun,
  };
  window.__CT_REVIEW_RUNTIME_OVERRIDE__ = override;
  const appMain = await import("../app/main");
  teardownActiveApp = appMain.teardown;
  const reviewToolsHost = app.querySelector(".review-tools-host");
  if (reviewToolsHost) {
    (reviewToolsHost as HTMLElement).hidden = false;
    reviewToolsHost.appendChild(bar);
  }
  else app.prepend(bar);
}

const params = new URLSearchParams(window.location.search);
const requested = params.get("checkpoint");
if (params.get("natural") === "1") {
  startCheckpoint("new_game").catch((error: unknown) => {
    console.error("[review] natural run failed", error);
    renderReviewHome("P0 自然流程未能初始化，已阻断进入。");
  });
} else if (requested === null) {
  renderReviewHome();
} else if (!isReviewCheckpointId(requested) && !isEndgameReviewCheckpointId(requested)) {
  renderReviewHome("未识别该检查点，已返回安全评审首页。");
} else {
  startCheckpoint(requested as (typeof REVIEW_CHECKPOINTS)[number]["id"] | EndgameReviewCheckpointId).catch((error: unknown) => {
    console.error("[review] checkpoint failed", error);
    renderReviewHome("检查点未能通过完整性校验，已阻断进入。");
  });
}
