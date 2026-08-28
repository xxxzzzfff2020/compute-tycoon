import { describe, expect, it } from "vitest";
import {
  COMPANY_REQUIREMENT_GROWTH_PER_100_LEVELS,
  COMPANY_PREVIOUS_EARTH_RUN_XP,
  COMPANY_SOFT_CAP_PIVOT_LEVEL,
  applyCompanyCosmicExperience,
  companyExperienceForLevel,
  companyLevelFromExperience,
  companyLevelProgress,
  companyTitleKey,
  encodeCompanyLevelScore,
} from "../../src/economy/company-level";
import { applyOfflineCompanyExperience, tick, workshopExperiencePerSecond } from "../../src/economy/engine";
import { applyEndgameIteration } from "../../src/economy/singularity";
import { addExperience } from "../../src/economy/workshop";
import { buildEndgameReviewSave } from "../../src/review/endgame-checkpoints";
import { freshSaveData } from "../../src/save/storage";
import type { SaveData } from "../../src/save/types";
import { validateSave } from "../../src/save/validate";

describe("company level", () => {
  it("uses stable cumulative thresholds and title tiers", () => {
    expect(companyExperienceForLevel(1)).toBe(0);
    expect(companyExperienceForLevel(2)).toBe(100);
    expect(companyLevelFromExperience(99)).toBe(1);
    expect(companyLevelFromExperience(100)).toBe(2);
    expect(companyLevelFromExperience(companyExperienceForLevel(146))).toBe(146);
    const pivotRequirement = companyExperienceForLevel(COMPANY_SOFT_CAP_PIVOT_LEVEL + 1)
      - companyExperienceForLevel(COMPANY_SOFT_CAP_PIVOT_LEVEL);
    const hundredLevelsLater = companyExperienceForLevel(COMPANY_SOFT_CAP_PIVOT_LEVEL + 101)
      - companyExperienceForLevel(COMPANY_SOFT_CAP_PIVOT_LEVEL + 100);
    expect(pivotRequirement).toBeCloseTo(107_260, 6);
    expect(hundredLevelsLater / pivotRequirement).toBeCloseTo(COMPANY_REQUIREMENT_GROWTH_PER_100_LEVELS, 10);
    expect(companyTitleKey(1)).toBe("company.title.startupStudio");
    expect(companyTitleKey(146)).toBe("company.title.stellarOverlord");
    expect(companyTitleKey(185)).toBe("company.title.cosmicTycoon");
  });

  it("gains company XP with workshop XP and never resets it during an Earth iteration", () => {
    const state = freshSaveData(1_000);
    state.singularity = {
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
    addExperience(state, 12_345);
    const companyBeforeIteration = state.company!.totalExperience;
    expect(companyBeforeIteration).toBe(12_345);
    expect(applyEndgameIteration(state)).toEqual({ ok: true });
    expect(state.workshop.level).toBe(1);
    expect(state.workshop.experience).toBe(0);
    expect(state.company!.totalExperience).toBe(companyBeforeIteration);
  });

  it("keeps the verifiable Earth terminal XP rate through Stage 4, Stage 5, perpetual and offline time", () => {
    const stage4 = buildEndgameReviewSave("endgame_stage4_mid", 1_700_000_000_000);
    stage4.company = { totalExperience: 0 };
    const stage4Rate = workshopExperiencePerSecond(stage4).toNumber();
    tick(stage4, 1_700_000_060_000, 60);
    expect(stage4.company.totalExperience).toBeCloseTo(60 * stage4Rate, 6);

    const stage5 = buildEndgameReviewSave("endgame_stage5_dyson_almost", 1_700_000_000_000);
    stage5.company = { totalExperience: 0 };
    const stage5Rate = workshopExperiencePerSecond(stage5).toNumber();
    tick(stage5, 1_700_000_060_000, 60);
    expect(stage5.company.totalExperience).toBeCloseTo(60 * stage5Rate, 6);

    const perpetual = buildEndgameReviewSave("endgame_perpetual", 1_700_000_000_000);
    perpetual.company = { totalExperience: 0 };
    const perpetualRate = workshopExperiencePerSecond(perpetual).toNumber();
    tick(perpetual, 1_700_000_060_000, 60);
    expect(perpetual.company.totalExperience).toBeCloseTo(60 * perpetualRate, 6);
    perpetual.company.totalExperience = 0;
    expect(applyOfflineCompanyExperience(perpetual, 60)).toBeCloseTo(60 * perpetualRate * 0.75, 6);
  });

  it("keeps growing beyond the reported Lv2681 point and gets progressively slower without a local cap", () => {
    const perpetual = buildEndgameReviewSave("endgame_perpetual", 1_700_000_000_000);
    const level = 2_681;
    const threshold = companyExperienceForLevel(level);
    perpetual.company = { totalExperience: threshold + 84_860 };
    const before = companyLevelProgress(perpetual);
    expect(before.level).toBe(level);
    expect(before.experienceToNextLevel).toBeCloseTo(107_695.785, 2);

    const perpetualRate = workshopExperiencePerSecond(perpetual).toNumber();
    expect(applyCompanyCosmicExperience(perpetual, 1, 1, perpetualRate)).toBeCloseTo(perpetualRate, 6);
    expect(companyLevelProgress(perpetual).experience).toBeCloseTo(before.experience + perpetualRate, 6);

    const remaining = companyExperienceForLevel(level + 1) - perpetual.company.totalExperience;
    applyCompanyCosmicExperience(perpetual, Math.ceil(remaining / perpetualRate), 1, perpetualRate);
    expect(companyLevelProgress(perpetual).level).toBe(level + 1);

    const beforeOffline = perpetual.company.totalExperience;
    const offlineSeconds = 12 * 60 * 60;
    expect(applyOfflineCompanyExperience(perpetual, offlineSeconds)).toBeCloseTo(
      offlineSeconds * perpetualRate * 0.75,
      4,
    );
    expect(perpetual.company.totalExperience).toBeGreaterThan(beforeOffline);
    expect(companyLevelProgress(perpetual).level).toBeGreaterThan(level + 1);

    for (const farLevel of [5_000, 6_000]) {
      const farThreshold = companyExperienceForLevel(farLevel);
      expect(Number.isFinite(farThreshold)).toBe(true);
      expect(companyLevelFromExperience(farThreshold)).toBe(farLevel);
      expect(companyExperienceForLevel(farLevel + 1) - farThreshold).toBeGreaterThan(before.experienceToNextLevel);
    }
  });

  it("migrates old saves conservatively from verifiable run progress", () => {
    const legacy = buildEndgameReviewSave("endgame_r3_start", 1_700_000_000_000);
    legacy.workshop.level = 10;
    legacy.workshop.experience = 300;
    delete (legacy as Partial<SaveData>).company;
    const validated = validateSave(legacy);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.repaired).toBe(true);
    expect(validated.data.company!.totalExperience).toBe(
      companyExperienceForLevel(10) + 300 + 2 * COMPANY_PREVIOUS_EARTH_RUN_XP,
    );
  });

  it("uses the exact visible level as the platform score", () => {
    const state = freshSaveData(0);
    state.company = { totalExperience: companyExperienceForLevel(185) + 1_234 };
    expect(companyLevelProgress(state).level).toBe(185);
    expect(encodeCompanyLevelScore(state)).toBe(185);
  });
});
