// GameSession：应用层协调。命令一律原子化（先验证→改内存→保存；保存失败回滚）。
import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import { OffsetClock, type Clock } from "../core/time";
import { MODEL_ARCHIVE_MAX_LEVEL, MODELS } from "../data/content";
import { ERA_PROJECTS, FLAGSHIP_PROJECTS } from "../data/stage3";
import {
  acceptOrder,
  acquireFirstModel,
  applyPrestige,
  applyTrain,
  automationAutoAccept,
  applyOfflineResearchProgress,
  buyServer,
  buyMaxServers,
  canPrestige,
  claimOrder,
  completeStage2Settlement,
  creditModelContribution,
  enableAutomation,
  enableRental,
  incomePerSecond,
  modelCompute,
  modelLevel,
  researchModel,
  tick,
  upgradeCenter,
} from "../economy/engine";
import {
  advanceFlagship,
  canCommissionRoom,
  canStartFlagship,
  canUpgradeInfrastructure,
  chooseBlueprint,
  claimFlagshipReward,
  commissionRoom,
  enterStage3,
  architectureMultiplier,
  architectureUnlockedCount,
  startFlagship,
  syncArchitectureBlueprints,
  upgradeInfrastructure,
} from "../economy/stage3";
import {
  claimCore,
  canClaimCore,
  prepareEndgameReplacementSave,
} from "../economy/singularity";
import {
  buyNode,
  buyVerifiedNodes,
  claimFinalProjectReward,
  advanceFinalProject,
  startFinalProject,
  startSpacePlan,
  STAGE4_FINAL_PROJECT,
  stage4Entered,
} from "../economy/stage4";
import {
  buyNode as buyS5Node,
  claimFinalProjectReward as claimDysonReward,
  advanceFinalProject as advanceDyson,
  startFinalProject as startDyson,
  startStage5,
  stage5Entered,
  STAGE5_FINAL_PROJECT,
} from "../economy/stage5";
import type { SaveRepository } from "../save/repository";
import {
  claimOfflineReward,
  hasPendingOfflineReward,
  offlineCapSeconds,
  settleOfflineReward,
  type OfflineQuote,
} from "../save/offline";
import { freshSaveData } from "../save/storage";
import type { RewardedAdOfferState, SaveData } from "../save/types";
import { buildViewModel, type ViewModel } from "../economy/viewmodel";
import {
  claimFreeIncomeCharge,
  expirePendingSponsorAd,
  grantSponsorAd,
  normalizeSponsorDay,
  prepareSponsorAd,
  type SponsorAdKind,
} from "../economy/sponsor";

export const AUTOSAVE_INTERVAL_SEC = 15;

export interface SessionOptions {
  repository: SaveRepository;
  clock?: Clock;
  onChanged?: () => void;
  onSave?: (result: { ok: boolean; reason: string }) => void;
  /** 每完成一个订单（含自动领取）回调一次 */
  onOrderCompleted?: (info: { orderId: string; count: number }) => void;
  autosaveIntervalSec?: number;
}

export interface CommandResult {
  ok: boolean;
  error?: string;
  researchReceipt?: ResearchReceipt;
  architectureReceipt?: ArchitectureReceipt;
  rewardedAdOffer?: RewardedAdOfferState;
}

export interface ArchitectureReceipt {
  beforeCount: number;
  afterCount: number;
  beforeMultiplier: string;
  afterMultiplier: string;
}

export interface ResearchReceipt {
  oldModelId: string;
  oldModelName: string;
  resultModelId: string;
  resultModelName: string;
  levelBefore: number;
  levelAfter: number;
  archiveLevelBefore: number;
  archiveLevelAfter: number;
  archiveLevelDelta: number;
  computeBefore: string;
  computeAfter: string;
  computeDelta: string;
  incomeBefore: string;
  incomeAfter: string;
  incomeDelta: string;
  switched: boolean;
  switchReason: string;
  conclusion: string;
}

