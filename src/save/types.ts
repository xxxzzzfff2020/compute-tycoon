// 存档结构契约（compute_tycoon_h5_mvp_v1）
import Decimal from "decimal.js";
import { toStoredBig, type StoredBig } from "../core/big";

export const SAVE_NAMESPACE = "compute_tycoon_h5_mvp_v1";
/** 终局隔离 Review 命名空间（不触碰正式档与 Review v2 命名空间）。 */
export const ENDGAME_SAVE_NAMESPACE = "compute_tycoon_h5_endgame_review_v1";
export const SAVE_SCHEMA_VERSION = 6;
export const MAX_SUPPORTED_SCHEMA_VERSION = 6;

export interface ModelProgressState {
  modelId: string;
  level: number;
  /** 累计训练次数 */
  trainingCount: number;
}

/** 永久模型图鉴数据；本轮训练等级仍保存在 ModelProgressState 并在迭代时重置。 */
export interface ModelArchiveEntry {
  modelId: string;
  /** 重复研发形成的永久图鉴等级。 */
  level: number;
  /** 首次获得时间。 */
  firstAcquiredAtMs: number;
  /** 累计研发命中次数（首次获得也计一次）。 */
  researchCount: number;
  /** 历史训练次数；不参与本轮训练重置。 */
  lifetimeTrainingCount: number;
  /** 当前使用该模型时累计创造的经营收入。 */
  lifetimeContribution: StoredBig;
}

export interface OrderState {
  orderId: string;
  startedAtMs: number;
  /** 订单完成所需的剩余秒数（用于恢复） */
  remainingSec: number;
  /** 0=处理中 1=可领取 2=已领取 */
  status: 0 | 1 | 2;
}

export interface WorkshopState {
  /** 工作室等级（只增不减，服务于阶段成长） */
  level: number;
  /** 当前经验 */
  experience: number;
  /** 升级所需经验（由等级曲线计算，存档冗余便于展示） */
  experienceToNextLevel: number;
  /** 累计营业收入（与 lifetimeIncome 同源，只增不减） */
  lifetimeRevenue: StoredBig;
  /** 首服是否已通过里程碑授予（防重复） */
  firstServerAwarded: boolean;
}

/** 模型研发循环（B 方案）：订单/升级累积进度 → 100% 免费研发一次 */
export interface ModelResearchState {
  /** 0-100 研发进度（只增不减，研发后归零重计） */
  progress: number;
  /** Stage 2 期间累计研发次数（结算统计） */
  stage2Draws: number;
}

/** Stage 2 集群里程碑记录（exactly-once） */
export interface Stage2State {
  /** 8 台服务器章节结算是否已展示过（防重复） */
  settlementShown: boolean;
  /** 结算时的时间戳（用于展示完成用时） */
  completedAtMs: number;
  /** 结算时累计收入 */
  stageIncome: StoredBig;
}

export interface OfflineReward {
  startedAtMs: number;
  endedAtMs: number;
  /** 有效结算秒数（= min(实际离线, 阶段上限)） */
  elapsedSec: number;
  /** 实际离线秒数（超出部分展示用） */
  rawElapsedSec: number;
  /** 本阶段离线上限秒数 */
  capSec: number;
  money: StoredBig;
  claimed: boolean;
  /** CARD-04 回归回执：离线期间获得研发进度（0-100 增量） */
  researchProgress: number;
  /** CARD-04 回归回执：离线期间推进的工程进度增量（进度点，0 表示未推进） */
  projectProgressDelta: number;
  /** CARD-04 回归回执：离线期间推进的工程显示名（如 行星算力统一场 / 戴森算力球） */
  projectName: string | null;
}

