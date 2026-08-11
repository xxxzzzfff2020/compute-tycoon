// i18n 运行时：语言解析 / 字典查找 / 参数插值 / 监听器。
// 语言偏好保存在独立 localStorage key，不进入游戏存档 Schema。
import type { Dict, Locale } from "./types";
import { zhCN } from "./zh-CN";
import { enUS } from "./en-US";

export type { Dict, Locale };
export const SUPPORTED_LOCALES: Locale[] = ["zh-CN", "en-US"];
export const DEFAULT_LOCALE: Locale = "zh-CN";
export const LOCALE_STORAGE_KEY = "compute_tycoon_locale";

const dictionaries: Record<Locale, Dict> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

let currentLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

function normalizeLocale(raw: string | null): Locale {
  if (raw === "en-US" || raw === "en") return "en-US";
  if (raw === "zh-CN" || raw === "zh" || raw === "zh-TW" || raw === "zh-HK") return "zh-CN";
  if (raw && raw.toLowerCase().startsWith("en")) return "en-US";
  return DEFAULT_LOCALE;
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  return normalizeLocale(navigator.language);
}

export function getLocale(): Locale {
  return currentLocale;
}

export function localeFromCommand(command: string): Locale | null {
  if (!command.startsWith("set_locale:")) return null;
  const locale = command.slice("set_locale:".length);
  return locale === "zh-CN" || locale === "en-US" ? locale : null;
}

export function setLocale(locale: Locale): void {
  if (locale !== "zh-CN" && locale !== "en-US") return;
  if (locale === currentLocale) return;
  currentLocale = locale;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }
  for (const listener of listeners) listeners.forEach((fn) => fn());
}

export function initLocale(): Locale {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    currentLocale = normalizeLocale(stored ?? detectBrowserLocale());
    document.documentElement.lang = currentLocale;
  }
  return currentLocale;
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 插值：{name}、{count} 等占位符替换；数字走 Intl 格式化。 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale];
  const template = dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === "number" ? formatNumber(value) : String(value);
  });
}

/** 数字/货币/百分比本地化（Intl.NumberFormat，按 locale 缓存）。 */
const numberFormats = new Map<string, Intl.NumberFormat>();
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  const cacheKey = currentLocale + ":" + JSON.stringify(options ?? null);
  let formatter = numberFormats.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currentLocale, options);
    numberFormats.set(cacheKey, formatter);
  }
  return formatter.format(value);
}

export function formatPercent(value: number, digits = 0): string {
  return formatNumber(value * 100, { maximumFractionDigits: digits, minimumFractionDigits: 0 }) + "%";
}

/** 简单单复数：en-US 用 n===1 判断，zh-CN 无变化。 */
export function pluralize(keyBase: string, count: number): string {
  const key = currentLocale === "en-US" && count === 1 ? `${keyBase}.one` : `${keyBase}.other`;
  return t(key, { count });
}
