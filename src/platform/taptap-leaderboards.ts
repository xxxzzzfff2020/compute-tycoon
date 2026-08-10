import Decimal from "decimal.js";
import { SAVE_SCHEMA_VERSION, type SaveData } from "../save/types";

export const FASTEST_LEADERBOARD_ID = "yd5746paqa6h2d8o50";
export const WEALTH_LEADERBOARD_ID = "2mbxnvaod8pwt5wawk";
export const FASTEST_EXPECTED_SORT = "ascending" as const;
export const WEALTH_EXPECTED_SORT = "descending" as const;
export const WEALTH_SCORE_VERSION = 1;

const WEALTH_BUCKET_SIZE = 1_000_000;
const WEALTH_MANTISSA_SCALE = 100_000;
const MAX_WEALTH_EXPONENT = Math.floor((Number.MAX_SAFE_INTEGER - (WEALTH_BUCKET_SIZE - 1)) / WEALTH_BUCKET_SIZE);

/**
 * TapTap 排行榜只接受安全整数。这里将任意大正数编码成“十进制指数 + 5位有效数”索引，
 * 在 Decimal 可表达范围内保持大小次序，不把超大资金直接转成 Infinity。
 */
export function encodeWealthScore(value: SaveData["money"] | Decimal): number | null {
  let wealth: Decimal;
  try {
    wealth = value instanceof Decimal ? value : new Decimal(value);
  } catch {
    return null;
  }
  if (!wealth.isFinite() || wealth.isNegative()) return null;
  if (wealth.isZero()) return 0;
  const exponent = wealth.e;
  if (!Number.isFinite(exponent) || exponent < 0) return 0;
  if (exponent > MAX_WEALTH_EXPONENT) return Number.MAX_SAFE_INTEGER;
  const mantissa = wealth.div(new Decimal(10).pow(exponent));
  const bucket = mantissa.mul(WEALTH_MANTISSA_SCALE).floor().toNumber();
  return Math.min(Number.MAX_SAFE_INTEGER, exponent * WEALTH_BUCKET_SIZE + bucket);
}

function isFormalSave(state: SaveData): boolean {
  if (state.schemaVersion !== SAVE_SCHEMA_VERSION) return false;
  return !state.saveId.startsWith("review-")
    && !state.saveId.startsWith("review-v2-")
    && !state.saveId.startsWith("endgame-review-")
    && !state.saveId.startsWith("dev-");
}

export interface TapLeaderboardManager {
  submitScores(options: { scores: Array<{ leaderboardId: string; score: number }>; callback: TapCallback }): void;
  openLeaderboard(options: { leaderboardId: string; collection: "public"; callback: TapCallback }): void;
}
interface TapCallback {
  onSuccess(result?: unknown): void;
  onFailure(code: number, message: string): void;
}
interface TapLeaderboardApi { getLeaderboardManager(): TapLeaderboardManager }

function manager(): TapLeaderboardManager | null {
  const tap = (globalThis as typeof globalThis & { tap?: Partial<TapLeaderboardApi> }).tap;
  if (!tap || typeof tap.getLeaderboardManager !== "function") return null;
  return tap.getLeaderboardManager();
}

export class TapLeaderboardController {
  private readonly leaderboard: TapLeaderboardManager | null;
  private submitting = false;
  private lastSubmitAtMs = 0;

  constructor(options: { leaderboardManager?: TapLeaderboardManager } = {}) {
    this.leaderboard = options.leaderboardManager ?? manager();
  }

  supported(): boolean { return this.leaderboard !== null; }

  async open(kind: "fastest" | "wealth"): Promise<{ ok: boolean; error?: string }> {
    if (!this.leaderboard) return { ok: false, error: "leaderboard.err.tapOnly" };
    const leaderboardId = kind === "fastest" ? FASTEST_LEADERBOARD_ID : WEALTH_LEADERBOARD_ID;
    try {
      await new Promise<void>((resolve, reject) => this.leaderboard!.openLeaderboard({
        leaderboardId,
        collection: "public",
        callback: { onSuccess: () => resolve(), onFailure: (code, message) => reject(new Error(`${code}: ${message}`)) },
      }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "leaderboard.err.openFailed" };
    }
  }

  async submitEligible(state: SaveData): Promise<{ ok: boolean; error?: string }> {
    if (!this.leaderboard) return { ok: false, error: "unsupported" };
    if (this.submitting || Date.now() - this.lastSubmitAtMs < 60_000) return { ok: false, error: "rate_limited" };
    if (!isFormalSave(state)) return { ok: false, error: "non_formal_save" };
    const scores: Array<{ leaderboardId: string; score: number }> = [];
    const wealthScore = encodeWealthScore(state.money);
    if (wealthScore !== null) scores.push({ leaderboardId: WEALTH_LEADERBOARD_ID, score: wealthScore });

    const completedAtMs = state.singularity?.stage5?.legendaryArchive?.completedAtMs ?? 0;
    const elapsedMs = completedAtMs - state.createdAtMs;
    // 最短通关只接受真实正式档终局记录；拒绝回拨、瞬时检查点和异常超长时间。
    const terminalProof = state.technologyIterationCount === 3
      && (state.singularity?.coresClaimed.length ?? 0) >= 3
      && state.singularity?.stage5?.storyCompleted === true;
    if (terminalProof && elapsedMs >= 10 * 60_000 && elapsedMs <= 365 * 24 * 60 * 60_000) {
      scores.push({ leaderboardId: FASTEST_LEADERBOARD_ID, score: Math.floor(elapsedMs) });
    }
    if (scores.length === 0) return { ok: false, error: "no_eligible_score" };

    this.submitting = true;
    this.lastSubmitAtMs = Date.now();
    try {
      await new Promise<void>((resolve, reject) => this.leaderboard!.submitScores({
        scores,
        callback: { onSuccess: () => resolve(), onFailure: (code, message) => reject(new Error(`${code}: ${message}`)) },
      }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "leaderboard.err.submitFailed" };
    } finally {
      this.submitting = false;
    }
  }
}
