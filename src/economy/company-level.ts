import type { CompanyState, SaveData } from "../save/types";

/**
 * 公司等级是跨技术迭代、跨地球/宇宙阶段的永久成长轨道。
 * 曲线复用玩家已经熟悉的工作室升级曲线，但只保存累计经验，等级由闭式公式派生。
 */
export const COMPANY_PREVIOUS_EARTH_RUN_XP = 120_000;
/** 宇宙阶段在缺少可验证地球经营速率时的保底值；生产链会传入地球终局实际速率。 */
export const COMPANY_COSMIC_XP_FLOOR_PER_SEC = 3;
/** 旧曲线在此等级前保持不变；锚点保证既有 Lv2681 存档不掉级。 */
export const COMPANY_SOFT_CAP_PIVOT_LEVEL = 2_680;
/** Lv2680 后每 100 级的单级经验需求累计扩大约 1.5 倍。 */
export const COMPANY_REQUIREMENT_GROWTH_PER_100_LEVELS = 1.5;
export const COMPANY_LEVEL_MAX_PLATFORM_SCORE = 2_147_483_647;

// 只用于缺失 company 字段的旧档迁移，必须保留旧版本已兑现的标准时长折算。
const COMPANY_LEGACY_STAGE4_XP_PER_SEC = 1;
const COMPANY_LEGACY_STAGE5_XP_PER_SEC = 2;

const COMPANY_REQUIREMENT_GROWTH_PER_LEVEL = Math.pow(
  COMPANY_REQUIREMENT_GROWTH_PER_100_LEVELS,
  1 / 100,
);
const COMPANY_REQUIREMENT_GROWTH_LOG = Math.log(COMPANY_REQUIREMENT_GROWTH_PER_LEVEL);
const COMPANY_PIVOT_EXPERIENCE = linearCompanyExperienceForLevel(COMPANY_SOFT_CAP_PIVOT_LEVEL);
const COMPANY_PIVOT_NEXT_REQUIREMENT = 40 * COMPANY_SOFT_CAP_PIVOT_LEVEL + 60;

export interface CompanyLevelProgress {
  level: number;
  totalExperience: number;
  experience: number;
  experienceToNextLevel: number;
  progress: number;
  titleKey: string;
}

const TITLE_TIERS: ReadonlyArray<{ minLevel: number; key: string }> = [
  { minLevel: 185, key: "company.title.cosmicTycoon" },
  { minLevel: 146, key: "company.title.stellarOverlord" },
  { minLevel: 134, key: "company.title.lunarEmpire" },
  { minLevel: 110, key: "company.title.planetaryGiant" },
  { minLevel: 80, key: "company.title.regionalGroup" },
  { minLevel: 50, key: "company.title.clusterLeader" },
  { minLevel: 25, key: "company.title.cloudCompany" },
  { minLevel: 10, key: "company.title.computeRisingStar" },
  { minLevel: 1, key: "company.title.startupStudio" },
];

function linearCompanyExperienceForLevel(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  return 20 * (normalized - 1) * (normalized + 3);
}

/**
 * 到达指定等级时所需的累计公司经验；Lv.1 为 0。
 *
 * Lv2680 前沿用旧二次曲线。之后不降低经验流速，而让单级门槛按平滑复利增长：
 * 每一级约 ×1.004063、每 100 级累计约 ×1.5，Lv5000 形成强软上限。
 */
export function companyExperienceForLevel(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized <= COMPANY_SOFT_CAP_PIVOT_LEVEL) {
    return linearCompanyExperienceForLevel(normalized);
  }
  const steps = normalized - COMPANY_SOFT_CAP_PIVOT_LEVEL;
  const geometricRequirements = COMPANY_PIVOT_NEXT_REQUIREMENT
    * Math.expm1(steps * COMPANY_REQUIREMENT_GROWTH_LOG)
    / Math.expm1(COMPANY_REQUIREMENT_GROWTH_LOG);
  return COMPANY_PIVOT_EXPERIENCE + geometricRequirements;
}

/** 旧段闭式求逆；软上限段用几何级数逆运算并校正浮点边界。 */
export function companyLevelFromExperience(totalExperience: number): number {
  if (!Number.isFinite(totalExperience) || totalExperience <= 0) return 1;
  if (totalExperience < COMPANY_PIVOT_EXPERIENCE) {
    return Math.max(1, Math.floor(Math.sqrt(totalExperience / 20 + 4) - 1));
  }
  const scaled = 1 + (totalExperience - COMPANY_PIVOT_EXPERIENCE)
    * Math.expm1(COMPANY_REQUIREMENT_GROWTH_LOG)
    / COMPANY_PIVOT_NEXT_REQUIREMENT;
  const approximateSteps = Math.max(0, Math.floor(Math.log(scaled) / COMPANY_REQUIREMENT_GROWTH_LOG));
  let level = COMPANY_SOFT_CAP_PIVOT_LEVEL + approximateSteps;
  while (totalExperience >= companyExperienceForLevel(level + 1)) level += 1;
  while (level > COMPANY_SOFT_CAP_PIVOT_LEVEL && totalExperience < companyExperienceForLevel(level)) level -= 1;
  return level;
}

