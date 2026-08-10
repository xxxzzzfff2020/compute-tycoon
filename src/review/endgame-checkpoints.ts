// CARD-06 终局集中复验检查点（A–M，独立隔离命名空间 compute_tycoon_h5_endgame_review_v1）。
// 不修改正式 v3、Review v2 检查点 A–N 与正式存档；每个检查点是合法可刷新恢复的真实终局档。
import { MODELS } from "../data/content";
import { ERA_PROJECTS as DATA_ERA_PROJECTS } from "../data/stage3";
import {
  SINGULARITY_CORE_IDS,
  SINGULARITY_MULTIPLIERS,
  MAX_ITERATIONS,
  eraProjectIdForRound,
} from "../economy/singularity";
import { STAGE4_NODES, STAGE4_FINAL_PROJECT } from "../economy/stage4";
import { STAGE5_NODES, STAGE5_FINAL_PROJECT } from "../economy/stage5";
import { freshSaveData } from "../save/storage";
import type { SaveData } from "../save/types";
import { validateSave } from "../save/validate";

export const ENDGAME_REVIEW_STORAGE_PREFIX = "compute_tycoon_h5_endgame_review_v1";

export const ENDGAME_REVIEW_CHECKPOINTS = [
  { code: "A", id: "endgame_new_run", label: "终局新档 R1 起点", description: "隔离终局档从零开始，验证奇点核心 0/3 与第一轮经营。", focus: "终局入口、核心徽标、R1 节奏" },
  { code: "B", id: "endgame_r1_era_almost", label: "R1 时代工程前", description: "旗舰 project_3 完成、区域算力协作网即将开启。", focus: "R1 时代工程解锁与投入感" },
  { code: "C", id: "endgame_r1_core_ready", label: "R1 核心 1 可领取", description: "区域算力协作网完成，核心 1 手动领取（exactly-once）。", focus: "核心领取、奖励 ×1.5 与批量购买" },
  { code: "D", id: "endgame_r2_start", label: "R2 第二轮起点", description: "执行第一次迭代进入 R2，永久倍率 ×1.5。", focus: "迭代后重置、R2 加速与峰值恢复" },
  { code: "E", id: "endgame_r2_era_almost", label: "R2 时代工程前", description: "全球算力骨干环即将开启（核心 1 已领）。", focus: "R2 时代工程、第二轮高潮" },
  { code: "F", id: "endgame_r2_core_ready", label: "R2 核心 2 可领取", description: "全球算力骨干环完成，核心 2 手动领取（×2.0）。", focus: "核心 2、流程压缩与 R3 解锁" },
  { code: "G", id: "endgame_r3_start", label: "R3 第三轮起点", description: "执行第二次迭代进入 R3，永久倍率 ×2.0。", focus: "R3 加速、终局高潮铺垫" },
  { code: "H", id: "endgame_r3_era_almost", label: "R3 时代工程前", description: "行星算力统一场即将开启（核心 2 已领）。", focus: "R3 时代工程、完整成长与昂贵目标" },
  { code: "I", id: "endgame_r3_core_ready", label: "R3 核心 3 可领取", description: "行星算力统一场完成，核心 3 手动领取（×2.0）。", focus: "核心 3、地外算力计划揭示" },
  { code: "J", id: "endgame_space_reveal", label: "地外算力计划揭示", description: "第三次迭代转化为揭示，不执行普通清档。", focus: "惊喜事件、全屏反馈与手动启动" },
  { code: "K", id: "endgame_stage4_mid", label: "Stage 4 地月中期", description: "地月算力网运行中，首购后节点升级与超级工程推进。", focus: "尺度跃迁、地月节点、90–150min 节奏" },
  { code: "L", id: "endgame_stage5_dyson_almost", label: "Stage 5 戴森球冲刺", description: "戴森算力球进行中，恒星收入推进最终巨构。", focus: "Stage 5 高潮、戴森球、120–240min 节奏" },
  { code: "M", id: "endgame_perpetual", label: "永续增长模式", description: "戴森算力球完成，主线结局与永续模式解锁。", focus: "结局反馈、永续边界、手动重置保留" },
] as const;

