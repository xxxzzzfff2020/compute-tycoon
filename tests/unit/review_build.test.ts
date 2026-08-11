import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/app/session";
import {
  REVIEW_CHECKPOINTS,
  REVIEW_STORAGE_PREFIX,
  buildReviewSave,
  reviewCheckpointInvariantIssues,
  reviewStorageNamespace,
  type ReviewCheckpointId,
} from "../../src/review/checkpoints";
import { SaveRepository } from "../../src/save/repository";
import { LocalStorageSaveStorage, MemorySaveStorage, freshSaveData } from "../../src/save/storage";
import { SAVE_NAMESPACE } from "../../src/save/types";
import { validateSave } from "../../src/save/validate";
import {
  REVIEW_EXPERIENCE_SPEEDS,
  resolveReviewSpeed,
} from "../../src/review/runtime-contract";
import {
  consumeReviewResetMarker,
  REVIEW_RESET_MESSAGE,
  resetReviewCheckpoint,
} from "../../src/review/reset";

const NOW = 1_800_000_000_000;
const root = fileURLToPath(new URL("../../", import.meta.url));

class FakeWebStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function build(id: ReviewCheckpointId) {
  return buildReviewSave(id, NOW);
}

describe("founder review build contract", () => {
  it("review_checkpoint_schema_valid", () => {
    expect(REVIEW_CHECKPOINTS).toHaveLength(14);
    for (const checkpoint of REVIEW_CHECKPOINTS) {
      const save = build(checkpoint.id);
      const result = validateSave(save);
      expect(result.ok, checkpoint.id).toBe(true);
      if (result.ok) expect(result.data.schemaVersion).toBe(6);
    }
  });

  it("review_checkpoint_invariants_valid", () => {
    for (const checkpoint of REVIEW_CHECKPOINTS) {
      const save = build(checkpoint.id);
      expect(reviewCheckpointInvariantIssues(save, checkpoint.id), checkpoint.id).toEqual([]);
    }
  });

  it("review_checkpoint_uses_isolated_storage", () => {
    const namespaces = REVIEW_CHECKPOINTS.map((checkpoint) => reviewStorageNamespace(checkpoint.id));
    expect(new Set(namespaces).size).toBe(REVIEW_CHECKPOINTS.length);
    for (const namespace of namespaces) {
      expect(namespace.startsWith(`${REVIEW_STORAGE_PREFIX}:`)).toBe(true);
      expect(namespace).not.toBe(SAVE_NAMESPACE);
      expect(namespace).not.toBe("compute_tycoon_h5_dev_v1");
      expect(namespace).not.toBe("compute_tycoon_h5_endgame_review_v1");
    }
  });

  it("review_reset_tears_down_before_removing_only_the_current_namespace", () => {
    const id = "room2_almost" as const;
    const currentNamespace = reviewStorageNamespace(id);
    const preservedReviewNamespace = reviewStorageNamespace("stage3_entry");
    const keys = new Set([currentNamespace, preservedReviewNamespace, SAVE_NAMESPACE]);
    const events: string[] = [];
    let navigatedUrl = "";

    resetReviewCheckpoint(id, currentNamespace, {
      search: "?checkpoint=room2_almost&debug=1&speed=32",
      pathname: "/review.html",
      hash: "#checkpoint",
      teardown: () => events.push("teardown"),
      removeItem: (key) => {
        events.push(`remove:${key}`);
        keys.delete(key);
      },
      navigate: (url) => {
        events.push("navigate");
        navigatedUrl = url;
      },
    });

    expect(events).toEqual(["teardown", `remove:${currentNamespace}`, "navigate"]);
    expect(keys.has(currentNamespace)).toBe(false);
    expect(keys.has(preservedReviewNamespace)).toBe(true);
    expect(keys.has(SAVE_NAMESPACE)).toBe(true);

    const target = new URL(navigatedUrl, "https://review.test");
    expect(target.searchParams.get("checkpoint")).toBe(id);
    expect(target.searchParams.get("debug")).toBe("1");
    expect(target.searchParams.get("speed")).toBe("32");
    expect(target.searchParams.get("reviewReset")).toBe("1");
    expect(target.hash).toBe("#checkpoint");
  });

  it("review_reset_consumes_one_shot_feedback_without_dropping_debug_or_speed", () => {
    let cleanUrl = "";
    const shown = consumeReviewResetMarker({
      search: "?checkpoint=room2_almost&debug=1&speed=32&reviewReset=1",
      pathname: "/review.html",
      hash: "#checkpoint",
      replaceState: (url) => {
        cleanUrl = url;
      },
    });

    expect(shown).toBe(true);
    expect(REVIEW_RESET_MESSAGE).toBe("检查点已重置");
    const clean = new URL(cleanUrl, "https://review.test");
    expect(clean.searchParams.get("checkpoint")).toBe("room2_almost");
    expect(clean.searchParams.get("debug")).toBe("1");
    expect(clean.searchParams.get("speed")).toBe("32");
    expect(clean.searchParams.has("reviewReset")).toBe(false);
    expect(clean.hash).toBe("#checkpoint");
  });

  it("review_checkpoint_refresh_restore", () => {
    const backing = new FakeWebStorage();
    const namespace = reviewStorageNamespace("room2_almost");
    const storage = new LocalStorageSaveStorage(namespace, undefined, backing);
    const seeded = build("room2_almost");
    expect(storage.save(seeded)).toBe(true);

    const firstRepository = new SaveRepository({ storage, nowMs: () => NOW });
    const first = firstRepository.load().data;
    first.money = Number(first.money) + 12345;
    const saved = firstRepository.save(first);
    expect(saved.ok).toBe(true);

    const refreshedRepository = new SaveRepository({
      storage: new LocalStorageSaveStorage(namespace, undefined, backing),
      nowMs: () => NOW,
    });
    const refreshed = refreshedRepository.load().data;
    expect(refreshed.money).toBe(saved.saved.money);
    expect(refreshed.saveId).toBe("review-v2-room2_almost");
    expect(refreshed.stage3.machineRooms).toHaveLength(1);
  });

  it("review_checkpoint_no_duplicate_rewards", () => {
    const roomStorage = new MemorySaveStorage();
    roomStorage.save(build("room2_almost"));
    const roomSession = new GameSession({
      repository: new SaveRepository({ storage: roomStorage, nowMs: () => NOW }),
      clock: { now: () => NOW },
    });
    expect(roomSession.commissionRoom(2).ok).toBe(true);
    expect(roomSession.commissionRoom(2).ok).toBe(false);
    expect(roomSession.getState().stage3.machineRooms.filter((room) => room.index === 2)).toHaveLength(1);

    const iterationStorage = new MemorySaveStorage();
    iterationStorage.save(build("iteration_ready"));
    const iterationSession = new GameSession({
      repository: new SaveRepository({ storage: iterationStorage, nowMs: () => NOW }),
      clock: { now: () => NOW },
    });
    expect(iterationSession.prestige().ok).toBe(true);
    expect(iterationSession.prestige().ok).toBe(false);
    expect(iterationSession.getState().technologyIterationCount).toBe(1);
  });

  it("review_mode_not_visible_in_production", () => {
    const productionHtml = readFileSync(`${root}index.html`, "utf8");
    const productionConfig = readFileSync(`${root}vite.config.ts`, "utf8");
    expect(productionHtml).toContain("/src/app/main.ts");
    expect(productionHtml).not.toContain("/src/review/main.ts");
    expect(productionHtml).not.toContain("checkpoint=");
    expect(productionConfig).not.toContain("compute-tycoon-founder-review-entry");
  });

  it("formal command router preserves parameterized cosmic node actions", () => {
    const mainSource = readFileSync(`${root}src/app/main.ts`, "utf8");
    expect(mainSource).toContain('command.startsWith("buy_node:")');
    expect(mainSource).toContain('session.buyNode(command.slice("buy_node:".length))');
    expect(mainSource).toContain('command.startsWith("buy_stage5_node:")');
    expect(mainSource).toContain('session.buyStage5Node(command.slice("buy_stage5_node:".length))');
  });

  it("model research regression is review-only and commit label is build-time sourced", () => {
    expect(REVIEW_CHECKPOINTS.some((checkpoint) => checkpoint.id === "model_research_regression")).toBe(true);
    const reviewMain = readFileSync(`${root}src/review/main.ts`, "utf8");
    expect(reviewMain).toContain("VITE_REVIEW_COMMIT");
    expect(reviewMain).not.toContain("a09810b8e4903d9a39b7cfe3126e5d8064306157");
    expect(reviewMain).toContain("teardownActiveApp = appMain.teardown");
    expect(reviewMain).toContain("resetReviewCheckpoint");
    expect(reviewMain).not.toContain("window.localStorage.removeItem(namespace)");
    expect(reviewMain).not.toContain("window.location.reload()");
  });

  it("review_mode_cannot_modify_production_save", () => {
    const backing = new FakeWebStorage();
    const productionStorage = new LocalStorageSaveStorage(SAVE_NAMESPACE, undefined, backing);
    const productionSave = freshSaveData(NOW);
    productionSave.money = 777;
    expect(productionStorage.save(productionSave)).toBe(true);

    const checkpoint = "iteration_ready" as const;
    const reviewStorage = new LocalStorageSaveStorage(reviewStorageNamespace(checkpoint), undefined, backing);
    reviewStorage.save(build(checkpoint));
    const session = new GameSession({
      repository: new SaveRepository({ storage: reviewStorage, nowMs: () => NOW }),
      clock: { now: () => NOW },
    });
    expect(session.prestige().ok).toBe(true);
    session.reset();

    expect(productionStorage.load()?.money).toBe(777);
    expect(productionStorage.load()?.saveId).toBe(productionSave.saveId);
    expect(backing.getItem(reviewStorageNamespace(checkpoint))).not.toBeNull();
  });

  it("packages production and review assets in the Sites client binding directory", () => {
    const packageJson = JSON.parse(readFileSync(`${root}package.json`, "utf8")) as {
      scripts: Record<string, string>;
    };
    const sitesPreparation = readFileSync(`${root}scripts/prepare-sites.mjs`, "utf8");
    const reviewFinalizer = readFileSync(`${root}scripts/finalize-review-build.mjs`, "utf8");

    expect(packageJson.scripts["build:sites"]).toContain("scripts/clean-sites-build.mjs");
    expect(packageJson.scripts["build:sites"]).toContain("--outDir dist/client");
    expect(packageJson.scripts["build:sites:review"]).toContain("scripts/clean-sites-build.mjs");
    expect(packageJson.scripts["build:sites:review"]).toContain("--outDir dist/client");
    expect(packageJson.scripts["build:sites:review"]).toContain("finalize-review-build.mjs dist/client");
    expect(sitesPreparation).toContain("dist/client/index.html");
    expect(sitesPreparation).toContain("dist/server/index.js");
    expect(reviewFinalizer).toContain('"responsive-probe.html"');
    expect(reviewFinalizer).toContain("const allowed=[320,350,390,430]");
  });

  it("offers bounded 1-256x human debug speeds while retaining isolated QA acceleration", () => {
    expect(REVIEW_EXPERIENCE_SPEEDS).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256]);
    expect(resolveReviewSpeed(new URLSearchParams("debug=1&speed=1"))).toBe(1);
    expect(resolveReviewSpeed(new URLSearchParams("debug=1&speed=32"))).toBe(32);
    expect(resolveReviewSpeed(new URLSearchParams("debug=1&speed=256"))).toBe(256);
    expect(resolveReviewSpeed(new URLSearchParams("debug=1&speed=3"))).toBe(1);
    expect(resolveReviewSpeed(new URLSearchParams("speed=32"))).toBe(1);
    expect(resolveReviewSpeed(new URLSearchParams("qa=1&speed=240"))).toBe(240);
    expect(resolveReviewSpeed(new URLSearchParams("qa=1&speed=999"))).toBe(256);
  });

  it("ships the bounded review-ready visual system without media dependencies", () => {
    const css = readFileSync(`${root}src/styles/main.css`, "utf8");
    const renderSource = readFileSync(`${root}src/ui/render.ts`, "utf8");

    for (const selector of [
      '.app[data-stage="1"]',
      '.app[data-stage="2"]',
      '.app[data-stage="3"]',
      ".server-chip.owned",
      ".infra-card",
      ".room-card.owned",
      ".flagship-card.available",
      ".archive-card",
      '#section-prestige[data-state="ready"]',
      "@media (prefers-reduced-motion: reduce)",
    ]) {
      expect(css).toContain(selector);
    }
    expect(renderSource).toContain("root.dataset.stage");
    expect(renderSource).toContain("root.dataset.iteration");
    expect(css).not.toContain("url(");
  });

  it("keeps the full current-money header inside the 320–430px portrait shell", () => {
    const css = readFileSync(`${root}src/styles/main.css`, "utf8");
    expect(css).toMatch(/#app\s*\{\s*max-width:\s*430px;/);
    expect(css).toContain("max-width: 100%;");
    expect(css).toContain("overflow-wrap: anywhere;");
    expect(css).toContain("@media (max-width: 350px)");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
  });
});
