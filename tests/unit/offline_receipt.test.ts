// CARD-04：离线时长、上限与回归回执（隔离终局命名空间；保持 exactly-once）。
import { describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { freshSaveData } from "../../src/save/storage";
import { normalizeSave } from "../../src/save/validate";
import {
  calculateOfflineReward,
  claimOfflineReward,
  settleOfflineReward,
  hasPendingOfflineReward,
  offlineCapSeconds,
  offlineRemainingSec,
  OFFLINE_FREE_SECONDS,
  OFFLINE_MAX_SECONDS,
  unlockOfflineRewardSlice,
} from "../../src/save/offline";
import { incomePerSecond } from "../../src/economy/engine";
import * as engine from "../../src/economy/engine";
import { startStage5, stage5Entered, startFinalProject, advanceFinalProject, STAGE5_FINAL_PROJECT, STAGE5_NODES } from "../../src/economy/stage5";
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
  s.singularity!.stage5!.nodes = STAGE5_NODES.map((node) => node.id);
  s.money = STAGE5_FINAL_PROJECT.constructionCost;
  return s;
}

const calculator = { incomePerSecond };

describe("CARD-04: receipt snapshot fields", () => {
  it("session boot settle fills elapsed/raw/cap/excess/money/project", () => {
    const s = stage5State();
    s.lastTickAtMs = now() - 10 * 60 * 60 * 1000; // 10h 离线；首次报价只免费结算 2h
    startFinalProject(s); // 戴森球进行中
    const { session } = makeSession({ initial: { ...s } as Partial<SaveData> });
    expect(session.hasPendingOffline()).toBe(true);
    // 回执写入存档快照
    const reward = session.getState().pendingOfflineReward!;
    expect(reward.elapsedSec).toBe(OFFLINE_FREE_SECONDS);
    expect(reward.rawElapsedSec).toBe(10 * 60 * 60);
    expect(reward.capSec).toBe(OFFLINE_FREE_SECONDS);
    expect(reward.projectName).toBe("stage5.dysonSphere");
    expect(reward.projectProgressDelta).toBeGreaterThan(0);
    expect(reward.money).toBeGreaterThan(0);
  });

  it("receipt survives normalize (backfill defaults for legacy)", () => {
    const s = stage5State();
    s.lastTickAtMs = now() - 2 * 60 * 60 * 1000;
    settleOfflineReward(s, now(), calculator);
    const n = normalizeSave(structuredClone(s));
    expect(n?.pendingOfflineReward?.rawElapsedSec).toBe(2 * 60 * 60);
    expect(n?.pendingOfflineReward?.capSec).toBe(OFFLINE_FREE_SECONDS);
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

describe("single-player offline receipt boundaries", () => {
  it.each([["stage4", stage4State], ["stage5", stage5State]] as const)("%s retains the free 2h cap at all legacy ad boundaries", (_stage, makeState) => {
    for (const seconds of [OFFLINE_MAX_SECONDS - 1, OFFLINE_MAX_SECONDS, OFFLINE_MAX_SECONDS + 1]) {
      const s = makeState();
      s.lastTickAtMs = now() - seconds * 1000;
      const quote = settleOfflineReward(s, now(), calculator)!;
      expect(quote.elapsedSec).toBe(OFFLINE_FREE_SECONDS);
      expect(quote.eligibleSec).toBe(OFFLINE_FREE_SECONDS);
      expect(quote.capSec).toBe(OFFLINE_FREE_SECONDS);
      expect(quote.rawElapsedSec).toBe(seconds);
      expect(quote.adUnlocksMax).toBe(0);
      expect(unlockOfflineRewardSlice(s)).toEqual({ ok: false, error: "ads_disabled" });
    }
  });

  it("stage5 does not auto-claim or enter perpetual growth during a long absence", () => {
    const s = stage5State();
    s.lastTickAtMs = now() - 2 * OFFLINE_MAX_SECONDS * 1000;
    const q = settleOfflineReward(s, now(), calculator)!;
    expect(q.elapsedSec).toBe(OFFLINE_FREE_SECONDS);
    expect(q.money.gt(0)).toBe(true);
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
    // 部分领取：报价常驻直至下一次结算替换；剩余为 0 且重复领取不会入账
    expect(hasPendingOfflineReward(s)).toBe(true);
    expect(offlineRemainingSec(s.pendingOfflineReward!)).toBe(0);
    expect(claimOfflineReward(s, now(), calculator).claimed).toBe(false);
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
    expect(hasPendingOfflineReward(s)).toBe(true);
    expect(offlineRemainingSec(s.pendingOfflineReward!)).toBe(0);
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
    expect(state.pendingOfflineReward?.projectName).toBe("stage5.dysonSphere");
    expect(state.pendingOfflineReward?.projectProgressDelta).toBeGreaterThan(0);
    expect(state.singularity?.stage5?.projectProgress).toBeGreaterThan(before);
    expect(hasPendingFinalRewardLike(state)).toBe(false);
    // 不自动领取/解锁永续
    expect(state.singularity?.perpetual).toBeNull();
  });

  it("same-session background resume advances an active project exactly once", () => {
    const s = stage5State();
    startFinalProject(s);
    s.lastTickAtMs = now();
    const { session, clock } = makeSession({ initial: { ...s } as Partial<SaveData> });
    const before = session.getState().singularity?.stage5?.projectProgress ?? 0;

    session.save("visibility_hidden");
    clock.advance(10 * 60 * 1000);
    expect(session.resumeFromBackground()).toEqual({ ok: true, settled: true });
    const after = session.getState().singularity?.stage5?.projectProgress ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(session.getState().pendingOfflineReward?.projectName).toBe("stage5.dysonSphere");
    expect(session.getState().pendingOfflineReward?.projectProgressDelta).toBe(after - before);

    expect(session.resumeFromBackground()).toEqual({ ok: true, settled: false });
    expect(session.getState().singularity?.stage5?.projectProgress).toBe(after);
  });

  it.each([false, true])("zero-income resume advances projects once within the free cap (settled receipt: %s)", (keepSettledReceipt) => {
    const s = stage5State();
    expect(startFinalProject(s).ok).toBe(true);
    if (keepSettledReceipt) {
      s.pendingOfflineReward = {
        startedAtMs: now() - 600_000, endedAtMs: now(),
        elapsedSec: 600, rawElapsedSec: 600, eligibleSec: 600, capSec: OFFLINE_FREE_SECONDS,
        adUnlocksUsed: 0, adUnlocksMax: 0,
        moneyPerSec: 1, money: 600, paidSec: 600, claimed: true,
        researchProgress: 0, projectProgressDelta: 0, projectName: null,
      };
    }
    const zeroIncome = vi.spyOn(engine, "incomePerSecond").mockReturnValue(new Decimal(0));
    try {
      const { session, clock } = makeSession({ initial: s });
      expect(session.save("visibility_hidden").ok).toBe(true);
      const before = structuredClone(session.getState());
      const expected = structuredClone(before);
      advanceFinalProject(expected, OFFLINE_FREE_SECONDS);
      clock.advance(3 * 60 * 60 * 1000);

      expect(session.resumeFromBackground()).toEqual({ ok: true, settled: true });
      const after = session.getState();
      expect(after.singularity?.stage5?.projectProgress).toBeGreaterThan(before.singularity?.stage5?.projectProgress ?? 0);
      expect(after.singularity?.stage5?.projectProgress).toBe(expected.singularity?.stage5?.projectProgress);
      expect(after.pendingOfflineReward).toEqual(before.pendingOfflineReward);
      expect(after.money).toBe(before.money);
      expect(after.lastTickAtMs).toBe(clock.now());
      expect(session.resumeFromBackground()).toEqual({ ok: true, settled: false });
      expect(session.getState().singularity?.stage5?.projectProgress).toBe(after.singularity?.stage5?.projectProgress);
    } finally {
      zeroIncome.mockRestore();
    }
  });
});

function hasPendingFinalRewardLike(s: SaveData): boolean {
  return (s.singularity?.stage5?.pendingRewardProjectId ?? null) != null;
}