export interface SettingsState {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

export interface RewardedAdOfferState {
  eventId: string;
  kind: "offline_capacity" | "income_boost";
  createdAtMs: number;
}

export interface SponsorState {
  /** 北京时间自然日；只向前滚动，防设备时间回拨重复领取。 */
  dayKey: string;
  offlineAdsWatchedToday: number;
  incomeFreeChargesUsedToday: number;
  incomeAdsWatchedToday: number;
  /** 充给下一次离线结算的额外容量，0–18小时。 */
  offlineCapacityBonusSec: number;
  /** 收入×2的真实墙钟到期时间；最多保留未来24小时。 */
  incomeBoostUntilMs: number;
  lastObservedNowMs: number;
}

/** 激励视频奖励账本：事件ID持久化，确保重试/刷新不会重复发奖。 */
export interface MonetizationState {
  completedRewardEventIds: string[];
  pendingOffer: RewardedAdOfferState | null;
  sponsor: SponsorState;
}

export interface SaveData {
  schemaVersion: number;
  saveId: string;
  revision: number;
  updatedAtMs: number;
  stage: number; // 1 | 2 | 3
  money: StoredBig;
  lifetimeIncome: StoredBig;
  modelProgress: ModelProgressState | null;
  /** 已解锁模型 id 列表 */
  ownedModelIds: string[];
  /** 每个模型的永久图鉴等级与历史贡献。 */
  modelArchive: Record<string, ModelArchiveEntry>;
  automation: boolean;
  /** 手动完成订单计数（解锁自动经营） */
  completedOrders: number;
  activeOrders: OrderState[];
  rentalCompute: {
    active: boolean;
    /** 租赁算力单位（每台服务器等效） */
    units: number;
    /** 租赁单位单价（每秒费用） */
    unitCostPerSec: number;
  };
  serverCount: number;
  /** 服务器总算力（各服务器 power 之和） */
  serverPower: StoredBig;
  computeCenterLevel: number;
  technologyIterationCount: number;
  permanentMultiplier: number;
  lifetimeCompute: StoredBig;
  highestIncomePerSecond: StoredBig;
  pendingOfflineReward: OfflineReward | null;
  /** 上次技术迭代时的累计收入（用于下一轮门槛） */
  incomeAtLastPrestige: StoredBig;
  /** 离线开始锚点：上次结算时间 */
  lastTickAtMs: number;
  workshop: WorkshopState;
  /** 模型研发循环状态 */
  modelResearch: ModelResearchState;
  /** Stage 2 集群里程碑 */
  stage2: Stage2State;
  /** Stage 3 算力中心 / 档案馆 / 迭代状态 */
  stage3: Stage3State;
  /** 正式终局状态；旧存档迁移前或非终局测试档可为 null。 */
  singularity: SingularityState | null;
  /** 仅包含可选激励视频的幂等奖励账本，不保存平台广告状态。 */
  monetization: MonetizationState;
  settings: SettingsState;
  /** 创建时间 */
  createdAtMs: number;
}

export function newSaveId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "save-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function moneyToSave(money: Decimal): StoredBig {
  return toStoredBig(money);
}

// ============ Stage 3 扩展（算力中心 / 档案馆 / 迭代） ============

/** 四项全局基础设施等级（全局，不逐服务器安装） */
export interface InfrastructureState {
  /** 电力设施等级（决定机房可投产上限） */
  power: number;
  /** 算力卡等级（直接提高总算力/收入） */
  computeCards: number;
  /** 光模块等级（提高有效吞吐/转化率） */
  optical: number;
  /** 存储阵列等级（提高旗舰工程奖励/离线上限） */
  storage: number;
}

/** 机房状态：1=集群核心机房（Stage3 进入即拥有） 2=企业级算力机房 3=区域算力中心 */
export interface MachineRoomState {
  index: number;
  id: string;
  name: string;
  /** 投产时间戳 */
  commissionedAtMs: number;
}

/** 旗舰算力工程 */
export interface FlagshipProjectState {
  /** 当前进行中的工程 id（同一时间最多一个） */
  activeId: string | null;
  /** 当前工程累计进度 0-1 */
  progress: number;
  /** 开始时间戳 */
  startedAtMs: number;
  /** 已完成的工程 id 列表（存档防重复领取/解锁） */
  completedIds: string[];
  /** 待领取奖励（完成后需手动领取） */
  pendingReward: { projectId: string; rewardMultiplier?: number } | null;
}

/** 集群架构蓝图 */
export interface BlueprintState {
  /** 已获得蓝图 id 列表（永久收集） */
  owned: string[];
  /** 当前轮激活的蓝图 id（每轮只激活一个） */
  active: string | null;
  /** 蓝图等级（重复获得时提升） */
  levels: Record<string, number>;
  /** 本轮已消费的 3 台 / 8 台选择里程碑。 */
  chosenMilestones: Array<"server3" | "server8">;
}

/** 科技档案（自动解锁，记录 + 少量永久被动） */
export interface TechnologyArchiveEntry {
  id: string;
  unlockedAtMs: number;
}

/** 算力纪元记录（记录达到过的尺度） */
export interface EraArchiveEntry {
  id: string;
  reachedAtMs: number;
}

