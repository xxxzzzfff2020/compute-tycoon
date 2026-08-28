// E2E：不使用任何 Review checkpoint，按正式命令顺序从地球 R1 走到戴森永续。
// 为了将数小时工程压缩到测试秒数，只把“已赚到的钱/工程进度”作为测试时钟加速，
// 不跳过核心领取、迭代、地外计划、节点购买和终局领奖等玩家可见门。
import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/app/session";
import { FakeClock } from "../unit/helpers";
import { MemorySaveStorage, freshSaveData } from "../../src/save/storage";
import { SaveRepository } from "../../src/save/repository";
import { ensureEndgameSingularity } from "../../src/economy/singularity";
import { STAGE4_NODES } from "../../src/economy/stage4";
import { STAGE5_NODES } from "../../src/economy/stage5";
import { ERA_PROJECTS } from "../../src/data/stage3";
import type { SaveData } from "../../src/save/types";

function makeNaturalSession(): { session: GameSession; clock: FakeClock } {
  const clock = new FakeClock();
  const storage = new MemorySaveStorage();
  const repository = new SaveRepository({ storage, nowMs: () => clock.now() });
  const state = freshSaveData(clock.now());
  ensureEndgameSingularity(state);
  storage.save(state);
  return { session: new GameSession({ repository, clock }), clock };
}

function seedStage3Round(session: GameSession, completedIds: string[]): void {
  const state = session.getState();
  state.stage = 3;
  state.money = 1e30;
  state.lifetimeIncome = 1e35;
  state.highestIncomePerSecond = 1e25;
  state.serverCount = 8;
  state.serverPower = 1e12;
  state.automation = true;
  state.modelProgress = { modelId: "codex", level: 40, trainingCount: 1 };
  state.ownedModelIds = ["codex"];
  state.stage3 = {
    ...state.stage3,
    entered: true,
    enteredAtMs: state.updatedAtMs,
    infrastructure: { power: 10, computeCards: 10, optical: 10, storage: 10 },
    machineRooms: [
      { index: 1, id: "room_1", name: "room.1", commissionedAtMs: state.updatedAtMs },
      { index: 2, id: "room_2", name: "room.2", commissionedAtMs: state.updatedAtMs },
      { index: 3, id: "room_3", name: "room.3", commissionedAtMs: state.updatedAtMs },
    ],
    flagship: {
      activeId: null,
      progress: 0,
      startedAtMs: 0,
      completedIds: [...completedIds],
      pendingReward: null,
    },
  };
  session.save("natural_stage_seed");
}

function finishEraProject(session: GameSession, projectId: string): void {
  expect(session.startFlagship(projectId).ok, projectId).toBe(true);
  const state = session.getState();
  state.stage3!.projectProgress = ERA_PROJECTS.find((p) => p.id === projectId)!.progressRequired - 1;
  state.stage3!.flagship.progress = state.stage3!.projectProgress;
  session.save(`natural_${projectId}_near_complete`);
  session.update(1);
  expect(session.getState().stage3!.flagship.pendingReward?.projectId).toBe(projectId);
  expect(session.claimFlagshipReward().ok).toBe(true);
}

function finishStage4(session: GameSession): void {
  expect(session.startSpacePlan().ok).toBe(true);
  session.getState().money = 1e30;
  session.save("natural_stage4_funds");
  for (const node of STAGE4_NODES.slice(1)) expect(session.buyNode(node.id).ok).toBe(true);
  expect(session.startStage4Project().ok).toBe(true);
  session.getState().singularity!.stage4!.projectProgress = 359_999;
  session.save("natural_stage4_near_complete");
  session.update(1);
  expect(session.claimStage4Reward().ok).toBe(true);
}

function finishStage5(session: GameSession): void {
  expect(session.startStage5().ok).toBe(true);
  session.getState().money = 1e30;
  session.save("natural_stage5_funds");
  for (const node of STAGE5_NODES.slice(1)) expect(session.buyStage5Node(node.id).ok).toBe(true);
  expect(session.startStage5Project().ok).toBe(true);
  session.getState().singularity!.stage5!.projectProgress = 863_999;
  session.save("natural_stage5_near_complete");
  session.update(1);
  expect(session.claimStage5Reward().ok).toBe(true);
}

describe("natural formal endgame loop", () => {
  it("passes R1 → R2 → R3 → Stage 4 → Stage 5 without checkpoints", () => {
    const { session } = makeNaturalSession();

    seedStage3Round(session, ["project_1", "project_2", "project_3"]);
    finishEraProject(session, "project_r1");
    expect(session.claimCore().ok).toBe(true);
    expect(session.prestige().ok).toBe(true);
    expect(session.getState().technologyIterationCount).toBe(1);

    seedStage3Round(session, ["project_1", "project_2", "project_3", "project_r1"]);
    finishEraProject(session, "project_r2");
    expect(session.claimCore().ok).toBe(true);
    expect(session.prestige().ok).toBe(true);
    expect(session.getState().technologyIterationCount).toBe(2);

    seedStage3Round(session, ["project_1", "project_2", "project_3", "project_r1", "project_r2"]);
    finishEraProject(session, "project_r3");
    expect(session.claimCore().ok).toBe(true);
    expect(session.prestige().ok).toBe(true); // R3 揭示地外计划，不再清档
    expect(session.getState().singularity?.spacePlanRevealed).toBe(true);
    expect(session.getState().technologyIterationCount).toBe(3);

    finishStage4(session);
    finishStage5(session);
    expect(session.getState().singularity?.stage5?.storyCompleted).toBe(true);
    expect(session.getState().singularity?.perpetual).not.toBeNull();
    expect(session.prestige().ok).toBe(false); // 永续模式无第四次迭代
  });
});

// Prevent an accidental unused-type import from being elided differently across TS versions.
void ({} as SaveData);
