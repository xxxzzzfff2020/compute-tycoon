// 工作室成长轨道：轻量经验/等级，只服务于阶段成长，不引入技能树/新货币。
import Decimal from "decimal.js";
import { toStoredBig, type StoredBig } from "../core/big";
import type { SaveData } from "../save/types";
import { SERVERS, type OrderDef } from "../data/content";
import { flowCompressionUnlocked } from "./singularity";
import { registerOwnedServerUnit, syncTalentPoints } from "./incremental-growth";
import { addCompanyExperience } from "./company-level";

// ---------- 常数 ----------
/** 首服/自动经营里程碑：负责人反馈 #19403 要求标准手动体验约 3 分钟。 */
export const FIRST_SERVER_WORKSHOP_LEVEL = 3;
/** 与首个订单自带四格的手动吞吐校准：标准策略约 3 分钟达到。 */
export const FIRST_SERVER_LIFETIME_REVENUE = 7_200;

/** 订单经验 = 毛收入 × 经验系数（向上取整；订单类型差异自然体现）。
 *  校准目标：标准策略 Lv6 约 8-10 分钟（与累计营业收入 24k 门槛同步）。 */
export const ORDER_EXPERIENCE_RATIO = 0.03;

/** 首次获取模型经验奖励 */
export const XP_FIRST_MODEL = 30;
/** 解锁自动经营经验奖励 */
export const XP_AUTOMATION_UNLOCK = 60;
/** 获得首服经验奖励 */
export const XP_FIRST_SERVER = 100;

/** 升级所需经验：平坦曲线 60 + 40×level（Lv1→2 需 100）。 */
export function experienceToNextLevel(level: number): number {
  return Math.floor(60 + 40 * level);
}

/** 某订单完成后提供的经验（基础值，与倍率无关） */
export function orderExperience(order: OrderDef): number {
  return Math.max(1, Math.ceil(order.gross * ORDER_EXPERIENCE_RATIO));
}

/** 按存档状态结算的订单经验：技术迭代的永久收入倍率同时加速工作室成长（第二轮首服更快）。
 *  算力中心/模型倍率不参与，避免 Stage 1 经验节奏被倍率污染。 */
export function orderExperienceForState(state: SaveData, order: OrderDef): number {
  const base = orderExperience(order);
  const mult = new Decimal(state.permanentMultiplier ?? 1);
  if (mult.lte(1)) return base;
  return Math.max(1, Math.ceil(mult.toNumber() * base));
}

/** 旧存档/测试导出兼容；免费研发机制已下线，不再产生进度。 */
export const RESEARCH_PER_LEVEL_UP = 0;
export const RESEARCH_PER_REVENUE = 0;

/** 累积模型研发进度（0-100 封顶）。返回是否因升级获得额外进度 */
export function addExperience(state: SaveData, xp: number): boolean {
  if (!state.workshop) return false;
  if (xp <= 0) return false;
  let leveled = false;
  state.workshop.experience += xp;
  addCompanyExperience(state, xp);
  // 反复升级直到经验不足
  while (
    state.workshop.experience >= state.workshop.experienceToNextLevel
  ) {
    state.workshop.experience -= state.workshop.experienceToNextLevel;
    state.workshop.level += 1;
    state.workshop.experienceToNextLevel = experienceToNextLevel(state.workshop.level);
    leveled = true;
  }
  syncTalentPoints(state);
  return leveled;
}

/** @deprecated 免费研发已下线；保留无副作用导出供旧调用安全降级。 */
export function addResearchFromOrder(_state: SaveData, _order: OrderDef): void {
  // no-op
}

/** @deprecated 免费研发已下线；保留无副作用导出供旧调用安全降级。 */
export function addResearchFromLevelUp(_state: SaveData): void {
  // no-op
}

/** 当前累计营业收入（与 lifetimeIncome 同源，只增不减） */
export function lifetimeRevenue(state: SaveData): Decimal {
  return new Decimal(state.workshop?.lifetimeRevenue ?? state.lifetimeIncome);
}

/** 首服里程碑是否已满足（等级 + 累计收入同时达标） */
export function firstServerMilestoneMet(state: SaveData): boolean {
  const ws = state.workshop;
  if (!ws) return false;
  // CARD-01 核心 2 奖励：已学早期流程压缩（首服门槛减半）。
  if (flowCompressionUnlocked(state)) {
    return (
      ws.level >= Math.ceil(FIRST_SERVER_WORKSHOP_LEVEL / 2) &&
      lifetimeRevenue(state).gte(FIRST_SERVER_LIFETIME_REVENUE / 2)
    );
  }
  return (
    ws.level >= FIRST_SERVER_WORKSHOP_LEVEL &&
    lifetimeRevenue(state).gte(FIRST_SERVER_LIFETIME_REVENUE)
  );
}

/** 首服是否已通过里程碑授予 */
export function firstServerAwarded(state: SaveData): boolean {
  return state.workshop?.firstServerAwarded === true;
}

/** 授予首服（里程碑）：不扣资金，只触发一次。返回是否成功授予 */
export function awardFirstServer(state: SaveData): { ok: boolean; awarded: boolean } {
  if (state.workshop?.firstServerAwarded) return { ok: false, awarded: false };
  if (!firstServerMilestoneMet(state)) return { ok: false, awarded: false };
  // 直接加入资产，不扣除当前资金
  state.serverCount = 1;
  // 无服务器时 serverPower=1 只是计算占位；首服后改为真实服务器算力总和。
  state.serverPower = SERVERS[0].power;
  registerOwnedServerUnit(state, SERVERS[0].id);
  state.rentalCompute = { active: false, units: 0, unitCostPerSec: 0 };
  state.workshop.firstServerAwarded = true;
  // 里程碑经验奖励（不改变等级之外的东西）
  addExperience(state, XP_FIRST_SERVER);
  return { ok: true, awarded: true };
}


/** 首服解锁进度（用于 UI 展示：等级 / 累计收入） */
export function firstServerProgress(state: SaveData): {
  levelCurrent: number;
  levelTarget: number;
  revenueCurrent: StoredBig;
  revenueTarget: number;
  met: boolean;
  awarded: boolean;
} {
  const compressed = flowCompressionUnlocked(state);
  return {
    levelCurrent: state.workshop?.level ?? 1,
    levelTarget: compressed ? Math.ceil(FIRST_SERVER_WORKSHOP_LEVEL / 2) : FIRST_SERVER_WORKSHOP_LEVEL,
    revenueCurrent: toStoredBig(lifetimeRevenue(state)),
    revenueTarget: compressed ? FIRST_SERVER_LIFETIME_REVENUE / 2 : FIRST_SERVER_LIFETIME_REVENUE,
    met: firstServerMilestoneMet(state),
    awarded: firstServerAwarded(state),
  };
}
