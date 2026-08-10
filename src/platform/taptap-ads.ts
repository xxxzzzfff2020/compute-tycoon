// TapTap 小游戏激励视频适配层。
// 本批仅用于 ?adtest=1 联调：不发游戏奖励、不改存档、不初始化插屏/Banner。

export const TAPTAP_REWARDED_VIDEO_AD_UNIT_ID = "1054324";

export type TapRewardedAdState =
  | "idle"
  | "unsupported"
  | "loading"
  | "ready"
  | "showing"
  | "error"
  | "destroyed";

export interface TapRewardedVideoAd {
  onLoad(callback: () => void): void;
  onError(callback: (error: { errCode?: number; errMsg?: string }) => void): void;
  onClose(callback: (result?: { isEnded?: boolean }) => void): void;
  load?(): unknown;
  show(): unknown;
  destroy?(): void;
}
export interface TapAdsApi {
  createRewardedVideoAd(options: { adUnitId: string }): TapRewardedVideoAd;
}

export interface TapRewardedAdSnapshot {
  state: TapRewardedAdState;
  message: string;
}

type SnapshotListener = (snapshot: TapRewardedAdSnapshot) => void;
type CompletionListener = (completed: boolean) => void;

function globalTapApi(): TapAdsApi | undefined {
  const candidate = (globalThis as typeof globalThis & { tap?: TapAdsApi }).tap;
  return candidate && typeof candidate.createRewardedVideoAd === "function" ? candidate : undefined;
}

function errorMessage(error: { errCode?: number; errMsg?: string } | unknown): string {
  if (typeof error === "object" && error !== null) {
    const value = error as { errCode?: number; errMsg?: string; message?: string };
    const detail = value.errMsg ?? value.message;
    if (detail) return value.errCode == null ? detail : `${value.errCode}: ${detail}`;
  }
  return "未知错误";
}

export class TapRewardedAdController {
  private readonly adUnitId: string;
  private readonly injectedApi?: TapAdsApi;
  private ad: TapRewardedVideoAd | null = null;
  private snapshot: TapRewardedAdSnapshot = { state: "idle", message: "尚未初始化" };
  private listeners = new Set<SnapshotListener>();
  private pendingCompletion: CompletionListener | null = null;

  constructor(options: { adUnitId?: string; tapApi?: TapAdsApi } = {}) {
    this.adUnitId = options.adUnitId ?? TAPTAP_REWARDED_VIDEO_AD_UNIT_ID;
    this.injectedApi = options.tapApi;
  }

  getSnapshot(): TapRewardedAdSnapshot {
    return { ...this.snapshot };
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  init(): void {
    if (this.snapshot.state !== "idle") return;
    const tapApi = this.injectedApi ?? globalTapApi();
    if (!tapApi) {
      this.setSnapshot("unsupported", "当前不是 TapTap 小游戏环境");
      return;
    }

    try {
      this.ad = tapApi.createRewardedVideoAd({ adUnitId: this.adUnitId });
      this.ad.onLoad(() => {
        if (this.snapshot.state !== "destroyed") this.setSnapshot("ready", "激励视频已就绪");
      });
      this.ad.onError((error) => {
        const pending = this.pendingCompletion;
        this.pendingCompletion = null;
        this.setSnapshot("error", `广告错误：${errorMessage(error)}`);
        pending?.(false);
      });
      this.ad.onClose((result) => {
        const pending = this.pendingCompletion;
        this.pendingCompletion = null;
        pending?.(result?.isEnded === true);
        if (this.snapshot.state !== "destroyed") {
          // 平台会自动加载下一条；等待下一次 onLoad 再允许播放。
          this.setSnapshot("loading", "正在加载下一条激励视频");
        }
      });
      this.setSnapshot("loading", "正在加载激励视频");
      this.ad.load?.();
    } catch (error) {
      this.ad = null;
      this.setSnapshot("error", `初始化失败：${errorMessage(error)}`);
    }
  }

  show(onComplete: CompletionListener): boolean {
    if (!this.ad || this.snapshot.state !== "ready") return false;
    this.pendingCompletion = onComplete;
    this.setSnapshot("showing", "激励视频播放中");
    try {
      this.ad.show();
      return true;
    } catch (error) {
      this.pendingCompletion = null;
      this.setSnapshot("error", `播放失败：${errorMessage(error)}`);
      onComplete(false);
      return false;
    }
  }

  destroy(): void {
    if (this.snapshot.state === "destroyed") return;
    this.pendingCompletion = null;
    try {
      this.ad?.destroy?.();
    } finally {
      this.ad = null;
      this.setSnapshot("destroyed", "广告联调已关闭");
      this.listeners.clear();
    }
  }

  private setSnapshot(state: TapRewardedAdState, message: string): void {
    this.snapshot = { state, message };
    for (const listener of this.listeners) listener(this.getSnapshot());
  }
}

export function installTapRewardedAdTest(
  container: HTMLElement,
  options: { enabled: boolean; controller?: TapRewardedAdController },
): () => void {
  if (!options.enabled) return () => {};

  const controller = options.controller ?? new TapRewardedAdController();
  const panel = document.createElement("aside");
  panel.className = "ad-test-panel";
  panel.setAttribute("aria-label", "TapTap 激励视频联调");

  const title = document.createElement("strong");
  title.textContent = "激励视频联调";
  const note = document.createElement("div");
  note.className = "ad-test-note";
  note.textContent = "仅验证播放回调，不发游戏奖励、不修改存档";
  const status = document.createElement("div");
  status.className = "ad-test-status";
  const result = document.createElement("div");
  result.className = "ad-test-result";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-primary";
  button.textContent = "播放激励视频";
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  panel.append(title, note, status, result, button);
  container.appendChild(panel);

  const unsubscribe = controller.subscribe((snapshot) => {
    status.textContent = snapshot.message;
    const ready = snapshot.state === "ready";
    button.disabled = !ready;
    button.classList.toggle("disabled", !ready);
    button.setAttribute("aria-disabled", String(!ready));
  });

  button.addEventListener("click", () => {
    result.textContent = "";
    const started = controller.show((completed) => {
      result.textContent = completed
        ? "完整观看回调已收到 · 联调成功（未修改存档）"
        : "视频未完整观看或播放失败 · 未产生任何游戏变化";
    });
    if (!started) result.textContent = "广告尚未就绪，请稍后重试";
  });

  controller.init();
  return () => {
    unsubscribe();
    controller.destroy();
    panel.remove();
  };
}
