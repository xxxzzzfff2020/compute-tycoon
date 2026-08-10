// Stage 3 内容数据：基础设施 / 机房 / 旗舰工程 / 集群架构蓝图 / 科技档案 / 算力纪元。
// 数值经经济模拟校准（见 docs/ECONOMY_SIMULATION.md）。

// ---------- 四项全局基础设施 ----------
export interface InfrastructureDef {
  id: "power" | "computeCards" | "optical" | "storage";
  name: string;
  icon: string;
  /** 每级成本（成本 = base × growth^level） */
  baseCost: number;
  costGrowth: number;
  /** 关键等级（用于机房门槛/科技档案解锁） */
  keyLevels: number[];
  desc: string;
}

export const INFRASTRUCTURES: InfrastructureDef[] = [
  { id: "power", name: "电力设施", icon: "⚡", baseCost: 2_500_000, costGrowth: 1.9, keyLevels: [3, 6, 8], desc: "决定机房可投产上限；电力不足时算力降载运行（不损坏）" },
  { id: "computeCards", name: "算力卡", icon: "🖥️", baseCost: 3_200_000, costGrowth: 1.8, keyLevels: [3, 5, 7], desc: "直接提高总算力与请求处理速度" },
  { id: "optical", name: "光模块", icon: "🔆", baseCost: 2_000_000, costGrowth: 1.9, keyLevels: [3, 5, 7], desc: "提高有效吞吐与算力向收入的转化率" },
  { id: "storage", name: "存储阵列", icon: "💾", baseCost: 1_800_000, costGrowth: 2.0, keyLevels: [3, 5, 7], desc: "提高旗舰工程奖励与数据承载能力" },
];

export function infraById(id: string): InfrastructureDef {
  const def = INFRASTRUCTURES.find((d) => d.id === id);
  if (!def) throw new Error("unknown infrastructure: " + id);
  return def;
}

export function infraUpgradeCost(id: string, level: number): number {
  const def = infraById(id);
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, level));
}

// ---------- 机房 ----------
export interface MachineRoomDef {
  index: number;
  id: string;
  name: string;
  scaleName: string;
  /** 投产门槛：基础设施最低等级 */
  requires: { power: number; computeCards: number; optical: number; storage: number };
  /** 投产后的算力倍率（对基础总算力的放大） */
  computeMult: number;
  /** 投产后的收入倍率 */
  incomeMult: number;
  /** 解锁的旗舰工程 */
  unlocksProject: string | null;
}

export const MACHINE_ROOMS: MachineRoomDef[] = [
  {
    index: 1,
    id: "room_1",
    name: "集群核心机房",
    scaleName: "集群核心机房",
    requires: { power: 0, computeCards: 0, optical: 0, storage: 0 },
    computeMult: 1,
    incomeMult: 1,
    unlocksProject: "project_1",
  },
  {
    index: 2,
    id: "room_2",
    name: "企业级算力机房",
    scaleName: "企业级算力机房",
    requires: { power: 3, computeCards: 3, optical: 2, storage: 2 },
    computeMult: 3,
    incomeMult: 3,
    unlocksProject: "project_2",
  },
  {
    index: 3,
    id: "room_3",
    name: "区域算力中心",
    scaleName: "区域级算力运营商",
    // 曲线协调：机房 3 在中段门槛投产，最终工程仍要求存储 8，保留后续成长段。
    requires: { power: 6, computeCards: 7, optical: 5, storage: 5 },
    computeMult: 12,
    incomeMult: 12,
    unlocksProject: "project_3",
  },
];

export function roomById(index: number): MachineRoomDef {
  const def = MACHINE_ROOMS.find((r) => r.index === index);
  if (!def) throw new Error("unknown machine room: " + index);
  return def;
}

/** 机房投产红利：固定 60 个真实墙钟秒收入 ×4。 */
export const COMMISSION_BONUS_DURATION_SEC = 60;
export const COMMISSION_BONUS_MULT = 4;

// ---------- 旗舰算力工程 ----------
export interface FlagshipProjectDef {
  id: string;
  name: string;
  icon: string;
  /** 解锁所需机房数量 */
  requiresRooms: number;
  /** 解锁所需总算力（当前轮） */
  requiresCompute: number;
  /** 解锁所需光模块等级（工程 2 门槛） */
  requiresOptical?: number;
  /** 计算存储奖励加成时的最低存储等级。 */
  requiresStorage: number;
  /** 完成所需进度（进度由总算力驱动） */
  progressRequired: number;
  /** 完成奖励 */
  reward: {
    money: number;
    researchProgress: number;
    /** 解锁机房建设资格 */
    unlocksRoom: number | null;
    /** 业务费率提高（永久本轮） */
    rateBonus?: number;
    /** 解锁更高算力卡等级（工程 1 奖励） */
    computeCardBoost?: number;
  };
  desc: string;
}