/** Stage 3 整体状态 */
export interface Stage3State {
  /** 是否已进入 Stage 3（8 台 + Stage2 结算完成） */
  entered: boolean;
  /** 进入时间戳 */
  enteredAtMs: number;
  infrastructure: InfrastructureState;
  machineRooms: MachineRoomState[];
  flagship: FlagshipProjectState;
  /** 投产红利：到何时为止收入 ×4 */
  commissionBonusUntilMs: number;
  /** 当前瓶颈识别缓存 */
  bottleneck: string | null;
  /** 集群架构蓝图：已获得/当前激活/等级 */
  blueprint: BlueprintState;
  /** 科技档案（自动解锁） */
  technologyArchive: TechnologyArchiveEntry[];
  /** 算力纪元记录 */
  eraArchive: EraArchiveEntry[];
  /** 当前旗舰工程处理进度（0-1，含离线推进） */
  projectProgress: number;
  /** 本轮峰值统计（存档便于迭代总结展示） */
  peakStats: {
    peakCompute: StoredBig;
    peakIncomePerSec: StoredBig;
    totalRequests: StoredBig;
  };
}

/**
 * 正式终局状态（隔离 Review 同样使用此结构）。
 * mode 仅为门禁：正式档缺失/不等于 "endgame" 时，全部终局行为不生效，
 * 正式 v3 引擎（单次迭代 ×2）与旧 Review v2 检查点保持原样。
 */
export interface SingularityState {
  mode: "endgame" | null;
  /** 已领取的奇点核心 id（唯一顺序 1→2→3；exactly-once） */
  coresClaimed: string[];
  /** 第三次迭代是否已转化为“地外算力计划”揭示（只置 true，不自动进入 Stage 4） */
  spacePlanRevealed: boolean;
  /** 已解锁“批量购买已验证项目”的工程 id（核心 1 奖励） */
  claimedProjectIds: string[];
  /** 第三枚核心揭示时间（用于档案展示） */
  spacePlanRevealedAtMs: number;
  /** 玩家是否已主动点击“启动地外算力计划”并进入 Stage 4（CARD-02；只置一次） */
  spacePlanStarted: boolean;
  /** Stage 4 地月算力网状态（进入后非 null） */
  stage4: Stage4State | null;
  /** Stage 5 戴森算力纪元状态（进入后非 null） */
  stage5: Stage5State | null;
  /** 永续增长模式（戴森算力球完成后激活；仅禁迭代/进度清档，保留手动完整重置存档） */
  perpetual: PerpetualState | null;
}

/** Stage 4 地月算力网（正式终局与隔离 Review 共用）。 */
export interface Stage4State {
  /** 是否已进入 Stage 4 */
  entered: boolean;
  /** 进入时间戳 */
  enteredAtMs: number;
  /** 已拥有的轨道算力节点 id（首个节点由进入里程碑授予） */
  nodes: string[];
  /** 本轮累计收入（从 Stage 4 起点计） */
  stageIncome: StoredBig;
  /** 地月一体化算力网工程进度 0-1 */
  projectProgress: number;
  /** 当前进行中的超级工程 id（同一时间最多一个） */
  activeProjectId: string | null;
  /** 已完成的超级工程 id 列表 */
  completedProjectIds: string[];
  /** 待领取工程奖励（手动领取） */
  pendingRewardProjectId: string | null;
}

/** Stage 5 戴森算力纪元（正式终局与隔离 Review 共用）。 */
export interface Stage5State {
  /** 是否已进入 Stage 5 */
  entered: boolean;
  /** 进入时间戳 */
  enteredAtMs: number;
  /** 已拥有的恒星计算节点 id（首个节点由进入里程碑授予） */
  nodes: string[];
  /** 本轮累计收入（从 Stage 5 起点计） */
  stageIncome: StoredBig;
  /** 戴森算力球工程进度 */
  projectProgress: number;
  /** 当前进行中的工程 id（同一时间最多一个） */
  activeProjectId: string | null;
  /** 已完成的工程 id 列表 */
  completedProjectIds: string[];
  /** 待领取工程奖励（手动领取） */
  pendingRewardProjectId: string | null;
  /** 戴森算力球完成后置 true（主线完成；exactly-once） */
  storyCompleted: boolean;
  /** 戴森算力球完成后的终局传奇快照；可选以兼容既有 schema v3 终局档。 */
  legendaryArchive?: LegendaryArchiveState | null;
}

/** 永续增长模式（CARD-03）。 */
export interface PerpetualState {
  /** 戴森算力球完成时间戳 */
  unlockedAtMs: number;
}

/** 结局后档案：只记录一次戴森算力球完成时的成长峰值，不引入新玩法系统。 */
export interface LegendaryArchiveState {
  completedAtMs: number;
  maxCompute: StoredBig;
  maxIncome: StoredBig;
  reachedEra: string;
}
