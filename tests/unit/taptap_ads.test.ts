import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  installTapRewardedAdTest,
  TAPTAP_REWARDED_VIDEO_AD_UNIT_ID,
  TapRewardedAdController,
  type TapAdsApi,
  type TapRewardedVideoAd,
} from "../../src/platform/taptap-ads";

class FakeRewardedVideoAd implements TapRewardedVideoAd {
  loadCount = 0;
  showCount = 0;
  destroyCount = 0;
  private loadListener: (() => void) | null = null;
  private errorListener: ((error: { errCode?: number; errMsg?: string }) => void) | null = null;
  private closeListener: ((result?: { isEnded?: boolean }) => void) | null = null;

  onLoad(callback: () => void): void { this.loadListener = callback; }
  onError(callback: (error: { errCode?: number; errMsg?: string }) => void): void { this.errorListener = callback; }
  onClose(callback: (result?: { isEnded?: boolean }) => void): void { this.closeListener = callback; }
  load(): void { this.loadCount += 1; }
  show(): void { this.showCount += 1; }
  destroy(): void { this.destroyCount += 1; }
  emitLoad(): void { this.loadListener?.(); }
  emitError(error: { errCode?: number; errMsg?: string }): void { this.errorListener?.(error); }
  emitClose(isEnded: boolean): void { this.closeListener?.({ isEnded }); }
}

function fakeApi(ad: FakeRewardedVideoAd, receivedIds: string[]): TapAdsApi {
  return {
    createRewardedVideoAd: ({ adUnitId }) => {
      receivedIds.push(adUnitId);
      return ad;
    },
  };
}

function setupDom(): JSDOM {
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>");
  (globalThis as typeof globalThis & { window: Window }).window = dom.window as unknown as Window & typeof globalThis;
  (globalThis as typeof globalThis & { document: Document }).document = dom.window.document;
  return dom;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "tap");
});

describe("TapTap rewarded video adapter", () => {
  it("uses the vertically matched ad unit and rewards only an ended playback", () => {
    const ad = new FakeRewardedVideoAd();
    const receivedIds: string[] = [];
    const controller = new TapRewardedAdController({ tapApi: fakeApi(ad, receivedIds) });
    const completions: boolean[] = [];

    controller.init();
    expect(receivedIds).toEqual([TAPTAP_REWARDED_VIDEO_AD_UNIT_ID]);
    expect(TAPTAP_REWARDED_VIDEO_AD_UNIT_ID).toBe("1054324");
    expect(ad.loadCount).toBe(1);
    expect(controller.getSnapshot().state).toBe("loading");

    ad.emitLoad();
    expect(controller.show((completed) => completions.push(completed))).toBe(true);
    expect(ad.showCount).toBe(1);
    ad.emitClose(false);
    expect(completions).toEqual([false]);

    ad.emitLoad();
    expect(controller.show((completed) => completions.push(completed))).toBe(true);
    ad.emitClose(true);
    expect(completions).toEqual([false, true]);
    controller.destroy();
    expect(ad.destroyCount).toBe(1);
  });

  it("fails closed outside TapTap without throwing", () => {
    const controller = new TapRewardedAdController();
    controller.init();
    expect(controller.getSnapshot()).toEqual({
      state: "unsupported",
      message: "ads.err.tapOnly",
    });
    expect(controller.show(() => { throw new Error("must not run"); })).toBe(false);
  });

  it("mounts only when adtest is enabled and never changes game state", () => {
    setupDom();
    const container = document.getElementById("app")!;
    const noPanelCleanup = installTapRewardedAdTest(container, { enabled: false });
    expect(document.querySelector(".ad-test-panel")).toBeNull();
    noPanelCleanup();

    const ad = new FakeRewardedVideoAd();
    const controller = new TapRewardedAdController({ tapApi: fakeApi(ad, []) });
    const cleanup = installTapRewardedAdTest(container, { enabled: true, controller });
    const button = document.querySelector(".ad-test-panel button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    ad.emitLoad();
    expect(button.disabled).toBe(false);
    button.click();
    ad.emitClose(true);
    expect(document.querySelector(".ad-test-result")?.textContent).toBe("ads.debug.success");
    cleanup();
    expect(document.querySelector(".ad-test-panel")).toBeNull();
  });
});
