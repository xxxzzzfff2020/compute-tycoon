// CARD-04：离线时长、上限与回归回执（隔离终局命名空间；保持 exactly-once）。
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { freshSaveData } from "../../src/save/storage";
import { normalizeSave } from "../../src/save/validate";
import {
  calculateOfflineReward,
  claimOfflineReward,
  settleOfflineReward,
  hasPendingOfflineReward,
  offlineCapSeconds,
  OFFLINE_STAGE4_CAP_SECONDS,
  OFFLINE_STAGE5_CAP_SECONDS,
} from "../../src/save/offline";
import { incomePerSecond } from "../../src/economy/engine";
import { startStage5, stage5Entered, startFinalProject, advanceFinalProject } from "../../src/economy/stage5";
import { startSpacePlan, startFinalProject as startS4Final, stage4Entered } from "../../src/economy/stage4";
import { makeSession } from "./helpers";
import type { SaveData } from "../../src/save/types";

function now() {
  return 1_700_000_000_000;
}

function incomeState(): SaveData {
  const s = freshSaveData(now());
  s.modelProgress = { modelId: "codex", level: 3, trainingCount: 2 };
  s.ownedModelIds = ["codex"];
  s.serverCount = 1;
  s.serverPower = 1.5;
  s.lastTickAtMs = now();
  return s;
}

/** Stage 4 隔离终局档（已进入地月算力网）。 */
function stage4State(): SaveData {
  const s = incomeState();
  s.singularity = {
    mode: "endgame",
    coresClaimed: ["core_1", "core_2", "core_3"],
    spacePlanRevealed: true,
    spacePlanStarted: false,
    claimedProjectIds: [],
    spacePlanRevealedAtMs: now(),
    stage4: null,
    stage5: null,
    perpetual: null,
  };
  startSpacePlan(s, now());
  expect(stage4Entered(s)).toBe(true);
  return s;
}

/** Stage 5 隔离终局档（已完成地月主线并进入戴森纪元）。 */
function stage5State(): SaveData {
  const s = incomeState();
  s.singularity = {
    mode: "endgame",
    coresClaimed: ["core_1", "core_2", "core_3"],
    spacePlanRevealed: true,
    spacePlanStarted: true,
    claimedProjectIds: [],
    spacePlanRevealedAtMs: now(),
    stage4: {
      entered: true,
      enteredAtMs: now(),
      nodes: ["leo_node", "moon_base", "lunar_link", "deep_relay"],
      stageIncome: 1e12,
      projectProgress: 360000,
      activeProjectId: null,
      completedProjectIds: ["moon_network"],
      pendingRewardProjectId: null,
    },
    stage5: null,
    perpetual: null,
  };
  startStage5(s, now());
  expect(stage5Entered(s)).toBe(true);
  return s;
}

const calculator = { incomePerSecond };

describe("CARD-04: receipt snapshot fields", () => {
  it("session boot settle fills elapsed/raw/cap/excess/money/project", () => {
    const s = stage5State();
    s.lastTickAtMs = now() - 10 * 60 * 60 * 1000; // 10h 离线（基础上限 6h）
    startFinalProject(s); // 戴森球进行中
    const { session } = makeSession({ initial: { ...s } as Partial<SaveData> });
    expect(session.hasPendingOffline()).toBe(true);
    // 回执写入存档快照
    const reward = session.getState().pendingOfflineReward!;
    expect(reward.elapsedSec).toBe(6 * 60 * 60);
    expect(reward.rawElapsedSec).toBe(10 * 60 * 60);
    expect(reward.capSec).toBe(6 * 60 * 60);
    expect(reward.projectName).toBe("戴森算力球");
    expect(reward.projectProgressDelta).toBeGreaterThan(0);
    expect(reward.money).toBeGreaterThan(0);
  });

  it("receipt survives normalize (backfill defaults for legacy)", () => {
    const s = stage5State();
    s.lastTickAtMs = now() - 2 * 60 * 60 * 1000;
    settleOfflineReward(s, now(), calculator);
    const n = normalizeSave(structuredClone(s));
    expect(n?.pendingOfflineReward?.rawElapsedSec).toBe(2 * 60 * 60);
    expect(n?.pendingOfflineReward?.capSec).toBe(OFFLINE_STAGE5_CAP_SECONDS);
    // 旧版报价（无新字段）回填默认值
    const legacy = freshSaveData(now());
    legacy.pendingOfflineReward = {
      startedAtMs: now() - 3600_000,
      endedAtMs: now(),
      elapsedSec: 1800,
      money: 123,
      claimed: false,
    } as unknown as SaveData["pendingOfflineReward"];
    const n2 = normalizeSave(legacy);
    expect(n2?.pendingOfflineReward?.rawElapsedSec).toBe(1800);
    expect(n2?.pendingOfflineReward?.projectName).toBeNull();
    expect(n2?.pendingOfflineReward?.researchProgress).toBe(0);
  });
});

