import Decimal from "decimal.js";
import type { SaveData } from "../save/types";

/**
 * 平台排行榜只能接收安全整数。银河财富指数把累计营业收入按科学计数法压缩为
 * 单调保序整数：指数优先、同指数内按尾数排序。它不是人民币金额，游戏内仍展示
 * 原始累计营业收入。
 *
 * 支持的指数范围远大于本游戏正常数值曲线；超过边界时明确不提交，而不是截断或
 * 把两个不同数量级混为同一个榜分。
 */
/**
 * v2 将提交域收窄到平台榜常见的 32-bit 正整数安全区。
 * 游戏内可继续显示完整累计收入；榜分仅用作严格保序的排名键。
 */
export const WEALTH_INDEX_VERSION = 2;
const MIN_DECIMAL_EXPONENT = -1_000;
const MAX_DECIMAL_EXPONENT = 999_999;
const MANTISSA_BUCKETS = 1_000;
/** 最大提交分为 1,001,000,000，低于 signed 32-bit 上界。 */
export const WEALTH_INDEX_MAX_PLATFORM_SCORE = 1_001_000_000;

export interface WealthIndex {
  /** 可提交到 TapTap 单字段整数排行榜的安全分数。 */
  score: number;
  /** 原始累计营业收入的十进制数量级，用于游戏内解释，不提交为金额。 */
  exponent: number;
  /** 1 ≤ mantissa < 10 的可读尾数。 */
  mantissa: string;
}

function asDecimal(value: SaveData["lifetimeIncome"] | Decimal): Decimal | null {
  try {
    const parsed = value instanceof Decimal ? value : new Decimal(value);
    return parsed.isFinite() && !parsed.isNegative() ? parsed : null;
  } catch {
    return null;
  }
}

/** 将累计营业收入映射为安全、单调保序的银河财富指数。 */
export function wealthIndexOf(value: SaveData["lifetimeIncome"] | Decimal): WealthIndex | null {
  const wealth = asDecimal(value);
  if (!wealth) return null;
  if (wealth.isZero()) return { score: 0, exponent: 0, mantissa: "0" };

  // Decimal.js 的 toExponential 让我们不依赖 JS Number 的有限指数范围。
  const [mantissaText, exponentText] = wealth.toExponential().toLowerCase().split("e");
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || exponent < MIN_DECIMAL_EXPONENT || exponent > MAX_DECIMAL_EXPONENT) {
    return null;
  }
  const mantissa = new Decimal(mantissaText);
  if (mantissa.lt(1) || mantissa.gte(10)) return null;
  const fractionalBucket = mantissa.minus(1)
    .div(9)
    .mul(MANTISSA_BUCKETS - 1)
    .floor()
    .toNumber();
  const score = (exponent - MIN_DECIMAL_EXPONENT) * MANTISSA_BUCKETS + fractionalBucket + 1;
  if (!Number.isSafeInteger(score) || score < 0 || score > WEALTH_INDEX_MAX_PLATFORM_SCORE) return null;
  return { score, exponent, mantissa: mantissa.toSignificantDigits(4).toString() };
}

export function encodeWealthIndex(value: SaveData["lifetimeIncome"] | Decimal): number | null {
  return wealthIndexOf(value)?.score ?? null;
}

/** 仅用于名人堂本地说明，不把指数伪装成真实金额。 */
export function formatWealthIndex(value: SaveData["lifetimeIncome"] | Decimal): string {
  const index = wealthIndexOf(value);
  if (!index) return "—";
  if (index.score === 0) return "GI-0";
  return `GI-${index.exponent >= 0 ? "+" : ""}${index.exponent} · ${index.mantissa}`;
}
