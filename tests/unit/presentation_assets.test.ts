import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { bgmPhaseProfile, GAME_BGM_PATH } from "../../src/audio/game-audio";

describe("original presentation assets", () => {
  it("maps earth iterations, lunar and dyson eras onto separate BGM sections", () => {
    expect(bgmPhaseProfile(1, 0)).toEqual({ key: "earth", start: 0, end: 76, playbackRate: 0.97 });
    expect(bgmPhaseProfile(3, 3)).toEqual({ key: "earth", start: 57, end: 76, playbackRate: 1 });
    expect(bgmPhaseProfile(4, 3)).toEqual({ key: "lunar", start: 76, end: 152, playbackRate: 1 });
    expect(bgmPhaseProfile(5, 3)).toEqual({ key: "dyson", start: 152, end: 227.5, playbackRate: 1.02 });
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
