// 本地集中验收入口：通过 ?dev=1&state=<id> 跳转到指定进度（独立存档命名空间，不污染正式档）。
// 正式页面不展示；仅 E2E/开发用。
import { freshSaveData } from "../save/storage";
import type { SaveData } from "../save/types";
import { acquireFirstModel, buyServer, applyTrain, enableAutomation, completeStage2Settlement } from "../economy/engine";
import { DEV_VERIFY_STATES } from "../data/stage3";
import { MODELS } from "../data/content";

export const DEV_SAVE_NAMESPACE = "compute_tycoon_h5_dev_v1";

export function devStateId(): string | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  if (p.get("dev") !== "1") return null;
  const id = p.get("state");
  return id && DEV_VERIFY_STATES.some((s) => s.id === id) ? id : null;
}

function money(s: SaveData, amount: number): void {
  s.money = amount;
}

function seedSixModelArchive(s: SaveData, nowMs: number): void {
  s.ownedModelIds = MODELS.map((model) => model.id);
  s.modelArchive = Object.fromEntries(MODELS.map((model, index) => [model.id, {
    modelId: model.id,
    level: 2 + (index % 3),
    firstAcquiredAtMs: nowMs - (index + 1) * 60_000,
    researchCount: 2 + (index % 3),
    lifetimeTrainingCount: 3 + index,
    lifetimeContribution: 100_000 * (index + 1),
  }]));
  s.modelProgress = { modelId: "scheduler", level: 2, trainingCount: 1 };
}

