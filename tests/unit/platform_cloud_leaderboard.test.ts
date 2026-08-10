import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TapCloudSaveController,
  type TapCloudApi,
  type TapCloudArchive,
} from "../../src/platform/taptap-cloud-save";
import {
  encodeWealthScore,
  FASTEST_LEADERBOARD_ID,
  TapLeaderboardController,
  WEALTH_LEADERBOARD_ID,
  WEALTH_SCORE_VERSION,
  type TapLeaderboardManager,
} from "../../src/platform/taptap-leaderboards";
import { buildEndgameReviewSave } from "../../src/review/endgame-checkpoints";

function memoryStorage(values = new Map<string, string>()): Pick<Storage, "getItem" | "setItem"> {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function installWindowStorage(): Pick<Storage, "getItem" | "setItem"> {
  const storage = memoryStorage();
  vi.stubGlobal("window", {
    localStorage: storage,
    setTimeout,
    clearTimeout,
  });
  return storage;
}

function cloudHarness(): { api: TapCloudApi; saves: TapCloudArchive[]; setCloudPayload(value: string): void } {
  const files = new Map<string, string>();
  const saves: TapCloudArchive[] = [];
  let cloudPayload = "";
  return {
    saves,
    setCloudPayload: (value) => { cloudPayload = value; },
    api: {
      env: { USER_DATA_PATH: "tapfile://usr" },
      getFileSystemManager: () => ({
        writeFile: ({ filePath, data, success }) => { files.set(filePath, data); success(); },
        readFile: ({ filePath, success, fail }) => {
          const data = files.get(filePath);
          if (data == null) fail(new Error("missing")); else success({ data });
        },
      }),
      getCloudSaveManager: () => ({
        getArchiveList: ({ success }) => success({ saves }),
        createArchive: (options) => {
          cloudPayload = files.get(options.archiveFilePath) ?? "";
          saves.push({ name: options.archiveMetaData.name, uuid: "u1", fileId: "f1" });
          options.success();
        },
        updateArchive: (options) => { cloudPayload = files.get(options.archiveFilePath) ?? ""; options.success(); },
        getArchiveData: (options) => { files.set(options.targetFilePath, cloudPayload); options.success({ filePath: options.targetFilePath }); },
      }),
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("TapTap cloud-save adapter", () => {
  it("creates one ASCII slot and restores the wrapped payload", async () => {
    installWindowStorage();
    const harness = cloudHarness();
    const controller = new TapCloudSaveController({ tapApi: harness.api });
    expect((await controller.upload(JSON.stringify({ schemaVersion: 6, saveId: "safe" }))).ok).toBe(true);
    expect(harness.saves[0].name).toBe("compute_tycoon_auto");
    const restored = await controller.download();
    expect(restored.ok).toBe(true);
    expect(JSON.parse(restored.saveJson!)).toMatchObject({ schemaVersion: 6, saveId: "safe" });
    expect(controller.getSnapshot().state).toBe("synced");
  });

  it("blocks blind cross-device overwrite until the device has restored the current remote lineage", async () => {
    installWindowStorage();
    const harness = cloudHarness();
    const deviceA = new TapCloudSaveController({ tapApi: harness.api, browserStorage: memoryStorage() });
    const deviceB = new TapCloudSaveController({ tapApi: harness.api, browserStorage: memoryStorage() });
    const save = (revision: number, updatedAtMs: number) => JSON.stringify({
      schemaVersion: 6,
      saveId: "shared-save",
      revision,
      updatedAtMs,
      money: String(revision * 100),
    });

    expect((await deviceA.upload(save(1, 1_000), true)).ok).toBe(true);
    const blind = await deviceB.upload(save(2, 2_000), true);
    expect(blind).toMatchObject({ ok: false, conflict: true });
    expect(deviceB.getSnapshot().state).toBe("conflict");

    expect((await deviceB.download()).ok).toBe(true);
    expect((await deviceB.upload(save(2, 2_000), true)).ok).toBe(true);
    const staleA = await deviceA.upload(save(3, 3_000), true);
    expect(staleA).toMatchObject({ ok: false, conflict: true });
  });

  it("blocks a different save identity and corrupt remote archive without an explicit overwrite", async () => {
    installWindowStorage();
    const harness = cloudHarness();
    const a = new TapCloudSaveController({ tapApi: harness.api, browserStorage: memoryStorage() });
    const b = new TapCloudSaveController({ tapApi: harness.api, browserStorage: memoryStorage() });
    expect((await a.upload(JSON.stringify({ schemaVersion: 6, saveId: "save-a", revision: 1, updatedAtMs: 10 }), true)).ok).toBe(true);
    expect(await b.upload(JSON.stringify({ schemaVersion: 6, saveId: "save-b", revision: 1, updatedAtMs: 10 }), true)).toMatchObject({
      ok: false,
      conflict: true,
    });
    harness.setCloudPayload("{}");
    expect(await b.upload(JSON.stringify({ schemaVersion: 6, saveId: "save-b", revision: 2, updatedAtMs: 20 }), true)).toMatchObject({
      ok: false,
      conflict: true,
    });
  });

  it("rejects corrupt cloud data without returning replacement JSON", async () => {
    installWindowStorage();
    const api: TapCloudApi = {
      env: { USER_DATA_PATH: "tapfile://usr" },
      getFileSystemManager: () => ({
        writeFile: ({ success }) => success(),
        readFile: ({ success }) => success({ data: "{}" }),
      }),
      getCloudSaveManager: () => ({
        getArchiveList: ({ success }) => success({ saves: [{ name: "compute_tycoon_auto", uuid: "u", fileId: "f" }] }),
        createArchive: ({ success }) => success(),
        updateArchive: ({ success }) => success(),
        getArchiveData: ({ targetFilePath, success }) => success({ filePath: targetFilePath }),
      }),
    };
    const result = await new TapCloudSaveController({ tapApi: api }).download();
    expect(result.ok).toBe(false);
    expect(result.saveJson).toBeUndefined();
  });
});

describe("TapTap leaderboard adapter", () => {
  it("encodes very large wealth as monotonic safe-integer score index", () => {
    expect(WEALTH_SCORE_VERSION).toBe(1);
    const values = ["0", "1e16", "9.9e99", "1e1000"];
    const scores = values.map((value) => encodeWealthScore(value)!);
    expect(scores.every(Number.isSafeInteger)).toBe(true);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(new Set(scores).size).toBe(scores.length);
  });

  it("submits wealth and an eligible terminal duration, then opens each public board", async () => {
    const submitted: Array<{ leaderboardId: string; score: number }> = [];
    const opened: string[] = [];
    const leaderboardManager: TapLeaderboardManager = {
      submitScores: ({ scores, callback }) => { submitted.push(...scores); callback.onSuccess(); },
      openLeaderboard: ({ leaderboardId, callback }) => { opened.push(leaderboardId); callback.onSuccess(); },
    };
    const controller = new TapLeaderboardController({ leaderboardManager });
    const state = buildEndgameReviewSave("endgame_perpetual", 1_700_000_000_000);
    state.saveId = "formal-terminal-save";
    state.createdAtMs = state.singularity!.stage5!.legendaryArchive!.completedAtMs - 2 * 60 * 60_000;
    state.money = 123_456_789;
    expect((await controller.submitEligible(state)).ok).toBe(true);
    expect(submitted.map((score) => score.leaderboardId).sort()).toEqual([FASTEST_LEADERBOARD_ID, WEALTH_LEADERBOARD_ID].sort());
    await controller.open("fastest");
    await controller.open("wealth");
    expect(opened).toEqual([FASTEST_LEADERBOARD_ID, WEALTH_LEADERBOARD_ID]);
  });

  it("never submits isolated review checkpoint records", async () => {
    const leaderboardManager: TapLeaderboardManager = {
      submitScores: ({ callback }) => callback.onSuccess(),
      openLeaderboard: ({ callback }) => callback.onSuccess(),
    };
    const state = buildEndgameReviewSave("endgame_perpetual", 1_700_000_000_000);
    const result = await new TapLeaderboardController({ leaderboardManager }).submitEligible(state);
    expect(result).toEqual({ ok: false, error: "non_formal_save" });
  });
});
