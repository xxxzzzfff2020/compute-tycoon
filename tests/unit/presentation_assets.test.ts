import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { bgmPhaseProfile, GAME_BGM_PATH } from "../../src/audio/game-audio";

describe("original presentation assets", () => {
  it("maps every gameplay stage onto its own original-speed BGM section", () => {
    expect(bgmPhaseProfile(1, 0)).toEqual({ key: "stage1", start: 0, end: 19, playbackRate: 1 });
    expect(bgmPhaseProfile(2, 0)).toEqual({ key: "stage2", start: 19, end: 38, playbackRate: 1 });
    expect(bgmPhaseProfile(3, 3)).toEqual({ key: "stage3", start: 38, end: 76, playbackRate: 1 });
    expect(bgmPhaseProfile(4, 3)).toEqual({ key: "stage4", start: 76, end: 152, playbackRate: 1 });
    expect(bgmPhaseProfile(5, 3)).toEqual({ key: "stage5", start: 152, end: 227.5, playbackRate: 1 });
  });

  it("does not alter music speed or section when technology iterations change", () => {
    expect(bgmPhaseProfile(1, 0)).toEqual(bgmPhaseProfile(1, 3));
    expect(bgmPhaseProfile(3, 0)).toEqual(bgmPhaseProfile(3, 3));
  });

  it("ships bounded local audio and final-key-art files", () => {
    const bgm = resolve(process.cwd(), "public", GAME_BGM_PATH.slice(1));
    const art = resolve(process.cwd(), "public/assets/visuals/dyson-compute-sphere-keyart-v1.jpg");
    expect(readFileSync(bgm).subarray(0, 3).toString("ascii")).toBe("ID3");
    expect(statSync(bgm).size).toBeLessThan(3 * 1024 * 1024);
    expect(readFileSync(art).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(statSync(art).size).toBeLessThan(400 * 1024);
  });
});