function formatResearchMetric(value: Decimal): string {
  return value.toFixed(4).replace(/\.?(0+)$/, "");
}

function modelName(modelId: string): string {
  return MODELS.find((model) => model.id === modelId)?.name ?? modelId;
}

function architectureReceipt(before: SaveData, after: SaveData): ArchitectureReceipt | undefined {
  const beforeCount = architectureUnlockedCount(before);
  const afterCount = architectureUnlockedCount(after);
  if (beforeCount === afterCount) return undefined;
  return {
    beforeCount,
    afterCount,
    beforeMultiplier: architectureMultiplier(before).toFixed(2),
    afterMultiplier: architectureMultiplier(after).toFixed(2),
  };
}

export class GameSession {
  private repository: SaveRepository;
  private clock: Clock;
  private state: SaveData;
  private onChanged?: () => void;
  private onSave?: (result: { ok: boolean; reason: string }) => void;
  private onOrderCompleted?: (info: { orderId: string; count: number }) => void;
  private autosaveIntervalSec: number;
  private elapsedSinceSave = 0;
  private lastTickMs: number;
  private log: string[] = [];

  constructor(options: SessionOptions) {
    this.repository = options.repository;
    this.clock = options.clock ?? new OffsetClock();
    this.onChanged = options.onChanged;
    this.onSave = options.onSave;
    this.onOrderCompleted = options.onOrderCompleted;
    this.autosaveIntervalSec = options.autosaveIntervalSec ?? AUTOSAVE_INTERVAL_SEC;
    const load = this.repository.load();
    this.state = load.data;
    syncArchitectureBlueprints(this.state);
    this.lastTickMs = this.clock.now();
    if (expirePendingSponsorAd(this.state, this.clock.now())) {
      const saved = this.repository.save(this.state);
      if (saved.ok) this.state = saved.saved;
    }
    if (load.kind !== "fresh") {
      this.settleOfflineAtBoot();
    }
  }

  getState(): SaveData {
    return this.state;
  }

  viewModel(): ViewModel {
    return buildViewModel(this.state);
  }

  private emitChanged(): void {
    this.onChanged?.();
  }

  /** 每帧驱动 */
  update(dtSec: number): void {
    if (!Number.isFinite(dtSec) || dtSec <= 0) return;
    const now = this.clock.now();
    // 调用方传入精确 rAF delta；隔离验收可在入口处安全缩放该 delta。
    const elapsed = dtSec;
    this.lastTickMs = now;
    let changed = false;

    if (elapsed > 0) {
      // 自动经营：接单
      if (this.state.automation) {
        const accepted = automationAutoAccept(this.state, now);
        if (accepted > 0) changed = true;
      }
      // 推进订单
      const result = tick(this.state, now, elapsed);
      if (result.changed) changed = true;
      if (result.completedOrderIds.length > 0) {
        this.onOrderCompleted?.({
          orderId: result.completedOrderIds[0],
          count: result.completedOrderIds.length,
        });
      }
      // 自动领取可领取订单（领取即移除槽位，倒序遍历避免索引漂移）
      if (this.state.automation) {
        for (let i = this.state.activeOrders.length - 1; i >= 0; i--) {
          if (this.state.activeOrders[i].status === 1) {
            claimOrder(this.state, i);
          }
        }
        // 自动领取后同帧补满槽位：新订单留到下一帧才推进，经济结果不变，
        // 但渲染层不会观察到 4→3→4 的短暂缺口。
        const refilled = automationAutoAccept(this.state, now);
        if (refilled > 0) changed = true;
      }
    }

    // 自动保存
    this.elapsedSinceSave += dtSec;
    if (this.elapsedSinceSave >= this.autosaveIntervalSec) {
      this.elapsedSinceSave = 0;
      this.save("autosave");
    }

    if (changed) {
      this.emitChanged();
    }
  }

