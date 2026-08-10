// 测试工具：内存存储 + 固定时钟 + 会话工厂
import { GameSession } from "../../src/app/session";
import { OffsetClock } from "../../src/core/time";
import { MemorySaveStorage } from "../../src/save/storage";
import { SaveRepository } from "../../src/save/repository";
import { freshSaveData } from "../../src/save/storage";
import type { SaveData } from "../../src/save/types";
import {
  acceptOrder,
  acquireFirstModel,
  enableAutomation,
  tick,
} from "../../src/economy/engine";

export class FakeClock extends OffsetClock {
  private current = 1_700_000_000_000;
  override now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

export function makeSession(options?: { initial?: Partial<SaveData> }): {
  session: GameSession;
  clock: FakeClock;
  storage: MemorySaveStorage;
  repository: SaveRepository;
} {
  const clock = new FakeClock();
  const storage = new MemorySaveStorage();
  const repository = new SaveRepository({ storage, nowMs: () => clock.now() });
  if (options?.initial) {
    const base = freshSaveData(clock.now());
    const data: SaveData = { ...base, ...options.initial };
    storage.save(data);
  }
  const session = new GameSession({ repository, clock });
  return { session, clock, storage, repository };
}

/** 快速推进一个可运行状态：获取模型并接受推荐订单 */
export function seedBasicRun(state: SaveData, nowMs: number): SaveData {
  acquireFirstModel(state, "codex");
  acceptOrder(state, "o1", nowMs);
  return state;
}

export function runUntilOrdersComplete(
  session: GameSession,
  clock: FakeClock,
  seconds: number
): void {
  // 1 秒步进，确保 tick 的秒级结算生效
  const steps = Math.ceil(seconds);
  for (let i = 0; i < steps; i++) {
    clock.advance(1000);
    session.update(1);
  }
}
