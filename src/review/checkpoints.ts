import {
  AUTOMATION_UNLOCK_ORDERS,
  MODEL_ARCHIVE_MAX_LEVEL,
  MODELS,
  SERVERS,
} from "../data/content";
import { MACHINE_ROOMS } from "../data/stage3";
import {
  automationUnlocked,
  currentStage,
  incomePerSecond,
  modelCompute,
  modelLevel,
  orderDisplayMode,
} from "../economy/engine";
import { canResearchModel } from "../economy/engine";
import {
  architectureUnlockedCount,
  canIterate,
  canCommissionRoom,
  iterationRequirementsMet,
  stage3EntryMet,
  syncArchitectureBlueprints,
} from "../economy/stage3";
import {
  FIRST_SERVER_LIFETIME_REVENUE,
  FIRST_SERVER_WORKSHOP_LEVEL,
  experienceToNextLevel,
} from "../economy/workshop";
import { freshSaveData } from "../save/storage";
import { SAVE_SCHEMA_VERSION, type SaveData } from "../save/types";
import { validateSave } from "../save/validate";

export const REVIEW_STORAGE_PREFIX = "compute_tycoon_h5_review_v2";

export const REVIEW_CHECKPOINTS = [
  {
    code: "A",
    id: "new_game",
    label: "新档开始",
    description: "从第一款模型开始，完整体验 Stage 1–3 与第一次技术迭代。",
    focus: "核心循环理解、自然节奏与全程尺度变化",
  },
  {
    code: "B",
    id: "automation_unlocked",
    label: "自动经营刚解锁",
    description: "观察手动订单让位于自动吞吐后的反馈是否清晰。",
    focus: "自动化解锁、页面稳定、收入持续增长",
  },
  {
    code: "C",
    id: "first_server_almost",
    label: "第一台服务器即将获得",
    description: "距离首服里程碑只差一小段累计收入。",
    focus: "首服是授予而非购买，获得后立即变强",
  },
  {
    code: "D",
    id: "server3_blueprint",
    label: "3 台服务器与首个架构节点",
    description: "集群成形，首个架构蓝图按服务器规模自动永久解锁。",
    focus: "固定顺序自动解锁与全局倍率反馈",
  },
  {
    code: "E",
    id: "server8_high_throughput",
    label: "8 台服务器与高吞吐",
    description: "观察订单是否已自然聚合为算力吞吐而非单笔频闪。",
    focus: "Stage 2 高吞吐、结算与 Stage 3 前置边界",
  },
  {
    code: "F",
    id: "stage3_entry",
    label: "Stage 3 刚进入",
    description: "八台服务器折入机房 1，开始基础设施经营。",
    focus: "尺度跃迁、四项设施职责与机房身份",
  },
  {
    code: "G",
    id: "room2_almost",
    label: "机房 2 即将投产",
    description: "门槛与前置工程均已满足，可直接验证投产红利。",
    focus: "机房扩张、投产反馈与倍率感",
  },
  {
    code: "H",
    id: "room3_final_flagship",
    label: "机房 3 与最终旗舰工程",
    description: "机房 3 已投产，最终旗舰工程进入收官冲刺。",
    focus: "Stage 3 高潮、旗舰工程与档案反馈",
  },
  {
    code: "I",
    id: "iteration_ready",
    label: "第一次技术迭代确认页",
    description: "主线条件已满足，检查重置与永久保留说明。",
    focus: "技术迭代是否像奖励而不是清档",
  },
  {
    code: "J",
    id: "second_run_acceleration",
    label: "第二轮与首服加速",
    description: "第二轮早期，下一笔订单将触发更快自动化并接近首服。",
    focus: "永久倍率、自动化门槛与二轮恢复速度",
  },
  {
    code: "K",
    id: "model_research_regression",
    label: "模型训练 / 蓝图分层回归",
    description: "固定语音模型训练 Lv10、蓝图增幅 Lv3 与知识蒸馏弱候选，验证两条成长线互不替代。",
    focus: "训练等级、蓝图倍率、收藏算力成长",
  },
  {
    code: "L",
    id: "server5_blueprint",
    label: "5 台服务器与第二架构节点",
    description: "达到规模化运营节点，第二个架构蓝图自动永久解锁。",
    focus: "固定顺序自动解锁、全局倍率与下一节点提示",
  },
  {
    code: "M",
    id: "model_archive_complete",
    label: "模型图鉴已完成",
    description: "所有可用模型图鉴均达到各自上限，研发入口应停止消费。",
    focus: "满级排除、完成态文案与无隐藏算力",
  },
  {
    code: "N",
    id: "second_run_iteration_complete",
    label: "第二轮再次满足迭代条件",
    description: "第二轮再次达到最终条件，但本版本迭代 hard cap 阻止二次清档。",
    focus: "终态文案、无二次迭代、继续自由经营",
  },
] as const;

