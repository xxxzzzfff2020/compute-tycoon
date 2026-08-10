// 存档校验：拒绝高版本未知 Schema、修复损坏字段、损坏时安全新建。
import {
  MAX_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  type ModelArchiveEntry,
  type ModelProgressState,
  type ModelResearchState,
  type OfflineReward,
  type OrderState,
  type SaveData,
  type SettingsState,
  type MachineRoomState,
  type MonetizationState,
  type Stage4State,
  type Stage5State,
  type PerpetualState,
  type Stage2State,
  type Stage3State,
  type SingularityState,
  type WorkshopState,
} from "./types";
import { MODEL_ARCHIVE_MAX_LEVEL, SERVERS } from "../data/content";
import { BLUEPRINTS } from "../data/stage3";
import {
  isNonNegativeStoredBig,
  normalizeNonNegativeStoredBig,
  toStoredBig,
  type StoredBig,
} from "../core/big";
import Decimal from "decimal.js";

export type ValidationResult =
  | { ok: true; data: SaveData; repaired: boolean }
  | { ok: false; reason: "unsupported_version" | "corrupt" };

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonNegative(v: unknown): v is number {
  return isNumber(v) && v >= 0;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function clampNonNegative(v: unknown, fallback = 0): number {
  return isNonNegative(v) ? v : fallback;
}

function clampStoredBig(v: unknown, fallback: StoredBig = 0): StoredBig {
  return normalizeNonNegativeStoredBig(v, fallback);
}

function isValidOrder(o: unknown): o is OrderState {
  if (typeof o !== "object" || o === null) return false;
  const x = o as Record<string, unknown>;
  return (
    isString(x.orderId) &&
    isNumber(x.startedAtMs) &&
    isNumber(x.remainingSec) &&
    (x.status === 0 || x.status === 1 || x.status === 2)
  );
}

function isValidModelProgress(m: unknown): m is ModelProgressState {
  if (typeof m !== "object" || m === null) return false;
  const x = m as Record<string, unknown>;
  return isString(x.modelId) && isNonNegative(x.level);
}

function isValidOfflineReward(r: unknown): r is OfflineReward {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Record<string, unknown>;
  return (
    isNumber(x.startedAtMs) &&
    isNumber(x.endedAtMs) &&
    isNumber(x.elapsedSec) &&
    isNonNegativeStoredBig(x.money) &&
    typeof x.claimed === "boolean"
  );
}

/** 旧版离线报价回填 CARD-04 回执字段（不丢弃已存在的待领取收益） */
function normalizeOfflineReward(r: OfflineReward): OfflineReward {
  const x = r as unknown as Record<string, unknown>;
  return {
    ...r,
    money: clampStoredBig(x.money, 0),
    rawElapsedSec: isNonNegative(x.rawElapsedSec) ? (x.rawElapsedSec as number) : r.elapsedSec,
    capSec: isNonNegative(x.capSec) ? (x.capSec as number) : r.elapsedSec,
    researchProgress: isNonNegative(x.researchProgress) ? (x.researchProgress as number) : 0,
    projectProgressDelta: isNonNegative(x.projectProgressDelta) ? (x.projectProgressDelta as number) : 0,
    projectName: typeof x.projectName === "string" ? (x.projectName as string) : null,
  };
}

function isValidWorkshop(w: unknown): w is WorkshopState {
  if (typeof w !== "object" || w === null) return false;
  const x = w as Record<string, unknown>;
  return (
    isNonNegative(x.level) &&
    isNonNegative(x.experience) &&
    isNonNegative(x.experienceToNextLevel) &&
    isNonNegativeStoredBig(x.lifetimeRevenue) &&
    typeof x.firstServerAwarded === "boolean"
  );
}

function isValidModelResearch(r: unknown): r is ModelResearchState {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Record<string, unknown>;
  return isNonNegative(x.progress) && isNonNegative(x.stage2Draws);
}

function isValidStage2(st: unknown): st is Stage2State {
  if (typeof st !== "object" || st === null) return false;
  const x = st as Record<string, unknown>;
  return (
    typeof x.settlementShown === "boolean" &&
    isNonNegative(x.completedAtMs) &&
    isNonNegativeStoredBig(x.stageIncome)
  );
}

function defaultStage3(): Stage3State {
  return {
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
}

const FULL_CLUSTER_POWER = SERVERS.reduce((sum, server) => sum + server.power, 0);

function hasRealStage3Progress(stage3: Stage3State): boolean {
  const infra = stage3.infrastructure;
  const hasInfra = infra.power > 0 || infra.computeCards > 0 || infra.optical > 0 || infra.storage > 0;
  const hasExpandedRoom = stage3.machineRooms.some((room) => room.index >= 2);
  const flagship = stage3.flagship;
  const hasFlagship = Boolean(
    flagship.activeId
    || flagship.progress > 0
    || flagship.completedIds.length > 0
    || flagship.pendingReward
    || stage3.projectProgress > 0
  );
  return hasInfra || hasExpandedRoom || hasFlagship;
}

function ensureRoomOne(stage3: Stage3State): Stage3State {
  if (stage3.machineRooms.some((room) => room.index === 1)) return stage3;
  return {
    ...stage3,
    machineRooms: [
      { index: 1, id: "room_1", name: "era.room1.name", commissionedAtMs: stage3.enteredAtMs },
      ...stage3.machineRooms,
    ],
  };
}

function isValidSettings(s: unknown): s is SettingsState {
  if (typeof s !== "object" || s === null) return false;
  const x = s as Record<string, unknown>;
  return typeof x.soundEnabled === "boolean" && typeof x.notificationsEnabled === "boolean";
}

/** 终局状态校验：正式终局与隔离 Review 均只接受 mode === "endgame"。 */
function isValidSingularity(s: unknown): s is SingularityState {
  if (typeof s !== "object" || s === null) return false;
  const x = s as Record<string, unknown>;
  if (x.mode !== "endgame") return false;
  if (!Array.isArray(x.coresClaimed) || x.coresClaimed.some((c) => typeof c !== "string")) return false;
  if (typeof x.spacePlanRevealed !== "boolean") return false;
  if (!Array.isArray(x.claimedProjectIds) || x.claimedProjectIds.some((c) => typeof c !== "string")) return false;
  if (typeof x.spacePlanRevealedAtMs !== "number" || !Number.isFinite(x.spacePlanRevealedAtMs)) return false;
  if (typeof x.spacePlanStarted !== "boolean") return false;
  if (x.stage4 != null && !isValidStage4(x.stage4)) return false;
  if (x.stage5 != null && !isValidStage5(x.stage5)) return false;
  if (x.perpetual != null && !isValidPerpetual(x.perpetual)) return false;
  return true;
}

/** Stage 4 地月算力网状态校验（CARD-02）。 */
function isValidStage4(s: unknown): s is Stage4State {
  if (typeof s !== "object" || s === null) return false;
  const x = s as Record<string, unknown>;
  if (typeof x.entered !== "boolean") return false;
  if (!isNonNegative(x.enteredAtMs)) return false;
  if (!Array.isArray(x.nodes) || x.nodes.some((n) => typeof n !== "string")) return false;
  if (!isNonNegativeStoredBig(x.stageIncome)) return false;
  if (!isNonNegative(x.projectProgress)) return false;
  if (x.activeProjectId != null && typeof x.activeProjectId !== "string") return false;
  if (!Array.isArray(x.completedProjectIds) || x.completedProjectIds.some((p) => typeof p !== "string")) return false;
  if (x.pendingRewardProjectId != null && typeof x.pendingRewardProjectId !== "string") return false;
  return true;
}

/** Stage 5 戴森算力纪元状态校验（CARD-03）。 */
function isValidStage5(s: unknown): s is Stage5State {
  if (typeof s !== "object" || s === null) return false;
  const x = s as Record<string, unknown>;
  if (typeof x.entered !== "boolean") return false;
  if (!isNonNegative(x.enteredAtMs)) return false;
  if (!Array.isArray(x.nodes) || x.nodes.some((n) => typeof n !== "string")) return false;
  if (!isNonNegativeStoredBig(x.stageIncome)) return false;
  if (!isNonNegative(x.projectProgress)) return false;
  if (x.activeProjectId != null && typeof x.activeProjectId !== "string") return false;
  if (!Array.isArray(x.completedProjectIds) || x.completedProjectIds.some((p) => typeof p !== "string")) return false;
  if (x.pendingRewardProjectId != null && typeof x.pendingRewardProjectId !== "string") return false;
  if (typeof x.storyCompleted !== "boolean") return false;
  return true;
}

/** 永续增长模式状态校验（CARD-03）。 */
function isValidPerpetual(s: unknown): s is PerpetualState {
  if (typeof s !== "object" || s === null) return false;
  const x = s as Record<string, unknown>;
  return isNonNegative(x.unlockedAtMs);
}

/** 修复一个对象为合法存档；返回 null 表示无法修复 */
export function normalizeSave(input: unknown): SaveData | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;

  if (!isNumber(raw.schemaVersion)) return null;
  if (raw.schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION) return null;
  if (raw.schemaVersion < 1) return null;

  // 必需字段检查
  if (!isString(raw.saveId)) return null;
  if (!isNonNegative(raw.revision)) return null;
  if (!isNumber(raw.updatedAtMs)) return null;

  const modelProgress = raw.modelProgress == null ? null
    : isValidModelProgress(raw.modelProgress)
      ? {
          modelId: raw.modelProgress.modelId,
          level: Math.max(1, Math.floor(raw.modelProgress.level)),
          trainingCount: Math.floor(clampNonNegative(
            (raw.modelProgress as unknown as Record<string, unknown>).trainingCount,
            0
          )),
        }
      : null;

  const ownedModelIds: string[] = [...new Set(Array.isArray(raw.ownedModelIds)
    ? raw.ownedModelIds.filter((x): x is string => isString(x))
    : [])];
  if (modelProgress && !ownedModelIds.includes(modelProgress.modelId)) {
    ownedModelIds.push(modelProgress.modelId);
  }

  const modelArchive: Record<string, ModelArchiveEntry> = {};
  const rawArchive = raw.modelArchive;
  if (rawArchive && typeof rawArchive === "object" && !Array.isArray(rawArchive)) {
    for (const [key, value] of Object.entries(rawArchive as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      const modelId = isString(entry.modelId) ? entry.modelId : key;
      if (!modelId) continue;
      modelArchive[modelId] = {
        modelId,
        level: Math.min(MODEL_ARCHIVE_MAX_LEVEL, Math.max(1, Math.floor(clampNonNegative(entry.level, 1)))),
        firstAcquiredAtMs: Math.max(0, Math.floor(clampNonNegative(
          entry.firstAcquiredAtMs,
          clampNonNegative(raw.createdAtMs, 0)
        ))),
        researchCount: Math.min(MODEL_ARCHIVE_MAX_LEVEL, Math.max(1, Math.floor(clampNonNegative(entry.researchCount, 1)))),
        lifetimeTrainingCount: Math.floor(clampNonNegative(entry.lifetimeTrainingCount, 0)),
        lifetimeContribution: clampStoredBig(entry.lifetimeContribution, 0),
      };
    }
  }
  // v1 迁移：旧档只有 ownedModelIds；保留本轮训练等级，图鉴等级从 1 起。
  for (const modelId of ownedModelIds) {
    if (!modelArchive[modelId]) {
      modelArchive[modelId] = {
        modelId,
        level: 1,
        firstAcquiredAtMs: Math.max(0, Math.floor(clampNonNegative(raw.createdAtMs, 0))),
        researchCount: 1,
        lifetimeTrainingCount:
          modelProgress?.modelId === modelId ? modelProgress.trainingCount : 0,
        lifetimeContribution: 0,
      };
    }
  }

  const activeOrders: OrderState[] = Array.isArray(raw.activeOrders)
    ? raw.activeOrders.filter(isValidOrder)
    : [];

  const pendingOfflineReward =
    raw.pendingOfflineReward == null
      ? null
      : isValidOfflineReward(raw.pendingOfflineReward)
        ? normalizeOfflineReward(raw.pendingOfflineReward)
        : null;

  const workshop = isValidWorkshop(raw.workshop)
    ? {
        ...(raw.workshop as WorkshopState),
        lifetimeRevenue: clampStoredBig((raw.workshop as WorkshopState).lifetimeRevenue, 0),
      }
    : {
        level: 1,
        experience: 0,
        experienceToNextLevel: 100,
        lifetimeRevenue: clampStoredBig(raw.lifetimeIncome, 0),
        firstServerAwarded: false,
      };

  const settings = isValidSettings(raw.settings)
    ? (raw.settings as SettingsState)
    : { soundEnabled: true, notificationsEnabled: true };

  const rawMonetization = raw.monetization as Record<string, unknown> | null | undefined;
  const rawPendingOffer = rawMonetization?.pendingOffer as Record<string, unknown> | null | undefined;
  const pendingKind = rawPendingOffer?.kind;
  const rawSponsor = rawMonetization?.sponsor as Record<string, unknown> | null | undefined;
  const monetization: MonetizationState = {
    completedRewardEventIds: Array.isArray(rawMonetization?.completedRewardEventIds)
      ? [...new Set(rawMonetization.completedRewardEventIds.filter((id): id is string => typeof id === "string"))].slice(-64)
      : [],
    pendingOffer: rawPendingOffer
      && typeof rawPendingOffer.eventId === "string"
      && (pendingKind === "offline_capacity" || pendingKind === "income_boost")
      ? {
          eventId: rawPendingOffer.eventId,
          kind: pendingKind,
          createdAtMs: Math.max(0, Math.floor(clampNonNegative(rawPendingOffer.createdAtMs, 0))),
        }
      : null,
    sponsor: {
      dayKey: typeof rawSponsor?.dayKey === "string" ? rawSponsor.dayKey : "",
      offlineAdsWatchedToday: Math.min(9, Math.floor(clampNonNegative(rawSponsor?.offlineAdsWatchedToday, 0))),
      incomeFreeChargesUsedToday: Math.min(3, Math.floor(clampNonNegative(rawSponsor?.incomeFreeChargesUsedToday, 0))),
      incomeAdsWatchedToday: Math.min(9, Math.floor(clampNonNegative(rawSponsor?.incomeAdsWatchedToday, 0))),
      offlineCapacityBonusSec: Math.min(18 * 60 * 60, Math.floor(clampNonNegative(rawSponsor?.offlineCapacityBonusSec, 0))),
      incomeBoostUntilMs: Math.max(0, Math.floor(clampNonNegative(rawSponsor?.incomeBoostUntilMs, 0))),
      lastObservedNowMs: Math.max(0, Math.floor(clampNonNegative(rawSponsor?.lastObservedNowMs, raw.updatedAtMs))),
    },
  };

  // 模型研发（B 方案）与 Stage 2 里程碑：旧档缺失时安全补默认值
  const rawResearch = raw.modelResearch as Record<string, unknown> | null | undefined;
  const rawStage2 = raw.stage2 as Record<string, unknown> | null | undefined;
  const modelResearch = isValidModelResearch(raw.modelResearch)
    ? (raw.modelResearch as ModelResearchState)
    : { progress: clampNonNegative(rawResearch?.progress, 0), stage2Draws: clampNonNegative(rawResearch?.stage2Draws, 0) };

  const stage2 = isValidStage2(raw.stage2)
    ? {
        ...(raw.stage2 as Stage2State),
        stageIncome: clampStoredBig((raw.stage2 as Stage2State).stageIncome, 0),
      }
    : { settlementShown: false, completedAtMs: 0, stageIncome: clampStoredBig(rawStage2?.stageIncome, 0) };

  // 终局状态：mode === "endgame" 才透传；缺失/损坏字段置 null，随后由正式入口安全迁移。
  const rawSingularity = raw.singularity as SingularityState | null | undefined;
  const singularity = isValidSingularity(rawSingularity)
    ? {
        mode: "endgame" as const,
        coresClaimed: [...new Set(rawSingularity!.coresClaimed)],
        spacePlanRevealed: rawSingularity!.spacePlanRevealed,
        claimedProjectIds: [...new Set(rawSingularity!.claimedProjectIds)],
        spacePlanRevealedAtMs: Math.max(0, Math.floor(
          clampNonNegative(rawSingularity!.spacePlanRevealedAtMs, 0),
        )),
        spacePlanStarted: rawSingularity!.spacePlanStarted === true,
        stage4: rawSingularity!.stage4 != null
          ? {
              ...structuredClone(rawSingularity!.stage4),
              stageIncome: clampStoredBig(rawSingularity!.stage4.stageIncome, 0),
            }
          : null,
        stage5: rawSingularity!.stage5 != null
          ? {
              ...structuredClone(rawSingularity!.stage5),
              stageIncome: clampStoredBig(rawSingularity!.stage5.stageIncome, 0),
              legendaryArchive: rawSingularity!.stage5.legendaryArchive
                ? {
                    ...structuredClone(rawSingularity!.stage5.legendaryArchive),
                    maxCompute: clampStoredBig(rawSingularity!.stage5.legendaryArchive.maxCompute, 0),
                    maxIncome: clampStoredBig(rawSingularity!.stage5.legendaryArchive.maxIncome, 0),
                  }
                : null,
            }
          : null,
        perpetual: rawSingularity!.perpetual != null
          ? structuredClone(rawSingularity!.perpetual)
          : null,
      }
    : null;

  // Stage 3：旧档缺失时安全补默认值（不破坏现有资金/服务器/中心数据）
  const rawStage3 = raw.stage3 as Record<string, unknown> | null | undefined;
  const rawInf = rawStage3?.infrastructure as Record<string, unknown> | null | undefined;
  const rawFlagship = rawStage3?.flagship as Record<string, unknown> | null | undefined;
  const stage3: Stage3State = {
        ...defaultStage3(),
        entered: rawStage3?.entered === true,
        enteredAtMs: Math.max(0, Math.floor(clampNonNegative(rawStage3?.enteredAtMs, 0))),
        infrastructure: {
          power: Math.floor(clampNonNegative(rawInf?.power, 0)),
          computeCards: Math.floor(clampNonNegative(rawInf?.computeCards, 0)),
          optical: Math.floor(clampNonNegative(rawInf?.optical, 0)),
          storage: Math.floor(clampNonNegative(rawInf?.storage, 0)),
        },
        machineRooms: Array.isArray(rawStage3?.machineRooms)
          ? (rawStage3.machineRooms as MachineRoomState[]).filter((r) => r && isNonNegative(r.index))
          : [],
        flagship: {
          activeId: typeof rawFlagship?.activeId === "string" ? rawFlagship.activeId : null,
          progress: clampNonNegative(rawFlagship?.progress, 0),
          startedAtMs: Math.max(0, Math.floor(clampNonNegative(rawFlagship?.startedAtMs, 0))),
          completedIds: Array.isArray(rawFlagship?.completedIds)
            ? rawFlagship.completedIds.filter((x): x is string => typeof x === "string")
            : [],
          pendingReward: rawFlagship?.pendingReward
            ? (() => {
                const pending = rawFlagship.pendingReward as Record<string, unknown>;
                const multiplier = clampNonNegative(pending.rewardMultiplier, 0);
                return {
                  projectId: String(pending.projectId ?? ""),
                  ...(multiplier >= 1 ? { rewardMultiplier: multiplier } : {}),
                };
              })()
            : null,
        },
        commissionBonusUntilMs: Math.max(0, Math.floor(clampNonNegative(rawStage3?.commissionBonusUntilMs, 0))),
        bottleneck: typeof rawStage3?.bottleneck === "string" ? rawStage3.bottleneck : null,
        blueprint: (() => {
          const rawBP = (rawStage3?.blueprint ?? {}) as Record<string, unknown>;
          const rawLevels = rawBP.levels;
          const levels: Record<string, number> = {};
          if (rawLevels && typeof rawLevels === "object") {
            for (const [k, v] of Object.entries(rawLevels as Record<string, unknown>)) {
              if (typeof v === "number" && Number.isFinite(v)) levels[k] = Math.max(0, Math.floor(v));
            }
          }
          const knownIds = new Set(BLUEPRINTS.map((blueprint) => blueprint.id));
          const owned = Array.isArray(rawBP.owned)
            ? [...new Set((rawBP.owned as unknown[]).filter(
                (x): x is string => typeof x === "string" && knownIds.has(x),
              ))]
            : [];
          // 旧蓝图选择迁移：earned = min(3, max(owned.length, sum(known levels)))。
          // 迁移后只保留固定顺序前 earned 个节点；旧 active/levels/choice 不再产生效果。
          const levelSum = BLUEPRINTS.reduce((sum, blueprint) => sum + (levels[blueprint.id] ?? 0), 0);
          const earned = Math.min(BLUEPRINTS.length, Math.max(owned.length, levelSum));
          const normalizedOwned = BLUEPRINTS.slice(0, earned).map((blueprint) => blueprint.id);
          return {
            owned: normalizedOwned,
            active: null,
            levels: Object.fromEntries(normalizedOwned.map((id) => [id, 1])),
            chosenMilestones: [],
          };
        })(),
        technologyArchive: Array.isArray(rawStage3?.technologyArchive)
          ? rawStage3.technologyArchive.filter((t) => t && typeof t === "object" && typeof (t as Record<string, unknown>).id === "string")
          : [],
        eraArchive: Array.isArray(rawStage3?.eraArchive)
          ? rawStage3.eraArchive.filter((e) => e && typeof e === "object" && typeof (e as Record<string, unknown>).id === "string")
          : [],
        projectProgress: clampNonNegative(rawStage3?.projectProgress, 0),
        peakStats: {
          peakCompute: clampStoredBig((rawStage3?.peakStats as Record<string, unknown> | null)?.peakCompute, 0),
          peakIncomePerSec: clampStoredBig((rawStage3?.peakStats as Record<string, unknown> | null)?.peakIncomePerSec, 0),
          totalRequests: clampStoredBig((rawStage3?.peakStats as Record<string, unknown> | null)?.totalRequests, 0),
        },
      };

  let normalizedStage3 = stage3;
  let normalizedStage2 = stage2;
  let normalizedServerCount = Math.floor(clampNonNegative(raw.serverCount, 0));
  let normalizedServerPower = clampStoredBig(raw.serverPower, 1);
  if (new Decimal(normalizedServerPower).lte(0)) normalizedServerPower = 1;
  const legacyIterationProgress = raw.schemaVersion < 3
    && clampNonNegative(raw.computeCenterLevel, 0) > 0
    && clampNonNegative(raw.technologyIterationCount, 0) > 0;
  const realStage3Progress = hasRealStage3Progress(stage3) || legacyIterationProgress;

  const rawIterationCount = Math.floor(clampNonNegative(raw.technologyIterationCount, 0));
  const rawPermanentMultiplier = clampNonNegative(raw.permanentMultiplier, 1) || 1;
  // CARD-01 隔离档（mode === "endgame"）：保留真实迭代次数与加法式永久倍率。
  // 正式档：仍按当前版本合同收敛为最多 1 次、永久 ×2（旧 Review v2 检查点依赖此行为）。
  const endgameMode = singularity?.mode === "endgame";
  const normalizedIterationCount = endgameMode
    ? Math.min(3, rawIterationCount)
    : rawIterationCount > 0 || rawPermanentMultiplier > 1 ? 1 : 0;
  const normalizedPermanentMultiplier = endgameMode
    ? rawPermanentMultiplier
    : normalizedIterationCount > 0 ? 2 : 1;

  // schema v3：旧算力中心只作读取兼容，不再构成运行入口。
  // 真实 Stage 3 进度保留并补齐唯一入口的不变量；只有旧 gateway 标记的档案回到 Stage 2。
  if (realStage3Progress) {
    normalizedStage3 = ensureRoomOne({ ...stage3, entered: true });
    normalizedStage2 = {
      ...stage2,
      settlementShown: true,
      completedAtMs: stage2.completedAtMs || stage3.enteredAtMs,
    };
    normalizedServerCount = Math.max(8, normalizedServerCount);
    normalizedServerPower = toStoredBig(Decimal.max(FULL_CLUSTER_POWER, new Decimal(normalizedServerPower)));
  } else if (raw.schemaVersion < 3 && clampNonNegative(raw.computeCenterLevel, 0) > 0) {
    normalizedStage3 = {
      ...stage3,
      entered: false,
      enteredAtMs: 0,
      machineRooms: stage3.machineRooms.filter((room) => room.index >= 2),
    };
  }

  const normalizedStage = normalizedStage3.entered
    ? 3
    : normalizedServerCount > 0 ? 2 : 1;

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    saveId: raw.saveId,
    revision: Math.floor(clampNonNegative(raw.revision, 0)),
    updatedAtMs: Math.max(0, Math.floor(clampNonNegative(raw.updatedAtMs, 0))),
    stage: normalizedStage,
    money: clampStoredBig(raw.money, 0),
    lifetimeIncome: clampStoredBig(raw.lifetimeIncome, 0),
    modelProgress,
    ownedModelIds,
    modelArchive,
    automation: raw.automation === true,
    completedOrders: Math.floor(clampNonNegative(raw.completedOrders, 0)),
    activeOrders,
    rentalCompute: {
      active: (raw.rentalCompute as Record<string, unknown> | null)?.active === true,
      units: Math.floor(clampNonNegative((raw.rentalCompute as Record<string, unknown> | null)?.units, 0)),
      unitCostPerSec: clampNonNegative(
        (raw.rentalCompute as Record<string, unknown> | null)?.unitCostPerSec,
        0
      ),
    },
    serverCount: normalizedServerCount,
    serverPower: normalizedServerPower,
    computeCenterLevel: 0,
    technologyIterationCount: normalizedIterationCount,
    permanentMultiplier: normalizedPermanentMultiplier,
    lifetimeCompute: clampStoredBig(raw.lifetimeCompute, 0),
    highestIncomePerSecond: clampStoredBig(raw.highestIncomePerSecond, 0),
    pendingOfflineReward,
    incomeAtLastPrestige: clampStoredBig(raw.incomeAtLastPrestige, 0),
    lastTickAtMs: Math.max(0, Math.floor(clampNonNegative(raw.lastTickAtMs, 0))),
    workshop,
    modelResearch,
    stage2: normalizedStage2,
    stage3: normalizedStage3,
    singularity,
    monetization,
    settings,
    createdAtMs: Math.max(0, Math.floor(clampNonNegative(raw.createdAtMs, 0))),
  };
}

export function validateSave(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "corrupt" };
  }
  const raw = input as Record<string, unknown>;
  if (isNumber(raw.schemaVersion) && raw.schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION) {
    return { ok: false, reason: "unsupported_version" };
  }
  const normalized = normalizeSave(input);
  if (!normalized) return { ok: false, reason: "corrupt" };
  const normalizedIterationCount = normalized.technologyIterationCount;
  const normalizedPermanentMultiplier = normalized.permanentMultiplier;
  // 记录是否发生过字段修复
  const repaired = raw.schemaVersion !== normalized.schemaVersion
    || raw.stage !== normalized.stage
    || raw.money !== normalized.money
    || raw.automation !== normalized.automation
    || !isValidSettings(raw.settings)
    || raw.modelArchive == null
    || raw.monetization == null
    || (raw.singularity != null && !isValidSingularity(raw.singularity))
    || raw.technologyIterationCount !== normalizedIterationCount
    || raw.permanentMultiplier !== normalizedPermanentMultiplier
    || (raw.stage3 as Record<string, unknown> | null | undefined)?.blueprint == null;
  return { ok: true, data: normalized, repaired };
}