describe("sponsor offline cap boundaries", () => {
  it("stage4 cap is 6h; before/exact/after/excess", () => {
    const s = stage4State();
    // 恰好上限前 1 秒
    s.lastTickAtMs = now() - (OFFLINE_STAGE4_CAP_SECONDS - 1) * 1000;
    let q = settleOfflineReward(s, now(), calculator);
    expect(q!.elapsedSec).toBe(OFFLINE_STAGE4_CAP_SECONDS - 1);
    expect(s.pendingOfflineReward!.rawElapsedSec).toBe(OFFLINE_STAGE4_CAP_SECONDS - 1);
    // 领取后再次离线：恰好上限
    claimOfflineReward(s, now(), calculator);
    s.lastTickAtMs = now();
    s.lastTickAtMs = now() - OFFLINE_STAGE4_CAP_SECONDS * 1000;
    q = settleOfflineReward(s, now(), calculator);
    expect(q!.elapsedSec).toBe(OFFLINE_STAGE4_CAP_SECONDS);
    expect(q!.rawElapsedSec).toBe(OFFLINE_STAGE4_CAP_SECONDS);
    // 上限后 1 秒
    claimOfflineReward(s, now(), calculator);
    s.lastTickAtMs = now() - (OFFLINE_STAGE4_CAP_SECONDS + 1) * 1000;
    q = settleOfflineReward(s, now(), calculator);
    expect(q!.elapsedSec).toBe(OFFLINE_STAGE4_CAP_SECONDS);
    expect(q!.rawElapsedSec).toBe(OFFLINE_STAGE4_CAP_SECONDS + 1);
    expect(s.pendingOfflineReward!.capSec).toBe(OFFLINE_STAGE4_CAP_SECONDS);
  });

  it("stage5 uses the same 6h base cap", () => {
    const s = stage5State();
    s.lastTickAtMs = now() - 2 * OFFLINE_STAGE5_CAP_SECONDS * 1000;
    const q = settleOfflineReward(s, now(), calculator);
    expect(q!.elapsedSec).toBe(OFFLINE_STAGE5_CAP_SECONDS);
    expect(q!.rawElapsedSec).toBe(2 * OFFLINE_STAGE5_CAP_SECONDS);
    expect(q!.money.gt(0)).toBe(true);
    // 离线不自动领核心/迭代/进阶段
    expect(s.singularity?.stage5?.storyCompleted).toBe(false);
    expect(s.singularity?.perpetual).toBeNull();
  });
});

