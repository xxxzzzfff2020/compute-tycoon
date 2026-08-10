// 应用入口：装配存储/会话/UI，绑定命令路由与帧循环。
// 运行时合同：
// - boot 防重入（同一 container 只初始化一次）；
// - rAF 句柄保留，HMR/重新初始化时取消旧循环；
// - 生命周期监听只注册一次并随 shell.destroy 清理。
import { OffsetClock } from "../core/time";
import { buildDevSave, DEV_SAVE_NAMESPACE, devStateId } from "./devverify";
import { ENDGAME_SAVE_NAMESPACE, newSaveId } from "../save/types";
import { ensureEndgameSingularity } from "../economy/singularity";
import { createGrowthFeedback } from "../economy/feel";
import { getLocale, initLocale, setLocale, t } from "../i18n";
import { GameSession } from "./session";
import { freshSaveData, LocalStorageSaveStorage } from "../save/storage";
import { SaveRepository } from "../save/repository";
import { createAppShell, type AppShell, type CommandHandler } from "../ui/render";
import {
  TapRewardedAdController,
} from "../platform/taptap-ads";
import type { RewardedAdOfferState } from "../save/types";
import { TapCloudSaveController } from "../platform/taptap-cloud-save";
import { TapLeaderboardController } from "../platform/taptap-leaderboards";
import { GameAudio } from "../audio/game-audio";
import {
  PLATFORM_FEATURE_REASONS,
  PLATFORM_FEATURES,
  PLATFORM_REVIEW_CLOUD_SLOT_NAME,
  PLATFORM_REVIEW_MODE,
  PLATFORM_REVIEW_SAVE_NAMESPACE,
} from "../platform/features";
import {
  shouldMigrateExistingReviewSave,
  shouldSeedReviewSave,
  type ReviewRuntimeOverride,
} from "../review/runtime-contract";
import "./../styles/main.css";
import "./../styles/final-feel.css";

let bootedContainer: HTMLElement | null = null;
let activeRaf: number | null = null;
let activeShell: AppShell | null = null;
let boundContainer: HTMLElement | null = null;
let onVisibility: (() => void) | null = null;
let onBeforeUnload: (() => void) | null = null;
let activeRewardedAdController: TapRewardedAdController | null = null;
let removeRewardedAdSubscription: (() => void) | null = null;
let activeAudio: GameAudio | null = null;
let activeCloudSaveController: TapCloudSaveController | null = null;
let removeCloudSaveSubscription: (() => void) | null = null;
const PLATFORM_REVIEW_SPEEDS = new Set([1, 2, 4, 8, 16, 32, 64, 128, 256]);

/** 供测试/审计使用：当前活动 rAF 句柄（null 表示无活动循环） */
export function activeLoopCount(): number {
  return activeRaf !== null ? 1 : 0;
}

/** Review高倍率按最多1游戏秒分步，避免单个大帧跳过自动补单/状态门。Production 1×通常只执行一步。 */
export function advanceSessionTime(
  session: Pick<GameSession, "update">,
  elapsedGameSec: number,
  maxStepSec = 1,
): void {
  let remaining = Math.max(0, elapsedGameSec);
  const step = Math.max(0.01, maxStepSec);
  while (remaining > 1e-9) {
    const current = Math.min(step, remaining);
    session.update(current);
    remaining -= current;
  }
}

