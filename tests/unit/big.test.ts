import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  formatBig,
  formatHeaderMoney,
  formatLiveMoney,
  formatMoney,
  formatTime,
  normalizeNonNegativeStoredBig,
  toStoredBig,
} from "../../src/core/big";

describe("big number formatting", () => {
  it("formats plain integers with separators", () => {
    expect(formatBig(1000)).toBe("1,000");
    expect(formatBig(9999)).toBe("9,999");
  });

  it("formats Chinese units", () => {
    expect(formatBig(10000)).toBe("1万");
    expect(formatBig(123456)).toBe("12.35万");
    expect(formatBig(1_000_000)).toBe("100万");
    expect(formatBig(100_000_000)).toBe("1亿");
    expect(formatBig(1_200_000_000)).toBe("12亿");
    expect(formatBig("1e12")).toBe("1兆");
    expect(formatBig("1e16")).toBe("1京");
    expect(formatBig("1e20")).toBe("1.00e20");
  });

  it("formats huge values with scientific notation", () => {
    const v = new Decimal("1e30");
    expect(formatBig(v)).toMatch(/e30/);
    const v2 = new Decimal("9.9e60");
    expect(formatBig(v2)).toMatch(/e60/);
  });

  it("formats money with prefix", () => {
    expect(formatMoney(1234)).toBe("¥1,234");
    expect(formatMoney(1_0000)).toBe("¥1万");
  });

  it("formats the current-money header at the exact display boundaries", () => {
    expect(formatHeaderMoney("74999.9")).toBe("¥74,999");
    expect(formatHeaderMoney("75000")).toBe("¥75,000");
    expect(formatHeaderMoney("999999999999")).toBe("¥999,999,999,999");
    expect(formatHeaderMoney("1000000000000")).toBe("¥1,000,000,000,000");
    expect(formatHeaderMoney("1000000000001")).toBe("¥1兆");
    expect(formatHeaderMoney("1234567890000")).toBe("¥1.23兆");
    expect(formatHeaderMoney("10000000000000000")).toBe("¥1京");
    expect(formatHeaderMoney("100000000000000000000")).toBe("¥1.00e20");
  });

  it("keeps two decimals in perpetual live money without changing the normal header contract", () => {
    expect(formatLiveMoney("890123456789012")).toBe("¥890.12兆");
    expect(formatLiveMoney("10000000000000000", "13000000000")).toBe("¥1.000000京");
    expect(formatLiveMoney("10000000000000000")).toBe("¥1.00京");
    expect(formatLiveMoney("100000000000000000000")).toBe("¥1.00e20");
    expect(formatHeaderMoney("890123456789012")).toBe("¥890兆");
  });

  it("formats time", () => {
    expect(formatTime(5)).toBe("5秒");
    expect(formatTime(75)).toBe("1分15秒");
    expect(formatTime(3600)).toBe("1小时");
  });

  it("handles zero and negatives", () => {
    expect(formatBig(0)).toBe("0");
    expect(formatBig(new Decimal(-5000))).toBe("-5,000");
  });

  it("handles overflow-scale values without precision loss", () => {
    // 极端量级：超过 Number 安全整数范围，仍能以科学计数法表示
    const huge = new Decimal("1e308");
    expect(formatBig(huge)).toMatch(/e308/);
    const tiny = new Decimal("123456789012345678901234567890");
    expect(formatBig(tiny)).toMatch(/万|亿|e/);
    // decimal.js 高精度乘法不溢出
    const a = new Decimal("1e100");
    const b = a.mul(a);
    expect(b.toExponential()).toMatch(/e\+?200/);
  });

  it("stores unsafe magnitudes as canonical Decimal strings", () => {
    expect(toStoredBig("9007199254740991")).toBe(9007199254740991);
    expect(toStoredBig("9007199254740992")).toBe("9007199254740992");
    expect(toStoredBig("12345678901234567890123")).toBe("1.2345678901234567890123e+22");
    expect(normalizeNonNegativeStoredBig("-1", 7)).toBe(7);
    expect(normalizeNonNegativeStoredBig("not-a-number", 9)).toBe(9);
  });
});
