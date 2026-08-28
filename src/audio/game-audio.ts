import { LocalHaptics, type InteractionFeedbackKind } from "../platform/local-haptics";

export type { InteractionFeedbackKind } from "../platform/local-haptics";

export interface AudioPreferences {
  bgmEnabled: boolean;
  hapticsEnabled: boolean;
  volume: number;
}

const AUDIO_PREFS_KEY = "compute_tycoon_h5_audio_v1";
const DEFAULT_PREFS: AudioPreferences = { bgmEnabled: true, hapticsEnabled: true, volume: 0.45 };
const RELEASE_PACKAGE_MODE = import.meta.env.VITE_RELEASE_PACKAGE === "1";

export function loadAudioPreferences(): AudioPreferences {
  try {
    const raw = localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AudioPreferences>;
    return {
      bgmEnabled: parsed.bgmEnabled !== false,
      hapticsEnabled: parsed.hapticsEnabled !== false,
      volume: Math.max(0, Math.min(1, Number(parsed.volume ?? DEFAULT_PREFS.volume))),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveAudioPreferences(preferences: AudioPreferences): void {
  try {
    localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // 隐私模式/受限WebView仍允许本次会话调整，不阻断游戏。
  }
  window.dispatchEvent(new CustomEvent("ct-audio-preferences", { detail: preferences }));
}

export const GAME_BGM_PATHS = {
  stage1: `${import.meta.env.BASE_URL}assets/audio/compute-tycoon-stage1-solo-spark-v1.mp3`,
  stage2: `${import.meta.env.BASE_URL}assets/audio/compute-tycoon-stage2-cluster-pulse-v1.mp3`,
  stage3: `${import.meta.env.BASE_URL}assets/audio/compute-tycoon-stage3-compute-citadel-v1.mp3`,
  stage4: `${import.meta.env.BASE_URL}assets/audio/compute-tycoon-stage4-earth-moon-relay-v1.mp3`,
  stage5: `${import.meta.env.BASE_URL}assets/audio/compute-tycoon-stage5-dyson-ascension-v1.mp3`,
} as const;

export function feedbackKindForCommand(command: string): InteractionFeedbackKind | null {
  if ((!RELEASE_PACKAGE_MODE && command === "set_debug_speed") || command === "tick") return null;
  const milestoneCommands = [
    "claim_core", "prestige", "enter_stage3", "start_space_plan", "start_stage5",
    "complete_stage2_settlement", "claim_flagship_reward", "claim_stage4_reward", "claim_stage5_reward",
  ];
  if (milestoneCommands.some((prefix) => command === prefix || command.startsWith(`${prefix}:`))) return "milestone";
  const successCommands = [
    "acquire_model", "train_model", "buy_server", "buy_max_servers",
    "commission_room", "upgrade_blueprint", "expand_server_scale", "allocate_talent",
    "enable_rental", "enable_automation", "upgrade_infra", "start_flagship",
    "buy_node", "buy_stage5_node", "start_stage4_project", "start_stage5_project",
  ];
  if (successCommands.some((prefix) => command === prefix || command.startsWith(`${prefix}:`))) return "success";
  return "click";
}

export interface BgmPhaseProfile {
  key: keyof typeof GAME_BGM_PATHS;
  path: string;
}

export function bgmPhaseProfile(stage: number, _iteration: number): BgmPhaseProfile {
  const normalizedStage = Math.min(5, Math.max(1, Math.trunc(stage)));
  const key = `stage${normalizedStage}` as keyof typeof GAME_BGM_PATHS;
  return {
    key,
    path: GAME_BGM_PATHS[key],
  };
}

/** 五阶段独立原创配乐 + 浏览器本地触感；不依赖平台 SDK。 */
export class GameAudio {
  private bgm: HTMLAudioElement | null = null;
  private prefs = loadAudioPreferences();
  private readonly haptics = new LocalHaptics();
  private stage = 1;
  private iteration = 0;
  private removeUnlock: (() => void) | null = null;
  private readonly onPrefs = (event: Event) => {
    this.prefs = (event as CustomEvent<AudioPreferences>).detail;
    this.applyPreferences();
  };
  private readonly onVisibility = () => {
    if (document.visibilityState === "hidden") {
      this.bgm?.pause();
      return;
    }
    if (this.prefs.bgmEnabled) void this.playBgm();
  };
  install(): void {
    const unlock = () => {
      this.ensureBgm();
      this.applyPreferences();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    this.removeUnlock = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("ct-audio-preferences", this.onPrefs);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  setPhase(stage: number, iteration: number): void {
    if (stage === this.stage && iteration === this.iteration) return;
    const previousKey = this.phaseProfile().key;
    this.stage = stage;
    this.iteration = iteration;
    if (this.bgm) {
      const nextKey = this.phaseProfile().key;
      if (nextKey !== previousKey) {
        const shouldResume = this.prefs.bgmEnabled && document.visibilityState !== "hidden";
        this.bgm.pause();
        this.bgm.src = this.phaseProfile().path;
        this.bgm.currentTime = 0;
        this.bgm.load();
        if (shouldResume) void this.playBgm();
      }
    }
  }

  playFeedback(kind: InteractionFeedbackKind): void {
    if (document.visibilityState === "hidden") return;
    this.haptics.trigger(kind, this.prefs.hapticsEnabled);
  }

  destroy(): void {
    this.removeUnlock?.();
    window.removeEventListener("ct-audio-preferences", this.onPrefs);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.bgm) {
      this.bgm.pause();
      this.bgm.removeAttribute("src");
      this.bgm.load();
      this.bgm = null;
    }
  }

  private applyPreferences(): void {
    const bgm = this.ensureBgm();
    bgm.volume = Math.max(0, Math.min(1, this.prefs.volume * 0.58));
    if (this.prefs.bgmEnabled && document.visibilityState !== "hidden") {
      void this.playBgm();
    } else {
      bgm.pause();
    }
  }

  private ensureBgm(): HTMLAudioElement {
    if (this.bgm) return this.bgm;
    const bgm = new Audio(this.phaseProfile().path);
    bgm.preload = "metadata";
    bgm.setAttribute("playsinline", "true");
    bgm.loop = true;
    bgm.volume = Math.max(0, Math.min(1, this.prefs.volume * 0.58));
    this.bgm = bgm;
    return bgm;
  }

  private async playBgm(): Promise<void> {
    if (!this.prefs.bgmEnabled || document.visibilityState === "hidden") return;
    const bgm = this.ensureBgm();
    try {
      await bgm.play();
    } catch {
      // 浏览器自动播放策略会在首次交互前拒绝播放；下一次交互会再次尝试。
    }
  }

  private phaseProfile(): BgmPhaseProfile {
    return bgmPhaseProfile(this.stage, this.iteration);
  }
}
