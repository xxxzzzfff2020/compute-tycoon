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

export const GAME_BGM_PATH = `${import.meta.env.BASE_URL}assets/audio/compute-tycoon-stellar-tide-v1.mp3`;
const BGM_SEGMENTS = {
  stage1: { start: 0, end: 19 },
  stage2: { start: 19, end: 38 },
  stage3: { start: 38, end: 76 },
  stage4: { start: 76, end: 152 },
  stage5: { start: 152, end: 227.5 },
} as const;

export interface BgmPhaseProfile {
  key: keyof typeof BGM_SEGMENTS;
  start: number;
  end: number;
  playbackRate: number;
}

export function bgmPhaseProfile(stage: number, _iteration: number): BgmPhaseProfile {
  const normalizedStage = Math.min(5, Math.max(1, Math.trunc(stage)));
  const key = `stage${normalizedStage}` as keyof typeof BGM_SEGMENTS;
  const segment = BGM_SEGMENTS[key];
  return {
    key,
    start: segment.start,
    end: segment.end,
    playbackRate: 1,
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
  private readonly onBgmTimeUpdate = () => {
    if (!this.bgm) return;
    const segment = this.currentSegment();
    if (this.bgm.currentTime >= segment.end || this.bgm.currentTime < segment.start) {
      this.bgm.currentTime = segment.start;
    }
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
      if (nextKey !== previousKey) this.bgm.currentTime = this.phaseStart();
      this.bgm.playbackRate = this.phaseProfile().playbackRate;
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
      this.bgm.removeEventListener("timeupdate", this.onBgmTimeUpdate);
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
    const bgm = new Audio(GAME_BGM_PATH);
    bgm.preload = "auto";
    bgm.setAttribute("playsinline", "true");
    bgm.addEventListener("timeupdate", this.onBgmTimeUpdate);
    bgm.addEventListener("ended", this.onBgmTimeUpdate);
    bgm.currentTime = this.phaseStart();
    bgm.playbackRate = this.phaseProfile().playbackRate;
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

  private currentSegment(): { start: number; end: number } {
    const profile = this.phaseProfile();
    return { start: profile.start, end: profile.end };
  }

  private phaseStart(): number {
    return this.phaseProfile().start;
  }
}
