import type { ChronicleMilestoneId, ChronicleState, SaveData } from "../save/types";

/**
 * 银河历程册只是一份随账号云档同步的个人经历记录：它不提交到平台榜，
 * 也不裁决设备时间是否可信。为了避免回拨把已取得的记录写回过去，所有
 * 新时间戳都以已经观察到的最高设备时间为下限。
 */
const ORDERED_MILESTONES: ChronicleMilestoneId[] = [
  "first_model",
  "first_server",
  "first_iteration",
  "earth_complete",
  "stage4_entered",
  "stage5_entered",
  "dyson_complete",
];

function finiteFloor(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function chronicle(state: SaveData): ChronicleState {
  const current = state.chronicle;
  if (current && typeof current === "object") return current;
  const now = Math.max(finiteFloor(state.createdAtMs), finiteFloor(state.updatedAtMs));
  state.chronicle = {
    maxObservedDeviceAtMs: now,
    clockAdjustmentCount: 0,
    lastClockAdjustmentAtMs: 0,
    milestones: {},
  };
  return state.chronicle;
}

function milestoneTimestamp(state: SaveData, id: ChronicleMilestoneId, observedAtMs: number): number | null {
  switch (id) {
    case "first_model":
      return state.modelProgress ? observedAtMs : null;
    case "first_server":
      return state.serverCount > 0 ? observedAtMs : null;
    case "first_iteration":
      return state.technologyIterationCount > 0 ? observedAtMs : null;
    case "earth_complete":
      return state.singularity?.spacePlanRevealed
        ? finiteFloor(state.singularity.spacePlanRevealedAtMs) || observedAtMs
        : null;
    case "stage4_entered":
      return state.singularity?.stage4?.entered
        ? finiteFloor(state.singularity.stage4.enteredAtMs) || observedAtMs
        : null;
    case "stage5_entered":
      return state.singularity?.stage5?.entered
        ? finiteFloor(state.singularity.stage5.enteredAtMs) || observedAtMs
        : null;
    case "dyson_complete": {
      const stage5 = state.singularity?.stage5;
      if (!stage5?.storyCompleted && !state.singularity?.perpetual) return null;
      return finiteFloor(stage5?.legendaryArchive?.completedAtMs)
        || finiteFloor(state.singularity?.perpetual?.unlockedAtMs)
        || observedAtMs;
    }
  }
}

/** 记录刚刚达成的里程碑；重复调用不会改变既有时间。 */
export function recordChronicleMilestones(state: SaveData, observedAtMs: number): boolean {
  const current = chronicle(state);
  const observed = Math.max(0, finiteFloor(observedAtMs));
  let changed = false;
  let floor = current.maxObservedDeviceAtMs;
  for (const id of ORDERED_MILESTONES) {
    const existing = finiteFloor(current.milestones[id]);
    if (existing > 0) {
      floor = Math.max(floor, existing);
      continue;
    }
    const candidate = milestoneTimestamp(state, id, observed);
    if (candidate == null) continue;
    const recordedAtMs = Math.max(floor, finiteFloor(candidate));
    current.milestones[id] = recordedAtMs;
    floor = recordedAtMs;
    changed = true;
  }
  if (changed && floor > current.maxObservedDeviceAtMs) {
    current.maxObservedDeviceAtMs = floor;
    changed = true;
  }
  return changed;
}

/**
 * 仅记录活跃会话里被 OffsetClock 发现的回拨。该记录是中性提示，不能作为
 * 反作弊或封禁依据；真实服务器时间/权威校验仍需要独立后端能力。
 */
export function noteChronicleClockAdjustment(state: SaveData, observedAtMs: number): boolean {
  const current = chronicle(state);
  const atMs = Math.max(current.maxObservedDeviceAtMs, finiteFloor(observedAtMs));
  current.clockAdjustmentCount = Math.max(0, Math.floor(current.clockAdjustmentCount)) + 1;
  current.lastClockAdjustmentAtMs = Math.max(current.lastClockAdjustmentAtMs, atMs);
  current.maxObservedDeviceAtMs = Math.max(current.maxObservedDeviceAtMs, atMs);
  return true;
}

export const CHRONICLE_MILESTONE_IDS = ORDERED_MILESTONES;
