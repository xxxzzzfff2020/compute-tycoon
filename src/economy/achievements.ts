// 成就定义与达成判定：天赋点的唯一新来源（负责人验收反馈：成就领取天赋点）。
// 判定只读 SaveData；领取动作写入 growth.talent.claimedAchievementIds（见 incremental-growth）。
import Decimal from "decimal.js";
import type { SaveData } from "../save/types";
import { stage3TotalCompute } from "./stage3";
import { ownedNodes, STAGE4_NODES, stage4Entered } from "./stage4";
import { perpetualActive, stage5Entered } from "./stage5";

export interface AchievementDef {
  id: string;
  nameKey: string;
  descriptionKey: string;
}

export interface AchievementState {
  id: string;
  achieved: boolean;
  achievedAtMs: number;
}

/** 每个成就领取后奖励的天赋点数（与 TALENT_POINT_CAP 合计 15 点一一对应）。 */
export const ACHIEVEMENT_TALENT_POINTS = 1;

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "first_model", nameKey: "ach.firstModel.name", descriptionKey: "ach.firstModel.desc" },
  { id: "first_order", nameKey: "ach.firstOrder.name", descriptionKey: "ach.firstOrder.desc" },
  { id: "first_server", nameKey: "ach.firstServer.name", descriptionKey: "ach.firstServer.desc" },
  { id: "eight_servers", nameKey: "ach.eightServers.name", descriptionKey: "ach.eightServers.desc" },
  { id: "first_room", nameKey: "ach.firstRoom.name", descriptionKey: "ach.firstRoom.desc" },
  { id: "r1", nameKey: "ach.r1.name", descriptionKey: "ach.r1.desc" },
  { id: "r2", nameKey: "ach.r2.name", descriptionKey: "ach.r2.desc" },
  { id: "r3", nameKey: "ach.r3.name", descriptionKey: "ach.r3.desc" },
  { id: "three_cores", nameKey: "ach.threeCores.name", descriptionKey: "ach.threeCores.desc" },
  { id: "stage4", nameKey: "ach.stage4.name", descriptionKey: "ach.stage4.desc" },
  { id: "four_lunar_nodes", nameKey: "ach.fourLunarNodes.name", descriptionKey: "ach.fourLunarNodes.desc" },
  { id: "stage5", nameKey: "ach.stage5.name", descriptionKey: "ach.stage5.desc" },
  { id: "dyson", nameKey: "ach.dyson.name", descriptionKey: "ach.dyson.desc" },
  { id: "compute_scale", nameKey: "ach.computeScale.name", descriptionKey: "ach.computeScale.desc" },
  { id: "income_scale", nameKey: "ach.incomeScale.name", descriptionKey: "ach.incomeScale.desc" },
];

/** 成就 id → 达成状态（条件全部来自正式 SaveData，不引入第二套事实源）。 */
export function evaluateAchievements(state: SaveData): AchievementState[] {
  const claimedCoreIds = new Set(state.singularity?.coresClaimed ?? []);
  const s4Entered = stage4Entered(state);
  const s5Entered = stage5Entered(state);
  const s4NodeCount = ownedNodes(state).length;
  const firstModelAt = Object.values(state.modelArchive ?? {}).reduce(
    (min, entry) => entry.firstAcquiredAtMs > 0 ? Math.min(min, entry.firstAcquiredAtMs) : min,
    Number.POSITIVE_INFINITY,
  );
  const reached: Record<string, { achieved: boolean; achievedAtMs: number }> = {
    first_model: { achieved: state.ownedModelIds.length > 0, achievedAtMs: Number.isFinite(firstModelAt) ? firstModelAt : 0 },
    first_order: { achieved: state.completedOrders > 0 || new Decimal(state.lifetimeIncome).gt(0), achievedAtMs: 0 },
    first_server: { achieved: state.workshop.firstServerAwarded || state.serverCount > 0, achievedAtMs: 0 },
    eight_servers: { achieved: state.serverCount >= 8 || state.stage2.settlementShown, achievedAtMs: state.stage2.completedAtMs },
    first_room: { achieved: state.stage3?.entered === true, achievedAtMs: state.stage3.enteredAtMs },
    r1: { achieved: claimedCoreIds.has("core_1"), achievedAtMs: 0 },
    r2: { achieved: claimedCoreIds.has("core_2"), achievedAtMs: 0 },
    r3: { achieved: claimedCoreIds.has("core_3"), achievedAtMs: state.singularity?.spacePlanRevealedAtMs ?? 0 },
    three_cores: { achieved: claimedCoreIds.size >= 3, achievedAtMs: state.singularity?.spacePlanRevealedAtMs ?? 0 },
    stage4: { achieved: s4Entered, achievedAtMs: state.singularity?.stage4?.enteredAtMs ?? 0 },
    four_lunar_nodes: { achieved: s4NodeCount >= STAGE4_NODES.length, achievedAtMs: 0 },
    stage5: { achieved: s5Entered, achievedAtMs: state.singularity?.stage5?.enteredAtMs ?? 0 },
    dyson: { achieved: perpetualActive(state), achievedAtMs: state.singularity?.stage5?.legendaryArchive?.completedAtMs ?? 0 },
    compute_scale: { achieved: stage3TotalCompute(state).gte(1e6), achievedAtMs: 0 },
    income_scale: { achieved: new Decimal(state.highestIncomePerSecond).gte(1e9), achievedAtMs: 0 },
  };
  return ACHIEVEMENTS.map((definition) => {
    const item = reached[definition.id];
    return { id: definition.id, achieved: item.achieved, achievedAtMs: item.achievedAtMs };
  });
}

/** 当前有效阶段编号（1–5；4/5 对应地月/戴森纪元），供成就达成记录使用。 */
export function achievementStageValue(state: SaveData): number {
  if (stage5Entered(state)) return 5;
  if (stage4Entered(state)) return 4;
  return state.stage;
}

/** 当前可领取（已达成且未领取）的成就数量。 */
export function claimableAchievementCount(state: SaveData): number {
  const claimed = new Set(state.growth.talent.claimedAchievementIds);
  return evaluateAchievements(state).filter((item) => item.achieved && !claimed.has(item.id)).length;
}