export type ReviewCheckpointId = (typeof REVIEW_CHECKPOINTS)[number]["id"];

export function isReviewCheckpointId(value: string | null): value is ReviewCheckpointId {
  return REVIEW_CHECKPOINTS.some((checkpoint) => checkpoint.id === value);
}

export function reviewCheckpointById(id: ReviewCheckpointId) {
  return REVIEW_CHECKPOINTS.find((checkpoint) => checkpoint.id === id)!;
}

export function reviewStorageNamespace(id: ReviewCheckpointId): string {
  return `${REVIEW_STORAGE_PREFIX}:${id}`;
}

function setMoneyAndRevenue(state: SaveData, money: number, revenue: number): void {
  state.money = money;
  state.lifetimeIncome = revenue;
  state.workshop.lifetimeRevenue = revenue;
  state.stage2.stageIncome = revenue;
}

function seedSingleModel(state: SaveData, nowMs: number, modelId = "codex"): void {
  const model = MODELS.find((entry) => entry.id === modelId) ?? MODELS[0];
  state.ownedModelIds = [model.id];
  state.modelProgress = { modelId: model.id, level: 4, trainingCount: 3 };
  state.modelArchive = {
    [model.id]: {
      modelId: model.id,
      level: 2,
      firstAcquiredAtMs: nowMs - 60_000,
      researchCount: 2,
      lifetimeTrainingCount: 3,
      lifetimeContribution: 24_000,
    },
  };
}

function seedSixModelArchive(state: SaveData, nowMs: number): void {
  state.ownedModelIds = MODELS.map((model) => model.id);
  state.modelArchive = Object.fromEntries(MODELS.map((model, index) => [model.id, {
    modelId: model.id,
    level: 2 + (index % 3),
    firstAcquiredAtMs: nowMs - (index + 1) * 60_000,
    researchCount: 2 + (index % 3),
    lifetimeTrainingCount: 3 + index,
    lifetimeContribution: 100_000 * (index + 1),
  }]));
  state.modelProgress = { modelId: "scheduler", level: 3, trainingCount: 2 };
  state.modelResearch = { progress: 82, stage2Draws: 12 };
}

function setWorkshop(
  state: SaveData,
  level: number,
  experience: number,
  firstServerAwarded: boolean,
): void {
  state.workshop.level = level;
  state.workshop.experience = experience;
  state.workshop.experienceToNextLevel = experienceToNextLevel(level);
  state.workshop.firstServerAwarded = firstServerAwarded;
}

function setServers(state: SaveData, count: number): void {
  state.serverCount = count;
  state.serverPower = count > 0
    ? SERVERS.slice(0, count).reduce((sum, server) => sum + server.power, 0)
    : 1;
  state.stage = count > 0 ? 2 : 1;
  if (count > 0) {
    state.rentalCompute = { active: false, units: 0, unitCostPerSec: 0 };
    state.workshop.firstServerAwarded = true;
  }
}

function addReachedEras(state: SaveData, nowMs: number): void {
  const ids: string[] = [];
  if (state.ownedModelIds.length > 0) ids.push("era_studio");
  if (state.serverCount >= 1) ids.push("era_own_server");
  if (state.serverCount >= 3) ids.push("era_cluster");
  if (state.serverCount >= 8) ids.push("era_full_cluster");
  for (const room of state.stage3.machineRooms) ids.push(`era_room${room.index}`);
  if (state.stage3.flagship.completedIds.includes("project_2")) ids.push("era_national");
  state.stage3.eraArchive = [...new Set(ids)].map((id) => ({ id, reachedAtMs: nowMs }));
}

function setStage2Foundation(state: SaveData, nowMs: number, serverCount: number): void {
  seedSixModelArchive(state, nowMs);
  state.automation = true;
  state.completedOrders = 200;
  setWorkshop(state, 10, 140, true);
  setServers(state, serverCount);
  setMoneyAndRevenue(state, 12_000_000, 24_000_000);
  state.stage2 = { settlementShown: false, completedAtMs: 0, stageIncome: 24_000_000 };
  state.stage3.blueprint = {
    owned: [],
    active: null,
    levels: {},
    chosenMilestones: [],
  };
  syncArchitectureBlueprints(state);
  addReachedEras(state, nowMs);
}

