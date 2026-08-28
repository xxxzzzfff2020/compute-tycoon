// 单机存储接口：与游戏状态解耦，仅使用本地存储与手工备份。
import { ORDER_QUEUE_CAP } from "../data/content";
import {
  SAVE_NAMESPACE,
  SAVE_SCHEMA_VERSION,
  type SaveData,
  newSaveId,
} from "./types";

export interface SaveStorage {
  load(): SaveData | null;
  /** true 表示已确认写入；false 表示当前环境不可写。 */
  save(data: SaveData): boolean;
  remove(): void;
}

export interface SaveCoder {
  serialize(data: SaveData): string;
  parse(text: string): SaveData;
}

export class JsonSaveCoder implements SaveCoder {
  serialize(data: SaveData): string {
    return JSON.stringify(data);
  }
  parse(text: string): SaveData {
    return JSON.parse(text) as SaveData;
  }
}

export class LocalStorageSaveStorage implements SaveStorage {
  constructor(
    private namespace: string = SAVE_NAMESPACE,
    private coder: SaveCoder = new JsonSaveCoder(),
    private storage: Storage | null = defaultBrowserStorage()
  ) {}

  load(): SaveData | null {
    if (!this.storage) return null;
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.namespace);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      return this.coder.parse(raw);
    } catch {
      return null;
    }
  }

  save(data: SaveData): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this.namespace, this.coder.serialize(data));
      return true;
    } catch (err) {
      // localStorage 满/隐私模式：明确失败，由仓库层触发事务回滚
      console.warn("[save] localStorage write failed", err);
      return false;
    }
  }

  remove(): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(this.namespace);
    } catch (err) {
      console.warn("[save] localStorage remove failed", err);
    }
  }
}

export class MemorySaveStorage implements SaveStorage {
  private data: SaveData | null = null;
  load(): SaveData | null {
    return this.data ? structuredClone(this.data) : null;
  }
  save(data: SaveData): boolean {
    this.data = structuredClone(data);
    return true;
  }
  remove(): void {
    this.data = null;
  }
}

export function freshSaveData(nowMs: number): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    saveId: newSaveId(),
    revision: 0,
    updatedAtMs: nowMs,
    stage: 1,
    money: 0,
    lifetimeIncome: 0,
    modelProgress: null,
    ownedModelIds: [],
    modelArchive: {},
    automation: false,
    completedOrders: 0,
    activeOrders: [],
    unlockedOrderIds: ["o1"],
    orderSlotCapacity: { o1: ORDER_QUEUE_CAP },
    rentalCompute: { active: false, units: 0, unitCostPerSec: 0 },
    serverCount: 0,
    serverPower: 1,
    growth: {
      blueprintBaseLevels: {},
      legacyModelId: null,
      serverUnits: {},
      serverBaseUnits: {},
      talent: {
        highestWorkshopLevel: 1,
        claimedWorkshopLevels: [],
        claimedCoreIds: [],
        claimedAchievementIds: [],
        achievementRecords: {},
        pointsEarned: 0,
        allocations: {
          blueprint_power: 0,
          blueprint_efficiency: 0,
          blueprint_milestone: 0,
          scale_power: 0,
          scale_efficiency: 0,
          scale_milestone: 0,
        },
      },
    },
    computeCenterLevel: 0,
    technologyIterationCount: 0,
    permanentMultiplier: 1,
    lifetimeCompute: 0,
    highestIncomePerSecond: 0,
    pendingOfflineReward: null,
    incomeAtLastPrestige: 0,
    lastTickAtMs: nowMs,
    workshop: {
      level: 1,
      experience: 0,
      experienceToNextLevel: 100,
      lifetimeRevenue: 0,
      firstServerAwarded: false,
    },
    company: { totalExperience: 0 },
    modelResearch: { progress: 0, stage2Draws: 0 },
    stage2: { settlementShown: false, completedAtMs: 0, stageIncome: 0 },
    stage3: {
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
    },
    singularity: null,
    monetization: {
      completedRewardEventIds: [],
      pendingOffer: null,
      sponsor: {
        dayKey: "",
        offlineAdsWatchedToday: 0,
        incomeFreeChargesUsedToday: 0,
        incomeAdsWatchedToday: 0,
        offlineCapacityBonusSec: 0,
        incomeBoostUntilMs: 0,
        lastObservedNowMs: nowMs,
      },
    },
    chronicle: {
      maxObservedDeviceAtMs: nowMs,
      clockAdjustmentCount: 0,
      lastClockAdjustmentAtMs: 0,
      milestones: {},
    },
    settings: { soundEnabled: true, notificationsEnabled: true },
    createdAtMs: nowMs,
  };
}

function defaultBrowserStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const candidate = localStorage as Partial<Storage>;
    if (
      typeof candidate.getItem !== "function" ||
      typeof candidate.setItem !== "function" ||
      typeof candidate.removeItem !== "function"
    ) {
      return null;
    }
    return localStorage;
  } catch {
    return null;
  }
}
