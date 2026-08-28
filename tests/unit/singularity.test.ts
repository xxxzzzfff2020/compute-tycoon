// CARD-01：有限三次迭代与奇点核心（隔离终局命名空间）单元测试。
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { freshSaveData } from "../../src/save/storage";
import { validateSave, normalizeSave } from "../../src/save/validate";
import {
  MAX_ITERATIONS,
  SINGULARITY_MULTIPLIERS,
  canClaimCore,
  claimCore,
  canEndgameIterate,
  applyEndgameIteration,
  currentRound,
  coresClaimed,
  singularityDisplay,
  batchPurchaseUnlocked,
  flowCompressionUnlocked,
  endgameMode,
  ensureEndgameSingularity,
} from "../../src/economy/singularity";
import { canBuyMaxServers, buyMaxServers, canPrestige, applyPrestige } from "../../src/economy/engine";
import {
  startFlagship,
  advanceFlagship,
  claimFlagshipReward,
  canStartFlagship,
  hasPendingFlagshipReward,
  projectConstructionCost,
} from "../../src/economy/stage3";
import { canIterate, iterationRequirementsMet, applyFirstIteration } from "../../src/economy/stage3";
import type { SaveData } from "../../src/save/types";
import { ERA_PROJECTS, FLAGSHIP_PROJECTS } from "../../src/data/stage3";

function now() {
  return 1_700_000_000_000;
}

describe("bounded era-project tuning", () => {
  it("keeps the recalibrated R1 funding ladder isolated from later rounds", () => {
    expect(FLAGSHIP_PROJECTS.map((project) => project.constructionCosts[0])).toEqual([
      15_000_000_000,
      180_000_000_000,
      2_500_000_000_000,
    ]);
    expect(ERA_PROJECTS.find((project) => project.id === "project_r1")?.constructionCosts).toEqual([
      6_000_000_000_000,
      6_000_000_000_000,
      6_000_000_000_000,
    ]);
    expect(FLAGSHIP_PROJECTS.map((project) => project.constructionCosts[1])).toEqual([
      77_760_000_000,
      210_600_000_000,
      2_430_000_000_000,
    ]);
    expect(FLAGSHIP_PROJECTS.map((project) => project.constructionCosts[2])).toEqual([
      92_400_000_000,
      369_600_000_000,
      3_696_000_000_000,
    ]);
  });

  it("keeps the approved R2 and R3 progress requirements in the formal data source", () => {
    expect(ERA_PROJECTS.find((project) => project.id === "project_r2")?.progressRequired).toBe(25_200);
    expect(ERA_PROJECTS.find((project) => project.id === "project_r3")?.progressRequired).toBe(32_400);
  });
});