function setStage3Foundation(
  state: SaveData,
  nowMs: number,
  roomCount: number,
  infrastructure: SaveData["stage3"]["infrastructure"],
  completedProjects: string[],
): void {
  setStage2Foundation(state, nowMs, 8);
  state.stage2 = { settlementShown: true, completedAtMs: nowMs - 60_000, stageIncome: 24_000_000 };
  state.stage3 = {
    ...state.stage3,
    entered: true,
    enteredAtMs: nowMs - 60_000,
    infrastructure: { ...infrastructure },
    machineRooms: MACHINE_ROOMS.slice(0, roomCount).map((room, index) => ({
      index: room.index,
      id: room.id,
      name: room.name,
      commissionedAtMs: nowMs - (roomCount - index) * 30_000,
    })),
    flagship: {
      activeId: null,
      progress: 0,
      startedAtMs: 0,
      completedIds: [...completedProjects],
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
  state.stage = 3;
  addReachedEras(state, nowMs);
}

function rawReviewSave(id: ReviewCheckpointId, nowMs: number): SaveData {
  const state = freshSaveData(nowMs);
  state.saveId = `review-v2-${id}`;

  switch (id) {
    case "new_game":
      return state;

    case "automation_unlocked":
      seedSingleModel(state, nowMs);
      state.completedOrders = AUTOMATION_UNLOCK_ORDERS;
      state.automation = true;
      // 新合同：自动经营必须在取得首台自有服务器后才可开启。
      setServers(state, 1);
      state.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };
      setWorkshop(state, 6, 70, true);
      setMoneyAndRevenue(state, 1_400, 1_080);
      addReachedEras(state, nowMs);
      return state;

    case "first_server_almost":
      seedSingleModel(state, nowMs, "vision");
      state.completedOrders = 72;
      state.automation = true;
      state.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };
      setWorkshop(state, FIRST_SERVER_WORKSHOP_LEVEL, 180, false);
      setMoneyAndRevenue(state, 5_600, FIRST_SERVER_LIFETIME_REVENUE - 220);
      addReachedEras(state, nowMs);
      return state;

    case "model_research_regression":
      state.ownedModelIds = MODELS.map((model) => model.id);
      state.modelArchive = Object.fromEntries(MODELS.map((model) => {
        const level = model.id === "voice" ? 3 : model.id === "distill" ? 6 : 1;
        return [model.id, {
          modelId: model.id,
          level,
          firstAcquiredAtMs: nowMs - 120_000,
          researchCount: level,
          lifetimeTrainingCount: model.id === "voice" ? 10 : 0,
          lifetimeContribution: 10_000,
        }];
      }));
      state.modelProgress = { modelId: "voice", level: 10, trainingCount: 10 };
      state.modelResearch = { progress: 100, stage2Draws: 0 };
      state.completedOrders = 1; // (1 × 7 + workshop Lv1) % 5 = distill in the voice candidate pool.
      state.automation = true;
      setServers(state, 1);
      setMoneyAndRevenue(state, 100_000, 100_000);
      addReachedEras(state, nowMs);
      return state;

    case "server3_blueprint":
      setStage2Foundation(state, nowMs, 3);
      setMoneyAndRevenue(state, 650_000, 1_200_000);
      addReachedEras(state, nowMs);
      return state;

    case "server8_high_throughput":
      setStage2Foundation(state, nowMs, 8);
      state.stage2 = { settlementShown: true, completedAtMs: nowMs - 5_000, stageIncome: 42_000_000 };
      setMoneyAndRevenue(state, 18_000_000, 42_000_000);
      addReachedEras(state, nowMs);
      return state;

    case "stage3_entry":
      setStage3Foundation(state, nowMs, 1, { power: 0, computeCards: 0, optical: 0, storage: 0 }, []);
      state.stage3.commissionBonusUntilMs = nowMs + 60_000;
      setMoneyAndRevenue(state, 45_000_000, 80_000_000);
      return state;

    case "room2_almost":
      setStage3Foundation(state, nowMs, 1, { power: 3, computeCards: 3, optical: 2, storage: 2 }, ["project_1"]);
      setMoneyAndRevenue(state, 180_000_000, 260_000_000);
      return state;

    case "room3_final_flagship":
      setStage3Foundation(state, nowMs, 3, { power: 6, computeCards: 7, optical: 5, storage: 8 }, ["project_1", "project_2"]);
      state.stage3.flagship = {
        ...state.stage3.flagship,
        activeId: "project_3",
        progress: 13_500,
        startedAtMs: nowMs - 90_000,
      };
      state.stage3.projectProgress = 13_500;
      setMoneyAndRevenue(state, 1_200_000_000, 1_800_000_000);
      return state;

    case "iteration_ready":
      setStage3Foundation(state, nowMs, 3, { power: 6, computeCards: 7, optical: 5, storage: 8 }, ["project_1", "project_2", "project_3"]);
      state.stage3.technologyArchive = [
        { id: "tech_gpu_array", unlockedAtMs: nowMs - 40_000 },
        { id: "tech_optical_mesh", unlockedAtMs: nowMs - 30_000 },
        { id: "tech_distributed_storage", unlockedAtMs: nowMs - 20_000 },
      ];
      setMoneyAndRevenue(state, 3_000_000_000, 4_000_000_000);
      return state;

    case "second_run_acceleration":
      seedSixModelArchive(state, nowMs);
      state.modelProgress = { modelId: "codex", level: 2, trainingCount: 1 };
      state.completedOrders = 2;
      state.automation = false;
      state.technologyIterationCount = 1;
      state.permanentMultiplier = 2;
      state.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };
      setWorkshop(state, 5, 230, false);
      setMoneyAndRevenue(state, 3_000, FIRST_SERVER_LIFETIME_REVENUE - 1_200);
      state.stage2 = { settlementShown: false, completedAtMs: 0, stageIncome: 0 };
      state.stage3 = {
        ...state.stage3,
        blueprint: {
          owned: ["bp_general", "bp_gpu"],
          active: null,
          levels: { bp_general: 1, bp_gpu: 1 },
          chosenMilestones: [],
        },
        technologyArchive: [
          { id: "tech_gpu_array", unlockedAtMs: nowMs - 120_000 },
          { id: "tech_optical_mesh", unlockedAtMs: nowMs - 110_000 },
        ],
        eraArchive: [
          { id: "era_studio", reachedAtMs: nowMs - 100_000 },
          { id: "era_own_server", reachedAtMs: nowMs - 90_000 },
          { id: "era_cluster", reachedAtMs: nowMs - 80_000 },
          { id: "era_full_cluster", reachedAtMs: nowMs - 70_000 },
          { id: "era_room1", reachedAtMs: nowMs - 60_000 },
          { id: "era_room2", reachedAtMs: nowMs - 50_000 },
          { id: "era_room3", reachedAtMs: nowMs - 40_000 },
        ],
      };
      return state;

    case "server5_blueprint":
      setStage2Foundation(state, nowMs, 5);
      setMoneyAndRevenue(state, 2_500_000, 8_000_000);
      return state;

    case "model_archive_complete":
      state.ownedModelIds = MODELS.map((model) => model.id);
      state.modelArchive = Object.fromEntries(MODELS.map((model) => [model.id, {
        modelId: model.id,
        level: MODEL_ARCHIVE_MAX_LEVEL,
        firstAcquiredAtMs: nowMs - 120_000,
        researchCount: MODEL_ARCHIVE_MAX_LEVEL,
        lifetimeTrainingCount: model.maxLevel,
        lifetimeContribution: 100_000,
      }]));
      state.modelProgress = { modelId: "voice", level: modelByIdMaxLevel("voice"), trainingCount: 20 };
      state.modelResearch = { progress: 0, stage2Draws: 12 };
      state.automation = true;
      setServers(state, 1);
      setMoneyAndRevenue(state, 2_000_000, 2_000_000);
      addReachedEras(state, nowMs);
      return state;

    case "second_run_iteration_complete":
      setStage3Foundation(state, nowMs, 3, { power: 8, computeCards: 8, optical: 8, storage: 8 }, ["project_1", "project_2", "project_3"]);
      state.technologyIterationCount = 1;
      state.permanentMultiplier = 2;
      setMoneyAndRevenue(state, 5_000_000_000, 7_000_000_000);
      return state;
  }
}

