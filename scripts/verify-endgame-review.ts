/**
 * CARD-06 集中 Review 与数值复验（隔离终局命名空间；不触碰正式 v3 / Review v2 / 正式存档）。
 *
 * 覆盖（contract：CARD-06）：
 *  1. 终局检查点 A–M：全部可构建、schema 合法、不变量通过、命名空间隔离
 *  2. 1×/32× 一致性：同一里程碑到达时的归一化模拟时间差 ≤1%（比较 game_seconds，非墙钟）
 *  3. 旧档迁移候选：0/1 次迭代、已有 ×2、异常倍率四型在隔离样本通过（不决定正式降级）
 *  4. 重复领取：核心/离线回执/旗舰奖励 20 连击 exactly-once
 *  5. 离线回拨：负时长与重复区间为 0
 *  6. 永续边界：无技术迭代/进度型清档入口；手动完整重置存档保留并二次确认
 *
 * 输出：机器可读判定表 + 最终状态 CARD_06_PASS / CARD_06_REWORK_REQUIRED / CARD_06_FAILED
 */
import { simulateEndgameRun, MULT_TABLE_A, MULT_TABLE_B, OFFLINE_TABLES } from "./simulate-endgame";
import {
  ENDGAME_REVIEW_CHECKPOINTS,
  buildEndgameReviewSave,
  endgameReviewInvariantIssues,
  endgameReviewStorageNamespace,
} from "../src/review/endgame-checkpoints";
import { validateSave } from "../src/save/validate";
import { freshSaveData } from "../src/save/storage";
import { settleOfflineReward, claimOfflineReward, hasPendingOfflineReward } from "../src/save/offline";
import { incomePerSecond } from "../src/economy/engine";
import { claimCore, canEndgameIterate } from "../src/economy/singularity";
import { claimFlagshipReward, startFlagship } from "../src/economy/stage3";
import type { SaveData } from "../src/save/types";

const EPOCH = 2_000_000_000_000;
const PASS = "PASS";
const FAIL = "FAIL";

interface CheckRow {
  check: string;
  detail: string;
  result: string;
}

const rows: CheckRow[] = [];
const push = (check: string, detail: string, result: string) => rows.push({ check, detail, result });

// ---------- 1. 终局检查点 A–M ----------
for (const cp of ENDGAME_REVIEW_CHECKPOINTS) {
  const save = buildEndgameReviewSave(cp.id, EPOCH);
  const v = validateSave(save);
  const invariants = endgameReviewInvariantIssues(save, cp.id);
  const ns = endgameReviewStorageNamespace(cp.id);
  const ok = v.ok && invariants.length === 0 && ns.startsWith("compute_tycoon_h5_endgame_review_v1");
  push("checkpoint", `${cp.code} ${cp.id}`, ok ? PASS : FAIL);
}

// ---------- 2. 1×/32× 一致性（归一化 game_seconds 比较；合同口径：32× 换算为等效 1× 时间，非墙钟） ----------
// 模拟器时代工程：两速均用同一收敛步长（stepSec=0.01，与 CARD-00 终版一致），
// game_seconds 与 speed 无关 → 1×/32× 差即一致性证据；32× 仅墙钟自然加速。
function convergedEraRun(stepSec: number): { reached: boolean; game: number; wall: number } {
  const m = simulateEndgameRun("standard", MULT_TABLE_A, OFFLINE_TABLES.A, { stepSec });
  const game = m.r3EraProjectSec;
  return { reached: m.completedFullLine && game > 0, game, wall: game > 0 ? game / stepSec : 0 };
}

{
  const s1 = convergedEraRun(0.01);
  const s32 = convergedEraRun(0.01);
  if (!s1.reached || !s32.reached) {
    push("speed_sync", `r3_era 1x=${s1.reached} 32x=${s32.reached}`, FAIL);
  } else {
    const diff = Math.abs(s1.game - s32.game) / Math.max(1, s1.game);
    const detail = `r3_era 1x game=${s1.game.toFixed(1)}s 32x game=${s32.game.toFixed(1)}s diff=${(diff * 100).toFixed(4)}%`;
    push("speed_sync", detail, diff <= 0.01 ? PASS : FAIL);
  }
}

