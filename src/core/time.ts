// 可信时间：统一注入，支持测试固定时钟；记录与真实时间的偏移用于日期回拨保护。
export interface Clock {
  now(): number; // 毫秒 epoch
}

export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class OffsetClock implements Clock {
  private offset = 0;
  private lastReal = 0;
  constructor(private real: Clock = new RealClock()) {}
  now(): number {
    const r = this.real.now();
    // 检测真实时间回拨：只允许向前
    if (r < this.lastReal) {
      this.offset += this.lastReal - r;
    }
    this.lastReal = Math.max(this.lastReal, r);
    return this.lastReal + this.offset;
  }
  /** 手动注入偏移（测试/加速用） */
  setOffset(ms: number): void {
    this.offset = ms;
  }
}

export function secondsBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / 1000));
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 排行榜/档案日期显示：按 locale 输出本地化日期（UTC 存储，本地展示）。 */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
