// 大数表示：基于 decimal.js。所有经济数值以 Decimal 存储与运算。
// 显示单位随语言环境切换：zh-CN 使用 万/亿/兆/京，en-US 使用 K/M/B/T。
import Decimal from "decimal.js";
import { getLocale, type Locale } from "../i18n";

Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_UP });

/**
 * 存档中的规模型大数：安全范围内继续用 number 兼容旧档，
 * 超过 JS 安全整数边界后改用 Decimal 字符串，避免 JSON 往返丢精度。
 */
export type StoredBig = number | string;

const MAX_SAFE_MAGNITUDE = new Decimal(Number.MAX_SAFE_INTEGER);

export function toStoredBig(value: Decimal.Value): StoredBig {
  const v = new Decimal(value);
  if (!v.isFinite()) throw new Error("non_finite_big_value");
  if (v.isZero()) return 0;
  if (v.abs().lte(MAX_SAFE_MAGNITUDE)) return v.toNumber();
  return v.toSignificantDigits(Decimal.precision).toString();
}

export function isNonNegativeStoredBig(value: unknown): value is StoredBig {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && value.trim() === "") return false;
  try {
    const v = new Decimal(value);
    return v.isFinite() && v.gte(0);
  } catch {
    return false;
  }
}

export function normalizeNonNegativeStoredBig(
  value: unknown,
  fallback: StoredBig = 0,
): StoredBig {
  return isNonNegativeStoredBig(value) ? toStoredBig(value) : fallback;
}

/** 每单位可读文本的界限（按 locale）。 */
function unitTable(locale: Locale): Array<{ e: number; label: string }> {
  return locale === "en-US"
    ? [
        { e: 3, label: "K" },
        { e: 6, label: "M" },
        { e: 9, label: "B" },
        { e: 12, label: "T" },
        { e: 15, label: "Qa" },
        { e: 18, label: "Qi" },
        { e: 21, label: "Sx" },
        { e: 24, label: "Sp" },
      ]
    : [
        { e: 4, label: "万" },
        { e: 8, label: "亿" },
        { e: 12, label: "兆" },
        { e: 16, label: "京" },
      ];
}

function withThousands(value: Decimal): string {
  const int = value.floor().toFixed(0);
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatBig(value: Decimal | number | string): string {
  const v = new Decimal(value);
  if (!v.isFinite()) return "∞";
  if (v.isZero()) return "0";
  const neg = v.isNegative();
  const abs = v.abs();
  const exp = abs.toExponential().split("e");
  const expNum = exp.length > 1 ? Math.floor(Number(exp[1])) : 0;
  const sign = neg ? "-" : "";
  const units = unitTable(getLocale());
  // 低于首个数量级：千分位整数
  const firstUnit = units[0].e;
  if (abs.lt(Math.pow(10, firstUnit))) {
    if (abs.lte(10)) {
      const s = abs.toFixed(2).replace(/\.?0+$/, "");
      return sign + s;
    }
    return sign + withThousands(abs);
  }
  let best: { e: number; label: string } | null = null;
  for (const u of units) {
    if (expNum >= u.e) best = u;
  }
  if (best && expNum < units[units.length - 1].e + 4) {
    const scaled = abs.div(new Decimal(10).pow(best.e));
    const digits = scaled.gte(100) ? 0 : 2;
    const fixed = scaled.toFixed(digits);
    const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
    return sign + trimmed + best.label;
  }
  // 超出范围：科学计数法
  const mantissa = abs.div(new Decimal(10).pow(expNum)).toFixed(2);
  return sign + mantissa + "e" + expNum;
}

export function formatRate(value: Decimal | number | string): string {
  return formatBig(value);
}

function currencyPrefix(): string {
  return getLocale() === "en-US" ? "$" : "¥";
}

export function formatMoney(value: Decimal | number | string): string {
  return currencyPrefix() + formatBig(value);
}

const HEADER_MONEY_CUTOFF = new Decimal("1000000000000");

/** 顶部当前资金：阈值内保留完整千分位；超过后按大数单位→科学计数法。 */
export function formatHeaderMoney(value: Decimal | number | string): string {
  const v = new Decimal(value);
  if (!v.isFinite()) return currencyPrefix() + "∞";

  const sign = v.isNegative() ? "-" : "";
  const abs = v.abs();
  if (abs.lte(HEADER_MONEY_CUTOFF)) {
    return currencyPrefix() + sign + withThousands(abs);
  }

  return `${currencyPrefix()}${sign}${formatBig(abs)}`;
}

/**
 * 永续终局实时资金：保留两位大数小数，让持续收入在没有新按钮时仍可被看见。
 * 仅用于终局表现，不改变存档、结算或普通阶段的顶部资金合同。
 */
export function formatLiveMoney(
  value: Decimal | number | string,
  visibleStep: Decimal | number | string = 0,
): string {
  const v = new Decimal(value);
  if (!v.isFinite()) return currencyPrefix() + "∞";

  const sign = v.isNegative() ? "-" : "";
  const abs = v.abs();
  if (abs.lte(HEADER_MONEY_CUTOFF)) return currencyPrefix() + sign + withThousands(abs);

  const expParts = abs.toExponential().split("e");
  const expNum = expParts.length > 1 ? Math.floor(Number(expParts[1])) : 0;
  const units = unitTable(getLocale());
  let best: { e: number; label: string } | null = null;
  for (const unit of units) {
    if (expNum >= unit.e) best = unit;
  }
  if (best && expNum < units[units.length - 1].e + 4) {
    const unit = new Decimal(10).pow(best.e);
    const step = new Decimal(visibleStep).abs().div(unit);
    const stepExp = step.gt(0) && step.lt(1)
      ? Number(step.toExponential().split("e")[1] ?? 0)
      : 0;
    const digits = Math.max(2, Math.min(6, -stepExp));
    return `${currencyPrefix()}${sign}${abs.div(unit).toFixed(digits)}${best.label}`;
  }

  const unit = new Decimal(10).pow(expNum);
  const step = new Decimal(visibleStep).abs().div(unit);
  const stepExp = step.gt(0) && step.lt(1)
    ? Number(step.toExponential().split("e")[1] ?? 0)
    : 0;
  const digits = Math.max(2, Math.min(6, -stepExp));
  return `${currencyPrefix()}${sign}${abs.div(unit).toFixed(digits)}e${expNum}`;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (getLocale() === "en-US") {
    if (s < 60) return `${s}s`;
    if (s < 3600) {
      const m = Math.floor(s / 60);
      const r = s % 60;
      return r > 0 ? `${m}m ${r}s` : `${m}m`;
    }
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (s < 60) return s + "秒";
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r > 0 ? `${m}分${r}秒` : `${m}分钟`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}