/** 构造隔离终局档（R1 起点：三机房 + 旗舰 project_3 已完成） */
function endgameState(): SaveData {
  const s = freshSaveData(now());
  s.money = 1e30;
  s.singularity = {
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
  s.stage3 = {
    ...s.stage3,
    entered: true,
    enteredAtMs: now(),
    machineRooms: [
      { index: 1, id: "room_1", name: "r1", commissionedAtMs: now() },
      { index: 2, id: "room_2", name: "r2", commissionedAtMs: now() },
      { index: 3, id: "room_3", name: "r3", commissionedAtMs: now() },
    ],
    infrastructure: { power: 10, computeCards: 10, optical: 10, storage: 10 },
    flagship: {
      activeId: null,
      progress: 0,
      startedAtMs: 0,
      completedIds: ["project_1", "project_2", "project_3"],
      pendingReward: null,
    },
  };
  return s;
}

/** 完成 R1 时代工程：启动 project_r1 → 推进到完成 → 领取（不发放资金/研发） */
function completeEraProject(s: SaveData, projectId: string): void {
  const constructionCost = projectConstructionCost(s, projectId) ?? new Decimal(0);
  if (new Decimal(s.money).lt(constructionCost)) s.money = constructionCost.mul(2).toNumber();
  expect(canStartFlagship(s, projectId)).toBe(true);
  expect(startFlagship(s, projectId).ok).toBe(true);
  // 时代工程速度 = 算力×0.001（cap 14/18），循环推进直到完成
  for (let i = 0; i < 2_000_000; i++) {
    const r = advanceFlagship(s, 100);
    if (r.completed) break;
  }
  expect(hasPendingFlagshipReward(s)).toBe(projectId);
  expect(claimFlagshipReward(s).ok).toBe(true);
}

describe("singularity: schema & isolation", () => {
  it("fresh formal save has singularity null", () => {
    const s = freshSaveData(now());
    expect(s.singularity).toBeNull();
    const r = validateSave(s);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.repaired).toBe(false);
  });

  it("formal v3 migration (A): old formal save opens endgame idempotently without data loss", () => {
    const s = freshSaveData(now());
    s.money = 12345;
    s.serverCount = 2;
    s.lifetimeIncome = 99999;
    expect(s.singularity).toBeNull();

    expect(ensureEndgameSingularity(s)).toBe(true);
    expect(s.singularity?.mode).toBe("endgame");
    expect(s.singularity?.coresClaimed).toEqual([]);
    expect(s.singularity?.stage4).toBeNull();
    expect(s.money).toBe(12345);
    expect(s.serverCount).toBe(2);
    expect(s.lifetimeIncome).toBe(99999);

    // 幂等：重复载入不重复迁移
    expect(ensureEndgameSingularity(s)).toBe(false);
    expect(s.singularity?.coresClaimed).toEqual([]);

    // 归一化后终局档透传（迭代次数/倍率保持）
    s.technologyIterationCount = 2;
    s.permanentMultiplier = 2.0;
    const n = normalizeSave(structuredClone(s));
    expect(n?.singularity?.mode).toBe("endgame");
    expect(n?.technologyIterationCount).toBe(2);
    expect(n?.permanentMultiplier).toBe(2.0);
  });

  it("legacy R1 save restores core_1 as history without replaying rewards", () => {
    const s = freshSaveData(now());
    s.technologyIterationCount = 1;
    s.permanentMultiplier = 2;
    s.money = 987_654;
    s.lifetimeIncome = 12_345_678;
    s.ownedModelIds = ["codex"];
    const before = {
      money: s.money,
      lifetimeIncome: s.lifetimeIncome,
      ownedModelIds: [...s.ownedModelIds],
      iterationCount: s.technologyIterationCount,
      permanentMultiplier: s.permanentMultiplier,
    };

    expect(ensureEndgameSingularity(s)).toBe(true);
    expect(s.singularity?.coresClaimed).toEqual(["core_1"]);
    expect(currentRound(s)).toBe(2);
    expect(s.money).toBe(before.money);
    expect(s.lifetimeIncome).toBe(before.lifetimeIncome);
    expect(s.ownedModelIds).toEqual(before.ownedModelIds);
    expect(s.technologyIterationCount).toBe(before.iterationCount);
    expect(s.permanentMultiplier).toBe(before.permanentMultiplier);
    expect(ensureEndgameSingularity(s)).toBe(false);
    expect(s.singularity?.coresClaimed).toEqual(["core_1"]);
  });

  it("legacy R2 save restores core_1/core_2 and enters R3 without replay", () => {
    const s = freshSaveData(now());
    s.technologyIterationCount = 2;
    s.permanentMultiplier = 2;
    s.money = 4_321_000;
    const beforeRevision = s.revision;

    expect(ensureEndgameSingularity(s)).toBe(true);
    expect(s.singularity?.coresClaimed).toEqual(["core_1", "core_2"]);
    expect(currentRound(s)).toBe(3);
    expect(s.money).toBe(4_321_000);
    expect(s.revision).toBe(beforeRevision);
    expect(s.technologyIterationCount).toBe(2);
    expect(s.permanentMultiplier).toBe(2);
  });

  it("legacy R3 save restores all cores and the already revealed space plan", () => {
    const s = freshSaveData(now());
    s.technologyIterationCount = 3;
    s.permanentMultiplier = 2;
    s.updatedAtMs = now();

    expect(ensureEndgameSingularity(s)).toBe(true);
    expect(s.singularity?.coresClaimed).toEqual(["core_1", "core_2", "core_3"]);
    expect(s.singularity?.spacePlanRevealed).toBe(true);
    expect(s.singularity?.spacePlanRevealedAtMs).toBe(now());
    expect(currentRound(s)).toBeNull();
    expect(canEndgameIterate(s)).toBe(false);
  });

  it("formal v3 migration does not touch existing endgame save", () => {
    const s = endgameState();
    s.singularity = {
      mode: "endgame",
      coresClaimed: ["core_1"],
      spacePlanRevealed: false,
      claimedProjectIds: [],
      spacePlanRevealedAtMs: 0,
      spacePlanStarted: false,
      stage4: null,
      stage5: null,
      perpetual: null,
    };
    expect(ensureEndgameSingularity(s)).toBe(false);
    expect(s.singularity?.coresClaimed).toEqual(["core_1"]);
  });

  it("endgame save persists through normalize", () => {
    const s = endgameState();
    s.singularity = {
      mode: "endgame",
      coresClaimed: ["core_1"],
      spacePlanRevealed: false,
      claimedProjectIds: ["project_1"],
      spacePlanRevealedAtMs: 0,
      spacePlanStarted: false,
      stage4: null,
      stage5: null,
      perpetual: null,
    };
    s.technologyIterationCount = 1;
    s.permanentMultiplier = 1.5;
    const n = normalizeSave(structuredClone(s));
    expect(n?.singularity?.mode).toBe("endgame");
    expect(n?.singularity?.coresClaimed).toEqual(["core_1"]);
    // 终局档：不收敛迭代/倍率
    expect(n?.technologyIterationCount).toBe(1);
    expect(n?.permanentMultiplier).toBe(1.5);
  });

  it("formal save still converges overflow iterations to 1 / ×2", () => {
    const s = freshSaveData(now());
    s.technologyIterationCount = 3;
    s.permanentMultiplier = 4;
    const n = normalizeSave(structuredClone(s));
    expect(n?.technologyIterationCount).toBe(1);
    expect(n?.permanentMultiplier).toBe(2);
  });

  it("corrupt singularity payload resets to null (no endgame hijack)", () => {
    const s = endgameState() as unknown as Record<string, unknown>;
    (s as Record<string, unknown>).singularity = { mode: "endgame", coresClaimed: "bad" };
    const n = normalizeSave(s);
    expect(n?.singularity).toBeNull();
    expect(n?.technologyIterationCount).toBe(0);
  });
});