  /** 离线结算（启动时）：生成待领取报价，不自动入账 */
  private settleOfflineAtBoot(): void {
    const now = this.clock.now();
    const hadPending = hasPendingOfflineReward(this.state);
    const elapsedSec = !hadPending && now > this.state.lastTickAtMs
      ? Math.min((now - this.state.lastTickAtMs) / 1000, offlineCapSeconds(this.state))
      : 0;
    const quote = settleOfflineReward(this.state, now, {
      incomePerSecond: (s) => incomePerSecond(s),
    }, (s, q) => {
      // 回调在快照写入前执行：填充回执并应用侧效。
      this.applyOfflineSideEffects(s, q, elapsedSec);
    });
    // 无资金报价时（income=0）：仍按同一有效时长推进研发/工程（不产生回执）。
    let sideEffectChanged = false;
    if (!quote && elapsedSec >= 5) {
      sideEffectChanged = this.applyOfflineSideEffects(this.state, null, elapsedSec);
    }
    if (quote) {
      this.log.push(`离线收益 ${quote.elapsedSec}秒 ¥${quote.money.toFixed(0)} 待领取`);
    }
    if (quote || sideEffectChanged) {
      this.save("offline_settle");
    }
  }

  /** 应用离线侧效（研发/工程推进，仅一次）并填充回执；返回是否有任何状态变化。 */
  private applyOfflineSideEffects(state: SaveData, quote: OfflineQuote | null, elapsedSec: number): boolean {
    if (elapsedSec < 5) return false;
    let changed = false;
    // 研发进度：离线期间推进模型研发（不自动研发/切换）。
    const researchBefore = state.modelResearch?.progress ?? 0;
    if (applyOfflineResearchProgress(state, elapsedSec) > 0) changed = true;
    const researchDelta = Math.max(0, (state.modelResearch?.progress ?? 0) - researchBefore);
    if (quote) quote.researchProgress = researchDelta;

    // 工程推进：识别当前激活工程并计算进度增量（不自动购节点/领奖/迭代/进新阶段）。
    let projectName: string | null = null;
    let projectDelta = 0;
    if (stage5Entered(state)) {
      const s5 = state.singularity?.stage5;
      if (s5?.activeProjectId) {
        const def = STAGE5_FINAL_PROJECT;
        if (s5.activeProjectId === def.id) {
          const before = s5.projectProgress ?? 0;
          if (advanceDyson(state, elapsedSec).completed || (state.singularity?.stage5?.projectProgress ?? 0) !== before) changed = true;
          projectDelta = Math.max(0, (state.singularity?.stage5?.projectProgress ?? 0) - before);
          projectName = def.name;
        }
      }
    } else if (stage4Entered(state)) {
      const s4 = state.singularity?.stage4;
      if (s4?.activeProjectId) {
        const def = STAGE4_FINAL_PROJECT;
        if (s4.activeProjectId === def.id) {
          const before = s4.projectProgress ?? 0;
          if (advanceFinalProject(state, elapsedSec).completed || (state.singularity?.stage4?.projectProgress ?? 0) !== before) changed = true;
          projectDelta = Math.max(0, (state.singularity?.stage4?.projectProgress ?? 0) - before);
          projectName = def.name;
        }
      }
    } else {
      const fs = state.stage3?.flagship;
      if (fs?.activeId) {
        const def = [...FLAGSHIP_PROJECTS, ...ERA_PROJECTS].find((p) => p.id === fs.activeId);
        if (def) {
          const before = fs.progress ?? 0;
          if (advanceFlagship(state, elapsedSec).completed || (state.stage3?.flagship?.progress ?? 0) !== before) changed = true;
          projectDelta = Math.max(0, (state.stage3?.flagship?.progress ?? 0) - before);
          projectName = def.name;
        }
      }
    }
    if (quote) {
      quote.projectProgressDelta = projectDelta;
      quote.projectName = projectName;
    }
    return changed;
  }

