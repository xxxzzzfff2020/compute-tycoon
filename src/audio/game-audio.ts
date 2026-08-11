export interface AudioPreferences {
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  volume: number;
}

const AUDIO_PREFS_KEY = "compute_tycoon_h5_audio_v1";
const DEFAULT_PREFS: AudioPreferences = { bgmEnabled: true, sfxEnabled: true, volume: 0.45 };

export function loadAudioPreferences(): AudioPreferences {
  try {
    const raw = localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AudioPreferences>;
    return {
      bgmEnabled: parsed.bgmEnabled !== false,
      sfxEnabled: parsed.sfxEnabled !== false,
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

/** 原创分段配乐 + 低密度里程碑音效；不播放高频订单音效。 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgm: HTMLAudioElement | null = null;
  private prefs = loadAudioPreferences();
  private stage = 1;
  private iteration = 0;
  private removeUnlock: (() => void) | null = null;
  private readonly onPrefs = (event: Event) => {
    this.prefs = (event as CustomEvent<AudioPreferences>).detail;
    this.applyPreferences();
  };
  private readonly onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (this.context) void this.context.suspend();
      this.bgm?.pause();
      return;
    }
    if (this.context && this.prefs.sfxEnabled) void this.context.resume();
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

  playCue(command: string): void {
    if (!this.prefs.sfxEnabled) return;
    const allowed = [
      "research_model", "buy_server", "buy_max_servers", "commission_room",
      "claim_core", "prestige", "buy_node", "buy_stage5_node",
      "claim_flagship_reward", "claim_stage4_reward", "claim_stage5_reward",
    ];
    if (!allowed.some((prefix) => command === prefix || command.startsWith(prefix + ":"))) return;
    const context = this.ensureContext();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const now = context.currentTime;
    oscillator.type = command.includes("claim") || command === "prestige" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(command.includes("claim") ? 520 : 360, now);
    oscillator.frequency.exponentialRampToValueAtTime(command.includes("claim") ? 880 : 520, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.prefs.volume * 0.12), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain).connect(this.master!);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
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
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }

  private ensureContext(): AudioContext {
    if (this.context && this.master) return this.context;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
    this.master.gain.value = this.prefs.volume;
    return this.context;
  }

  private applyPreferences(): void {
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(this.prefs.volume, this.context.currentTime, 0.04);
    }
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
