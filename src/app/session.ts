// GameSession：应用层协调。命令一律原子化（先验证→改内存→保存；保存失败回滚）。
import Decimal from "decimal.js";
import { toStoredBig } from "../core/big";
import { OffsetClock, type Clock } from "../core/time";
import { noteChronicleClockAdjustment, recordChronicleMilestones } from "../economy/chronicle";
import { ERA_PROJECTS, FLAGSHIP_PROJECTS } from "../data/stage3";
import {
  acceptOrder,
  acquireFirstModel,
  applyPrestige,
  applyTrain,
  automationAutoAccept,
  applyOfflineCompanyExperience,
  applyOfflineResearchProgress,
  applyOfflineWorkshopExperience,
  buyServer,
  buyMaxServers,
  canPrestige,
  claimOrder,
  claimOrderQueue,
  expandOrderSlot,
  unlockOrder,
  completeStage2Settlement,
  creditModelContribution,
  enableAutomation,
  enableRental,
  incomePerSecond,
  modelCompute,
  modelLevel,
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
  offlineRewardSettled,
  settleOfflineReward,
  type OfflineQuote,
} from "../save/offline";
import { freshSaveData } from "../save/storage";
import type { RewardedAdOfferState, SaveData } from "../save/types";
import { buildViewModel, type ViewModel } from "../economy/viewmodel";
import {
  claimFreeIncomeCharge,
  expirePendingSponsorAd,
  normalizeSponsorDay,
  type SponsorAdKind,
} from "../economy/sponsor";
import {
  allocateTalent,
  buyBlueprintLevels,
  buyRecommendedBlueprint,
  buyServerScaleUnits,
  claimAchievement,
  resetTalents,
} from "../economy/incremental-growth";
import type { TalentNodeId } from "../save/types";

export const AUTOSAVE_INTERVAL_SEC = 15;