export const FLAGSHIP_PROJECTS: FlagshipProjectDef[] = [
  {
    id: "project_1",
    name: "大模型集中训练",
    icon: "🧠",
    requiresRooms: 1,
    requiresCompute: 500,
    requiresStorage: 0,
    progressRequired: 500,
    reward: { money: 3_000_000, researchProgress: 25, unlocksRoom: null, computeCardBoost: 1 },
    desc: "机房 1 运行后解锁；完成后获得大额资金、模型研发进度与高阶算力卡",
  },
  {
    id: "project_2",
    name: "全国推理服务网络",
    icon: "🌐",
    requiresRooms: 2,
    requiresCompute: 5_000,
    requiresOptical: 3,
    requiresStorage: 2,
    progressRequired: 4000,
    reward: { money: 10_000_000, researchProgress: 30, unlocksRoom: 3, rateBonus: 0.15 },
    desc: "机房 2 投产后解锁；完成提高本轮业务费率并解锁机房 3 建设资格",
  },
  {
    id: "project_3",
    name: "区域推理协作网",
    icon: "🛰️",
    requiresRooms: 3,
    requiresCompute: 20_000,
    requiresOptical: 4,
    requiresStorage: 8,
    progressRequired: 15000,
    reward: { money: 30_000_000, researchProgress: 40, unlocksRoom: 0 },
    desc: "机房 3 投产后解锁；完成解锁第一次技术迭代与算力纪元记录",
  },
];

/**
 * 时代工程（每轮唯一最昂贵目标；正式终局与隔离 Review 共用）。
 * - R1 解锁点：现有旗舰 project_3 完成后追加“区域算力协作网”（方案 C）。
 * - R2：全球算力骨干环（核心 1 已领后解锁；进度 cap 14/秒）。
 * - R3：行星算力统一场（核心 2 已领后解锁；进度 cap 18/秒）。
 * 数值校准来自 CARD-00 模拟（required 27000/45000/43000）。
 */
export const ERA_PROJECTS: FlagshipProjectDef[] = [
  {
    id: "project_r1",
    name: "区域算力协作网",
    icon: "🛰️",
    requiresRooms: 3,
    requiresCompute: 0,
    requiresStorage: 0,
    progressRequired: 27000,
    reward: { money: 0, researchProgress: 0, unlocksRoom: null },
    desc: "R1 时代工程：三座机房与区域算力网络完成后追加的唯一目标，完成可领取奇点核心 1",
  },
  {
    id: "project_r2",
    name: "全球算力骨干环",
    icon: "🌍",
    requiresRooms: 3,
    requiresCompute: 0,
    requiresStorage: 0,
    progressRequired: 45000,
    reward: { money: 0, researchProgress: 0, unlocksRoom: null },
    desc: "R2 时代工程：跨大洲的全球算力骨干环，完成可领取奇点核心 2",
  },
  {
    id: "project_r3",
    name: "行星算力统一场",
    icon: "🌌",
    requiresRooms: 3,
    requiresCompute: 0,
    requiresStorage: 0,
    progressRequired: 43000,
    reward: { money: 0, researchProgress: 0, unlocksRoom: null },
    desc: "R3 时代工程：将全球算力统一为行星级场域，完成可领取奇点核心 3 并揭示地外算力计划",
  },
];

export function projectById(id: string): FlagshipProjectDef {
  const def = FLAGSHIP_PROJECTS.find((p) => p.id === id);
  if (!def) throw new Error("unknown flagship project: " + id);
  return def;
}

// ---------- 集群架构蓝图 ----------
export interface BlueprintDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 仅用于档案馆展示；实际全局倍率由已自动解锁的节点数量统一计算。 */
  kind: "general" | "gpu" | "interconnect";
}

export const BLUEPRINTS: BlueprintDef[] = [
  { id: "bp_general", name: "通用计算架构", icon: "⚙️", desc: "达到 3 台服务器时自动永久解锁", kind: "general" },
  { id: "bp_gpu", name: "GPU 并行架构", icon: "🎮", desc: "达到 5 台服务器时自动永久解锁", kind: "gpu" },
  { id: "bp_interconnect", name: "高速互联架构", icon: "🔗", desc: "达到 8 台服务器时自动永久解锁", kind: "interconnect" },
];