describe("CARD-04: exactly-once & rollback", () => {
  it("20x refresh/claim produces exactly one reward", () => {
    const s = incomeState();
    s.lastTickAtMs = now() - 20 * 60 * 1000;
    settleOfflineReward(s, now(), calculator);
    expect(hasPendingOfflineReward(s)).toBe(true);
    const moneyOnce = s.pendingOfflineReward!.money;
    // 20 次刷新重入：不重复结算、不重复领取
    for (let i = 0; i < 20; i++) {
      expect(settleOfflineReward(s, now(), calculator)).toBeNull();
      expect(hasPendingOfflineReward(s)).toBe(true);
      expect(s.pendingOfflineReward!.money).toBe(moneyOnce);
    }
    let claimedCount = 0;
    for (let i = 0; i < 20; i++) {
      const r = claimOfflineReward(s, now(), calculator);
      if (r.claimed) claimedCount += 1;
    }
    expect(claimedCount).toBe(1);
    expect(hasPendingOfflineReward(s)).toBe(false);
  });

  it("rollback produces no negative/duplicate interval", () => {
    const s = incomeState();
    const firstNow = now() + 10 * 60 * 1000;
    settleOfflineReward(s, firstNow, calculator);
    claimOfflineReward(s, firstNow, calculator);
    const moneyAfter = s.money;
    // 回拨：系统时钟早于上次结算
    const rollback = firstNow - 60_000;
    expect(settleOfflineReward(s, rollback, calculator)).toBeNull();
    expect(s.money).toBe(moneyAfter);
    expect(hasPendingOfflineReward(s)).toBe(false);
  });

  it("does not auto-advance stage on offline (stage4)", () => {
    const s = stage4State();
    s.lastTickAtMs = now() - 3 * 60 * 60 * 1000;
    const before = s.singularity?.stage4?.entered;
    settleOfflineReward(s, now(), calculator);
    expect(s.singularity?.stage4?.entered).toBe(before);
    expect(stage5Entered(s)).toBe(false);
  });
});

describe("CARD-04: receipt drives same-cap side effects", () => {
  it("offline research progress uses effective capped time", () => {
    const s = incomeState();
    s.modelResearch = { progress: 10, stage2Draws: 0 };
    s.lastTickAtMs = now() - 2 * 60 * 60 * 1000;
    const q = settleOfflineReward(s, now(), calculator, (st, quote) => {
      // 与资金同一上限：本例2小时全部有效
      quote.researchProgress = 5;
    });
    expect(q!.elapsedSec).toBe(2 * 60 * 60);
    expect(q!.researchProgress).toBe(5);
  });

  it("settle with fill callback writes receipt into pending reward", () => {
    const s = incomeState();
    s.lastTickAtMs = now() - 30 * 60 * 1000;
    const q = settleOfflineReward(s, now(), calculator, (st, quote) => {
      quote.researchProgress = 3.5;
      quote.projectProgressDelta = 120;
      quote.projectName = "区域算力协作网";
    });
    expect(q!.researchProgress).toBe(3.5);
    expect(s.pendingOfflineReward!.researchProgress).toBe(3.5);
    expect(s.pendingOfflineReward!.projectProgressDelta).toBe(120);
    expect(s.pendingOfflineReward!.projectName).toBe("区域算力协作网");
  });

  it("dyson project advances offline but never auto-claims", () => {
    const s = stage5State();
    startFinalProject(s);
    const before = s.singularity?.stage5?.projectProgress ?? 0;
    s.lastTickAtMs = now() - 2 * 60 * 60 * 1000;
    const { session } = makeSession({ initial: { ...s } as Partial<SaveData> });
    const state = session.getState();
    expect(state.pendingOfflineReward?.projectName).toBe("戴森算力球");
    expect(state.pendingOfflineReward?.projectProgressDelta).toBeGreaterThan(0);
    expect(state.singularity?.stage5?.projectProgress).toBeGreaterThan(before);
    expect(hasPendingFinalRewardLike(state)).toBe(false);
    // 不自动领取/解锁永续
    expect(state.singularity?.perpetual).toBeNull();
  });
});

function hasPendingFinalRewardLike(s: SaveData): boolean {
  return (s.singularity?.stage5?.pendingRewardProjectId ?? null) != null;
}