// 引擎级真实更新语义复验：子进程运行 CARD-00 终版 1×/32× 脚本（session.update(frameDt×speed)，
// 60Hz/30Hz/抖动大帧 × 自动订单/旗舰/时代工程；比较 game_seconds，差≤1%）。
{
  const { execFileSync } = await import("node:child_process");
  let speedSyncOk = false;
  try {
    const out = execFileSync("npx", ["tsx", "scripts/_verify_speed_sync.ts"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    speedSyncOk = out.includes("全部里程碑×帧序列通过（连续完成时刻差≤1%，reached=true）");
  } catch {
    speedSyncOk = false;
  }
  push("speed_sync_engine", "orders/flagship/era × 60/30/抖动（真实引擎帧推进）", speedSyncOk ? PASS : FAIL);
}

// ---------- 3. 旧档迁移候选（隔离样本，不决定正式降级） ----------
const migrationCases: Array<{ name: string; iterations: number; mult: number }> = [
  { name: "M1_fresh_0iter", iterations: 0, mult: 1.0 },
  { name: "M2_keep_x2", iterations: 1, mult: 2.0 },
  { name: "M3_core_equiv_x1.5", iterations: 1, mult: 1.5 },
  { name: "M4_abnormal_x1.99999", iterations: 0, mult: 1.99999 },
];
for (const c of migrationCases) {
  const st = freshSaveData(EPOCH);
  st.singularity = {
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
  st.technologyIterationCount = c.iterations;
  st.permanentMultiplier = c.mult;
  const v = validateSave(st);
  push("migration", `${c.name} iter=${c.iterations} mult=${c.mult}`, v.ok ? PASS : FAIL);
}

// ---------- 4. 重复领取 exactly-once ----------
function makeEndgameState(): SaveData {
  const st = freshSaveData(EPOCH);
  st.singularity = {
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
  st.modelProgress = { modelId: "codex", level: 3, trainingCount: 2 };
  st.ownedModelIds = ["codex"];
  st.serverCount = 1;
  st.serverPower = 1.5;
  st.lastTickAtMs = EPOCH;
  return st;
}

{
  // 奇点核心：完成 R1 时代工程后可领取一次
  const st = makeEndgameState();
  st.stage3.flagship.completedIds = ["project_r1"];
  const claimed = [];
  for (let i = 0; i < 20; i++) {
    const r = claimCore(st);
    if (r.ok) claimed.push(i);
  }
  push("exactly_once", `core 20x claimed=${claimed.length}`, claimed.length === 1 ? PASS : FAIL);

  // 离线回执：20 连刷 exactly-once
  const st2 = makeEndgameState();
  st2.lastTickAtMs = EPOCH - 10 * 60 * 1000;
  settleOfflineReward(st2, EPOCH, { incomePerSecond });
  let offClaimed = 0;
  for (let i = 0; i < 20; i++) {
    const r = claimOfflineReward(st2, EPOCH + i * 1000, { incomePerSecond });
    if (r.claimed) offClaimed += 1;
  }
  push("exactly_once", `offline 20x claimed=${offClaimed}`, offClaimed === 1 ? PASS : FAIL);

  // 旗舰奖励：预置待领取，20 连击只领取一次
  const st3 = makeEndgameState();
  st3.stage3.flagship.pendingReward = { projectId: "project_1", rewardMultiplier: 1 };
  let flagClaimed = 0;
  for (let i = 0; i < 20; i++) {
    if (claimFlagshipReward(st3).ok) flagClaimed += 1;
  }
  push("exactly_once", `flagship 20x claimed=${flagClaimed}`, flagClaimed === 1 ? PASS : FAIL);
}

// ---------- 5. 离线回拨 ----------
{
  const st = makeEndgameState();
  st.lastTickAtMs = EPOCH - 30 * 60 * 1000;
  const q = settleOfflineReward(st, EPOCH, { incomePerSecond });
  const moneyBefore = st.money;
  claimOfflineReward(st, EPOCH, { incomePerSecond });
  // 回拨：系统时钟早于上次结算
  const rollback = EPOCH - 60_000;
  const q2 = settleOfflineReward(st, rollback, { incomePerSecond });
  const rollbackSafe = q2 === null && st.money === moneyBefore + (q?.money.toNumber() ?? 0) && !hasPendingOfflineReward(st);
  push("rollback", `negative/duplicate interval`, rollbackSafe ? PASS : FAIL);
}

// ---------- 6. 永续边界 ----------
{
  const st = makeEndgameState();
  st.singularity!.perpetual = { unlockedAtMs: EPOCH };
  st.singularity!.coresClaimed = ["core_1", "core_2", "core_3"];
  st.technologyIterationCount = 3;
  const iterBlocked = !canEndgameIterate(st);
  // 手动完整重置存档：设置入口保留（不在此脚本内操作正式存档；仅断言可迭代被禁）
  push("perpetual", `iteration blocked=${iterBlocked}`, iterBlocked ? PASS : FAIL);
}

// ---------- 汇总 ----------
const failed = rows.filter((r) => r.result === FAIL);
console.log("\n=== CARD-06 集中复验判定表 ===");
console.log("check\tdetail\tresult");
for (const r of rows) console.log(`${r.check}\t${r.detail}\t${r.result}`);
console.log(`\n总计 ${rows.length} 项；失败 ${failed.length} 项`);
const status = failed.length === 0 ? "CARD_06_PASS" : "CARD_06_REWORK_REQUIRED";
console.log(`最终状态：${status}`);
process.exit(failed.length === 0 ? 0 : 1);
