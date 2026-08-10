import {
  buildReviewSave,
  isReviewCheckpointId,
  reviewCheckpointById,
  type ReviewCheckpointId,
} from "../../../src/review/checkpoints";
import {
  buildEndgameReviewSave,
  endgameReviewCheckpointById,
  isEndgameReviewCheckpointId,
  type EndgameReviewCheckpointId,
} from "../../../src/review/endgame-checkpoints";
import type { ReviewRuntimeOverride } from "../../../src/review/runtime-contract";

const params = new URLSearchParams(window.location.search);
const checkpoint = params.get("checkpoint") ?? "stage3_entry";
const speed = Math.min(256, Math.max(1, Number(params.get("speed") ?? "1") || 1));
const run = (params.get("run") ?? "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "default";
const anonymousSaveId = (params.get("save") ?? "7f3a9c2e").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "7f3a9c2e";
const nowMs = Date.now();

let initialSave;
let label: string;

if (isReviewCheckpointId(checkpoint)) {
  initialSave = buildReviewSave(checkpoint as ReviewCheckpointId, nowMs);
  label = reviewCheckpointById(checkpoint as ReviewCheckpointId).label;
} else if (isEndgameReviewCheckpointId(checkpoint)) {
  initialSave = buildEndgameReviewSave(checkpoint as EndgameReviewCheckpointId, nowMs);
  label = endgameReviewCheckpointById(checkpoint as EndgameReviewCheckpointId).label;
} else {
  throw new Error(`Unknown capture checkpoint: ${checkpoint}`);
}

initialSave.saveId = anonymousSaveId;
document.body.dataset.captureMode = params.get("mode") === "video" ? "video" : "screenshot";

if (document.body.dataset.captureMode === "video") {
  const captureDesignWidth = 430;
  const captureMaxZoom = 3.1;
  const syncCaptureZoom = () => {
    const safeZoom = Math.min(captureMaxZoom, document.documentElement.clientWidth / captureDesignWidth);
    document.documentElement.style.setProperty("--capture-video-zoom", String(safeZoom));
  };

  syncCaptureZoom();
  window.addEventListener("resize", syncCaptureZoom);
  new ResizeObserver(syncCaptureZoom).observe(document.documentElement);
}

const override: ReviewRuntimeOverride = {
  kind: "founder-review-v2",
  checkpointId: checkpoint,
  checkpointLabel: label,
  namespace: `compute_tycoon_h5_store_capture_v1:${checkpoint}:${run}`,
  initialSave,
  speed,
  preserveImportedSave: false,
};

window.__CT_REVIEW_RUNTIME_OVERRIDE__ = override;
await import("../../../src/app/main");
