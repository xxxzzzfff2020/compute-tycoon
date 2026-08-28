// 应用入口：装配存储/会话/UI，绑定命令路由与帧循环。
// 运行时合同：
// - boot 防重入（同一 container 只初始化一次）；
// - rAF 句柄保留，HMR/重新初始化时取消旧循环；
// - 生命周期监听只注册一次并随 shell.destroy 清理。
import { OffsetClock } from "../core/time";
import { buildDevSave, DEV_SAVE_NAMESPACE, devStateId } from "./devverify";
import { ENDGAME_SAVE_NAMESPACE, MAX_SUPPORTED_SCHEMA_VERSION, SAVE_NAMESPACE, newSaveId } from "../save/types";
import { ensureEndgameSingularity } from "../economy/singularity";
import { createGrowthFeedback } from "../economy/feel";
import { getLocale, initLocale, localeFromCommand, setLocale, t } from "../i18n";
import { GameSession } from "./session";
import { freshSaveData, LocalStorageSaveStorage } from "../save/storage";
import { SaveRepository } from "../save/repository";
import { createAppShell, type AppShell, type CommandHandler } from "../ui/render";
import { feedbackKindForCommand, GameAudio } from "../audio/game-audio";
import { foregroundGameSeconds, uiRenderDue } from "./frame-clock";
import {
  PLATFORM_FEATURE_REASONS,
  PLATFORM_REVIEW_MODE,
  PLATFORM_REVIEW_SAVE_NAMESPACE,
  isUnavailablePlatformCommand,
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
let activeAudio: GameAudio | null = null;
const PLATFORM_REVIEW_SPEEDS = new Set([1, 2, 4, 8, 16, 32, 64, 128, 256]);
/**
 * 负责人自然体验候选：从根地址进入正式自然流程；调试倍率只从菜单命令进入。
 * 该构建仍可使用平台Review隔离槽，但拒绝所有URL快捷入口，避免把检查点带给玩家。
 */
const OWNER_NATURAL_REVIEW_MODE = import.meta.env.VITE_OWNER_NATURAL_REVIEW === "1";
/** 正式交付包：在编译期关闭验收档、终局快捷入口与体验倍率。 */
const RELEASE_PACKAGE_MODE = import.meta.env.VITE_RELEASE_PACKAGE === "1";

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

  const clock = new OffsetClock();
  initLocale();
  const reviewOverride: ReviewRuntimeOverride | null =
    !RELEASE_PACKAGE_MODE && window.__CT_REVIEW_RUNTIME_OVERRIDE__?.kind === "founder-review-v2"
      ? window.__CT_REVIEW_RUNTIME_OVERRIDE__
      : null;
  // 开发加速只允许与合法隔离验收档同时启用，避免查询参数污染正式存档。
  const devParams = new URLSearchParams(window.location.search);
  // 隔离验收模式：独立存档命名空间，不影响正式档
  const verifyStateId = RELEASE_PACKAGE_MODE || reviewOverride || OWNER_NATURAL_REVIEW_MODE ? null : devStateId();
  const devEnabled = verifyStateId !== null;
  // CARD-01 隔离终局入口：?endgame=1 使用独立实验命名空间，不影响正式档与 Review v2。
  const endgameEnabled = !RELEASE_PACKAGE_MODE && !OWNER_NATURAL_REVIEW_MODE
    && reviewOverride == null && !devEnabled && devParams.get("endgame") === "1";
  const formalPlatformMode = reviewOverride == null && !devEnabled && !endgameEnabled;
  const requestedPlatformSpeed = Number(devParams.get("speed") ?? "1");
  let runtimeSpeed = reviewOverride
    ? reviewOverride.speed
    : devEnabled
      ? Math.max(1, Number(devParams.get("speed") ?? "1") || 1)
      : !OWNER_NATURAL_REVIEW_MODE && PLATFORM_REVIEW_MODE && PLATFORM_REVIEW_SPEEDS.has(requestedPlatformSpeed)
        ? requestedPlatformSpeed
        : 1;
  // 单机正式档只按设备本地命名空间读取，绝不探测账号或云端身份。
  const storage = new LocalStorageSaveStorage(
    PLATFORM_REVIEW_MODE ? PLATFORM_REVIEW_SAVE_NAMESPACE : SAVE_NAMESPACE,
  );
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
    } else if (existing.singularity == null && !(existing.schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION)) {
      // 旧正式档：向前兼容迁移，不丢数据。
      if (ensureEndgameSingularity(existing)) {
        effectiveStorage.save(existing);
      }
    }
  }
  const repository = new SaveRepository({ storage: effectiveStorage, nowMs: () => clock.now() });
  // 清理旧占位节点；单机启动不等待平台回调或联网请求。
  container.replaceChildren();
  const shell = createAppShell(container);
  const audio = new GameAudio();
  audio.install();
  shell.setInteractionFeedbackHandler((kind) => audio.playFeedback(kind));
  activeAudio = audio;
  shell.setPlatformStatus({
    cloud: PLATFORM_FEATURE_REASONS.cloudSave,
    leaderboard: PLATFORM_FEATURE_REASONS.leaderboard,
    platformReview: !RELEASE_PACKAGE_MODE && PLATFORM_REVIEW_MODE,
    runtimeSpeed,
  });
  const session = new GameSession({
    repository,
    clock,
    onOrderCompleted: () => {
      const m = shell.getMetrics();
      shell.resetMetrics();
      shell.incrementOrderCompletion(m.orderCompletionCount + 1);
    },
  });

  const executeCommand: CommandHandler = (command, payload) => {
    // UI 禁用之外再拒绝旧命令，防止残留入口或脚本触发任何平台副作用。
    if (isUnavailablePlatformCommand(command)) return { ok: false, error: "platform_disabled" };
    if (command.startsWith("set_locale:")) {
      const locale = localeFromCommand(command);
      if (!locale) return { ok: false, error: "invalid_locale" };
      if (getLocale() === locale) return { ok: true };
      setLocale(locale);
      // 语言是低频偏好：重载以全量一致地重渲染（存档 schema 不受影响）。
      window.location.reload();
      return { ok: true };
    }
    // 正式包在编译期移除整条调速命令分支；验收包保持原有菜单调速能力。
    if (!RELEASE_PACKAGE_MODE && command === "set_debug_speed") {
      const speed = Number((payload as { speed?: number } | undefined)?.speed);
      if (!formalPlatformMode || !PLATFORM_REVIEW_MODE || !PLATFORM_REVIEW_SPEEDS.has(speed)) {
        return { ok: false, error: "debug_speed_forbidden" };
      }
      runtimeSpeed = speed;
      return { ok: true };
    }
    switch (command) {
      case "acquire_model":
        return session.acquireModel();
      case "train_model":
        return session.trainModel();
      case "upgrade_recommended_blueprint":
        return session.upgradeRecommendedBlueprint(
          ((payload as { quantity?: number | "max" } | undefined)?.quantity ?? 1),
        );
      case "reset_talents":
        return session.resetTalents();
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
      case "save":
        return session.save("manual");
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
      case "reset": {
        const result = session.reset();
        if (result.ok) shell.showToast(t("toast.resetDone"));
        return result;
      }
      default:
        if (command.startsWith("accept_order:")) {
          return session.acceptOrder(command.slice("accept_order:".length));
        }
        if (command.startsWith("unlock_order:")) {
          return session.unlockOrder(command.slice("unlock_order:".length));
        }
        if (command.startsWith("expand_order_slot:")) {
          return session.expandOrderSlot(command.slice("expand_order_slot:".length));
        }
        if (command.startsWith("claim_order:")) {
          return session.claimOrder(Number(command.slice("claim_order:".length)));
        }
        if (command.startsWith("claim_order_queue:")) {
          return session.claimOrderQueue(command.slice("claim_order_queue:".length));
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
        if (command.startsWith("upgrade_blueprint:")) {
          const [, modelId, rawQuantity = "1"] = command.split(":");
          const quantity = rawQuantity === "max" ? "max" : Math.max(1, Number(rawQuantity) || 1);
          return session.upgradeBlueprint(modelId, quantity);
        }
        if (command.startsWith("expand_server_scale:")) {
          const [, serverId, rawQuantity = "1"] = command.split(":");
          const quantity = rawQuantity === "max" ? "max" : Math.max(1, Number(rawQuantity) || 1);
          return session.expandServerScale(serverId, quantity);
        }
        if (command.startsWith("allocate_talent:")) {
          return session.allocateTalent(command.slice("allocate_talent:".length) as import("../save/types").TalentNodeId);
        }
        if (command.startsWith("claim_achievement:")) {
          const result = session.claimAchievement(command.slice("claim_achievement:".length));
          if (result.ok) shell.showToast(t("toast.talentPointClaimed"));
          return result;
        }
        return { ok: false, error: "unknown_command" };
    }
  };
  let lastUiRenderAtMs = Number.NEGATIVE_INFINITY;
  // 只用于方案 E 本地验收面板：累计前台实际推进的游戏时间，不进存档。
  let debugElapsedGameSec = 0;
  const render = (nowMs = performance.now(), force = false) => {
    if (!force && !uiRenderDue(lastUiRenderAtMs, nowMs)) return;
    lastUiRenderAtMs = nowMs;
    const vm = session.viewModel();
    audio.setPhase(vm.stage, vm.iterationCount);
    shell.render(vm);
    shell.setDebugRuntime(vm, debugElapsedGameSec, runtimeSpeed);
  };

  const commandHandler: CommandHandler = (command, payload) => {
    const beforeFeel = session.viewModel().feel;
    const result = executeCommand(command, payload);
    if (result.ok) {
      const feedback = createGrowthFeedback(command, beforeFeel, session.viewModel().feel);
      if (feedback) shell.showGrowthFeedback(feedback);
      const interactionFeedback = feedbackKindForCommand(command);
      if (interactionFeedback) audio.playFeedback(interactionFeedback);
      render(performance.now(), true);
    }
    return result;
  };
  shell.setCommandHandler(commandHandler);

  render(performance.now(), true);
  shell.setVisualPaused(document.visibilityState === "hidden");

  // 帧循环：保存句柄，重复启动时先取消旧的
  let last = performance.now();
  let hiddenIntervalPending = document.visibilityState === "hidden";
  const resetFrameClock = () => {
    last = performance.now();
  };
  const loop = (now: number) => {
    if (activeRaf !== null) cancelAnimationFrame(activeRaf);
    const paused = document.visibilityState === "hidden";
    const elapsedGameSec = foregroundGameSeconds(last, now, runtimeSpeed, paused);
    last = now;
    if (elapsedGameSec > 0) {
      advanceSessionTime(session, elapsedGameSec);
      debugElapsedGameSec += elapsedGameSec;
      render(now);
    }
    activeRaf = requestAnimationFrame(loop);
  };
  activeRaf = requestAnimationFrame(loop);

  // 生命周期：真实后台区间回到前台时结算一次，重复 visible 不重放。
  onVisibility = () => {
    // 从当前时刻重新计帧，后台时间仅走离线结算，不补进在线首帧。
    resetFrameClock();
    if (document.visibilityState === "hidden") {
      shell.setVisualPaused(true);
      hiddenIntervalPending = true;
      session.save("visibility_hidden");
    } else {
      const completedInterval = hiddenIntervalPending;
      hiddenIntervalPending = false;
      if (completedInterval) session.resumeFromBackground();
      shell.setVisualPaused(false);
      render(performance.now(), true);
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
  if (activeAudio) {
    activeAudio.destroy();
    activeAudio = null;
  }
  if (!RELEASE_PACKAGE_MODE) delete window.__CT_REVIEW_RUNTIME_PROBE__;
  bootedContainer = null;
  boundContainer = null;
}

if (typeof document !== "undefined") {
  boot();
}
