import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/app/session";
import { MODEL_ARCHIVE_MAX_LEVEL, MODELS } from "../../src/data/content";
import {
  canResearchModel,
  incomePerSecond,
  modelCompute,
  modelLevel,
  researchModel,
} from "../../src/economy/engine";
import { buildReviewSave } from "../../src/review/checkpoints";
import { resolveReviewSpeed } from "../../src/review/runtime-contract";
import { SaveRepository } from "../../src/save/repository";
import { MemorySaveStorage, freshSaveData } from "../../src/save/storage";
import { acquireFirstModel } from "../../src/economy/engine";

const NOW = 1_800_000_000_000;

function core(state: ReturnType<typeof freshSaveData>) {
  return {
    level: modelLevel(state),
    compute: modelCompute(state),
    income: incomePerSecond(state),
  };
}

function firstUnlockState() {
  const state = freshSaveData(NOW);
  expect(acquireFirstModel(state, "codex").ok).toBe(true);
  state.serverCount = 1;
  state.serverPower = 2;
  state.stage = 2;
  state.automation = true;
  state.modelResearch.progress = 100;
  // stage2Draws=0 + active codex index 0 + stable offset 2 = voice.
  state.completedOrders = 0;
  return state;
}

function reviewSession(state: ReturnType<typeof freshSaveData>): GameSession {
  const storage = new MemorySaveStorage();
  storage.save(state);
  return new GameSession({
    repository: new SaveRepository({ storage, nowMs: () => NOW }),
    clock: { now: () => NOW },
  });
}