export type EndgameReviewCheckpointId = (typeof ENDGAME_REVIEW_CHECKPOINTS)[number]["id"];

export function isEndgameReviewCheckpointId(value: string | null): value is EndgameReviewCheckpointId {
  return ENDGAME_REVIEW_CHECKPOINTS.some((c) => c.id === value);
}

export function endgameReviewCheckpointById(id: EndgameReviewCheckpointId) {
  return ENDGAME_REVIEW_CHECKPOINTS.find((c) => c.id === id)!;
}

export function endgameReviewStorageNamespace(id: EndgameReviewCheckpointId): string {
  return `${ENDGAME_REVIEW_STORAGE_PREFIX}:${id}`;
}

// ---------- 种子构造 ----------

function seedEndgameBase(state: SaveData, nowMs: number, iterations: number): void {
  state.saveId = `endgame-review-${nowMs}`;
  state.singularity = {
    mode: "endgame",
    coresClaimed: [],
    spacePlanRevealed: false,
    claimedProjectIds: [],
    spacePlanRevealedAtMs: 0,
    spacePlanStarted: false,
    stage4: null,
    stage5: null,
    perpetual: null,
  };
  state.ownedModelIds = MODELS.map((m) => m.id);
  state.modelArchive = Object.fromEntries(MODELS.map((m, i) => [m.id, {
    modelId: m.id,
    level: 2 + (i % 3),
    firstAcquiredAtMs: nowMs - (i + 1) * 60_000,
    researchCount: 2 + (i % 3),
    lifetimeTrainingCount: 3 + i,
    lifetimeContribution: 100_000 * (i + 1),
  }]));
  state.modelProgress = { modelId: "codex", level: 3, trainingCount: 2 };
  state.modelResearch = { progress: 40, stage2Draws: 4 };
  state.automation = true;
  state.serverCount = 8;
  state.serverPower = 16;
  state.rentalCompute = { active: false, units: 0, unitCostPerSec: 0 };
  state.stage = 3;
  state.workshop.level = 10;
  state.workshop.experience = 300;
  state.workshop.experienceToNextLevel = 500;
  state.workshop.firstServerAwarded = true;
  state.stage2 = { settlementShown: true, completedAtMs: nowMs - 60_000, stageIncome: 40_000_000 };
  state.stage3 = {
    ...state.stage3,
    entered: true,
    enteredAtMs: nowMs - 60_000,
    infrastructure: { power: 8, computeCards: 8, optical: 8, storage: 8 },
    machineRooms: [
      { index: 1, id: "room_1", name: "era.room1.name", commissionedAtMs: nowMs - 45_000 },
      { index: 2, id: "room_2", name: "era.room2.name", commissionedAtMs: nowMs - 30_000 },
      { index: 3, id: "room_3", name: "era.room3.name", commissionedAtMs: nowMs - 15_000 },
    ],
    flagship: {
      activeId: null,
      progress: 0,
      startedAtMs: 0,
      completedIds: [],
      pendingReward: null,
    },
    blueprint: {
      owned: ["bp_general", "bp_gpu", "bp_interconnect"],
      active: null,
      levels: { bp_general: 1, bp_gpu: 1, bp_interconnect: 1 },
      chosenMilestones: [],
    },
    projectProgress: 0,
  };
  state.technologyIterationCount = iterations;
  state.permanentMultiplier = SINGULARITY_MULTIPLIERS[Math.min(iterations, MAX_ITERATIONS) - 1] ?? 1;
  state.lastTickAtMs = nowMs;
}

function completeEraProject(state: SaveData, round: 1 | 2 | 3): void {
  const id = eraProjectIdForRound(round);
  const def = DATA_ERA_PROJECTS.find((p) => p.id === id);
  if (!state.stage3.flagship.completedIds.includes(id)) {
    state.stage3.flagship.completedIds.push(id);
  }
  state.stage3.flagship.pendingReward = null;
  state.stage3.flagship.activeId = null;
  if (def) state.stage3.projectProgress = def.progressRequired;
}

