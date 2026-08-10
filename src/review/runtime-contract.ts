import type { SaveData } from "../save/types";

export const REVIEW_EXPERIENCE_SPEEDS = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const;
export type ReviewExperienceSpeed = (typeof REVIEW_EXPERIENCE_SPEEDS)[number];

export function resolveReviewSpeed(params: URLSearchParams): number {
  const requested = Number(params.get("speed") ?? "1");
  if (params.get("qa") === "1") {
    return Number.isFinite(requested) ? Math.min(256, Math.max(1, requested)) : 1;
  }
  if (params.get("debug") === "1" && REVIEW_EXPERIENCE_SPEEDS.includes(requested as ReviewExperienceSpeed)) {
    return requested;
  }
  return 1;
}

export interface ReviewRuntimeOverride {
  kind: "founder-review-v2";
  checkpointId: string;
  checkpointLabel: string;
  namespace: string;
  initialSave: SaveData;
  speed: number;
  /** 自然流程允许导入其他 saveId；刷新时不得因身份不同覆盖刚导入的合法存档。 */
  preserveImportedSave?: boolean;
}

export function shouldSeedReviewSave(
  existingSaveId: string | null | undefined,
  initialSaveId: string,
  preserveImportedSave: boolean,
): boolean {
  return preserveImportedSave
    ? existingSaveId == null
    : existingSaveId !== initialSaveId;
}

export function shouldMigrateExistingReviewSave(
  preserveImportedSave: boolean,
  singularity: SaveData["singularity"],
): boolean {
  return preserveImportedSave && singularity == null;
}

export interface ReviewRuntimeProbe {
  checkpointId: string;
  namespace: string;
  speed: number;
  getState(): SaveData;
  getMetrics(): {
    fullRenderCount: number;
    partialPatchCount: number;
    orderCompletionCount: number;
    rootReplacementCount: number;
  };
  save(): { ok: boolean; error?: string };
}

declare global {
  interface Window {
    __CT_REVIEW_RUNTIME_OVERRIDE__?: ReviewRuntimeOverride;
    __CT_REVIEW_RUNTIME_PROBE__?: ReviewRuntimeProbe;
  }
}

export {};
