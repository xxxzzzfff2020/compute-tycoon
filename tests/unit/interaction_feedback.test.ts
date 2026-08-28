import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { feedbackKindForCommand, GameAudio, loadAudioPreferences } from "../../src/audio/game-audio";
import { LocalHaptics } from "../../src/platform/local-haptics";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
const originalAudio = globalThis.Audio;

afterEach(() => {
  Object.assign(globalThis, {
    window: originalWindow,
    document: originalDocument,
    localStorage: originalLocalStorage,
    Audio: originalAudio,
  });
});

describe("interaction feedback", () => {
  it("ignores the removed SFX preference while migrating haptics on by default", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
    dom.window.localStorage.setItem("compute_tycoon_h5_audio_v1", JSON.stringify({
      bgmEnabled: false,
      sfxEnabled: true,
      volume: 0.5,
    }));
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage });
    const preferences = loadAudioPreferences();
    expect(preferences).toEqual({ bgmEnabled: false, hapticsEnabled: true, volume: 0.5 });
    expect(preferences).not.toHaveProperty("sfxEnabled");
    dom.window.close();
  });

  it("assigns one strongest feedback class to successful commands and excludes debug speed", () => {
    expect(feedbackKindForCommand("page:menu")).toBe("click");
    expect(feedbackKindForCommand("upgrade_blueprint:throughput")).toBe("success");
    expect(feedbackKindForCommand("claim_stage5_reward")).toBe("milestone");
    expect(feedbackKindForCommand("set_debug_speed")).toBeNull();
  });

  it("keeps successful interaction feedback haptic-only and creates no audio", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
    class FakeAudio {
      static instances: FakeAudio[] = [];
      constructor(public src: string) { FakeAudio.instances.push(this); }
    }
    const calls: unknown[] = [];
    Object.defineProperty(dom.window.navigator, "vibrate", { value: (duration: number) => { calls.push(duration); }, configurable: true });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      localStorage: dom.window.localStorage,
      Audio: FakeAudio,
    });
    const audio = new GameAudio();
    audio.playFeedback("success");
    expect(FakeAudio.instances).toHaveLength(0);
    expect(calls).toEqual([16]);
    audio.destroy();
    dom.window.close();
  });

  it("keeps click haptics but never creates or plays a click audio asset", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
    class FakeAudio {
      static instances: FakeAudio[] = [];
      constructor(public src: string) { FakeAudio.instances.push(this); }
    }
    const calls: unknown[] = [];
    Object.defineProperty(dom.window.navigator, "vibrate", { value: (duration: number) => { calls.push(duration); }, configurable: true });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      localStorage: dom.window.localStorage,
      Audio: FakeAudio,
    });

    new GameAudio().playFeedback("click");

    expect(FakeAudio.instances).toHaveLength(0);
    expect(calls).toEqual([8]);
    dom.window.close();
  });

  it("maps milestone feedback to local browser vibration and silently supports disabled haptics", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
    const calls: unknown[] = [];
    Object.defineProperty(dom.window.navigator, "vibrate", { value: (duration: number) => { calls.push(duration); }, configurable: true });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
    });
    new LocalHaptics().trigger("milestone", true);
    new LocalHaptics().trigger("click", false);
    expect(calls).toEqual([28]);
    dom.window.close();
  });
});
