// CARD-06：终局集中复验检查点 A–M（独立隔离命名空间）单元测试。
import { describe, expect, it } from "vitest";
import {
  ENDGAME_REVIEW_CHECKPOINTS,
  ENDGAME_REVIEW_STORAGE_PREFIX,
  buildEndgameReviewSave,
  endgameReviewInvariantIssues,
  endgameReviewStorageNamespace,
  type EndgameReviewCheckpointId,
} from "../../src/review/endgame-checkpoints";
import { SAVE_NAMESPACE, ENDGAME_SAVE_NAMESPACE, SAVE_SCHEMA_VERSION } from "../../src/save/types";
import { validateSave } from "../../src/save/validate";

const NOW = 1_800_000_000_000;

function build(id: EndgameReviewCheckpointId) {
  return buildEndgameReviewSave(id, NOW);
}

describe("endgame review checkpoints (CARD-06)", () => {
  it("has exactly 13 checkpoints A-M", () => {
    expect(ENDGAME_REVIEW_CHECKPOINTS).toHaveLength(13);
    const codes = ENDGAME_REVIEW_CHECKPOINTS.map((c) => c.code);
    expect(codes).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"]);
  });

  it("all checkpoints normalize as valid current-schema saves", () => {
    for (const cp of ENDGAME_REVIEW_CHECKPOINTS) {
      const save = build(cp.id);
      const result = validateSave(save);
      expect(result.ok, cp.id).toBe(true);
      if (result.ok) expect(result.data.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    }
  });

  it("all checkpoints pass their invariants", () => {
    for (const cp of ENDGAME_REVIEW_CHECKPOINTS) {
      const save = build(cp.id);
      expect(endgameReviewInvariantIssues(save, cp.id), cp.id).toEqual([]);
    }
  });

  it("uses isolated endgame namespace, not formal or review-v2", () => {
    const namespaces = ENDGAME_REVIEW_CHECKPOINTS.map((c) => endgameReviewStorageNamespace(c.id));
    expect(new Set(namespaces).size).toBe(ENDGAME_REVIEW_CHECKPOINTS.length);
    for (const ns of namespaces) {
      expect(ns.startsWith(`${ENDGAME_REVIEW_STORAGE_PREFIX}:`)).toBe(true);
      expect(ns).not.toBe(SAVE_NAMESPACE);
      expect(ns).not.toBe(ENDGAME_SAVE_NAMESPACE);
      expect(ns).not.toContain("review_v2");
    }
  });

  it("progression: core count and multipliers follow the frozen order", () => {
    const fresh = build("endgame_new_run");
    expect(fresh.singularity?.coresClaimed).toEqual([]);
    expect(fresh.permanentMultiplier).toBe(1);

    const r2 = build("endgame_r2_start");
    expect(r2.singularity?.coresClaimed).toEqual(["core_1"]);
    expect(r2.permanentMultiplier).toBe(1.5);

    const r3 = build("endgame_r3_start");
    expect(r3.singularity?.coresClaimed).toEqual(["core_1", "core_2"]);
    expect(r3.permanentMultiplier).toBe(2.0);

    const reveal = build("endgame_space_reveal");
    expect(reveal.singularity?.coresClaimed).toEqual(["core_1", "core_2", "core_3"]);
    expect(reveal.permanentMultiplier).toBe(2.0);
    expect(reveal.singularity?.spacePlanRevealed).toBe(true);
    expect(reveal.singularity?.spacePlanStarted).toBe(false);
  });

  it("stage4/stage5/perpetual checkpoints carry full valid stage state", () => {
    const s4 = build("endgame_stage4_mid");
    expect(s4.singularity?.spacePlanStarted).toBe(true);
    expect(s4.singularity?.stage4?.entered).toBe(true);
    expect(s4.singularity?.stage4?.nodes).toContain("leo_node");
    expect(s4.singularity?.stage5).toBeNull();

    const s5 = build("endgame_stage5_dyson_almost");
    expect(s5.singularity?.stage4?.completedProjectIds).toContain("moon_network");
    expect(s5.singularity?.stage5?.entered).toBe(true);
    expect(s5.singularity?.stage5?.nodes).toContain("solar_array");
    expect(s5.singularity?.stage5?.activeProjectId).toBe("dyson_sphere");

    const perp = build("endgame_perpetual");
    expect(perp.singularity?.stage5?.storyCompleted).toBe(true);
    expect(perp.singularity?.stage5?.completedProjectIds).toContain("dyson_sphere");
    expect(perp.singularity?.perpetual).not.toBeNull();
  });
});
