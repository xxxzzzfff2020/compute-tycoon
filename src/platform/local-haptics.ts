export type InteractionFeedbackKind = "click" | "success" | "milestone";

const DURATION_MS: Record<InteractionFeedbackKind, number> = {
  click: 8,
  success: 16,
  milestone: 28,
};

/** 仅使用设备本地振动；不支持或浏览器拒绝时静默降级。 */
export class LocalHaptics {
  private lastAt = Number.NEGATIVE_INFINITY;

  trigger(kind: InteractionFeedbackKind, enabled: boolean): void {
    if (!enabled || document.visibilityState === "hidden") return;
    const now = performance.now();
    if (now - this.lastAt < 160) return;
    this.lastAt = now;
    try {
      window.navigator.vibrate?.(DURATION_MS[kind]);
    } catch {
      // 本地触感不可用不影响命令、存档或音乐。
    }
  }
}