  // ---------- 命令 ----------
  private commit(mutator: () => { ok: boolean; error?: string }): CommandResult {
    const before = structuredClone(this.state);
    const result = mutator();
    if (!result.ok) {
      // 回滚
      this.state = before;
      return result;
    }
    const saved = this.repository.save(this.state);
    if (!saved.ok) {
      this.state = before;
      this.onSave?.({ ok: false, reason: saved.error ?? "save_failed" });
      return { ok: false, error: saved.error ?? "save_failed" };
    }
    this.state = saved.saved;
    this.onSave?.({ ok: true, reason: "command" });
    this.emitChanged();
    return { ok: true };
  }

  acquireModel(modelId?: string): CommandResult {
    return this.commit(() => acquireFirstModel(this.state, modelId));
  }

  acceptOrder(orderId: string): CommandResult {
    return this.commit(() => {
      const now = this.clock.now();
      const res = acceptOrder(this.state, orderId, now);
      if (!res.ok) return res;
      // 首个订单自动激活租赁算力
      if (!this.state.rentalCompute.active && this.state.serverCount === 0) {
        this.state.rentalCompute = { active: true, units: 2, unitCostPerSec: 0.25 };
      }
      return { ok: true };
    });
  }

  claimOrder(orderIndex: number): CommandResult {
    return this.commit(() => claimOrder(this.state, orderIndex));
  }

  trainModel(): CommandResult {
    return this.commit(() => applyTrain(this.state));
  }

  enableAutomation(): CommandResult {
    return this.commit(() => enableAutomation(this.state));
  }

  enableRental(): CommandResult {
    return this.commit(() => enableRental(this.state));
  }

  buyServer(): CommandResult {
    const before = structuredClone(this.state);
    const result = this.commit(() => buyServer(this.state));
    return result.ok
      ? { ...result, architectureReceipt: architectureReceipt(before, this.state) }
      : result;
  }

  buyMaxServers(): CommandResult {
    const before = structuredClone(this.state);
    const result = this.commit(() => {
      const result = buyMaxServers(this.state);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    });
    return result.ok
      ? { ...result, architectureReceipt: architectureReceipt(before, this.state) }
      : result;
  }

  researchModel(): CommandResult {
    const beforeState = structuredClone(this.state);
    const beforeModelId = beforeState.modelProgress?.modelId ?? "";
    const beforeLevel = modelLevel(beforeState);
    const beforeCompute = modelCompute(beforeState);
    const beforeIncome = incomePerSecond(beforeState);
    let resultModelId = "";
    let switched = false;
    let archiveLevelBefore = 0;
    let archiveLevelAfter = 0;
    const result = this.commit(() => {
      const r = researchModel(this.state);
      if (!r.ok) return { ok: false, error: r.error };
      resultModelId = r.modelId;
      switched = r.switched === true;
      archiveLevelBefore = r.archiveLevelBefore;
      archiveLevelAfter = r.archiveLevelAfter;
      return { ok: true };
    });
    if (!result.ok) return result;
    const after = this.state;
    const receipt: ResearchReceipt = {
      oldModelId: beforeModelId,
      oldModelName: modelName(beforeModelId),
      resultModelId,
      resultModelName: modelName(resultModelId),
      levelBefore: beforeLevel,
      levelAfter: modelLevel(after),
      archiveLevelBefore,
      archiveLevelAfter,
      archiveLevelDelta: archiveLevelAfter - archiveLevelBefore,
      computeBefore: formatResearchMetric(beforeCompute),
      computeAfter: formatResearchMetric(modelCompute(after)),
      computeDelta: formatResearchMetric(modelCompute(after).minus(beforeCompute)),
      incomeBefore: formatResearchMetric(beforeIncome),
      incomeAfter: formatResearchMetric(incomePerSecond(after)),
      incomeDelta: formatResearchMetric(incomePerSecond(after).minus(beforeIncome)),
      switched,
      switchReason: switched
        ? "receipt.reason.switched"
        : resultModelId === beforeModelId
          ? "receipt.reason.upgraded"
          : "receipt.reason.kept",
      conclusion: switched ? "receipt.conclusion.switched" : "receipt.conclusion.kept",
    };
    return {
      ...result,
      researchReceipt: receipt,
      ...(this.state.monetization.pendingOffer
        ? { rewardedAdOffer: structuredClone(this.state.monetization.pendingOffer) }
        : {}),
    };
  }

