import Decimal from "decimal.js";
import {
  LEGACY_MODEL_TRAINING_MAX_LEVEL,
  MODEL_TRAINING_MAX_LEVEL,
} from "../data/content";

export const TRAIN_COST_BASE = 70;
export const TRAIN_COST_GROWTH = 1.9;
export const TRAIN_COMPUTE_GAIN = 0.10;
export const MODEL_TRAINING_SCHEMA_VERSION = 9;

const LEGACY_TRAINING_STEPS = LEGACY_MODEL_TRAINING_MAX_LEVEL - 1;
const TRAINING_STEPS = MODEL_TRAINING_MAX_LEVEL - 1;

function mappedLevelForLegacyLevel(legacyLevel: number): number {
  const legacy = Math.min(LEGACY_MODEL_TRAINING_MAX_LEVEL, Math.max(1, Math.floor(legacyLevel)));
  return 1 + Math.round(((legacy - 1) * TRAINING_STEPS) / LEGACY_TRAINING_STEPS);
}

function legacyStepCost(legacyLevel: number): Decimal {
  return new Decimal(TRAIN_COST_BASE)
    .mul(new Decimal(TRAIN_COST_GROWTH).pow(legacyLevel - 1))
    .floor();
}

/** 旧 1→20 训练路径的逐级取整总成本，作为 40 级拆分后的精确总价锚点。 */
export const LEGACY_TRAINING_TOTAL_COST = (() => {
  let total = new Decimal(0);
  for (let legacyLevel = 1; legacyLevel < LEGACY_MODEL_TRAINING_MAX_LEVEL; legacyLevel += 1) {
    total = total.plus(legacyStepCost(legacyLevel));
  }
  return total;
})();

export function normalizeTrainingLevel(level: number): number {
  const safe = Number.isFinite(level) ? Math.floor(level) : 1;
  return Math.min(MODEL_TRAINING_MAX_LEVEL, Math.max(1, safe));
}

/**
 * 40 级训练只细分旧 20 级曲线：每个旧等级在迁移锚点上保持原效果，
 * 新增等级仅在相邻旧等级之间线性插值。
 */
export function trainingComputeMultiplier(level: number): number {
  const current = normalizeTrainingLevel(level);
  for (let legacyLevel = 1; legacyLevel < LEGACY_MODEL_TRAINING_MAX_LEVEL; legacyLevel += 1) {
    const lower = mappedLevelForLegacyLevel(legacyLevel);
    const upper = mappedLevelForLegacyLevel(legacyLevel + 1);
    if (current > upper) continue;
    const fraction = (current - lower) / (upper - lower);
    return 1 + ((legacyLevel - 1) + fraction) * TRAIN_COMPUTE_GAIN;
  }
  return 1 + LEGACY_TRAINING_STEPS * TRAIN_COMPUTE_GAIN;
}

function cumulativeTrainingCost(level: number): Decimal {
  const current = normalizeTrainingLevel(level);
  if (current <= 1) return new Decimal(0);
  if (current >= MODEL_TRAINING_MAX_LEVEL) return LEGACY_TRAINING_TOTAL_COST;

  let total = new Decimal(0);
  for (let legacyLevel = 1; legacyLevel < LEGACY_MODEL_TRAINING_MAX_LEVEL; legacyLevel += 1) {
    const lower = mappedLevelForLegacyLevel(legacyLevel);
    const upper = mappedLevelForLegacyLevel(legacyLevel + 1);
    const oldCost = legacyStepCost(legacyLevel);
    if (current >= upper) {
      total = total.plus(oldCost);
      continue;
    }
    if (current <= lower) break;

    // 将旧一级整数费用均分到 2–3 个新步骤；余数从前往后分配，锚点累计费用完全一致。
    const subdivisions = upper - lower;
    const completedSubsteps = current - lower;
    const basePart = oldCost.div(subdivisions).floor();
    const remainder = oldCost.minus(basePart.mul(subdivisions)).toNumber();
    total = total
      .plus(basePart.mul(completedSubsteps))
      .plus(Math.min(completedSubsteps, remainder));
    break;
  }
  return total;
}

export function trainingCostAtLevel(level: number): Decimal {
  const current = normalizeTrainingLevel(level);
  if (current >= MODEL_TRAINING_MAX_LEVEL) return new Decimal(0);
  return cumulativeTrainingCost(current + 1).minus(cumulativeTrainingCost(current));
}

/** v8 及更早的 Lv1–20 按完成比例一次性映射到 v9 的 Lv1–40。 */
export function migrateLegacyTrainingLevel(level: number): number {
  const safe = Number.isFinite(level) ? Math.floor(level) : 1;
  const legacy = Math.min(LEGACY_MODEL_TRAINING_MAX_LEVEL, Math.max(1, safe));
  return mappedLevelForLegacyLevel(legacy);
}