export function blueprintById(id: string): BlueprintDef {
  const def = BLUEPRINTS.find((b) => b.id === id);
  if (!def) throw new Error("unknown blueprint: " + id);
  return def;
}

// ---------- 科技档案（自动解锁，少量永久被动） ----------
export interface TechArchiveDef {
  id: string;
  name: string;
  desc: string;
  /** 解锁条件：infrastructure 达到等级 或 机房达到 index */
  unlock: { infra?: string; level: number; room?: number } | { room: number } | null;
  /** 永久被动：收入/算力/吞吐/研发速度等倍率 */
  passive: { income?: number; compute?: number; throughput?: number; research?: number } | null;
}

export const TECH_ARCHIVES: TechArchiveDef[] = [
  { id: "tech_gpu_array", name: "高密度GPU阵列", desc: "算力卡达到关键等级后解锁", unlock: { infra: "computeCards", level: 5 }, passive: { compute: 0.05 } },
  { id: "tech_power_modular", name: "模块化供电系统", desc: "电力设施达到关键等级后解锁", unlock: { infra: "power", level: 4 }, passive: { income: 0.04 } },
  { id: "tech_liquid_cooling", name: "液冷机房架构", desc: "电力设施达到关键等级后解锁", unlock: { infra: "power", level: 6 }, passive: { compute: 0.04 } },
  { id: "tech_optical_bus", name: "高速光互联总线", desc: "光模块达到关键等级后解锁", unlock: { infra: "optical", level: 3 }, passive: { throughput: 0.06 } },
  { id: "tech_distributed_storage", name: "分布式存储阵列", desc: "存储阵列达到关键等级后记录；存储收益由正式离线/旗舰合同统一计算", unlock: { infra: "storage", level: 3 }, passive: null },
  { id: "tech_auto_scheduler", name: "自治调度系统", desc: "存储阵列达到关键等级后记录；不额外改变吞吐或直接收入", unlock: { infra: "storage", level: 5 }, passive: null },
  { id: "tech_regional_network", name: "区域算力网络", desc: "机房 3 投产后解锁", unlock: { room: 3 }, passive: { income: 0.06 } },
  { id: "tech_llm_training", name: "大模型集中训练设施", desc: "完成旗舰工程 1 后解锁", unlock: null, passive: { research: 0.05 } },
];

// ---------- 算力纪元 ----------
export interface EraDef {
  id: string;
  name: string;
  /** 解锁条件：true 表示真实达到；false 表示未来锁定档案 */
  real: boolean;
}

export const ERAS: EraDef[] = [
  { id: "era_studio", name: "个人AI工作室", real: true },
  { id: "era_own_server", name: "自有服务器", real: true },
  { id: "era_cluster", name: "初级服务器集群", real: true },
  { id: "era_full_cluster", name: "完整服务器集群", real: true },
  { id: "era_room1", name: "集群核心机房", real: true },
  { id: "era_room2", name: "企业级算力机房", real: true },
  { id: "era_room3", name: "区域算力中心", real: true },
  { id: "era_national", name: "全国级算力网络", real: true },
  { id: "era_global", name: "全球算力网络", real: false },
  { id: "era_planetary", name: "行星级算力网络", real: false },
  { id: "era_orbit", name: "近地轨道算力环", real: false },
  { id: "era_moon", name: "月球计算基地", real: false },
  { id: "era_solar", name: "太阳系算力网络", real: false },
  { id: "era_dyson", name: "戴森算力云", real: false },
  { id: "era_galaxy", name: "银河计算网络", real: false },
  { id: "era_universe", name: "宇宙模拟阵列", real: false },
];

// ---------- 开发验收档位 ----------
export const DEV_VERIFY_STATES = [
  { id: "stage2_almost_done", label: "Stage 2 即将完成" },
  { id: "stage3_entry", label: "Stage 3 刚进入" },
  { id: "room2_almost", label: "机房2即将投产" },
  { id: "room3_almost", label: "机房3即将投产" },
  { id: "final_project_almost", label: "最终旗舰工程即将完成" },
  { id: "iteration_ready", label: "第一次技术迭代确认页" },
  { id: "second_run_start", label: "第二轮刚开始" },
] as const;
