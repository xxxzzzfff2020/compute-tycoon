// 黄金产品合同内容数据：模型/订单/服务器/算力中心。
// 来源：Lua 黄金基线 4a661c8 的产品合同（非代码迁移）。

export interface ModelDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 基础处理能力（订单/秒 的相对单位） */
  baseCompute: number;
  /** 训练一次提升的等级上限 */
  maxLevel: number;
  /** 六个模型各自唯一的产品职责。 */
  role: ModelRole;
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
    id: "codex", name: "代码推理模型", icon: "🤖", desc: "稳定提高全部业务的基础收益",
    baseCompute: 1.0, maxLevel: 20, role: "base_income", roleLabel: "基础业务收益",
    activeBonus: 0.10, archiveBonusPerLevel: 0.01,
  },
  {
    id: "vision", name: "视觉生成模型", icon: "🎨", desc: "提高请求处理速度与整体吞吐",
    baseCompute: 1.4, maxLevel: 15, role: "processing_speed", roleLabel: "处理速度",
    activeBonus: 0.12, archiveBonusPerLevel: 0.01,
  },
  {
    id: "voice", name: "语音合成模型", icon: "🎙️", desc: "让自动经营更多承接高价值业务",
    baseCompute: 1.8, maxLevel: 12, role: "high_value_business", roleLabel: "高价值业务占比",
    activeBonus: 1.0, archiveBonusPerLevel: 0.05,
  },
  {
    id: "science", name: "科学计算模型", icon: "🔬", desc: "提高自动经营的持续产出效率",
    baseCompute: 2.4, maxLevel: 10, role: "automation_efficiency", roleLabel: "自动经营效率",
    activeBonus: 0.12, archiveBonusPerLevel: 0.01,
  },
  {
    id: "distill", name: "知识蒸馏模型", icon: "🧠", desc: "加快订单与工作室带来的免费模型研发",
    baseCompute: 1.6, maxLevel: 12, role: "research_speed", roleLabel: "模型研发速度",
    activeBonus: 0.15, archiveBonusPerLevel: 0.01,
  },
  {
    id: "scheduler", name: "工程调度模型", icon: "🛰️", desc: "提高旗舰工程的算力处理效率",
    baseCompute: 2.0, maxLevel: 10, role: "flagship_efficiency", roleLabel: "旗舰工程效率",
    activeBonus: 0.15, archiveBonusPerLevel: 0.01,
  },
];

export interface OrderDef {
  id: string;
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
  { id: "o1", name: "图文摘要生成", icon: "📝", durationSec: 12, gross: 180, rentalCostRatio: 0.4, recommended: true },
  { id: "o2", name: "代码片段翻译", icon: "🧩", durationSec: 24, gross: 500, rentalCostRatio: 0.45, recommended: false },
  { id: "o3", name: "短视频脚本", icon: "🎬", durationSec: 45, gross: 1250, rentalCostRatio: 0.5, recommended: false },
  { id: "o4", name: "数据报表整理", icon: "📊", durationSec: 90, gross: 3200, rentalCostRatio: 0.55, recommended: false },
  { id: "o5", name: "长文档精读", icon: "📚", durationSec: 180, gross: 8800, rentalCostRatio: 0.6, recommended: false },
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
  name: string;
  cost: number;
  /** 服务器处理能力（模型 compute 的倍率） */
  power: number;
  desc: string;
}

export const SERVERS: ServerDef[] = [
  { id: "server_1", index: 1, name: "入门服务器", cost: 20000, power: 2, desc: "第一台自有服务器，免除租赁成本" },
  { id: "server_2", index: 2, name: "进阶服务器", cost: 75000, power: 4, desc: "第二台服务器，集群雏形" },
  { id: "server_3", index: 3, name: "专业服务器", cost: 220000, power: 8, desc: "第三台服务器，构成集群" },
  { id: "server_4", index: 4, name: "高性能服务器", cost: 100000, power: 24, desc: "规模化运营起点（集群后规模化经济，成本回落）" },
  { id: "server_5", index: 5, name: "旗舰服务器", cost: 250000, power: 36, desc: "第五台：规模化运营" },
  { id: "server_6", index: 6, name: "机架服务器", cost: 950000, power: 54, desc: "第六台服务器" },
  { id: "server_7", index: 7, name: "机柜服务器", cost: 2600000, power: 81, desc: "第七台服务器" },
  { id: "server_8", index: 8, name: "算力中心级服务器", cost: 5200000, power: 120, desc: "第八台：算力中心升级条件" },
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
