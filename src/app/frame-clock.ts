/**
 * 前台帧循环只消化一小段真实时间。
 * 激励视频、系统弹层或后台挂起后的长间隔由生命周期逻辑截断，不能在恢复首帧
 * 乘上调试倍率后一次性补算成数千次 update，阻塞界面造成“白屏”。
 */
export const MAX_FOREGROUND_FRAME_GAP_SEC = 0.25;
/** DOM 呈现限频；模拟仍按每个 requestAnimationFrame 推进。 */
export const UI_RENDER_HZ = 15;
export const UI_RENDER_INTERVAL_MS = 1000 / UI_RENDER_HZ;

export function uiRenderDue(lastRenderAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(nowMs)) return false;
  if (!Number.isFinite(lastRenderAtMs)) return true;
  return nowMs - lastRenderAtMs >= UI_RENDER_INTERVAL_MS - 1e-6;
}

export function foregroundGameSeconds(
  previousNowMs: number,
  nowMs: number,
  runtimeSpeed: number,
  paused: boolean,
): number {
  if (paused) return 0;
  const elapsedSec = (nowMs - previousNowMs) / 1000;
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  const speed = Number.isFinite(runtimeSpeed) ? Math.max(0, runtimeSpeed) : 1;
  return Math.min(elapsedSec, MAX_FOREGROUND_FRAME_GAP_SEC) * speed;
}