function modelByIdMaxLevel(id: string): number {
  return MODELS.find((model) => model.id === id)?.maxLevel ?? 1;
}

export function reviewCheckpointInvariantIssues(state: SaveData, id: ReviewCheckpointId): string[] {
  const issues: string[] = [];
  if (state.saveId !== `review-v2-${id}`) issues.push("save_id_mismatch");
  if (state.schemaVersion !== SAVE_SCHEMA_VERSION) issues.push("schema_not_current");
  if (state.serverCount < 0 || state.serverCount > SERVERS.length) issues.push("server_count_out_of_range");
  if (new Set(state.stage3.machineRooms.map((room) => room.index)).size !== state.stage3.machineRooms.length) {
    issues.push("duplicate_machine_room");
  }
  if (new Set(state.stage3.flagship.completedIds).size !== state.stage3.flagship.completedIds.length) {
    issues.push("duplicate_flagship_reward");
  }

  switch (id) {
    case "new_game":
      if (currentStage(state) !== 1 || state.ownedModelIds.length !== 0) issues.push("new_game_not_fresh");
      break;
    case "automation_unlocked":
      if (!automationUnlocked(state) || !state.automation || state.serverCount < 1) issues.push("automation_not_just_unlocked");
      break;
    case "first_server_almost":
      if (state.workshop.level < FIRST_SERVER_WORKSHOP_LEVEL
        || Number(state.workshop.lifetimeRevenue) >= FIRST_SERVER_LIFETIME_REVENUE
        || state.serverCount !== 0) issues.push("first_server_checkpoint_invalid");
      break;
    case "model_research_regression": {
      const currentCompute = modelCompute(state).toFixed(4);
      const currentIncome = incomePerSecond(state).toFixed(4);
      const legacyCandidate = structuredClone(state);
      legacyCandidate.modelArchive.distill.level = 7;
      legacyCandidate.modelProgress = { modelId: "distill", level: 1, trainingCount: 0 };
      const candidateCompute = modelCompute(legacyCandidate).toFixed(4);
      const candidateIncome = incomePerSecond(legacyCandidate).toFixed(4);
      if (state.modelProgress?.modelId !== "voice"
        || modelLevel(state) !== 10
        || Number(currentCompute) <= 0
        || Number(currentIncome) <= 0
        || state.modelArchive.voice?.level !== 3
        || state.modelArchive.distill?.level !== 6
        || state.modelResearch.progress !== 100
        || state.serverCount !== 1
        || !state.automation) {
        issues.push("model_research_regression_before_invalid");
      }
      // v7 蓝图是全局算力资产：非主力蓝图升级也会贡献正收益；但若把弱模型误切为主力，
      // 综合算力/收入仍必须低于当前主力，用于继续守住“研发不自动回退主力”合同。
      if (Number(candidateCompute) >= Number(currentCompute) || Number(candidateIncome) >= Number(currentIncome)) {
        issues.push("model_research_regression_legacy_candidate_invalid");
      }
      break;
    }
    case "server3_blueprint":
      if (state.serverCount !== 3 || architectureUnlockedCount(state) !== 1) issues.push("server3_blueprint_not_available");
      break;
    case "server8_high_throughput":
      if (state.serverCount !== 8 || !state.stage2.settlementShown || orderDisplayMode(state) !== "compute") {
        issues.push("server8_not_high_throughput");
      }
      break;
    case "stage3_entry":
      if (!state.stage3.entered || currentStage(state) !== 3 || state.stage3.machineRooms.length !== 1) issues.push("stage3_entry_invalid");
      if (!stage3EntryMet(state)) issues.push("stage3_entry_gate_invalid");
      break;
    case "room2_almost":
      if (!canCommissionRoom(state, 2)) issues.push("room2_not_commissionable");
      break;
    case "room3_final_flagship":
      if (state.stage3.machineRooms.length !== 3
        || state.stage3.flagship.activeId !== "project_3"
        || state.stage3.projectProgress <= 0) issues.push("final_flagship_not_active");
      break;
    case "iteration_ready":
      if (!iterationRequirementsMet(state)) issues.push("iteration_not_ready");
      break;
    case "second_run_acceleration":
      if (state.technologyIterationCount !== 1 || state.permanentMultiplier !== 2 || state.serverCount !== 0) {
        issues.push("second_run_invalid");
      }
      break;
    case "server5_blueprint":
      if (state.serverCount !== 5 || architectureUnlockedCount(state) !== 2) issues.push("server5_blueprint_not_available");
      break;
    case "model_archive_complete":
      if (MODELS.some((model) => state.modelArchive[model.id]?.level !== MODEL_ARCHIVE_MAX_LEVEL) || canResearchModel(state)) {
        issues.push("model_archive_not_complete");
      }
      break;
    case "second_run_iteration_complete":
      if (!iterationRequirementsMet(state) || canIterate(state) || state.technologyIterationCount !== 1 || state.permanentMultiplier !== 2) {
        issues.push("second_run_iteration_not_terminal");
      }
      break;
  }
  return issues;
}

export function buildReviewSave(id: ReviewCheckpointId, nowMs: number): SaveData {
  const raw = rawReviewSave(id, nowMs);
  const validation = validateSave(raw);
  if (!validation.ok) {
    throw new Error(`review checkpoint ${id} failed schema validation: ${validation.reason}`);
  }
  const issues = reviewCheckpointInvariantIssues(validation.data, id);
  if (issues.length > 0) {
    throw new Error(`review checkpoint ${id} failed invariants: ${issues.join(",")}`);
  }
  return validation.data;
}