describe("model research non-regression contract", () => {
  it("switches to a stronger first unlock after archive growth", () => {
    const state = firstUnlockState();
    const before = core(state);
    const result = researchModel(state);
    const after = core(state);

    expect(result).toMatchObject({ ok: true, modelId: "voice", isNew: true, switched: true });
    expect(state.ownedModelIds).toEqual(expect.arrayContaining(["codex", "voice"]));
    expect(state.modelArchive.voice.level).toBe(1);
    expect(after.level).toBeGreaterThanOrEqual(before.level);
    expect(after.compute.gte(before.compute)).toBe(true);
    expect(after.income.gte(before.income)).toBe(true);
    expect(after.compute.gt(before.compute) || after.income.gt(before.income)).toBe(true);
  });

  it("does not consume progress when every model archive is complete", () => {
    const state = buildReviewSave("model_archive_complete", NOW);
    const before = structuredClone(state);
    expect(canResearchModel(state)).toBe(false);
    const result = researchModel(state);
    expect(result).toMatchObject({ ok: false, error: "archive_complete" });
    expect(state).toEqual(before);
  });

  it("researches the current main only when it is the sole incomplete archive, then completes at Lv20", () => {
    const state = buildReviewSave("model_archive_complete", NOW);
    state.modelArchive.voice.level = MODEL_ARCHIVE_MAX_LEVEL - 1;
    // 最坏旧档：历史 researchCount 已达 20，但可见图鉴仍为 19。
    // 研发必须仍由可见图鉴 19→20 产生严格正增长。
    state.modelArchive.voice.researchCount = MODEL_ARCHIVE_MAX_LEVEL;
    state.modelResearch.progress = 100;
    const session = reviewSession(state);
    const before = core(session.getState());
    const progressBefore = session.getState().modelResearch.progress;
    const drawsBefore = session.getState().modelResearch.stage2Draws;

    const result = session.researchModel();
    const after = core(session.getState());

    expect(result).toMatchObject({
      ok: true,
      researchReceipt: {
        resultModelId: "voice",
        archiveLevelBefore: 19,
        archiveLevelAfter: 20,
        archiveLevelDelta: 1,
        switched: false,
        switchReason: "receipt.reason.upgraded",
      },
    });
    expect(session.getState().modelProgress?.modelId).toBe("voice");
    expect(modelLevel(session.getState())).toBe(12); // 训练上限仍沿用 voice.maxLevel
    expect(session.getState().modelArchive.voice.level).toBe(MODEL_ARCHIVE_MAX_LEVEL);
    expect(session.getState().modelArchive.voice.researchCount).toBe(MODEL_ARCHIVE_MAX_LEVEL);
    expect(progressBefore).toBe(100);
    expect(session.getState().modelResearch.progress).toBe(0);
    expect(session.getState().modelResearch.stage2Draws).toBe(drawsBefore + 1);
    expect(after.compute.gt(before.compute)).toBe(true);
    expect(after.income.gt(before.income)).toBe(true);
    expect(canResearchModel(session.getState())).toBe(false);

    const complete = structuredClone(session.getState());
    expect(session.researchModel()).toMatchObject({ ok: false, error: "archive_complete" });
    expect(session.getState()).toEqual(complete);
  });

  it("keeps the old active model for the exact weak voice→distill regression", () => {
    const state = buildReviewSave("model_research_regression", NOW);
    const before = core(state);
    expect(before.level).toBe(12);
    expect(before.compute.toFixed(4)).toBe("3.8178");
    expect(before.income.toFixed(4)).toBe("309.2832");

    const result = researchModel(state);
    const after = core(state);
    expect(result).toMatchObject({ ok: true, modelId: "distill", isNew: false, switched: false });
    expect(state.modelProgress?.modelId).toBe("voice");
    expect(modelLevel(state)).toBeGreaterThanOrEqual(12);
    expect(after.compute.gte(before.compute)).toBe(true);
    expect(after.income.gte(before.income)).toBe(true);
    expect(after.compute.gt(before.compute) || after.income.gt(before.income)).toBe(true);
    expect(state.modelArchive.voice.level).toBe(3);
    expect(state.modelArchive.distill.level).toBe(7);
  });

  it("uses only draw count and stable model identity for candidate selection", () => {
    const variants = [
      { completedOrders: 1, workshopLevel: 1, now: NOW },
      { completedOrders: 26, workshopLevel: 20, now: NOW + 32_000 },
    ];
    for (const variant of variants) {
      const state = buildReviewSave("model_research_regression", NOW);
      state.completedOrders = variant.completedOrders;
      state.workshop.level = variant.workshopLevel;
      state.updatedAtMs = variant.now;
      state.lastTickAtMs = variant.now;
      const result = researchModel(state);
      expect(result).toMatchObject({ modelId: "distill", switched: false });
      expect(state.modelProgress?.modelId).toBe("voice");
    }
  });

  it("keeps 1x and 32x equivalent updates on the same candidate", () => {
    const oneX = reviewSession(buildReviewSave("model_research_regression", NOW));
    const thirtyTwoX = reviewSession(buildReviewSave("model_research_regression", NOW));
    oneX.update(1);
    thirtyTwoX.update(32);
    oneX.getState().modelResearch.progress = 100;
    thirtyTwoX.getState().modelResearch.progress = 100;

    const oneXResult = oneX.researchModel();
    const thirtyTwoXResult = thirtyTwoX.researchModel();
    expect(oneXResult.researchReceipt?.resultModelId).toBe("distill");
    expect(thirtyTwoXResult.researchReceipt?.resultModelId).toBe("distill");
    expect(oneX.getState().modelProgress?.modelId).toBe("voice");
    expect(thirtyTwoX.getState().modelProgress?.modelId).toBe("voice");
  });

  it("converts a duplicate into archive growth without losing the old facts", () => {
    const state = buildReviewSave("model_research_regression", NOW);
    const oldTraining = state.modelProgress!.trainingCount;
    const oldVoiceArchive = structuredClone(state.modelArchive.voice);
    const result = researchModel(state);

    expect(result.ok).toBe(true);
    expect(state.modelArchive.voice.lifetimeTrainingCount).toBeGreaterThanOrEqual(oldTraining);
    expect(state.modelArchive.voice.firstAcquiredAtMs).toBe(oldVoiceArchive.firstAcquiredAtMs);
    expect(state.modelArchive.distill.researchCount).toBe(7);
  });

  it("skips a maxed candidate instead of consuming hidden research growth", () => {
    const state = buildReviewSave("model_research_regression", NOW);
    state.modelArchive.distill.level = MODEL_ARCHIVE_MAX_LEVEL;
    state.modelArchive.distill.researchCount = MODEL_ARCHIVE_MAX_LEVEL;
    const before = core(state);
    const result = researchModel(state);
    const after = core(state);

    expect(result.ok).toBe(true);
    expect(state.modelArchive.distill.level).toBe(MODEL_ARCHIVE_MAX_LEVEL);
    expect(state.modelArchive.distill.researchCount).toBe(MODEL_ARCHIVE_MAX_LEVEL);
    expect(result.modelId).not.toBe("distill");
    expect(state.modelArchive[result.modelId].level).toBeGreaterThan(1);
    expect(after.compute.gt(before.compute)).toBe(true);
    expect(after.income.gt(before.income)).toBe(true);
  });

  it("consumes exactly one full-progress command, commits one revision, and reloads identically", () => {
    const initial = buildReviewSave("model_research_regression", NOW);
    const storage = new MemorySaveStorage();
    storage.save(initial);
    const repository = new SaveRepository({ storage, nowMs: () => NOW });
    const session = new GameSession({ repository, clock: { now: () => NOW } });

    const first = session.researchModel();
    expect(first.ok).toBe(true);
    expect(first.researchReceipt).toMatchObject({
      oldModelName: "model.voice.name",
      resultModelName: "model.distill.name",
      levelBefore: 12,
      conclusion: "receipt.conclusion.kept",
    });
    expect(first.researchReceipt?.computeBefore).toBe("3.8178");
    expect(first.researchReceipt?.incomeBefore).toBe("309.2832");
    expect(first.researchReceipt?.computeAfter).toBe("4.8104");
    expect(first.researchReceipt?.incomeAfter).toBe("389.6968");
    expect(first.researchReceipt?.archiveLevelBefore).toBe(6);
    expect(first.researchReceipt?.archiveLevelAfter).toBe(7);
    expect(first.researchReceipt?.archiveLevelDelta).toBe(1);
    expect(first.researchReceipt?.computeDelta).toBe("0.9926");
    expect(first.researchReceipt?.incomeDelta).toBe("80.4136");
    expect(first.researchReceipt?.switched).toBe(false);
    expect(session.getState().revision).toBe(initial.revision + 1);

    const second = session.researchModel();
    expect(second.ok).toBe(false);
    expect(session.getState().revision).toBe(initial.revision + 1);

    const reloaded = new GameSession({
      repository: new SaveRepository({ storage, nowMs: () => NOW }),
      clock: { now: () => NOW },
    });
    expect(reloaded.getState().modelProgress).toEqual(session.getState().modelProgress);
    expect(reloaded.getState().modelArchive).toEqual(session.getState().modelArchive);
    expect(reloaded.getState().modelResearch).toEqual(session.getState().modelResearch);
  });

  it("is semantically identical at 1x, 32x, no-debug and production command speed", () => {
    expect(resolveReviewSpeed(new URLSearchParams("?debug=1&speed=1"))).toBe(1);
    expect(resolveReviewSpeed(new URLSearchParams("?debug=1&speed=32"))).toBe(32);
    expect(resolveReviewSpeed(new URLSearchParams("?debug=1&speed=256"))).toBe(256);
    expect(resolveReviewSpeed(new URLSearchParams("?speed=32"))).toBe(1);

    const outcomes = [1, 32, 1, 1].map(() => {
      const state = buildReviewSave("model_research_regression", NOW);
      const result = researchModel(state);
      return { result, state };
    });
    for (const outcome of outcomes) {
      expect(outcome.result).toMatchObject({ ok: true, modelId: "distill", switched: false });
      expect(outcome.state.modelProgress?.modelId).toBe("voice");
      expect(outcome.state.modelArchive.distill.level).toBe(7);
      expect(outcome.state.modelResearch.stage2Draws).toBe(1);
    }
    for (const outcome of outcomes.slice(1)) {
      expect(outcome.state).toEqual(outcomes[0].state);
    }
    expect(MODELS).toHaveLength(6);
  });
});
