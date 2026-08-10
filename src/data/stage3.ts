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
  { id: "power", name: "infra.power.name", icon: "⚡", baseCost: 2_500_000, costGrowth: 1.9, keyLevels: [3, 6, 8], desc: "infra.power.desc" },
  { id: "computeCards", name: "infra.computeCards.name", icon: "🖥️", baseCost: 3_200_000, costGrowth: 1.8, keyLevels: [3, 5, 7], desc: "infra.computeCards.desc" },
  { id: "optical", name: "infra.optical.name", icon: "🔆", baseCost: 2_000_000, costGrowth: 1.9, keyLevels: [3, 5, 7], desc: "infra.optical.desc" },
  { id: "storage", name: "infra.storage.name", icon: "💾", baseCost: 1_800_000, costGrowth: 2.0, keyLevels: [3, 5, 7], desc: "infra.storage.desc" },
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
    name: "era.room1.name",
    scaleName: "room.1.scaleName",
    requires: { power: 0, computeCards: 0, optical: 0, storage: 0 },
    computeMult: 1,
    incomeMult: 1,
    unlocksProject: "project_1",
  },
  {
    index: 2,
    id: "room_2",
    name: "era.room2.name",
    scaleName: "room.2.scaleName",
    requires: { power: 3, computeCards: 3, optical: 2, storage: 2 },
    computeMult: 3,
    incomeMult: 3,
    unlocksProject: "project_2",
  },
  {
    index: 3,
    id: "room_3",
    name: "era.room3.name",
    scaleName: "room.3.scaleName",
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
    name: "flagship.1.name",
    icon: "🧠",
    requiresRooms: 1,
    requiresCompute: 500,
    requiresStorage: 0,
    progressRequired: 500,
    reward: { money: 3_000_000, researchProgress: 25, unlocksRoom: null, computeCardBoost: 1 },
    desc: "flagship.1.desc",
  },
  {
    id: "project_2",
    name: "flagship.2.name",
    icon: "🌐",
    requiresRooms: 2,
    requiresCompute: 5_000,
    requiresOptical: 3,
    requiresStorage: 2,
    progressRequired: 4000,
    reward: { money: 10_000_000, researchProgress: 30, unlocksRoom: 3, rateBonus: 0.15 },
    desc: "flagship.2.desc",
  },
  {
    id: "project_3",
    name: "flagship.3.name",
    icon: "🛰️",
    requiresRooms: 3,
    requiresCompute: 20_000,
    requiresOptical: 4,
    requiresStorage: 8,
    progressRequired: 15000,
    reward: { money: 30_000_000, researchProgress: 40, unlocksRoom: 0 },
    desc: "flagship.3.desc",
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
    name: "flagship.r1.name",
    icon: "🛰️",
    requiresRooms: 3,
    requiresCompute: 0,
    requiresStorage: 0,
    progressRequired: 27000,
    reward: { money: 0, researchProgress: 0, unlocksRoom: null },
    desc: "flagship.r1.desc",
  },
  {
    id: "project_r2",
    name: "flagship.r2.name",
    icon: "🌍",
    requiresRooms: 3,
    requiresCompute: 0,
    requiresStorage: 0,
    progressRequired: 45000,
    reward: { money: 0, researchProgress: 0, unlocksRoom: null },
    desc: "flagship.r2.desc",
  },
  {
    id: "project_r3",
    name: "flagship.r3.name",
    icon: "🌌",
    requiresRooms: 3,
    requiresCompute: 0,
    requiresStorage: 0,
    progressRequired: 43000,
    reward: { money: 0, researchProgress: 0, unlocksRoom: null },
    desc: "flagship.r3.desc",
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
  { id: "bp_general", name: "blueprint.general.name", icon: "⚙️", desc: "blueprint.general.desc", kind: "general" },
  { id: "bp_gpu", name: "blueprint.gpu.name", icon: "🎮", desc: "blueprint.gpu.desc", kind: "gpu" },
  { id: "bp_interconnect", name: "blueprint.interconnect.name", icon: "🔗", desc: "blueprint.interconnect.desc", kind: "interconnect" },
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
  { id: "tech_gpu_array", name: "tech.gpuArray.name", desc: "tech.gpuArray.desc", unlock: { infra: "computeCards", level: 5 }, passive: { compute: 0.05 } },
  { id: "tech_power_modular", name: "tech.powerModular.name", desc: "tech.liquidCooling.desc", unlock: { infra: "power", level: 4 }, passive: { income: 0.04 } },
  { id: "tech_liquid_cooling", name: "tech.liquidCooling.name", desc: "tech.liquidCooling.desc", unlock: { infra: "power", level: 6 }, passive: { compute: 0.04 } },
  { id: "tech_optical_bus", name: "tech.opticalBus.name", desc: "tech.opticalBus.desc", unlock: { infra: "optical", level: 3 }, passive: { throughput: 0.06 } },
  { id: "tech_distributed_storage", name: "tech.distributedStorage.name", desc: "tech.distributedStorage.desc", unlock: { infra: "storage", level: 3 }, passive: null },
  { id: "tech_auto_scheduler", name: "tech.autoScheduler.name", desc: "tech.autoScheduler.desc", unlock: { infra: "storage", level: 5 }, passive: null },
  { id: "tech_regional_network", name: "tech.regionalNetwork.name", desc: "tech.regionalNetwork.desc", unlock: { room: 3 }, passive: { income: 0.06 } },
  { id: "tech_llm_training", name: "tech.llmTraining.name", desc: "tech.llmTraining.desc", unlock: null, passive: { research: 0.05 } },
];

// ---------- 算力纪元 ----------
export interface EraDef {
  id: string;
  name: string;
  /** 解锁条件：true 表示真实达到；false 表示未来锁定档案 */
  real: boolean;
}

export const ERAS: EraDef[] = [
  { id: "era_studio", name: "era.studio.name", real: true },
  { id: "era_own_server", name: "era.ownServer.name", real: true },
  { id: "era_cluster", name: "era.cluster.name", real: true },
  { id: "era_full_cluster", name: "era.fullCluster.name", real: true },
  { id: "era_room1", name: "era.room1.name", real: true },
  { id: "era_room2", name: "era.room2.name", real: true },
  { id: "era_room3", name: "era.room3.name", real: true },
  { id: "era_national", name: "era.national.name", real: true },
  { id: "era_global", name: "era.global.name", real: false },
  { id: "era_planetary", name: "era.planetary.name", real: false },
  { id: "era_orbit", name: "era.orbit.name", real: false },
  { id: "era_moon", name: "era.moon.name", real: false },
  { id: "era_solar", name: "era.solar.name", real: false },
  { id: "era_dyson", name: "era.dyson.name", real: false },
  { id: "era_galaxy", name: "era.galaxy.name", real: false },
  { id: "era_universe", name: "era.universe.name", real: false },
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