export interface SessionOptions {
  repository: SaveRepository;
  clock?: Clock;
  onChanged?: () => void;
  onSave?: (result: { ok: boolean; reason: string }) => void;
  /** 每完成一个订单（包括玩家领取自动经营结果）回调一次 */
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
  /** 云优先完整重置期间尚未落盘的新档；存在时冻结游戏，避免旧档重新上传。 */
  private pendingReset: SaveData | null = null;

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
    const now = this.clock.now();
    this.lastTickMs = now;
    const chronicleChanged = this.captureChronicle(now);
    if (expirePendingSponsorAd(this.state, now) || chronicleChanged) {
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

  /** 让账号历程随每次实际持久化前的游戏状态写入，不依赖本地 UI 记录。 */
  private captureChronicle(nowMs: number): boolean {
    let changed = recordChronicleMilestones(this.state, nowMs);
    if (this.clock.consumeRollback?.()) {
      changed = noteChronicleClockAdjustment(this.state, nowMs) || changed;
    }
    return changed;
  }

  /** 每帧驱动 */
  update(dtSec: number): void {
    // 云档完整重置采用“远端成功后再落本机”的事务语义。请求期间若仍推进
    // Tick/自动保存，旧档可能在新云档落地后被重新排队上传。
    if (this.pendingReset) return;
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
      // 订单完成后由引擎立即自动结算并释放本订单队列格；自动经营会在下一帧补入后续任务。
    }
    if (this.captureChronicle(now)) changed = true;

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

  /**
   * 离线结算唯一入口：启动与同一 WebView 的后台恢复共用。
   * 生成待领取报价但不自动入账；返回是否产生了玩家可见的资金/工程/研发变化。
   */
  private settleOfflineAt(now: number): { visibleChanged: boolean; anchorChanged: boolean } {
    const anchorBefore = this.state.lastTickAtMs;
    const existing = this.state.pendingOfflineReward;
    const hadUnsettledReceipt = existing != null && !offlineRewardSettled(existing);
    const quote = settleOfflineReward(this.state, now, {
      incomePerSecond: (s) => incomePerSecond(s),
    }, (s, q) => {
      // 回调在快照写入前执行：首次免费 2h 的回执与侧效同源。
      // 广告后续只补领本次离线收入，不重放研发/工程推进。
      this.applyOfflineSideEffects(s, q, q.elapsedSec);
    });
    // 无资金报价时（income=0）：仍按同一有效时长推进研发/工程（不产生回执）。
    let sideEffectChanged = false;
    // 必须使用结算前锚点：settleOfflineReward 即使没有报价也会把锚点推进到 now。
    const freeElapsedSec = !hadUnsettledReceipt && anchorBefore > 0 && now > anchorBefore
      ? Math.min((now - anchorBefore) / 1000, 2 * 60 * 60)
      : 0;
    if (!quote && freeElapsedSec >= 5) {
      sideEffectChanged = this.applyOfflineSideEffects(this.state, null, freeElapsedSec);
    }
    if (quote) {
      this.log.push(`离线收益 ${quote.elapsedSec}秒 ¥${quote.money.toFixed(0)} 待领取`);
    }
    return {
      visibleChanged: quote != null || sideEffectChanged,
      anchorChanged: this.state.lastTickAtMs !== anchorBefore,
    };
  }

  /** 离线结算（启动时）：生成待领取报价，不自动入账。 */
  private settleOfflineAtBoot(): void {
    const result = this.settleOfflineAt(this.clock.now());
    if (result.visibleChanged || result.anchorChanged) {
      this.save("offline_settle");
    }
  }

  /**
   * 真正从后台返回时结算一次隐藏区间；单机版不装配广告或平台生命周期。
   * 保存失败则回滚内存态，让同一区间能在后续保存/重启时安全重试。
   */
  resumeFromBackground(): { ok: boolean; settled: boolean; error?: string } {
    if (this.pendingReset) return { ok: false, settled: false, error: "reset_in_progress" };
    const before = structuredClone(this.state);
    const now = this.clock.now();
    const result = this.settleOfflineAt(now);
    this.lastTickMs = now;
    this.elapsedSinceSave = 0;
    if (!result.visibleChanged && !result.anchorChanged) {
      return { ok: true, settled: false };
    }
    const saved = this.save("visibility_resume");
    if (!saved.ok) {
      this.state = before;
      return { ok: false, settled: false, error: saved.error };
    }
    if (result.visibleChanged) this.emitChanged();
    return { ok: true, settled: result.visibleChanged };
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

    // 工作室经验与在线四槽订单使用同一速率。离线跨过等级门槛时，
    // addExperience 会同步发放一次性天赋点；不会自动替玩家分配天赋。
    if (applyOfflineWorkshopExperience(state, elapsedSec) > 0) changed = true;
    if (applyOfflineCompanyExperience(state, elapsedSec) > 0) changed = true;

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
    if (this.pendingReset) return { ok: false, error: "reset_in_progress" };
    const before = structuredClone(this.state);
    const result = mutator();
    if (!result.ok) {
      // 回滚
      this.state = before;
      return result;
    }
    this.captureChronicle(this.clock.now());
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

  claimOrderQueue(orderId: string): CommandResult {
    return this.commit(() => claimOrderQueue(this.state, orderId));
  }

  unlockOrder(orderId: string): CommandResult {
    return this.commit(() => unlockOrder(this.state, orderId));
  }

  expandOrderSlot(orderId: string): CommandResult {
    return this.commit(() => expandOrderSlot(this.state, orderId));
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
    return { ok: false, error: "feature_removed" };
  }

  upgradeBlueprint(modelId: string, quantity: number | "max" = 1): CommandResult {
    return this.commit(() => {
      const result = buyBlueprintLevels(this.state, modelId, quantity);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    });
  }

  upgradeRecommendedBlueprint(quantity: number | "max" = 1): CommandResult {
    return this.commit(() => {
      const result = buyRecommendedBlueprint(this.state, quantity);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    });
  }

  expandServerScale(serverId: string, quantity: number | "max" = 1): CommandResult {
    return this.commit(() => {
      const result = buyServerScaleUnits(this.state, serverId, quantity);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    });
  }

  allocateTalent(id: TalentNodeId): CommandResult {
    return this.commit(() => allocateTalent(this.state, id));
  }

  claimAchievement(id: string): CommandResult {
    return this.commit(() => claimAchievement(this.state, id));
  }

  resetTalents(): CommandResult {
    return this.commit(() => resetTalents(this.state));
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
    this.captureChronicle(this.clock.now());
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

  prepareSponsorAd(_kind: SponsorAdKind): CommandResult {
    return { ok: false, error: "ads_disabled" };
  }

  pendingRewardedAdOffer(): RewardedAdOfferState | null {
    return null;
  }

  cancelPendingSponsorAd(_eventId: string): CommandResult {
    return { ok: false, error: "ads_disabled" };
  }

  /** 单机版拒绝所有广告回调，包含从旧存档恢复的事件。 */
  grantRewardedAd(_eventId: string): CommandResult {
    return { ok: false, error: "ads_disabled" };
  }

  hasPendingOffline(): boolean {
    return hasPendingOfflineReward(this.state);
  }

  save(reason = "manual"): { ok: boolean; error?: string } {
    if (this.pendingReset) return { ok: false, error: "reset_in_progress" };
    const now = this.clock.now();
    normalizeSponsorDay(this.state, now);
    this.captureChronicle(now);
    // 在线游玩写盘时推进离线锚点：只有真正长时间未写盘（重开）才结算离线收益
    if (this.state.lastTickAtMs < now) {
      this.state.lastTickAtMs = now;
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
    if (this.pendingReset) return { ok: false, error: "reset_in_progress" };
    const res = this.repository.importJson(text, prepareEndgameReplacementSave);
    if (!res.ok) return { ok: false, error: res.error };
    this.state = res.data!;
    this.lastTickMs = this.clock.now();
    this.emitChanged();
    return { ok: true };
  }

  reset(): CommandResult {
    if (this.pendingReset) return { ok: false, error: "reset_in_progress" };
    const result = this.repository.reset(prepareEndgameReplacementSave);
    if (!result.ok) return { ok: false, error: result.error ?? "storage_write_failed" };
    this.state = result.data;
    this.lastTickMs = this.clock.now();
    this.emitChanged();
    return { ok: true };
  }

  /**
   * 准备完整重置但保留当前本机档不变，显式提交后才落盘。
   * 此兼容事务接口不访问任何账号或远端服务。
   */
  beginResetTransaction(): { ok: boolean; saveJson?: string; error?: string } {
    if (this.pendingReset) return { ok: false, error: "reset_in_progress" };
    const prepared = this.repository.prepareReset(prepareEndgameReplacementSave);
    if (!prepared.ok) return { ok: false, error: prepared.error ?? "save_preparation_failed" };
    this.pendingReset = prepared.data;
    return { ok: true, saveJson: this.repository.exportJson(prepared.data) };
  }

  /** 把同一份候选新档提交到本机并恢复会话。 */
  commitResetTransaction(): CommandResult {
    if (!this.pendingReset) return { ok: false, error: "reset_not_prepared" };
    const result = this.repository.commitPreparedReset(this.pendingReset);
    if (!result.ok) return { ok: false, error: result.error ?? "storage_write_failed" };
    this.state = result.data;
    this.pendingReset = null;
    this.lastTickMs = this.clock.now();
    this.elapsedSinceSave = 0;
    this.onSave?.({ ok: true, reason: "reset" });
    this.emitChanged();
    return { ok: true };
  }

  /** 放弃重置并释放锁；旧档从未被写入或替换。 */
  cancelResetTransaction(): void {
    this.pendingReset = null;
  }

  resetTransactionPending(): boolean {
    return this.pendingReset !== null;
  }

  getLog(): string[] {
    return this.log;
  }
}