export function companyTitleKey(level: number): string {
  return TITLE_TIERS.find((tier) => level >= tier.minLevel)?.key ?? TITLE_TIERS[TITLE_TIERS.length - 1].key;
}

function workshopTotalExperience(state: Pick<SaveData, "workshop">): number {
  const workshop = state.workshop;
  const level = Math.max(1, Math.floor(workshop?.level ?? 1));
  return companyExperienceForLevel(level) + Math.max(0, Number(workshop?.experience ?? 0));
}

/**
 * 旧档没有公司经验时，用仍可验证的本轮工作室与已完成轮次建立保守迁移锚点。
 * Stage 5 / 永续只补已经完成阶段的标准时长经验，不根据财富反推等级。
 */
export function legacyCompanyExperience(state: Pick<SaveData, "workshop" | "technologyIterationCount" | "singularity">): number {
  const priorEarthRuns = Math.min(2, Math.max(0, Math.floor(state.technologyIterationCount ?? 0)));
  let total = workshopTotalExperience(state) + priorEarthRuns * COMPANY_PREVIOUS_EARTH_RUN_XP;
  if (state.singularity?.stage5?.entered) total += 4 * 60 * 60 * COMPANY_LEGACY_STAGE4_XP_PER_SEC;
  if (state.singularity?.perpetual) total += 8 * 60 * 60 * COMPANY_LEGACY_STAGE5_XP_PER_SEC;
  return Math.max(0, total);
}

export function normalizeCompanyState(
  raw: unknown,
  state: Pick<SaveData, "workshop" | "technologyIterationCount" | "singularity">,
): CompanyState {
  if (raw && typeof raw === "object") {
    const total = Number((raw as Record<string, unknown>).totalExperience);
    if (Number.isFinite(total) && total >= 0) return { totalExperience: total };
  }
  return { totalExperience: legacyCompanyExperience(state) };
}

export function ensureCompanyState(state: SaveData): CompanyState {
  const current = state.company;
  if (!current || !Number.isFinite(current.totalExperience) || current.totalExperience < 0) {
    const normalized = normalizeCompanyState(current, state);
    state.company = normalized;
    return normalized;
  }
  return current;
}

export function addCompanyExperience(state: SaveData, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const company = ensureCompanyState(state);
  const before = company.totalExperience;
  company.totalExperience = before + amount;
  return company.totalExperience - before;
}

export function companyLevelProgress(state: SaveData): CompanyLevelProgress {
  const totalExperience = ensureCompanyState(state).totalExperience;
  const level = companyLevelFromExperience(totalExperience);
  const floor = companyExperienceForLevel(level);
  const ceiling = companyExperienceForLevel(level + 1);
  const experienceToNextLevel = Math.max(1, ceiling - floor);
  const experience = Math.max(0, totalExperience - floor);
  return {
    level,
    totalExperience,
    experience,
    experienceToNextLevel,
    progress: Math.min(1, experience / experienceToNextLevel),
    titleKey: companyTitleKey(level),
  };
}

/**
 * 宇宙阶段继续沿用地球终局可验证的经营经验速率，避免进入 Stage4 后突然跌到 1/2/3 点每秒。
 * 排行榜减速只由 Lv2680 后的复利门槛负责。
 */
export function companyCosmicExperiencePerSecond(state: SaveData, earthReferenceRate = 0): number {
  const cosmicEntered = Boolean(
    state.singularity?.perpetual
    || state.singularity?.stage5?.entered
    || state.singularity?.stage4?.entered,
  );
  if (cosmicEntered) return Math.max(COMPANY_COSMIC_XP_FLOOR_PER_SEC, earthReferenceRate);
  return 0;
}

export function applyCompanyCosmicExperience(
  state: SaveData,
  elapsedSec: number,
  efficiency = 1,
  earthReferenceRate = 0,
): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  const rate = companyCosmicExperiencePerSecond(state, earthReferenceRate);
  if (rate <= 0) return 0;
  return addCompanyExperience(state, rate * elapsedSec * Math.max(0, efficiency));
}

/** 排行榜直接提交肉眼可见的公司等级，不做隐藏小数或财富编码。 */
export function encodeCompanyLevelScore(state: SaveData): number | null {
  const level = companyLevelProgress(state).level;
  return Number.isSafeInteger(level) && level >= 1 && level <= COMPANY_LEVEL_MAX_PLATFORM_SCORE
    ? level
    : null;
}
