import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { GameSession } from "../../src/app/session";
import { acquireFirstModel } from "../../src/economy/engine";
import { ensureEndgameSingularity } from "../../src/economy/singularity";
import { SaveRepository } from "../../src/save/repository";
import { freshSaveData, MemorySaveStorage } from "../../src/save/storage";
import { AUTOMATION_TOTAL_ORDER_CAP, ORDERS, ORDER_QUEUE_CAP } from "../../src/data/content";
import { FakeClock, makeSession } from "./helpers";

describe("release stability gates", () => {
  it("runs a 30-minute logical online soak without invalid money, timers or save drift", () => {
    const initial = freshSaveData(1_700_000_000_000);
    acquireFirstModel(initial, "codex");
    initial.automation = true;
    initial.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };
    const { session, clock } = makeSession({ initial });
    for (let second = 0; second < 30 * 60; second += 1) {
      clock.advance(1000);
      session.update(1);
    }
    const state = session.getState();
    expect(new Decimal(state.money).isFinite()).toBe(true);
    expect(new Decimal(state.money).gte(0)).toBe(true);
    expect(state.revision).toBeGreaterThanOrEqual(100);
    expect(state.activeOrders.length).toBeLessThanOrEqual(AUTOMATION_TOTAL_ORDER_CAP);
    for (const order of ORDERS) {
      expect(state.activeOrders.filter((active) => active.orderId === order.id).length).toBeLessThanOrEqual(ORDER_QUEUE_CAP);
    }
  });

  it("survives 100 consecutive save/load cycles with the same identity and progression", () => {
    const clock = new FakeClock();
    const storage = new MemorySaveStorage();
    const repository = new SaveRepository({ storage, nowMs: () => clock.now() });
    let session = new GameSession({ repository, clock });
    expect(session.acquireModel("codex").ok).toBe(true);
    const saveId = session.getState().saveId;
    for (let i = 0; i < 100; i += 1) {
      clock.advance(1000);
      expect(session.save(`cycle_${i}`).ok).toBe(true);
      session = new GameSession({ repository, clock });
      expect(session.getState().saveId).toBe(saveId);
      expect(session.getState().modelProgress?.modelId).toBe("codex");
    }
  });

  it("keeps 100 rapid core and node commands exactly-once", () => {
    const coreState = freshSaveData(1_700_000_000_000);
    ensureEndgameSingularity(coreState);
    coreState.stage3.flagship.completedIds = ["project_r1"];
    const { session: coreSession } = makeSession({ initial: coreState });
    let coreSuccesses = 0;
    for (let i = 0; i < 100; i += 1) if (coreSession.claimCore().ok) coreSuccesses += 1;
    expect(coreSuccesses).toBe(1);
    expect(coreSession.getState().singularity?.coresClaimed).toEqual(["core_1"]);

    const nodeState = freshSaveData(1_700_000_000_000);
    ensureEndgameSingularity(nodeState);
    nodeState.money = "1e30";
    nodeState.singularity!.coresClaimed = ["core_1", "core_2", "core_3"];
    nodeState.singularity!.spacePlanRevealed = true;
    nodeState.singularity!.spacePlanStarted = true;
    nodeState.singularity!.stage4 = {
      entered: true,
      enteredAtMs: 1_700_000_000_000,
      nodes: ["leo_node"],
      stageIncome: 0,
      projectProgress: 0,
      activeProjectId: null,
      completedProjectIds: [],
      pendingRewardProjectId: null,
    };
    const { session: nodeSession } = makeSession({ initial: nodeState });
    let nodeSuccesses = 0;
    for (let i = 0; i < 100; i += 1) if (nodeSession.buyNode("moon_base").ok) nodeSuccesses += 1;
    expect(nodeSuccesses).toBe(1);
    expect(nodeSession.getState().singularity?.stage4?.nodes.filter((id) => id === "moon_base")).toHaveLength(1);
  });
});