export function boot(): void {
  const container = document.getElementById("app");
  if (!container) throw new Error("#app missing");
  // 防重入：同一容器已初始化则跳过（HMR 或重复调用不创建第二个实例）
  if (bootedContainer === container) return;
  if (boundContainer && boundContainer !== container) {
    // 不同容器：清理旧的再启动
    teardown();
  }

  const storage = new LocalStorageSaveStorage(
    PLATFORM_REVIEW_MODE ? PLATFORM_REVIEW_SAVE_NAMESPACE : undefined,
  );
  const clock = new OffsetClock();
  const reviewOverride: ReviewRuntimeOverride | null =
    window.__CT_REVIEW_RUNTIME_OVERRIDE__?.kind === "founder-review-v2"
      ? window.__CT_REVIEW_RUNTIME_OVERRIDE__
      : null;
  // 开发加速只允许与合法隔离验收档同时启用，避免查询参数污染正式存档。
  const devParams = new URLSearchParams(window.location.search);
  // 隔离验收模式：独立存档命名空间，不影响正式档
  const verifyStateId = reviewOverride ? null : devStateId();
  const devEnabled = verifyStateId !== null;
  // CARD-01 隔离终局入口：?endgame=1 使用独立实验命名空间，不影响正式档与 Review v2。
  const endgameEnabled = reviewOverride == null && !devEnabled && devParams.get("endgame") === "1";
  const requestedPlatformSpeed = Number(devParams.get("speed") ?? "1");
  let runtimeSpeed = reviewOverride
    ? reviewOverride.speed
    : devEnabled
      ? Math.max(1, Number(devParams.get("speed") ?? "1") || 1)
      : PLATFORM_REVIEW_MODE && PLATFORM_REVIEW_SPEEDS.has(requestedPlatformSpeed)
        ? requestedPlatformSpeed
        : 1;
  const effectiveStorage = reviewOverride
    ? new LocalStorageSaveStorage(reviewOverride.namespace)
    : verifyStateId
      ? new LocalStorageSaveStorage(DEV_SAVE_NAMESPACE)
      : endgameEnabled
        ? new LocalStorageSaveStorage(ENDGAME_SAVE_NAMESPACE)
      : storage;
  if (reviewOverride) {
    const existing = effectiveStorage.load();
    // P0 自然入口可能已经持有上一版本导入并写盘的旧档；升级站点后必须就地自愈，
    // 不能要求负责人再次选择同一文件，也不能因 saveId 不同覆盖它。
    if (existing && shouldMigrateExistingReviewSave(
      reviewOverride.preserveImportedSave === true,
      existing.singularity,
    )) {
      if (ensureEndgameSingularity(existing)) effectiveStorage.save(existing);
    }
    // 每个 Review 检查点是独立 slot：首次播种，刷新则继续真实操作后的存档。
    if (shouldSeedReviewSave(
      existing?.saveId,
      reviewOverride.initialSave.saveId,
      reviewOverride.preserveImportedSave === true,
    )) {
      effectiveStorage.save(structuredClone(reviewOverride.initialSave));
    }
  } else if (verifyStateId) {
    const expectedSaveId = `dev-${verifyStateId}`;
    const existing = effectiveStorage.load();
    // 首次进入/切换检查点时播种；同一检查点刷新则恢复玩家刚才的真实操作结果。
    if (existing?.saveId !== expectedSaveId) {
      const now = clock.now();
      effectiveStorage.save(buildDevSave(verifyStateId, now));
    }
  } else if (endgameEnabled) {
    // CARD-01 隔离终局：首次进入播种 endgame 档（mode="endgame"），
    // 刷新则继续真实操作后的存档；正式档与 Review v2 不受影响。
    const existing = effectiveStorage.load();
    if (existing?.singularity?.mode !== "endgame") {
      const now = clock.now();
      const fresh = freshSaveData(now);
      fresh.saveId = `endgame-${newSaveId()}`;
      fresh.singularity = {
        mode: "endgame",
        coresClaimed: [],
        spacePlanRevealed: false,
        claimedProjectIds: [],
        spacePlanRevealedAtMs: 0,
        spacePlanStarted: false,
        stage4: null,
        stage5: null,
        perpetual: null,
      };
      effectiveStorage.save(fresh);
    }
  } else {
    // 正式档（A_自然流程）：旧正式档 singularity 缺失/为 null 时向前兼容迁移——
    // 直接开启终局能力（空终局状态），不重复迁移（已有 singularity 则不动）、不丢数据。
    // Review v2 / dev 隔离入口不经过此分支，保持隔离断言不变。
    const existing = effectiveStorage.load();
    if (existing == null) {
      // 新玩家：正式新档直接开启终局能力（与迁移 A 一致）。
      const now = clock.now();
      const fresh = freshSaveData(now);
      ensureEndgameSingularity(fresh);
      effectiveStorage.save(fresh);
    } else if (existing.singularity == null) {
      // 旧正式档：向前兼容迁移，不丢数据。
      if (ensureEndgameSingularity(existing)) {
        effectiveStorage.save(existing);
      }
    }
  }
  const repository = new SaveRepository({ storage: effectiveStorage, nowMs: () => clock.now() });
  initLocale();
  const shell = createAppShell(container);
  const audio = new GameAudio();
  audio.install();
  activeAudio = audio;
  const formalPlatformMode = reviewOverride == null && !devEnabled && !endgameEnabled;
  const cloudSave = formalPlatformMode && PLATFORM_FEATURES.cloudSave
    ? new TapCloudSaveController({
        slotName: PLATFORM_REVIEW_MODE ? PLATFORM_REVIEW_CLOUD_SLOT_NAME : undefined,
      })
    : null;
  const leaderboards = formalPlatformMode && PLATFORM_FEATURES.leaderboard ? new TapLeaderboardController() : null;
  activeCloudSaveController = cloudSave;
  const leaderboardStatus = leaderboards?.supported()
    ? "platform.connected"
    : PLATFORM_FEATURES.leaderboard
      ? "platform.notConnected"
      : PLATFORM_FEATURE_REASONS.leaderboard;
  shell.setPlatformStatus({
    cloud: cloudSave?.getSnapshot().message ?? PLATFORM_FEATURE_REASONS.cloudSave,
    leaderboard: leaderboardStatus,
    platformReview: PLATFORM_REVIEW_MODE,
    runtimeSpeed,
  });
  if (cloudSave) {
    removeCloudSaveSubscription = cloudSave.subscribe((snapshot) => {
      shell.setPlatformStatus({
        cloud: snapshot.lastSuccessAtMs > 0
          ? `${snapshot.message} · platform.lastSuccess ${new Date(snapshot.lastSuccessAtMs).toLocaleString(getLocale())}`
          : snapshot.message,
        leaderboard: leaderboardStatus,
        platformReview: PLATFORM_REVIEW_MODE,
        runtimeSpeed,
      });
    });
  }
  let session: GameSession;
  session = new GameSession({
    repository,
    clock,
    onOrderCompleted: () => {
      const m = shell.getMetrics();
      shell.resetMetrics();
      shell.incrementOrderCompletion(m.orderCompletionCount + 1);
    },
    onSave: (result) => {
      if (!result.ok || !session) return;
      cloudSave?.scheduleUpload(() => session.exportJson());
      if (leaderboards?.supported()) void leaderboards.submitEligible(session.getState());
    },
  });

  const rewardedAd = formalPlatformMode && PLATFORM_FEATURES.rewardedAds
    ? new TapRewardedAdController()
    : null;
  const playRewardedOffer = (offer: RewardedAdOfferState | null | undefined): void => {
    if (!offer || !rewardedAd) return;
    const isOffline = offer.kind === "offline_capacity";
    const started = rewardedAd.show((completed) => {
      if (!completed) {
        session.cancelPendingSponsorAd(offer.eventId);
        shell.showToast(t("toast.adIncomplete"));
        return;
      }
      const granted = session.grantRewardedAd(offer.eventId);
      shell.showToast(granted.ok
        ? (isOffline ? t("toast.offlineCapacityBoost") : t("toast.incomeBoost"))
        : t("toast.rewardUnavailable"));
    });
    if (!started) {
      session.cancelPendingSponsorAd(offer.eventId);
      shell.showToast(t("toast.adNotReady"));
    }
  };
  if (rewardedAd) {
    activeRewardedAdController = rewardedAd;
    removeRewardedAdSubscription = rewardedAd.subscribe(() => undefined);
    rewardedAd.init();
  }

  const executeCommand: CommandHandler = (command, payload) => {
    switch (command) {
      case "acquire_model":
        return session.acquireModel();
      case "train_model":
        return session.trainModel();
      case "research_model":
        return session.researchModel();
      case "enable_automation":
        return session.enableAutomation();
      case "complete_stage2_settlement":
        return session.completeStage2Settlement();
      case "enter_stage3":
        return session.enterStage3();
      case "upgrade_infra":
        return session.upgradeInfra(String((payload as { id?: string } | undefined)?.id ?? ""));
      case "commission_room":
        return session.commissionRoom(Number((payload as { index?: number } | undefined)?.index ?? 0));
      case "start_flagship":
        return session.startFlagship(String((payload as { id?: string } | undefined)?.id ?? ""));
      case "claim_flagship_reward":
        return session.claimFlagshipReward();
      case "choose_blueprint":
        return session.chooseBlueprint(String((payload as { id?: string } | undefined)?.id ?? ""));
      case "enable_rental":
        return session.enableRental();
      case "buy_server":
        return session.buyServer();
      case "buy_max_servers":
        return session.buyMaxServers();
      case "upgrade_center":
        return session.upgradeCenter();
      case "prestige":
        return session.prestige();
      case "claim_core":
        return session.claimCore();
      case "start_space_plan":
        return session.startSpacePlan();
      case "buy_node":
        return session.buyNode(String((payload as { id?: string } | undefined)?.id ?? ""));
      case "start_stage4_project":
        return session.startStage4Project();
      case "claim_stage4_reward":
        return session.claimStage4Reward();
      case "start_stage5":
        return session.startStage5();
      case "buy_stage5_node":
        return session.buyStage5Node(String((payload as { id?: string } | undefined)?.id ?? ""));
      case "start_stage5_project":
        return session.startStage5Project();
      case "claim_stage5_reward":
        return session.claimStage5Reward();
      case "claim_offline":
        return session.claimOffline();
      case "claim_free_income_sponsor":
        return session.claimFreeIncomeSponsor();
      case "resume_sponsor_ad": {
        const offer = session.pendingRewardedAdOffer();
        if (!offer) return { ok: false, error: "ad_offer_missing" };
        if (!rewardedAd || rewardedAd.getSnapshot().state !== "ready") {
          shell.showToast(rewardedAd ? t("toast.adLoading") : t("toast.adTapTapOnly"));
          return { ok: false, error: "ad_not_ready" };
        }
        queueMicrotask(() => playRewardedOffer(offer));
        return { ok: true };
      }
      case "cancel_pending_sponsor_ad": {
        const offer = session.pendingRewardedAdOffer();
        return offer ? session.cancelPendingSponsorAd(offer.eventId) : { ok: false, error: "ad_offer_missing" };
      }
      case "cloud_upload": {
        if (!cloudSave?.supported()) {
          shell.showToast(t("toast.cloudUnsupported"));
          return { ok: false, error: "cloud_unsupported" };
        }
        void cloudSave.upload(session.exportJson(), true).then((result) => {
          if (result.ok) {
            shell.showToast(t("toast.cloudBackupDone"));
            return;
          }
          if (result.conflict) {
            shell.confirmDialog({
              title: t("cloud.conflictTitle"),
              body: `${t(result.error ?? "cloud.conflictBody")}\n\n${t("cloud.conflictAdvice")}`,
              confirmText: t("cloud.confirmOverride"),
              onConfirm: () => {
                void cloudSave.upload(session.exportJson(), true, true).then((forced) => {
                  shell.showToast(forced.ok ? t("toast.cloudOverridden") : t(forced.error ?? "toast.cloudOverrideFailed"));
                });
              },
            });
            return;
          }
          shell.showToast(t(result.error ?? "toast.cloudBackupFailed"));
        });
        return { ok: true };
      }
      case "cloud_restore": {
        if (!cloudSave?.supported()) {
          shell.showToast(t("toast.cloudUnsupported"));
          return { ok: false, error: "cloud_unsupported" };
        }
        shell.confirmDialog({
          title: t("cloud.restoreTitle"),
          body: t("cloud.restoreBody"),
          confirmText: t("cloud.restoreConfirm"),
          onConfirm: () => {
            void cloudSave.download().then((downloaded) => {
              if (!downloaded.ok || !downloaded.saveJson) {
                shell.showToast(t(downloaded.error ?? "toast.cloudRestoreFailed"));
                return;
              }
              const imported = session.importJson(downloaded.saveJson);
              shell.showToast(imported.ok ? t("toast.cloudRestored") : t("toast.cloudRestoreInvalid"));
            });
          },
        });
        return { ok: true };
      }
      case "set_debug_speed": {
        const speed = Number((payload as { speed?: number } | undefined)?.speed);
        if (!formalPlatformMode || !PLATFORM_REVIEW_MODE || !PLATFORM_REVIEW_SPEEDS.has(speed)) {
          return { ok: false, error: "debug_speed_forbidden" };
        }
        runtimeSpeed = speed;
        return { ok: true };
      }
      case "save":
        return session.save("manual");
      case "set_locale": {
        const locale = command.slice("set_locale:".length);
        if (locale !== "zh-CN" && locale !== "en-US") return { ok: false, error: "invalid_locale" };
        if (getLocale() === locale) return { ok: true };
        setLocale(locale);
        // 语言是低频偏好：重载以全量一致地重渲染（存档 schema 不受影响）。
        window.location.reload();
        return { ok: true };
      }
      case "export_json": {
        const json = session.exportJson();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `compute-tycoon-save-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return { ok: true };
      }
      case "import_json": {
        const res = session.importJson(String((payload as { text?: string } | undefined)?.text ?? ""));
        if (!res.ok) shell.showToast(t(res.error ?? "toast.importFailed"));
        return res;
      }
      case "reset":
        {
          const result = session.reset();
          if (result.ok) shell.showToast(t("toast.resetDone"));
          return result;
        }
      default:
        if (command.startsWith("accept_order:")) {
          return session.acceptOrder(command.slice("accept_order:".length));
        }
        if (command.startsWith("claim_order:")) {
          return session.claimOrder(Number(command.slice("claim_order:".length)));
        }
        if (command.startsWith("upgrade_infra:")) {
          return session.upgradeInfra(command.slice("upgrade_infra:".length));
        }
        if (command.startsWith("commission_room:")) {
          return session.commissionRoom(Number(command.slice("commission_room:".length)));
        }
        if (command.startsWith("start_flagship:")) {
          return session.startFlagship(command.slice("start_flagship:".length));
        }
        if (command.startsWith("buy_node:")) {
          return session.buyNode(command.slice("buy_node:".length));
        }
        if (command.startsWith("buy_stage5_node:")) {
          return session.buyStage5Node(command.slice("buy_stage5_node:".length));
        }
        if (command.startsWith("choose_blueprint:")) {
          return session.chooseBlueprint(command.slice("choose_blueprint:".length));
        }
        if (command.startsWith("prepare_sponsor_ad:")) {
          if (!rewardedAd || rewardedAd.getSnapshot().state !== "ready") {
            shell.showToast(rewardedAd ? t("toast.adLoading") : t("toast.adTapTapOnly"));
            return { ok: false, error: "ad_not_ready" };
          }
          const kind = command.slice("prepare_sponsor_ad:".length);
          if (kind !== "offline_capacity" && kind !== "income_boost") return { ok: false, error: "invalid_sponsor_kind" };
          return session.prepareSponsorAd(kind);
        }
        if (command.startsWith("open_leaderboard:")) {
          const kind = command.slice("open_leaderboard:".length);
          if (kind !== "fastest" && kind !== "wealth") return { ok: false, error: "invalid_leaderboard" };
          if (!leaderboards?.supported()) {
            shell.showToast(t("toast.leaderboardTapTapOnly"));
            return { ok: false, error: "leaderboard_unsupported" };
          }
          void leaderboards.submitEligible(session.getState()).finally(() => {
            void leaderboards.open(kind).then((result) => {
              if (!result.ok) shell.showToast(t(result.error ?? "leaderboard.err.openFailed"));
            });
          });
          return { ok: true };
        }
        return { ok: false, error: "unknown_command" };
    }
  };
  const commandHandler: CommandHandler = (command, payload) => {
    const beforeFeel = session.viewModel().feel;
    const result = executeCommand(command, payload);
    if (result.ok) {
      const feedback = createGrowthFeedback(command, beforeFeel, session.viewModel().feel);
      if (feedback) shell.showGrowthFeedback(feedback);
      audio.playCue(command);
    }
    if (result.rewardedAdOffer) queueMicrotask(() => playRewardedOffer(result.rewardedAdOffer));
    return result;
  };
  shell.setCommandHandler(commandHandler);

  const render = () => {
    const vm = session.viewModel();
    audio.setPhase(vm.stage, vm.iterationCount);
    shell.render(vm);
  };
  render();
  shell.setVisualPaused(document.visibilityState === "hidden");

  // 帧循环：保存句柄，重复启动时先取消旧的
  let last = performance.now();
  const loop = (now: number) => {
    if (activeRaf !== null) cancelAnimationFrame(activeRaf);
    const dt = (now - last) / 1000;
    last = now;
    advanceSessionTime(session, dt * runtimeSpeed);
    render();
    activeRaf = requestAnimationFrame(loop);
  };
  activeRaf = requestAnimationFrame(loop);

  // 生命周期：隐藏时保存（防重入，只绑定一次）
  onVisibility = () => {
    if (document.visibilityState === "hidden") {
      shell.setVisualPaused(true);
      session.save("visibility_hidden");
    } else {
      shell.setVisualPaused(false);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  onBeforeUnload = () => {
    session.save("beforeunload");
  };
  window.addEventListener("beforeunload", onBeforeUnload);

  bootedContainer = container;
  boundContainer = container;
  activeShell = shell;

  if (reviewOverride) {
    window.__CT_REVIEW_RUNTIME_PROBE__ = {
      checkpointId: reviewOverride.checkpointId,
      namespace: reviewOverride.namespace,
      speed: runtimeSpeed,
      getState: () => structuredClone(session.getState()),
      getMetrics: () => shell.getMetrics(),
      save: () => session.save("review_probe"),
    };
  }

  // HMR：模块热替换时清理旧实例
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      teardown();
    });
  }
}

export function teardown(): void {
  if (activeRaf !== null) {
    cancelAnimationFrame(activeRaf);
    activeRaf = null;
  }
  if (onVisibility) {
    document.removeEventListener("visibilitychange", onVisibility);
    onVisibility = null;
  }
  if (onBeforeUnload) {
    window.removeEventListener("beforeunload", onBeforeUnload);
    onBeforeUnload = null;
  }
  if (activeShell) {
    activeShell.destroy();
    activeShell = null;
  }
  if (removeRewardedAdSubscription) {
    removeRewardedAdSubscription();
    removeRewardedAdSubscription = null;
  }
  if (activeRewardedAdController) {
    activeRewardedAdController.destroy();
    activeRewardedAdController = null;
  }
  if (activeCloudSaveController) {
    activeCloudSaveController.destroy();
    activeCloudSaveController = null;
  }
  if (removeCloudSaveSubscription) {
    removeCloudSaveSubscription();
    removeCloudSaveSubscription = null;
  }
  if (activeAudio) {
    activeAudio.destroy();
    activeAudio = null;
  }
  delete window.__CT_REVIEW_RUNTIME_PROBE__;
  bootedContainer = null;
  boundContainer = null;
}

if (typeof document !== "undefined") {
  boot();
}