  completeStage2Settlement(): CommandResult {
    return this.commit(() => completeStage2Settlement(this.state));
  }

  enterStage3(): CommandResult {
    return this.commit(() => enterStage3(this.state, this.clock.now()));
  }

  upgradeInfra(id: string): CommandResult {
    return this.commit(() => upgradeInfrastructure(this.state, id));
  }

  commissionRoom(index: number): CommandResult {
    return this.commit(() => commissionRoom(this.state, index, this.clock.now()));
  }

  startFlagship(projectId: string): CommandResult {
    return this.commit(() => startFlagship(this.state, projectId));
  }

  claimFlagshipReward(): CommandResult {
    return this.commit(() => claimFlagshipReward(this.state));
  }

  chooseBlueprint(blueprintId: string): CommandResult {
    return this.commit(() => chooseBlueprint(this.state, blueprintId));
  }

  upgradeCenter(): CommandResult {
    return this.commit(() => upgradeCenter(this.state));
  }

  prestige(): CommandResult {
    if (!canPrestige(this.state)) return { ok: false, error: "not_ready" };
    return this.commit(() => applyPrestige(this.state));
  }

  /** 手动领取奇点核心（exactly-once；正式终局与隔离 Review 共用）。 */
  claimCore(): CommandResult {
    if (!canClaimCore(this.state)) return { ok: false, error: "not_ready" };
    return this.commit(() => claimCore(this.state));
  }

  /** CARD-02：启动地外算力计划（唯一一次；不自动进入，需玩家点击）。 */
  startSpacePlan(): CommandResult {
    return this.commit(() => startSpacePlan(this.state, this.clock.now()));
  }

  /** CARD-02：购买轨道算力节点（首节点由进入里程碑授予，不扣资金）。 */
  buyNode(nodeId: string): CommandResult {
    if (nodeId === "verified_nodes") return this.commit(() => buyVerifiedNodes(this.state));
    return this.commit(() => buyNode(this.state, nodeId));
  }

  /** CARD-02：启动地月一体化算力网（Stage 4 唯一最终工程）。 */
  startStage4Project(): CommandResult {
    return this.commit(() => startFinalProject(this.state));
  }

  /** CARD-02：手动领取地月一体化算力网奖励（exactly-once）。 */
  claimStage4Reward(): CommandResult {
    return this.commit(() => claimFinalProjectReward(this.state));
  }

  /** CARD-03：启动戴森算力纪元（唯一入口；前置：地月主线完成并手动领取）。 */
  startStage5(): CommandResult {
    return this.commit(() => startStage5(this.state, this.clock.now()));
  }

  /** CARD-03：购买恒星计算节点（首节点由进入里程碑授予，不扣资金）。 */
  buyStage5Node(nodeId: string): CommandResult {
    return this.commit(() => buyS5Node(this.state, nodeId));
  }

  /** CARD-03：启动戴森算力球（Stage 5 唯一最终巨构）。 */
  startStage5Project(): CommandResult {
    return this.commit(() => startDyson(this.state));
  }

  /** CARD-03：手动领取戴森算力球奖励（exactly-once；解锁永续增长模式）。 */
  claimStage5Reward(): CommandResult {
    return this.commit(() => claimDysonReward(this.state, this.clock.now()));
  }

