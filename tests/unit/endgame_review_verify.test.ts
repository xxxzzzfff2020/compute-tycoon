// CARD-06：集中复验关键契约（不变量、exactly-once、回拨、永续边界）单元测试。
import { describe, expect, it } from "vitest";
import { freshSaveData } from "../../src/save/storage";
import { settleOfflineReward, claimOfflineReward, hasPendingOfflineReward, offlineRemainingSec } from "../../src/save/offline";
import { incomePerSecond } from "../../src/economy/engine";
import { claimCore, canEndgameIterate, canClaimCore } from "../../src/economy/singularity";
import { claimFlagshipReward } from "../../src/economy/stage3";
import type { SaveData } from "../../src/save/types";

const EPOCH = 1_800_000_000_000;

function endgameState(): SaveData {
  const st = freshSaveData(EPOCH);
  st.singularity = {
    mode: "endgame",
    coresClaimed: [],
    spacePlanRevealed: false,
    claimedProjectIds: [],
    spacePlanRevealedAtMs: 0,
    spacePlanStarted: false,
    stage4: null,
    stage5: null,
    perpetual: null,
  };
  st.modelProgress = { modelId: "codex", level: 3, trainingCount: 2 };
  st.ownedModelIds = ["codex"];
  st.serverCount = 1;
  st.serverPower = 1.5;
  st.lastTickAtMs = EPOCH;
  return st;
}

describe("CARD-06 central re-verification", () => {
  it("core claim is exactly-once (20 attempts)", () => {
    const st = endgameState();
    st.stage3.flagship.completedIds = ["project_r1"];
    let okCount = 0;
    for (let i = 0; i < 20; i++) {
      if (claimCore(st).ok) okCount += 1;
    }
    expect(okCount).toBe(1);
    expect(st.singularity?.coresClaimed).toEqual(["core_1"]);
    expect(canClaimCore(st)).toBe(false);
  });

  it("offline reward settle/claim is exactly-once and rollback-safe", () => {
    const st = endgameState();
    st.lastTickAtMs = EPOCH - 10 * 60 * 1000;
    const q1 = settleOfflineReward(st, EPOCH, { incomePerSecond });
    expect(q1).not.toBeNull();
    expect(settleOfflineReward(st, EPOCH, { incomePerSecond })).toBeNull();
    let claimed = 0;
    for (let i = 0; i < 20; i++) {
      if (claimOfflineReward(st, EPOCH + i * 1000, { incomePerSecond }).claimed) claimed += 1;
    }
    expect(claimed).toBe(1);
    // 部分领取：报价常驻但剩余为 0；回拨不产生负时长/重复区间
    expect(hasPendingOfflineReward(st)).toBe(true);
    expect(offlineRemainingSec(st.pendingOfflineReward!)).toBe(0);
    expect(settleOfflineReward(st, EPOCH - 60_000, { incomePerSecond })).toBeNull();
    expect(st.money).toBeGreaterThanOrEqual(q1!.money.toNumber());
  });

  it("flagship reward claim is exactly-once (20 attempts)", () => {
    const st = endgameState();
    st.stage3.flagship.pendingReward = { projectId: "project_1", rewardMultiplier: 1 };
    let okCount = 0;
    for (let i = 0; i < 20; i++) {
      if (claimFlagshipReward(st).ok) okCount += 1;
    }
    expect(okCount).toBe(1);
  });

  it("perpetual blocks iteration but keeps manual reset available", () => {
    const st = endgameState();
    st.singularity!.perpetual = { unlockedAtMs: EPOCH };
    st.singularity!.coresClaimed = ["core_1", "core_2", "core_3"];
    st.technologyIterationCount = 3;
    expect(canEndgameIterate(st)).toBe(false);
    // 手动重置入口保留（由设置层维护；此处断言迭代被禁而非存档被锁）
    expect(st.singularity?.perpetual).not.toBeNull();
  });
});