function claimCoreState(state: SaveData, coreIndex: number): void {
  const id = SINGULARITY_CORE_IDS[coreIndex - 1];
  if (!(state.singularity!.coresClaimed ?? []).includes(id)) {
    state.singularity!.coresClaimed.push(id);
  }
}

function completeThroughRound(state: SaveData, round: 1 | 2 | 3): void {
  const rounds: Array<1 | 2 | 3> = [1, 2, 3].filter((r) => r <= round) as Array<1 | 2 | 3>;
  for (const r of rounds) {
    completeEraProject(state, r);
    claimCoreState(state, r);
  }
}

function rawEndgameSave(id: EndgameReviewCheckpointId, nowMs: number): SaveData {
  const state = freshSaveData(nowMs);
  seedEndgameBase(state, nowMs, 0);

  switch (id) {
    case "endgame_new_run":
      return state;

    case "endgame_r1_era_almost":
      state.stage3.flagship.completedIds = ["project_1", "project_2", "project_3"];
      state.stage3.flagship.pendingReward = null;
      state.stage3.projectProgress = 13_500;
      state.money = 3_000_000_000;
      state.lifetimeIncome = 8_000_000_000;
      return state;

    case "endgame_r1_core_ready":
      completeEraProject(state, 1);
      state.money = 5_000_000_000;
      state.lifetimeIncome = 12_000_000_000;
      return state;

    case "endgame_r2_start":
      completeThroughRound(state, 1);
      state.technologyIterationCount = 1;
      state.permanentMultiplier = 1.5;
      state.money = 500_000;
      state.lifetimeIncome = 1_000_000;
      return state;

    case "endgame_r2_era_almost":
      completeThroughRound(state, 1);
      state.technologyIterationCount = 1;
      state.permanentMultiplier = 1.5;
      state.stage3.flagship.completedIds = ["project_1", "project_2", "project_3"];
      state.stage3.projectProgress = 22_000;
      state.money = 2_000_000_000;
      state.lifetimeIncome = 6_000_000_000;
      return state;

    case "endgame_r2_core_ready":
      completeThroughRound(state, 1);
      completeEraProject(state, 2);
      claimCoreState(state, 2);
      state.technologyIterationCount = 1;
      state.permanentMultiplier = 1.5;
      state.money = 3_000_000_000;
      state.lifetimeIncome = 9_000_000_000;
      return state;

    case "endgame_r3_start":
      completeThroughRound(state, 2);
      state.technologyIterationCount = 2;
      state.permanentMultiplier = 2.0;
      state.money = 600_000;
      state.lifetimeIncome = 1_200_000;
      return state;

    case "endgame_r3_era_almost":
      completeThroughRound(state, 2);
      state.technologyIterationCount = 2;
      state.permanentMultiplier = 2.0;
      state.stage3.flagship.completedIds = ["project_1", "project_2", "project_3"];
      state.stage3.projectProgress = 30_000;
      state.money = 2_500_000_000;
      state.lifetimeIncome = 8_000_000_000;
      return state;

    case "endgame_r3_core_ready":
      completeThroughRound(state, 2);
      completeEraProject(state, 3);
      claimCoreState(state, 3);
      state.technologyIterationCount = 2;
      state.permanentMultiplier = 2.0;
      state.money = 4_000_000_000;
      state.lifetimeIncome = 12_000_000_000;
      return state;

    case "endgame_space_reveal":
      completeThroughRound(state, 3);
      state.technologyIterationCount = 3;
      state.permanentMultiplier = 2.0;
      state.singularity!.spacePlanRevealed = true;
      state.singularity!.spacePlanRevealedAtMs = nowMs;
      state.money = 5_000_000_000;
      state.lifetimeIncome = 15_000_000_000;
      return state;

    case "endgame_stage4_mid":
      completeThroughRound(state, 3);
      state.technologyIterationCount = 3;
      state.permanentMultiplier = 2.0;
      state.singularity!.spacePlanRevealed = true;
      state.singularity!.spacePlanRevealedAtMs = nowMs;
      state.singularity!.spacePlanStarted = true;
      state.singularity!.stage4 = {
        entered: true,
        enteredAtMs: nowMs,
        nodes: [STAGE4_NODES[0].id, STAGE4_NODES[1].id],
        stageIncome: 1.2e11,
        projectProgress: 30_000,
        activeProjectId: STAGE4_FINAL_PROJECT.id,
        completedProjectIds: [],
        pendingRewardProjectId: null,
      };
      state.money = 2e11;
      state.lifetimeIncome = 4e11;
      return state;

    case "endgame_stage5_dyson_almost":
      completeThroughRound(state, 3);
      state.technologyIterationCount = 3;
      state.permanentMultiplier = 2.0;
      state.singularity!.spacePlanRevealed = true;
      state.singularity!.spacePlanRevealedAtMs = nowMs;
      state.singularity!.spacePlanStarted = true;
      state.singularity!.stage4 = {
        entered: true,
        enteredAtMs: nowMs - 2_000_000,
        nodes: STAGE4_NODES.map((n) => n.id),
        stageIncome: 2e12,
        projectProgress: STAGE4_FINAL_PROJECT.progressRequired,
        activeProjectId: null,
        completedProjectIds: [STAGE4_FINAL_PROJECT.id],
        pendingRewardProjectId: null,
      };
      state.singularity!.stage5 = {
        entered: true,
        enteredAtMs: nowMs,
        nodes: [STAGE5_NODES[0].id, STAGE5_NODES[1].id, STAGE5_NODES[2].id],
        stageIncome: 5e13,
        projectProgress: 220_000,
        activeProjectId: STAGE5_FINAL_PROJECT.id,
        completedProjectIds: [],
        pendingRewardProjectId: null,
        storyCompleted: false,
      };
      state.money = 8e14;
      state.lifetimeIncome = 1e15;
      return state;

    case "endgame_perpetual":
      completeThroughRound(state, 3);
      state.technologyIterationCount = 3;
      state.permanentMultiplier = 2.0;
      state.singularity!.spacePlanRevealed = true;
      state.singularity!.spacePlanRevealedAtMs = nowMs;
      state.singularity!.spacePlanStarted = true;
      state.singularity!.stage4 = {
        entered: true,
        enteredAtMs: nowMs - 4_000_000,
        nodes: STAGE4_NODES.map((n) => n.id),
        stageIncome: 4e12,
        projectProgress: STAGE4_FINAL_PROJECT.progressRequired,
        activeProjectId: null,
        completedProjectIds: [STAGE4_FINAL_PROJECT.id],
        pendingRewardProjectId: null,
      };
      state.singularity!.stage5 = {
        entered: true,
        enteredAtMs: nowMs - 2_000_000,
        nodes: STAGE5_NODES.map((n) => n.id),
        stageIncome: 1e15,
        projectProgress: STAGE5_FINAL_PROJECT.progressRequired,
        activeProjectId: null,
        completedProjectIds: [STAGE5_FINAL_PROJECT.id],
        pendingRewardProjectId: null,
        storyCompleted: true,
        legendaryArchive: {
          completedAtMs: nowMs,
          maxCompute: 1e12,
          maxIncome: 1e15,
          reachedEra: "银河纪元",
        },
      };
      state.singularity!.perpetual = { unlockedAtMs: nowMs };
      state.money = 1e16;
      state.lifetimeIncome = 2e16;
      return state;
  }
}