describe("singularity: core state machine", () => {
  it("requires both optical and storage Lv10 before an era project can start", () => {
    const s = endgameState();
    s.stage3.infrastructure.optical = 9;
    expect(canStartFlagship(s, "project_r1")).toBe(false);
    s.stage3.infrastructure.optical = 10;
    s.stage3.infrastructure.storage = 9;
    expect(canStartFlagship(s, "project_r1")).toBe(false);
    s.stage3.infrastructure.storage = 10;
    expect(canStartFlagship(s, "project_r1")).toBe(true);
  });

  it("R1 core requires era project completion and manual claim", () => {
    const s = endgameState();
    expect(canClaimCore(s)).toBe(false);
    expect(claimCore(s).ok).toBe(false);
    completeEraProject(s, "project_r1");
    expect(canClaimCore(s)).toBe(true);
    expect(claimCore(s).ok).toBe(true);
    expect(coresClaimed(s)).toEqual(["core_1"]);
    expect(singularityDisplay(s)).toBe("1/3");
    // exactly-once
    expect(canClaimCore(s)).toBe(false);
    expect(claimCore(s).ok).toBe(false);
  });

  it("iteration requires claimed core and enforces unique order", () => {
    const s = endgameState();
    expect(canEndgameIterate(s)).toBe(false);
    expect(applyEndgameIteration(s).ok).toBe(false);
    completeEraProject(s, "project_r1");
    expect(applyEndgameIteration(s).ok).toBe(false); // 未领核心
    expect(claimCore(s).ok).toBe(true);
    expect(canEndgameIterate(s)).toBe(true);
    expect(applyEndgameIteration(s).ok).toBe(true);
    expect(s.technologyIterationCount).toBe(1);
    expect(s.permanentMultiplier).toBe(1.5);
    expect(currentRound(s)).toBe(2);
  });

  it("keeps owned blueprints but resets their investment to Lv.1 on a new earth round", () => {
    const s = endgameState();
    s.ownedModelIds = ["codex", "vision"];
    s.modelArchive = {
      codex: {
        modelId: "codex", level: 40, firstAcquiredAtMs: now(), researchCount: 9,
        lifetimeTrainingCount: 0, lifetimeContribution: 0,
      },
      vision: {
        modelId: "vision", level: 17, firstAcquiredAtMs: now(), researchCount: 0,
        lifetimeTrainingCount: 0, lifetimeContribution: 0,
      },
    };
    s.growth.blueprintBaseLevels.codex = 40;
    s.growth.blueprintBaseLevels.vision = 17;

    completeEraProject(s, "project_r1");
    expect(claimCore(s).ok).toBe(true);
    expect(applyEndgameIteration(s).ok).toBe(true);

    expect(s.ownedModelIds).toEqual(["codex", "vision"]);
    expect(s.modelArchive.codex.level).toBe(1);
    expect(s.modelArchive.vision.level).toBe(1);
    expect(s.modelArchive.codex.researchCount).toBe(9);
    expect(s.growth.blueprintBaseLevels.codex).toBe(1);
    expect(s.growth.blueprintBaseLevels.vision).toBe(1);
  });

  it("R2 core then iteration2 → ×2.0; R3 core then reveal without reset", () => {
    const s = endgameState();
    completeEraProject(s, "project_r1");
    claimCore(s);
    applyEndgameIteration(s);
    // R2：重进 Stage 3 完成 project_r2
    s.stage3 = {
      ...s.stage3,
      entered: true,
      enteredAtMs: now(),
      machineRooms: [
        { index: 1, id: "room_1", name: "r1", commissionedAtMs: now() },
        { index: 2, id: "room_2", name: "r2", commissionedAtMs: now() },
        { index: 3, id: "room_3", name: "r3", commissionedAtMs: now() },
      ],
      infrastructure: { power: 10, computeCards: 10, optical: 10, storage: 10 },
      flagship: {
        activeId: null,
        progress: 0,
        startedAtMs: 0,
        completedIds: ["project_1", "project_2", "project_3"],
        pendingReward: null,
      },
    };
    completeEraProject(s, "project_r2");
    expect(canClaimCore(s)).toBe(true);
    expect(claimCore(s).ok).toBe(true);
    expect(singularityDisplay(s)).toBe("2/3");
    expect(applyEndgameIteration(s).ok).toBe(true);
    expect(s.permanentMultiplier).toBe(2.0);
    // R3：不重置地球进度（money 保留），只揭示
    s.stage3 = {
      ...s.stage3,
      entered: true,
      machineRooms: [
        { index: 1, id: "room_1", name: "r1", commissionedAtMs: now() },
        { index: 2, id: "room_2", name: "r2", commissionedAtMs: now() },
        { index: 3, id: "room_3", name: "r3", commissionedAtMs: now() },
      ],
      infrastructure: { power: 10, computeCards: 10, optical: 10, storage: 10 },
      flagship: {
        activeId: null,
        progress: 0,
        startedAtMs: 0,
        completedIds: ["project_1", "project_2", "project_3"],
        pendingReward: null,
      },
    };
    s.money = (projectConstructionCost(s, "project_r3")?.toNumber() ?? 0) + 123_456_789;
    completeEraProject(s, "project_r3");
    expect(claimCore(s).ok).toBe(true);
    expect(singularityDisplay(s)).toBe("3/3");
    expect(applyEndgameIteration(s).ok).toBe(true);
    expect(s.technologyIterationCount).toBe(3);
    expect(s.permanentMultiplier).toBe(2.0);
    expect(s.singularity?.spacePlanRevealed).toBe(true);
    expect(s.money).toBe(123_456_789); // 不重置
    // 无第四次迭代
    expect(currentRound(s)).toBeNull();
    expect(canEndgameIterate(s)).toBe(false);
    expect(applyEndgameIteration(s).ok).toBe(false);
  });

  it("no auto-claim and no iteration without core", () => {
    const s = endgameState();
    completeEraProject(s, "project_r1");
    expect(claimCore(s).ok).toBe(true);
    // 二次迭代前必须再次领核心：当前无 project_r2 完成 → canEndgameIterate=false
    const s2 = endgameState();
    s2.singularity = { ...s2.singularity!, coresClaimed: [] };
    expect(canEndgameIterate(s2)).toBe(false);
  });

  it("multiplier table is additive 1.5/2.0/2.0", () => {
    expect(SINGULARITY_MULTIPLIERS).toEqual([1.5, 2.0, 2.0]);
    expect(MAX_ITERATIONS).toBe(3);
  });
});

