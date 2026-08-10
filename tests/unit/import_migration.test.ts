import { describe, expect, it } from "vitest";
import { freshSaveData } from "../../src/save/storage";
import { makeSession } from "./helpers";
import {
  shouldMigrateExistingReviewSave,
  shouldSeedReviewSave,
} from "../../src/review/runtime-contract";

function legacyIterationSave(iterationCount: 1 | 2 | 3) {
  const save = freshSaveData(1_700_000_000_000);
  save.technologyIterationCount = iterationCount;
  save.permanentMultiplier = 2;
  save.money = 995_569_802_104;
  save.lifetimeIncome = 1_100_000_000_000;
  save.singularity = null;
  return save;
}

describe("import migration: current endgame product", () => {
  it("keeps a valid imported saveId across natural-review refresh", () => {
    expect(shouldSeedReviewSave("legacy-owner-save", "p0-natural-review-v1", true)).toBe(false);
    expect(shouldSeedReviewSave(null, "p0-natural-review-v1", true)).toBe(true);
    expect(shouldSeedReviewSave("legacy-owner-save", "checkpoint-seed", false)).toBe(true);
  });

  it("migrates an already-persisted legacy import when the natural review reopens", () => {
    expect(shouldMigrateExistingReviewSave(true, null)).toBe(true);
    expect(shouldMigrateExistingReviewSave(false, null)).toBe(false);
    expect(shouldMigrateExistingReviewSave(true, {
      mode: "endgame",
      coresClaimed: ["core_1"],
      spacePlanRevealed: false,
      claimedProjectIds: [],
      spacePlanRevealedAtMs: 0,
      spacePlanStarted: false,
      stage4: null,
      stage5: null,
      perpetual: null,
    })).toBe(false);
  });

  it("imports a legacy R1 save into R2 without reward replay or terminal deadlock", () => {
    const { session, storage } = makeSession();
    const legacy = legacyIterationSave(1);

    expect(session.importJson(JSON.stringify(legacy))).toEqual({ ok: true });

    const imported = session.getState();
    expect(imported.technologyIterationCount).toBe(1);
    expect(imported.permanentMultiplier).toBe(2);
    expect(imported.singularity?.coresClaimed).toEqual(["core_1"]);
    expect(imported.singularity?.spacePlanRevealed).toBe(false);
    expect(imported.money).toBe(legacy.money);
    expect(imported.lifetimeIncome).toBe(legacy.lifetimeIncome);
    expect(storage.load()?.singularity?.coresClaimed).toEqual(["core_1"]);
  });

  it("imports a legacy R2 save into R3 without collapsing iteration history", () => {
    const { session, storage } = makeSession();
    const legacy = legacyIterationSave(2);

    expect(session.importJson(JSON.stringify(legacy))).toEqual({ ok: true });

    const imported = session.getState();
    expect(imported.technologyIterationCount).toBe(2);
    expect(imported.permanentMultiplier).toBe(2);
    expect(imported.singularity?.coresClaimed).toEqual(["core_1", "core_2"]);
    expect(imported.money).toBe(legacy.money);
    expect(storage.load()?.technologyIterationCount).toBe(2);
    expect(storage.load()?.singularity?.coresClaimed).toEqual(["core_1", "core_2"]);
  });

  it("imports a legacy R3 save as the already-revealed space-plan boundary", () => {
    const { session } = makeSession();
    const legacy = legacyIterationSave(3);

    expect(session.importJson(JSON.stringify(legacy))).toEqual({ ok: true });

    const imported = session.getState();
    expect(imported.technologyIterationCount).toBe(3);
    expect(imported.permanentMultiplier).toBe(2);
    expect(imported.singularity?.coresClaimed).toEqual(["core_1", "core_2", "core_3"]);
    expect(imported.singularity?.spacePlanRevealed).toBe(true);
    expect(imported.singularity?.spacePlanStarted).toBe(false);
    expect(imported.money).toBe(legacy.money);
  });

  it("does not rewrite an already-current endgame import", () => {
    const { session } = makeSession();
    const current = legacyIterationSave(1);
    current.singularity = {
      mode: "endgame",
      coresClaimed: ["core_1"],
      spacePlanRevealed: false,
      claimedProjectIds: ["project_r1"],
      spacePlanRevealedAtMs: 0,
      spacePlanStarted: false,
      stage4: null,
      stage5: null,
      perpetual: null,
    };

    expect(session.importJson(JSON.stringify(current))).toEqual({ ok: true });
    expect(session.getState().singularity).toEqual(current.singularity);
  });

  it("keeps the current save untouched when imported JSON is rejected", () => {
    const { session, storage } = makeSession();
    session.acquireModel();
    const before = structuredClone(session.getState());
    const persistedBefore = structuredClone(storage.load());

    expect(session.importJson("{broken")).toEqual({ ok: false, error: "invalid_json" });
    expect(session.getState()).toEqual(before);
    expect(storage.load()).toEqual(persistedBefore);
  });

  it("explicit in-session reset returns to the current endgame-enabled fresh contract", () => {
    const { session, storage } = makeSession();
    session.acquireModel();

    expect(session.reset()).toEqual({ ok: true });
    expect(session.getState().technologyIterationCount).toBe(0);
    expect(session.getState().singularity?.mode).toBe("endgame");
    expect(session.getState().singularity?.coresClaimed).toEqual([]);
    expect(storage.load()?.singularity?.mode).toBe("endgame");
  });
});
