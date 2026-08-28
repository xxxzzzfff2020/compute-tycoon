// 存档结构契约（compute_tycoon_h5_mvp_v1）
import Decimal from "decimal.js";
import { toStoredBig, type StoredBig } from "../core/big";

export const SAVE_NAMESPACE = "compute_tycoon_h5_mvp_v1";
/** 终局隔离 Review 命名空间（不触碰正式档与 Review v2 命名空间）。 */
export const ENDGAME_SAVE_NAMESPACE = "compute_tycoon_h5_endgame_review_v1";
/**
 * v9：共享模型训练从 20 级等价细分为 40 级；旧档按完成比例一次迁移，
 * 满级处理能力与完整训练总费用保持不变。
 */
export const SAVE_SCHEMA_VERSION = 9;
export const MAX_SUPPORTED_SCHEMA_VERSION = 9;

export type TalentNodeId =
  | "blueprint_power"
  | "blueprint_efficiency"
  | "blueprint_milestone"
  | "scale_power"
  | "scale_efficiency"
  | "scale_milestone";

/**
 * CARD-01：暴富内核的永久/本轮成长事实源。
 *
 * - blueprintBaseLevels + legacyModelId 是 v6→v7 等价锚点，只用于保证迁移瞬间不跳数；
 * - serverUnits 是当前轮规模，技术迭代时随服务器一起重置；
 * - talents 是有限永久成长，资金与广告均不能购买。
 */
export interface IncrementalGrowthState {
  blueprintBaseLevels: Record<string, number>;
  legacyModelId: string | null;
  serverUnits: Record<string, number>;
  serverBaseUnits: Record<string, number>;
  talent: {
    highestWorkshopLevel: number;
    claimedWorkshopLevels: number[];
    claimedCoreIds: string[];
    /** 负责人验收反馈：天赋点新来源为成就领取；旧工作室/核心记录仅作迁移兼容，不再继续发放。 */
    claimedAchievementIds: string[];
    /** 领取成就时记录的达成信息（时间/阶段/工作室等级），供个人历程展示；旧档由归一化回填。 */
    achievementRecords: Record<string, AchievementRecord>;
    pointsEarned: number;
    allocations: Record<TalentNodeId, number>;
  };
}

/** 单条成就的达成记录（领取时快照，时间只增不减）。 */
export interface AchievementRecord {
  achievedAtMs: number;
  /** 达成时的有效阶段编号（1–5；4/5 对应地月/戴森纪元）。 */
  stage: number;
  /** 达成时的工作室等级。 */
  workshopLevel: number;
}

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
  /** 固定并行处理线编号；旧档缺失时按同订单当前顺序迁移为 0..3。 */
  slotIndex?: number;
  /** 订单完成所需的剩余秒数（用于恢复） */
  remainingSec: number;
  /** 0=处理中；1/2 为旧版“待领取/已领取”状态，读取后会自动结算。 */
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
  /** 当前已解锁、可领取的离线秒数；新会话初始最多免费 2 小时。 */
  elapsedSec: number;
  /** 实际离线秒数（超出部分展示用） */
  rawElapsedSec: number;
  /** 单次离线会话最终最多可领取的秒数（新合同为 14 小时）。 */
  capSec: number;
  /** 本次实际可被解锁的有效时长（min(实际离线, 14 小时)）。 */
  eligibleSec: number;
  /** 同一离线会话中已成功观看并发奖的扩容广告次数（0–6）。 */
  adUnlocksUsed: number;
  /** 同一离线会话允许的最大扩容广告次数（固定 6）。 */
  adUnlocksMax: number;
  /** 已含离线效率的每秒收入快照；广告扩容只能按这次离线快照补领，不能重算。 */
  moneyPerSec: StoredBig;
  money: StoredBig;
  /**
   * 已实际领取入账的离线秒数（部分领取：先领免费 2 小时，广告扩容后可继续领）。
   * 旧档 claimed=true 语义为整份已领，归一化时回填 paidSec=elapsedSec。
   */
  paidSec: number;
  /** true 仅表示本会话已全部结算（无未领部分且广告也无法再扩容）。 */
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
  /** 旧字段，仅兼容读取；离线广告额度现在归属于单次离线回执，不再按日累计。 */
  offlineAdsWatchedToday: number;
  incomeFreeChargesUsedToday: number;
  incomeAdsWatchedToday: number;
  /**
   * 仅兼容历史存档的旧预充容量字段。v8 起离线广告只扩展当前待领取回执，
   * 不跨回归会话保留，归一化后固定为 0。
   */
  offlineCapacityBonusSec: number;
  /** 收入×2的真实墙钟到期时间；最多保留未来12小时。 */
  incomeBoostUntilMs: number;
  lastObservedNowMs: number;
}

export type ChronicleMilestoneId =
  | "first_model"
  | "first_server"
  | "first_iteration"
  | "earth_complete"
  | "stage4_entered"
  | "stage5_entered"
  | "dyson_complete";

/**
 * 银河历程册：只随当前账号云档同步，不向平台排行榜提交，也不用于反作弊裁决。
 * 时间仅做“设备记录时间”展示；记录只增不减，活跃会话检测到明显跳变时做中性标注。
 */
export interface ChronicleState {
  maxObservedDeviceAtMs: number;
  clockAdjustmentCount: number;
  lastClockAdjustmentAtMs: number;
  milestones: Partial<Record<ChronicleMilestoneId, number>>;
}

/** 跨技术迭代与宇宙阶段永久累积的公司等级事实源。 */
export interface CompanyState {
  totalExperience: number;
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
  /** 历史累计完成订单数；自动经营现由首台服务器解锁。 */
  completedOrders: number;
  activeOrders: OrderState[];
  /** 已购买的订单类型；缺失时由存档迁移推断，避免破坏旧档。 */
  unlockedOrderIds?: string[];
  /** 每个已解锁订单的独立并行槽位；当前固定为 4，字段保留用于旧档迁移。 */
  orderSlotCapacity?: Record<string, number>;
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
  /** CARD-01：全局蓝图算力 × 服务器规模 × 有限天赋。 */
  growth: IncrementalGrowthState;
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
  /** 永不因技术迭代重置的公司等级累计经验；旧档由迁移补齐。 */
  company?: CompanyState;
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
  /** 当前账号的本地/云同步银河历程册。 */
  chronicle: ChronicleState;
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