/** 构造验收档（不含 Stage 2 之前的阶段，从目标状态直接开始） */
export function buildDevSave(stateId: string, nowMs: number): SaveData {
  const s = freshSaveData(nowMs);
  s.saveId = `dev-${stateId}`;
  acquireFirstModel(s, "codex");
  s.automation = true;
  s.completedOrders = 10;
  s.workshop.level = 8;
  s.workshop.experience = 120;
  s.workshop.experienceToNextLevel = 460;
  s.workshop.lifetimeRevenue = 60_000;
  s.lifetimeIncome = 60_000;
  s.workshop.firstServerAwarded = true;
  s.stage2 = { settlementShown: true, completedAtMs: nowMs, stageIncome: 60_000 };

  switch (stateId) {
    case "stage2_almost_done": {
      // Stage 2 即将完成：7 台服务器 + 充足资金
      s.stage2 = { settlementShown: false, completedAtMs: 0, stageIncome: 0 };
      s.serverCount = 7;
      s.serverPower = 209; // 前 7 台：2+4+8+24+36+54+81
      money(s, 9_000_000);
      break;
    }
    case "stage3_entry": {
      // Stage 3 刚进入：8 台 + 机房 1 + 少量基础设施
      s.serverCount = 8;
      s.serverPower = 329;
      s.stage3 = {
        ...s.stage3,
        entered: true,
        enteredAtMs: nowMs,
        machineRooms: [{ index: 1, id: "room_1", name: "集群核心机房", commissionedAtMs: nowMs }],
        infrastructure: { power: 1, computeCards: 1, optical: 1, storage: 1 },
        eraArchive: [
          { id: "era_full_cluster", reachedAtMs: nowMs },
          { id: "era_room1", reachedAtMs: nowMs },
        ],
      };
      money(s, 50_000_000);
      break;
    }
    case "room2_almost": {
      // 机房 2 即将投产：基础设施达标 + 工程 1 完成
      s.serverCount = 8;
      s.serverPower = 329;
      s.stage3 = {
        ...s.stage3,
        entered: true,
        enteredAtMs: nowMs,
        machineRooms: [{ index: 1, id: "room_1", name: "集群核心机房", commissionedAtMs: nowMs }],
        infrastructure: { power: 4, computeCards: 5, optical: 3, storage: 3 },
        flagship: {
          activeId: null,
          progress: 0,
          startedAtMs: nowMs,
          completedIds: ["project_1"],
          pendingReward: null,
        },
        eraArchive: [
          { id: "era_full_cluster", reachedAtMs: nowMs },
          { id: "era_room1", reachedAtMs: nowMs },
        ],
      };
      money(s, 200_000_000);
      break;
    }
    case "room3_almost": {
      // 机房 3 即将投产：机房 2 已建 + 工程 2 完成 + 基础设施达标
      s.serverCount = 8;
      s.serverPower = 329;
      s.stage3 = {
        ...s.stage3,
        entered: true,
        enteredAtMs: nowMs,
        machineRooms: [
          { index: 1, id: "room_1", name: "集群核心机房", commissionedAtMs: nowMs },
          { index: 2, id: "room_2", name: "企业级算力机房", commissionedAtMs: nowMs },
        ],
        infrastructure: { power: 6, computeCards: 7, optical: 5, storage: 5 },
        flagship: {
          activeId: null,
          progress: 0,
          startedAtMs: nowMs,
          completedIds: ["project_1", "project_2"],
          pendingReward: null,
        },
        eraArchive: [
          { id: "era_full_cluster", reachedAtMs: nowMs },
          { id: "era_room1", reachedAtMs: nowMs },
          { id: "era_room2", reachedAtMs: nowMs },
        ],
      };
      money(s, 800_000_000);
      break;
    }
    case "final_project_almost": {
      // 最终旗舰工程即将完成：机房 3 已建 + 工程 3 进行中 90%
      s.serverCount = 8;
      s.serverPower = 329;
      s.stage3 = {
        ...s.stage3,
        entered: true,
        enteredAtMs: nowMs,
        machineRooms: [
          { index: 1, id: "room_1", name: "集群核心机房", commissionedAtMs: nowMs },
          { index: 2, id: "room_2", name: "企业级算力机房", commissionedAtMs: nowMs },
          { index: 3, id: "room_3", name: "区域算力中心", commissionedAtMs: nowMs },
        ],
        infrastructure: { power: 6, computeCards: 7, optical: 5, storage: 8 },
        flagship: {
          activeId: "project_3",
          progress: 13_500,
          startedAtMs: nowMs,
          completedIds: ["project_1", "project_2"],
          pendingReward: null,
        },
        projectProgress: 13_500,
        eraArchive: [
          { id: "era_full_cluster", reachedAtMs: nowMs },
          { id: "era_room1", reachedAtMs: nowMs },
          { id: "era_room2", reachedAtMs: nowMs },
          { id: "era_room3", reachedAtMs: nowMs },
        ],
      };
      seedSixModelArchive(s, nowMs);
      money(s, 2_000_000_000);
      break;
    }
    case "iteration_ready": {
      // 第一次技术迭代确认页：机房 3 + 工程 3 完成
      s.serverCount = 8;
      s.serverPower = 329;
      s.stage3 = {
        ...s.stage3,
        entered: true,
        enteredAtMs: nowMs,
        machineRooms: [
          { index: 1, id: "room_1", name: "集群核心机房", commissionedAtMs: nowMs },
          { index: 2, id: "room_2", name: "企业级算力机房", commissionedAtMs: nowMs },
          { index: 3, id: "room_3", name: "区域算力中心", commissionedAtMs: nowMs },
        ],
        infrastructure: { power: 6, computeCards: 7, optical: 5, storage: 8 },
        flagship: {
          activeId: null,
          progress: 0,
          startedAtMs: nowMs,
          completedIds: ["project_1", "project_2", "project_3"],
          pendingReward: null,
        },
        eraArchive: [
          { id: "era_full_cluster", reachedAtMs: nowMs },
          { id: "era_room1", reachedAtMs: nowMs },
          { id: "era_room2", reachedAtMs: nowMs },
          { id: "era_room3", reachedAtMs: nowMs },
        ],
      };
      seedSixModelArchive(s, nowMs);
      money(s, 3_000_000_000);
      break;
    }
    case "second_run_start": {
      // 第二轮刚开始：已迭代一次，回到 Stage 1
      seedSixModelArchive(s, nowMs);
      s.serverCount = 0;
      s.serverPower = 1;
      s.modelProgress = null;
      s.completedOrders = 0;
      s.automation = false;
      s.technologyIterationCount = 1;
      s.permanentMultiplier = 2;
      s.workshop.level = 1;
      s.workshop.experience = 0;
      s.workshop.experienceToNextLevel = 100;
      s.workshop.firstServerAwarded = false;
      s.stage2 = { settlementShown: false, completedAtMs: 0, stageIncome: 0 };
      s.stage3 = {
        entered: false,
        enteredAtMs: 0,
        infrastructure: { power: 0, computeCards: 0, optical: 0, storage: 0 },
        machineRooms: [],
        flagship: { activeId: null, progress: 0, startedAtMs: 0, completedIds: [], pendingReward: null },
        commissionBonusUntilMs: 0,
        bottleneck: null,
        blueprint: { owned: [], active: null, levels: {}, chosenMilestones: [] },
        technologyArchive: [],
        eraArchive: [],
        projectProgress: 0,
        peakStats: { peakCompute: 0, peakIncomePerSec: 0, totalRequests: 0 },
      };
      money(s, 0);
      break;
    }
    default:
      return s;
  }
  // 检查点直接构造状态，但纪元必须仍只反映实际已达到的尺度。
  const reached = new Set(s.stage3.eraArchive.map((entry) => entry.id));
  const addEra = (id: string) => {
    if (!reached.has(id)) {
      s.stage3.eraArchive.push({ id, reachedAtMs: nowMs });
      reached.add(id);
    }
  };
  if (s.ownedModelIds.length > 0) addEra("era_studio");
  if (s.serverCount >= 1) addEra("era_own_server");
  if (s.serverCount >= 3) addEra("era_cluster");
  if (s.serverCount >= 8) addEra("era_full_cluster");
  for (const room of s.stage3.machineRooms) addEra(`era_room${room.index}`);
  if (s.stage3.flagship.completedIds.includes("project_2")) addEra("era_national");
  return s;
}