/** 检查点不变量：返回问题列表（空数组=通过）。 */
export function endgameReviewInvariantIssues(state: SaveData, id: EndgameReviewCheckpointId): string[] {
  const issues: string[] = [];
  if (state.singularity?.mode !== "endgame") issues.push("not_endgame_mode");
  if (state.schemaVersion !== 6) issues.push("schema_not_v6");
  if (state.technologyIterationCount > MAX_ITERATIONS) issues.push("iteration_over_cap");
  if (new Set(state.stage3.flagship.completedIds).size !== state.stage3.flagship.completedIds.length) {
    issues.push("duplicate_flagship_reward");
  }
  const claimed = state.singularity?.coresClaimed ?? [];
  if (new Set(claimed).size !== claimed.length) issues.push("duplicate_core");

  switch (id) {
    case "endgame_new_run":
      if ((state.singularity?.coresClaimed ?? []).length !== 0) issues.push("new_run_not_fresh");
      break;
    case "endgame_r1_era_almost":
      if (!state.stage3.flagship.completedIds.includes("project_3")) issues.push("r1_flagship_not_done");
      break;
    case "endgame_r1_core_ready":
      if (!state.stage3.flagship.completedIds.includes("project_r1")) issues.push("r1_era_not_done");
      // 语义：时代工程完成、核心 1 可手动领取（未领取也合法；领取由玩家触发）
      break;
    case "endgame_r2_start":
      if (state.technologyIterationCount !== 1 || state.permanentMultiplier !== 1.5) issues.push("r2_start_invalid");
      if (state.singularity?.coresClaimed.length !== 1) issues.push("core_count_invalid");
      break;
    case "endgame_r2_era_almost":
      if (!state.stage3.flagship.completedIds.includes("project_3")) issues.push("r2_flagship_not_done");
      if (state.technologyIterationCount !== 1 || state.permanentMultiplier !== 1.5) issues.push("r2_era_invalid");
      break;
    case "endgame_r2_core_ready":
      if (!state.stage3.flagship.completedIds.includes("project_r2")) issues.push("r2_era_not_done");
      break;
    case "endgame_r3_start":
      if (state.technologyIterationCount !== 2 || state.permanentMultiplier !== 2.0) issues.push("r3_start_invalid");
      if (state.singularity?.coresClaimed.length !== 2) issues.push("core_count_invalid");
      break;
    case "endgame_r3_era_almost":
      if (!state.stage3.flagship.completedIds.includes("project_3")) issues.push("r3_flagship_not_done");
      if (state.technologyIterationCount !== 2 || state.permanentMultiplier !== 2.0) issues.push("r3_era_invalid");
      break;
    case "endgame_r3_core_ready":
      if (!state.stage3.flagship.completedIds.includes("project_r3")) issues.push("r3_era_not_done");
      break;
    case "endgame_space_reveal":
      if (state.singularity?.spacePlanRevealed !== true) issues.push("space_not_revealed");
      if (state.technologyIterationCount !== 3 || state.permanentMultiplier !== 2.0) issues.push("reveal_mult_invalid");
      if (state.singularity?.spacePlanStarted === true) issues.push("space_started_too_early");
      break;
    case "endgame_stage4_mid":
      if (state.singularity?.spacePlanStarted !== true) issues.push("stage4_not_started");
      if (!state.singularity?.stage4?.entered) issues.push("stage4_not_entered");
      if (!state.singularity?.stage4?.nodes.includes("leo_node")) issues.push("stage4_first_node_missing");
      break;
    case "endgame_stage5_dyson_almost":
      if (!state.singularity?.stage4?.completedProjectIds.includes("moon_network")) issues.push("stage4_not_complete");
      if (!state.singularity?.stage5?.entered) issues.push("stage5_not_entered");
      if (!state.singularity?.stage5?.nodes.includes("solar_array")) issues.push("stage5_first_node_missing");
      if (state.singularity?.stage5?.activeProjectId !== STAGE5_FINAL_PROJECT.id) issues.push("dyson_not_active");
      break;
    case "endgame_perpetual":
      if (state.singularity?.stage5?.storyCompleted !== true) issues.push("story_not_complete");
      if (state.singularity?.perpetual == null) issues.push("perpetual_not_unlocked");
      if (!state.singularity?.stage5?.completedProjectIds.includes("dyson_sphere")) issues.push("dyson_not_completed");
      break;
  }
  return issues;
}

/** 构建并校验终局检查点存档：schema 合法且不变量通过才返回。 */
export function buildEndgameReviewSave(id: EndgameReviewCheckpointId, nowMs: number): SaveData {
  const raw = rawEndgameSave(id, nowMs);
  const validation = validateSave(raw);
  if (!validation.ok) {
    throw new Error(`endgame review checkpoint ${id} failed schema validation: ${validation.reason}`);
  }
  const issues = endgameReviewInvariantIssues(validation.data, id);
  if (issues.length > 0) {
    throw new Error(`endgame review checkpoint ${id} failed invariants: ${issues.join(",")}`);
  }
  return validation.data;
}