  claimOffline(): CommandResult {
    const before = structuredClone(this.state);
    const reward = this.state.pendingOfflineReward;
    const res = claimOfflineReward(this.state, this.clock.now(), {
      incomePerSecond: (s) => incomePerSecond(s),
    });
    if (!res.claimed) {
      this.state = before;
      return { ok: false, error: "no_offline_reward" };
    }
    creditModelContribution(this.state, res.money);
    const saved = this.repository.save(this.state);
    if (!saved.ok) {
      this.state = before;
      return { ok: false, error: "save_failed" };
    }
    this.state = saved.saved;
    this.onSave?.({ ok: true, reason: "offline_claim" });
    this.emitChanged();
    return {
      ok: true,
    };
  }

  claimFreeIncomeSponsor(): CommandResult {
    return this.commit(() => claimFreeIncomeCharge(this.state, this.clock.now()));
  }

  prepareSponsorAd(kind: SponsorAdKind): CommandResult {
    const before = structuredClone(this.state);
    const prepared = prepareSponsorAd(this.state, kind, this.clock.now());
    if (!prepared.ok || !prepared.offer) {
      this.state = before;
      return { ok: false, error: prepared.error ?? "ad_offer_invalid" };
    }
    const saved = this.repository.save(this.state);
    if (!saved.ok) {
      this.state = before;
      return { ok: false, error: "save_failed" };
    }
    this.state = saved.saved;
    this.onSave?.({ ok: true, reason: "sponsor_ad_prepare" });
    this.emitChanged();
    return { ok: true, rewardedAdOffer: structuredClone(prepared.offer) };
  }

  pendingRewardedAdOffer(): RewardedAdOfferState | null {
    return this.state.monetization.pendingOffer
      ? structuredClone(this.state.monetization.pendingOffer)
      : null;
  }

  cancelPendingSponsorAd(eventId: string): CommandResult {
    if (this.state.monetization.pendingOffer?.eventId !== eventId) return { ok: false, error: "ad_offer_missing" };
    return this.commit(() => {
      this.state.monetization.pendingOffer = null;
      return { ok: true };
    });
  }

  /** 完整观看平台激励视频后发放赞助充能；事件ID持久化，重复回调/刷新不会重复发放。 */
  grantRewardedAd(eventId: string): CommandResult {
    const offer = this.state.monetization.pendingOffer;
    if (!offer || offer.eventId !== eventId) return { ok: false, error: "ad_offer_missing" };
    if (this.state.monetization.completedRewardEventIds.includes(eventId)) {
      return { ok: false, error: "ad_reward_already_granted" };
    }
    return this.commit(() => grantSponsorAd(this.state, eventId, this.clock.now()));
  }

  hasPendingOffline(): boolean {
    return hasPendingOfflineReward(this.state);
  }

  save(reason = "manual"): { ok: boolean; error?: string } {
    normalizeSponsorDay(this.state, this.clock.now());
    // 在线游玩写盘时推进离线锚点：只有真正长时间未写盘（重开）才结算离线收益
    if (this.state.lastTickAtMs < this.clock.now()) {
      this.state.lastTickAtMs = this.clock.now();
    }
    const result = this.repository.save(this.state);
    if (result.ok) {
      this.state = result.saved;
      this.onSave?.({ ok: true, reason });
    } else {
      this.onSave?.({ ok: false, reason: result.error ?? "save_failed" });
    }
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  exportJson(): string {
    return this.repository.exportJson(this.state);
  }

  importJson(text: string): { ok: boolean; error?: string } {
    const res = this.repository.importJson(text, prepareEndgameReplacementSave);
    if (!res.ok) return { ok: false, error: res.error };
    this.state = res.data!;
    this.lastTickMs = this.clock.now();
    this.emitChanged();
    return { ok: true };
  }

  reset(): CommandResult {
    const result = this.repository.reset(prepareEndgameReplacementSave);
    if (!result.ok) return { ok: false, error: result.error ?? "storage_write_failed" };
    this.state = result.data;
    this.lastTickMs = this.clock.now();
    this.emitChanged();
    return { ok: true };
  }

  getLog(): string[] {
    return this.log;
  }
}