describe("singularity: core rewards", () => {
  it("core1 unlocks batch purchase even before iteration", () => {
    const s = endgameState();
    completeEraProject(s, "project_r1");
    claimCore(s);
    s.serverCount = 1;
    s.serverPower = 2;
    s.money = 10_000_000;
    s.workshop.firstServerAwarded = true;
    expect(batchPurchaseUnlocked(s)).toBe(true);
    expect(canBuyMaxServers(s)).toBe(true);
    const res = buyMaxServers(s);
    expect(res.ok).toBe(true);
    expect(res.bought).toBeGreaterThan(0);
  });

  it("flow compression unlocks at core2", () => {
    const s = endgameState();
    expect(flowCompressionUnlocked(s)).toBe(false);
    s.singularity = { ...s.singularity!, coresClaimed: ["core_1", "core_2"] };
    expect(flowCompressionUnlocked(s)).toBe(true);
  });
});

describe("singularity: era project gates", () => {
  it("R2 era project requires core_1 and R3 requires core_2", () => {
    const s = endgameState();
    // 无核心：R2/R3 均不可启动
    expect(canStartFlagship(s, "project_r1")).toBe(true); // R1 由旗舰 project_3 解锁
    expect(canStartFlagship(s, "project_r2")).toBe(false);
    expect(canStartFlagship(s, "project_r3")).toBe(false);
    // 领核心1但尚未执行第一次迭代：仍在 R1，不能提前启动 R2。
    completeEraProject(s, "project_r1");
    claimCore(s);
    expect(canStartFlagship(s, "project_r2")).toBe(false);
    expect(applyEndgameIteration(s).ok).toBe(true);
    s.stage3 = structuredClone(endgameState().stage3);
    s.money = 1e30;
    // 已进入 R2：只能启动 R2，不能重开 R1 或提前启动 R3。
    expect(canStartFlagship(s, "project_r1")).toBe(false);
    expect(canStartFlagship(s, "project_r2")).toBe(true);
    expect(canStartFlagship(s, "project_r3")).toBe(false);
    // 已启动的 R2 不能再次启动并重置进度。
    expect(startFlagship(s, "project_r2").ok).toBe(true);
    advanceFlagship(s, 10);
    const progress = s.stage3.projectProgress;
    expect(canStartFlagship(s, "project_r2")).toBe(false);
    expect(startFlagship(s, "project_r2").ok).toBe(false);
    expect(s.stage3.projectProgress).toBe(progress);
    // 进入 R3 后才可启动 R3。
    s.stage3.flagship = { activeId: null, progress: 0, startedAtMs: 0, completedIds: ["project_1", "project_2", "project_3", "project_r2"], pendingReward: null };
    s.singularity = { ...s.singularity!, coresClaimed: ["core_1", "core_2"] };
    s.technologyIterationCount = 2;
    s.money = 1e30;
    expect(canStartFlagship(s, "project_r3")).toBe(true);
  });

  it("era projects are invisible in formal mode", () => {
    const s = freshSaveData(now());
    s.stage3 = {
      ...s.stage3,
      entered: true,
      enteredAtMs: now(),
      machineRooms: [
        { index: 1, id: "room_1", name: "r1", commissionedAtMs: now() },
        { index: 2, id: "room_2", name: "r2", commissionedAtMs: now() },
        { index: 3, id: "room_3", name: "r3", commissionedAtMs: now() },
      ],
      flagship: {
        activeId: null,
        progress: 0,
        startedAtMs: 0,
        completedIds: ["project_1", "project_2", "project_3"],
        pendingReward: null,
      },
    };
    expect(canStartFlagship(s, "project_r1")).toBe(false);
    expect(canStartFlagship(s, "project_r2")).toBe(false);
    expect(canStartFlagship(s, "project_r3")).toBe(false);
  });
});

