// 黄金产品合同内容数据：模型/订单/服务器/算力中心。
// 来源：Lua 黄金基线 4a661c8 的产品合同（非代码迁移）。

export interface ModelDef {
  id: string;
  /** 展示名：i18n key（zh-CN 原文） */
  name: string;
  icon: string;
  /** 展示描述：i18n key */
  desc: string;
  /** 基础处理能力（订单/秒 的相对单位） */
  baseCompute: number;
  /** 训练一次提升的等级上限 */
  maxLevel: number;
  /** 六个模型各自唯一的产品职责。 */
  role: ModelRole;
  /** 职责标签：i18n key */
  roleLabel: string;
  /** 当前主力模型启用时的职责加成。 */
  activeBonus: number;
  /** 已拥有图鉴每级提供的小额永久被动。 */
  archiveBonusPerLevel: number;
}

export type ModelRole =
  | "base_income"
  | "processing_speed"
  | "high_value_business"
  | "automation_efficiency"
  | "research_speed"
  | "flagship_efficiency";

/** 所有当前可用模型共用的永久图鉴研发上限；训练上限仍由 ModelDef.maxLevel 决定。 */
export const MODEL_ARCHIVE_MAX_LEVEL = 20;

export const MODELS: ModelDef[] = [
  {
    id: "codex", name: "model.codex.name", icon: "🤖", desc: "model.codex.desc",
    baseCompute: 1.0, maxLevel: 20, role: "base_income", roleLabel: "model.codex.roleLabel",
    activeBonus: 0.10, archiveBonusPerLevel: 0.01,
  },
  {
    id: "vision", name: "model.vision.name", icon: "🎨", desc: "model.vision.desc",
    baseCompute: 1.4, maxLevel: 15, role: "processing_speed", roleLabel: "model.vision.roleLabel",
    activeBonus: 0.12, archiveBonusPerLevel: 0.01,
  },
  {
    id: "voice", name: "model.voice.name", icon: "🎙️", desc: "model.voice.desc",
    baseCompute: 1.8, maxLevel: 12, role: "high_value_business", roleLabel: "model.voice.roleLabel",
    activeBonus: 1.0, archiveBonusPerLevel: 0.05,
  },
  {
    id: "science", name: "model.science.name", icon: "🔬", desc: "model.science.desc",
    baseCompute: 2.4, maxLevel: 10, role: "automation_efficiency", roleLabel: "model.science.roleLabel",
    activeBonus: 0.12, archiveBonusPerLevel: 0.01,
  },
  {
    id: "distill", name: "model.distill.name", icon: "🧠", desc: "model.distill.desc",
    baseCompute: 1.6, maxLevel: 12, role: "research_speed", roleLabel: "model.distill.roleLabel",
    activeBonus: 0.15, archiveBonusPerLevel: 0.01,
  },
  {
    id: "scheduler", name: "model.scheduler.name", icon: "🛰️", desc: "model.scheduler.desc",
    baseCompute: 2.0, maxLevel: 10, role: "flagship_efficiency", roleLabel: "model.scheduler.roleLabel",
    activeBonus: 0.15, archiveBonusPerLevel: 0.01,
  },
];

export interface OrderDef {
  id: string;
  /** 展示名：i18n key（zh-CN 原文） */
  name: string;
  icon: string;
  /** 处理所需秒数 */
  durationSec: number;
  /** 毛收入 */
  gross: number;
  /** 租赁算力成本（毛收入的百分比系数） */
  rentalCostRatio: number;
  /** 推荐难度标记 */
  recommended: boolean;
}

export const ORDERS: OrderDef[] = [
  // 推荐订单（o1）是自动经营的默认工作单；手工阶段可选择更高净率的长单。
  { id: "o1", name: "order.o1.name", icon: "📝", durationSec: 12, gross: 180, rentalCostRatio: 0.4, recommended: true },
  { id: "o2", name: "order.o2.name", icon: "🧩", durationSec: 24, gross: 500, rentalCostRatio: 0.45, recommended: false },
  { id: "o3", name: "order.o3.name", icon: "🎬", durationSec: 45, gross: 1250, rentalCostRatio: 0.5, recommended: false },
  { id: "o4", name: "order.o4.name", icon: "📊", durationSec: 90, gross: 3200, rentalCostRatio: 0.55, recommended: false },
  { id: "o5", name: "order.o5.name", icon: "📚", durationSec: 180, gross: 8800, rentalCostRatio: 0.6, recommended: false },
];

/** 自动经营基础业务组合；模型只能改变权重，不增加新订单。 */
export const BASE_BUSINESS_MIX: ReadonlyArray<{ orderId: string; share: number }> = [
  { orderId: "o1", share: 88 },
  { orderId: "o2", share: 6 },
  { orderId: "o3", share: 3 },
  { orderId: "o4", share: 2 },
  { orderId: "o5", share: 1 },
];

export interface ServerDef {
  id: string;
  /** 第 n 台服务器 */
  index: number;
  /** 展示名：i18n key（zh-CN 原文） */
  name: string;
  cost: number;
  /** 服务器处理能力（模型 compute 的倍率） */
  power: number;
  /** 展示描述：i18n key */
  desc: string;
}

export const SERVERS: ServerDef[] = [
  { id: "server_1", index: 1, name: "server.s1.name", cost: 20000, power: 2, desc: "server.s1.desc" },
  { id: "server_2", index: 2, name: "server.s2.name", cost: 75000, power: 4, desc: "server.s2.desc" },
  { id: "server_3", index: 3, name: "server.s3.name", cost: 220000, power: 8, desc: "server.s3.desc" },
  { id: "server_4", index: 4, name: "server.s4.name", cost: 100000, power: 24, desc: "server.s4.desc" },
  { id: "server_5", index: 5, name: "server.s5.name", cost: 250000, power: 36, desc: "server.s5.desc" },
  { id: "server_6", index: 6, name: "server.s6.name", cost: 950000, power: 54, desc: "server.s6.desc" },
  { id: "server_7", index: 7, name: "server.s7.name", cost: 2600000, power: 81, desc: "server.s7.desc" },
  { id: "server_8", index: 8, name: "server.s8.name", cost: 5200000, power: 120, desc: "server.s8.desc" },
];

/** 服务器阶段进度：3 台初级集群 / 5 台规模化运营 / 8 台算力中心升级条件 */
export const SERVER_CLUSTER_COUNT = 3;
export const SERVER_SCALE_COUNT = 5;
export const SERVER_CENTER_REQUIREMENT = 8;

export const CENTER_BASE_COST = 600_000;
export const CENTER_COST_GROWTH = 1.7;
export const CENTER_POWER_PER_LEVEL = 4.0; // 算力中心每级处理倍率
export const CENTER_INCOME_MULT_PER_LEVEL = 1.7; // 算力中心每级收入倍率
export const CENTER_MAX_LEVEL = 40;

export const FIRST_SERVER_COST = SERVERS[0].cost;
export const SECOND_SERVER_COST = SERVERS[1].cost;
export const THIRD_SERVER_COST = SERVERS[2].cost;

/** 第一次技术迭代目标：本轮累计收入（含离线） */
export const PRESTIGE_TARGET_INCOME = 600_000_000;

export const AUTOMATION_UNLOCK_ORDERS = 6; // 完成 6 个订单解锁自动经营
export const AUTOMATION_ORDER_CAP = 4; // 自动经营同时处理的最大订单数
