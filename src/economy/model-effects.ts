import Decimal from "decimal.js";
import { BASE_BUSINESS_MIX, MODELS, type ModelDef, type ModelRole } from "../data/content";
import type { SaveData } from "../save/types";

export interface ModelEffectMultipliers {
  income: Decimal;
  compute: Decimal;
  automation: Decimal;
  research: Decimal;
  flagship: Decimal;
  highValueWeight: Decimal;
}

const MULTIPLIER_ROLES: Array<Exclude<ModelRole, "high_value_business">> = [
  "base_income",
  "processing_speed",
  "automation_efficiency",
  "research_speed",
  "flagship_efficiency",
];

function activeModel(state: SaveData): ModelDef | null {
  if (!state.modelProgress) return null;
  return MODELS.find((model) => model.id === state.modelProgress!.modelId) ?? null;
}

function archiveBonus(state: SaveData, role: ModelRole): number {
  const definition = MODELS.find((model) => model.role === role);
  if (!definition) return 0;
  const entry = state.modelArchive?.[definition.id];
  if (!entry || !state.ownedModelIds.includes(definition.id)) return 0;
  const raw = Math.max(1, entry.level) * definition.archiveBonusPerLevel;
  return role === "high_value_business" ? Math.min(0.25, raw) : Math.min(0.05, raw);
}

/**
 * 研发后的全局收藏成长：使用现有图鉴等级与每级被动配置，不引入新的经济系数。
 *
 * `stage2Draws === 0` 代表旧档/研发前状态，保持原有曲线；首次研发后该贡献
 * 由存档中已有的研发次数稳定开启，刷新后仍与研发结果一致。角色被动仍由
 * `archiveBonus` 独立计算，这里只补充所有已拥有图鉴对原始算力的收藏成长。
 */
export function archiveCollectionComputeBonus(state: SaveData): Decimal {
  if ((state.modelResearch?.stage2Draws ?? 0) <= 0) return new Decimal(0);
  return MODELS.reduce((total, model) => {
    if (!state.ownedModelIds.includes(model.id)) return total;
    const entry = state.modelArchive?.[model.id];
    if (!entry) return total;
    // 收藏算力只由玩家可见的图鉴等级驱动；researchCount 仅保留为历史统计，
    // 避免旧档中 count 高于 level 时形成隐藏算力或吞掉后续可见升级收益。
    const collectionLevel = Math.max(1, entry.level);
    return total.plus(new Decimal(collectionLevel).mul(model.archiveBonusPerLevel));
  }, new Decimal(0));
}

export function modelEffectMultipliers(state: SaveData): ModelEffectMultipliers {
  // v6基础曲线继续由系统自动选出的研发主力承载，确保迁移瞬间完全等价。
  // CARD-01新增的所有蓝图共同成长由 blueprintGrowthMultiplier 统一结算，
  // UI不再提供逐服部署/手动切换，因此不存在玩家反复换“最优模型”的操作。
  const active = activeModel(state);
  const activeBonus = (role: ModelRole): number => active?.role === role ? active.activeBonus : 0;
  const multiplier = (role: Exclude<ModelRole, "high_value_business">): Decimal =>
    new Decimal(1).plus(activeBonus(role)).plus(archiveBonus(state, role));

  return {
    income: multiplier("base_income"),
    compute: multiplier("processing_speed").mul(new Decimal(1).plus(archiveCollectionComputeBonus(state))),
    automation: multiplier("automation_efficiency"),
    research: multiplier("research_speed"),
    flagship: multiplier("flagship_efficiency"),
    highValueWeight: new Decimal(1)
      .plus(activeBonus("high_value_business"))
      .plus(archiveBonus(state, "high_value_business")),
  };
}

export function businessMixForState(state: SaveData): Array<{ orderId: string; share: number }> {
  const highValueWeight = modelEffectMultipliers(state).highValueWeight.toNumber();
  return BASE_BUSINESS_MIX.map((item) => ({
    ...item,
    share: ["o3", "o4", "o5"].includes(item.orderId)
      ? item.share * highValueWeight
      : item.share,
  }));
}

export function modelRoleEffectText(model: ModelDef): string {
  return `model.effect.${model.role}`;
}

export function distinctModelRoles(): ModelRole[] {
  return MODELS.map((model) => model.role);
}

export function allMultiplierRoles(): ReadonlyArray<Exclude<ModelRole, "high_value_business">> {
  return MULTIPLIER_ROLES;
}