describe("singularity: batch purchase verified projects only", () => {
  it("bulk purchase requires at least one verified (owned) flagship project", () => {
    const s = endgameState();
    s.singularity = { ...s.singularity!, coresClaimed: ["core_1"] };
    s.serverCount = 1;
    s.serverPower = 2;
    s.money = 10_000_000;
    s.workshop.firstServerAwarded = true;
    // 已验证项目 = 本轮已完成旗舰（project_1/2/3 均已完成）
    expect(canBuyMaxServers(s)).toBe(true);
    const res = buyMaxServers(s);
    expect(res.ok).toBe(true);
    expect(res.bought).toBeGreaterThan(0);
  });
});

describe("singularity: formal mode is untouched", () => {
  it("formal save cannot claim cores or endgame-iterate", () => {
    const s = freshSaveData(now());
    expect(endgameMode(s)).toBe(false);
    expect(canClaimCore(s)).toBe(false);
    expect(claimCore(s).ok).toBe(false);
    expect(canEndgameIterate(s)).toBe(false);
    expect(applyEndgameIteration(s).ok).toBe(false);
    expect(batchPurchaseUnlocked(s)).toBe(false);
  });

  it("formal iteration path still works (single ×2)", () => {
    const s = freshSaveData(now());
    s.stage3 = {
      ...s.stage3,
      entered: true,
      enteredAtMs: now(),
      machineRooms: [
        { index: 1, id: "room_1", name: "r1", commissionedAtMs: now() },
        { index: 2, id: "room_2", name: "r2", commissionedAtMs: now() },
        { index: 3, id: "room_3", name: "r3", commissionedAtMs: now() },
      ],
      flagship: {
        activeId: null,
        progress: 0,
        startedAtMs: 0,
        completedIds: ["project_1", "project_2", "project_3"],
        pendingReward: null,
      },
    };
    expect(canPrestige(s)).toBe(true);
    expect(applyPrestige(s).ok).toBe(true);
    expect(s.permanentMultiplier).toBe(2);
    expect(s.technologyIterationCount).toBe(1);
    // 仍走正式单次迭代合同（重置后不再提供普通迭代入口）
    expect(iterationRequirementsMet(s)).toBe(false);
    expect(canIterate(s)).toBe(false);
  });

  it("formal applyFirstIteration rejects when endgame mode", () => {
    const s = endgameState();
    completeEraProject(s, "project_r1");
    claimCore(s);
    expect(applyFirstIteration(s).ok).toBe(false);
  });
});
