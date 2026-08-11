import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { bgmPhaseProfile, GAME_BGM_PATHS, GameAudio } from "../../src/audio/game-audio";

describe("original presentation assets", () => {
  it("maps every gameplay stage onto its own independent BGM file", () => {
    expect(bgmPhaseProfile(1, 0)).toEqual({ key: "stage1", path: GAME_BGM_PATHS.stage1 });
    expect(bgmPhaseProfile(2, 0)).toEqual({ key: "stage2", path: GAME_BGM_PATHS.stage2 });
    expect(bgmPhaseProfile(3, 3)).toEqual({ key: "stage3", path: GAME_BGM_PATHS.stage3 });
    expect(bgmPhaseProfile(4, 3)).toEqual({ key: "stage4", path: GAME_BGM_PATHS.stage4 });
    expect(bgmPhaseProfile(5, 3)).toEqual({ key: "stage5", path: GAME_BGM_PATHS.stage5 });
    expect(new Set(Object.values(GAME_BGM_PATHS)).size).toBe(5);
  });

  it("does not alter the stage track when technology iterations change", () => {
    expect(bgmPhaseProfile(1, 0)).toEqual(bgmPhaseProfile(1, 3));
    expect(bgmPhaseProfile(3, 0)).toEqual(bgmPhaseProfile(3, 3));
  });

  it("switches the audio source on stage changes and keeps each file looping", async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalLocalStorage = globalThis.localStorage;
    const originalAudio = globalThis.Audio;

    class FakeAudio {
      static instances: FakeAudio[] = [];
      src: string;
      preload = "";
      loop = false;
      volume = 1;
      currentTime = 0;
      paused = true;
      loadCount = 0;

      constructor(src: string) {
        this.src = src;
        FakeAudio.instances.push(this);
      }

      setAttribute(): void {}
      removeAttribute(name: string): void {
        if (name === "src") this.src = "";
      }
      load(): void { this.loadCount += 1; }
      pause(): void { this.paused = true; }
      async play(): Promise<void> { this.paused = false; }
    }

    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      localStorage: dom.window.localStorage,
      Audio: FakeAudio,
    });

    try {
      const audio = new GameAudio();
      audio.install();
      dom.window.dispatchEvent(new dom.window.Event("pointerdown"));
      await Promise.resolve();

      const bgm = FakeAudio.instances[0];
      expect(bgm.src).toBe(GAME_BGM_PATHS.stage1);
      expect(bgm.loop).toBe(true);
      expect(bgm.preload).toBe("metadata");

      audio.setPhase(2, 0);
      expect(bgm.src).toBe(GAME_BGM_PATHS.stage2);
      expect(bgm.currentTime).toBe(0);
      expect(bgm.loadCount).toBe(1);

      bgm.currentTime = 42;
      audio.setPhase(2, 3);
      expect(bgm.src).toBe(GAME_BGM_PATHS.stage2);
      expect(bgm.currentTime).toBe(42);
      expect(bgm.loadCount).toBe(1);

      audio.setPhase(5, 3);
      expect(bgm.src).toBe(GAME_BGM_PATHS.stage5);
      expect(bgm.currentTime).toBe(0);
      expect(bgm.loadCount).toBe(2);
      audio.destroy();
    } finally {
      Object.assign(globalThis, {
        window: originalWindow,
        document: originalDocument,
        localStorage: originalLocalStorage,
        Audio: originalAudio,
      });
      dom.window.close();
    }
  });

  it("ships bounded local audio and final-key-art files", () => {
    const bgmFiles = Object.values(GAME_BGM_PATHS).map((path) => resolve(process.cwd(), "public", path.replace(/^\.?\//, "")));
    const art = resolve(process.cwd(), "public/assets/visuals/dyson-compute-sphere-keyart-v1.jpg");
    for (const bgm of bgmFiles) {
      expect(readFileSync(bgm).subarray(0, 3).toString("ascii")).toBe("ID3");
      expect(statSync(bgm).size).toBeLessThan(4 * 1024 * 1024);
    }
    expect(bgmFiles.reduce((total, bgm) => total + statSync(bgm).size, 0)).toBeLessThan(14 * 1024 * 1024);
    expect(existsSync(resolve(process.cwd(), "public/assets/audio/compute-tycoon-stellar-tide-v1.mp3"))).toBe(false);
    expect(readFileSync(art).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(statSync(art).size).toBeLessThan(400 * 1024);
  });
});
