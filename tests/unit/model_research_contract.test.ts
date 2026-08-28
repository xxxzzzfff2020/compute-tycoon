import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/app/session";
import { ORDERS } from "../../src/data/content";
import {
  acquireFirstModel,
  applyOfflineResearchProgress,
  canResearchModel,
  researchModel,
} from "../../src/economy/engine";
import { blueprintUpgradeCost, buyBlueprintLevels } from "../../src/economy/incremental-growth";
import { addResearchFromLevelUp, addResearchFromOrder } from "../../src/economy/workshop";
import { SaveRepository } from "../../src/save/repository";
import { MemorySaveStorage, freshSaveData } from "../../src/save/storage";

const NOW = 1_800_000_000_000;

function paidState() {
  const state = freshSaveData(NOW);
  expect(acquireFirstModel(state, "codex").ok).toBe(true);
  state.serverCount = 1;
  state.serverPower = 2;
  state.stage = 2;
  state.automation = true;
  return state;
}

describe("paid-only Blueprint contract", () => {
  it("keeps legacy free-research commands disabled and mutation-free", () => {
    const state = paidState();
    state.modelResearch.progress = 100;
    const before = structuredClone(state);

    expect(canResearchModel(state)).toBe(false);
    expect(researchModel(state)).toMatchObject({ ok: false, error: "feature_removed" });
    expect(state).toEqual(before);
  });

  it("does not accumulate free progress from orders, levels, or offline time", () => {
    const state = paidState();
    state.modelResearch.progress = 37;
    addResearchFromOrder(state, ORDERS[0]);
    addResearchFromLevelUp(state);
    expect(applyOfflineResearchProgress(state, 24 * 60 * 60)).toBe(0);
    expect(state.modelResearch.progress).toBe(37);
  });

  it("uses the first paid upgrade to acquire an unowned Blueprint at Lv.1", () => {
    const state = paidState();
    const cost = blueprintUpgradeCost(state, "vision");
    state.money = cost.plus(100).toString();

    const result = buyBlueprintLevels(state, "vision", 1);

    expect(result.ok).toBe(true);
    expect(result.bought).toBe(1);
    expect(result.spent.eq(cost)).toBe(true);
    expect(state.modelArchive.vision.level).toBe(1);
    expect(state.ownedModelIds).toContain("vision");
    expect(new Decimal(state.money).eq(100)).toBe(true);
  });

  it("spends money only on the selected Blueprint and respects the Lv.40 cap", () => {
    const state = paidState();
    state.money = "1e30";
    expect(buyBlueprintLevels(state, "vision", 1).ok).toBe(true);
    state.modelArchive.vision.level = 39;
    state.modelArchive.vision.researchCount = 39;
    const codexBefore = state.modelArchive.codex.level;

    const result = buyBlueprintLevels(state, "vision", 10);

    expect(result).toMatchObject({ ok: true, bought: 1 });
    expect(state.modelArchive.vision.level).toBe(40);
    expect(state.modelArchive.codex.level).toBe(codexBefore);
  });

  it("rejects the removed GameSession command without committing a revision", () => {
    const storage = new MemorySaveStorage();
    const state = paidState();
    storage.save(state);
    const session = new GameSession({
      repository: new SaveRepository({ storage, nowMs: () => NOW }),
      clock: { now: () => NOW },
    });
    const before = structuredClone(session.getState());

    expect(session.researchModel()).toMatchObject({ ok: false, error: "feature_removed" });
    expect(session.getState()).toEqual(before);
  });
});
