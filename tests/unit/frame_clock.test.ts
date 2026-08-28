import { describe, expect, it } from "vitest";
import {
  foregroundGameSeconds,
  MAX_FOREGROUND_FRAME_GAP_SEC,
  UI_RENDER_INTERVAL_MS,
  uiRenderDue,
} from "../../src/app/frame-clock";

describe("foreground frame clock", () => {
  it("keeps normal frames and applies the selected review speed", () => {
    expect(foregroundGameSeconds(1_000, 1_016, 128, false)).toBeCloseTo(2.048, 6);
  });

  it("caps a long ad-return gap before applying acceleration", () => {
    const result = foregroundGameSeconds(1_000, 61_000, 128, false);
    expect(result).toBe(MAX_FOREGROUND_FRAME_GAP_SEC * 128);
    expect(result).toBe(32);
  });

  it("does not advance while the page or rewarded-ad layer is paused", () => {
    expect(foregroundGameSeconds(1_000, 61_000, 256, true)).toBe(0);
  });

  it("rejects invalid or backwards frame gaps", () => {
    expect(foregroundGameSeconds(2_000, 1_000, 1, false)).toBe(0);
    expect(foregroundGameSeconds(0, Number.NaN, 1, false)).toBe(0);
  });

  it("limits DOM presentation to 15Hz without changing frame simulation", () => {
    expect(uiRenderDue(Number.NEGATIVE_INFINITY, 1_000)).toBe(true);
    expect(uiRenderDue(1_000, 1_000 + UI_RENDER_INTERVAL_MS - 1)).toBe(false);
    expect(uiRenderDue(1_000, 1_000 + UI_RENDER_INTERVAL_MS)).toBe(true);
    expect(uiRenderDue(1_000, Number.NaN)).toBe(false);
  });
});
