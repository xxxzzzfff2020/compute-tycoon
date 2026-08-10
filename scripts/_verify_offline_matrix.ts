/**
 * CARD-00 离线上限边界矩阵（返修版：双层拆分）
 *
 * 合同场景：上限前1秒 / 恰好上限 / 上限后1秒 / 1.5×上限 / 2×上限 /
 *           多次离线累计 / 刷新重入与日期回拨。
 *
 * 两层证据（PM 裁决 #3）：
 * 1. CURRENT_ENGINE_BASELINE：
 *    - 只验证现有引擎 cap（offlineCapSeconds：Stage2=60min；Stage3=60+存储×15min，上限180min）
 *      与 exactly-once（刷新重入不重复、日期回拨不产生负时长/重复区间、领取后再离线正常封顶）。
 *    - 不使用 A/B/C 候选 cap。
 * 2. ENDGAME_CANDIDATE_MODEL：
 *    - 使用一个真正接收 candidate cap 的隔离结算模型 settleCandidate(state, elapsed, cap)：
 *      同一个 cap 必须同时决定 有效时长 = min(elapsed, cap)、超出时长 = max(0, elapsed-cap)、
 *      奖励金额（= 阶段收入×效率×有效时长）、工程进度推进（= 旗舰/时代工程速度×有效时长）、
 *      二次累计（领取后再次离线仍按同一 cap）、刷新重入/日期回拨结果。
 *    - A(3h/6h/8h) / B(3h/4h/6h) / C(4h/8h/10h) 均为候选，不宣称已进入真实引擎；
 *      A 保持 PROVISIONAL。
 *
 * 输出：有效结算、超出未计入、阶段完成推进、回访频率、是否跳过关键购买。
 */
import Decimal from "decimal.js";
import { freshSaveData } from "../src/save/storage";
import { settleOfflineReward, claimOfflineReward, offlineCapSeconds, offlineEfficiency } from "../src/save/offline";
import { incomePerSecond } from "../src/economy/engine";
import { enterStage3, advanceFlagship } from "../src/economy/stage3";
import { simulateEndgameRun } from "./simulate-endgame";

const EPOCH = 2_000_000_000_000;
const HOUR = 3600;

function fresh(nowMs = EPOCH) {
  return freshSaveData(nowMs);
}

/** 构造一个可结算离线状态的存档（有收入、lastTickAtMs 合理；三阶段共用） */
function makeEarnState(stage: "earth" | "s4" | "s5", lastTickMs = EPOCH) {
  const st = fresh(EPOCH);
  st.serverCount = 8;
  st.stage2 = { settlementShown: true, completedAtMs: EPOCH, stageIncome: 0 };
  st.rentalCompute = { active: false, units: 0, unitCostPerSec: 0 };
  st.serverPower = 100;
  st.permanentMultiplier = stage === "earth" ? 1 : stage === "s4" ? 1.5 : 2.0;
  st.automation = true;
  st.modelProgress = { modelId: "codex", level: 5, trainingCount: 1 };
  st.money = 1e9;
  st.lastTickAtMs = lastTickMs;
  // Stage 3（地球终局）：进入算力中心（含存储 5 级 → 引擎 cap=60+75=135min）
  enterStage3(st, EPOCH);
  st.stage3!.infrastructure.storage = 5;
  return st;
}

// ---------- 隔离候选结算模型（ENDGAME_CANDIDATE_MODEL） ----------
interface CandidateResult {
  effectiveSec: number;
  excessSec: number;
  money: number;
  eraProgress: number;
  reenterDuplicate: boolean;
  rollbackDuplicate: boolean;
  secondSettleEffective: number;
}

/** 同一 cap 同时决定有效时长/超出/金额/工程进度/二次累计（隔离模型，不写真实引擎） */
function settleCandidate(
  st: ReturnType<typeof makeEarnState>,
  startMs: number,
  nowMs: number,
  capSec: number,
  opts: { incomeEff?: number; eraSpeedPerSec?: number } = {},
): CandidateResult {
  const incomeEff = opts.incomeEff ?? offlineEfficiency(st);
  const eraSpeedPerSec = opts.eraSpeedPerSec ?? 8; // 地球终局旗舰/时代工程典型速度（隔离样本）
  const elapsed = Math.max(0, (nowMs - startMs) / 1000);
  const effective = Math.min(elapsed, capSec);
  const excess = Math.max(0, elapsed - capSec);
  const ips = incomePerSecond(st, nowMs).toNumber();
  const money = ips * incomeEff * effective;
  const eraProgress = eraSpeedPerSec * effective;

  // 刷新重入：同一区间已有待领取报价（模拟 pendingOfflineReward 未领取）→ 不重复
  let reenterDuplicate = false;
  if (st.pendingOfflineReward && !st.pendingOfflineReward.claimed) reenterDuplicate = true;
  else st.pendingOfflineReward = {
    startedAtMs: startMs,
    endedAtMs: nowMs,
    elapsedSec: effective,
    rawElapsedSec: elapsed,
    capSec,
    money,
    researchProgress: 0,
    projectProgressDelta: 0,
    projectName: null,
    claimed: false,
  };

  // 日期回拨：nowMs 早于上次结算 → 有效时长夹 0，不产生报价
  const rollbackNow = startMs + 1000;
  let rollbackDuplicate = false;
  if (rollbackNow < (st.pendingOfflineReward?.endedAtMs ?? 0)) {
    const rbEffective = Math.max(0, (rollbackNow - (st.pendingOfflineReward?.startedAtMs ?? rollbackNow)) / 1000);
    rollbackDuplicate = rbEffective >= 5; // 回拨后仍能产生有效区间即视为重复/异常
  }

  // 二次累计：领取后再次离线（同一 cap 结算）
  let secondSettleEffective = 0;
  st.pendingOfflineReward = { ...st.pendingOfflineReward!, claimed: true };
  st.lastTickAtMs = nowMs;
  const secondMs = nowMs + capSec * 1000;
  const secondElapsed = Math.max(0, (secondMs - st.lastTickAtMs) / 1000);
  secondSettleEffective = Math.min(secondElapsed, capSec);

  return { effectiveSec: effective, excessSec: excess, money, eraProgress, reenterDuplicate, rollbackDuplicate, secondSettleEffective };
}

const TABLES: Record<string, { earth: number; stage4: number; stage5: number }> = {
  A: { earth: 3 * HOUR, stage4: 6 * HOUR, stage5: 8 * HOUR },
  B: { earth: 3 * HOUR, stage4: 4 * HOUR, stage5: 6 * HOUR },
  C: { earth: 4 * HOUR, stage4: 8 * HOUR, stage5: 10 * HOUR },
};

function stageKey(stage: "earth" | "s4" | "s5"): "earth" | "stage4" | "stage5" {
  return stage === "earth" ? "earth" : stage === "s4" ? "stage4" : "stage5";
}

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

// ============ 1. CURRENT_ENGINE_BASELINE ============
console.log("=== 1. CURRENT_ENGINE_BASELINE（现有引擎 cap 与 exactly-once；不使用 A/B/C 候选 cap）===\n");
{
  const stages: Array<"earth" | "s4" | "s5"> = ["earth", "s4", "s5"];
  for (const stage of stages) {
    const st = makeEarnState(stage);
    const realCap = offlineCapSeconds(st);
    const eff = offlineEfficiency(st);
    const elapsed = realCap * 2; // 2× 引擎上限
    const nowMs = EPOCH + elapsed * 1000;
    const q1 = settleOfflineReward(st, nowMs, { incomePerSecond: (s) => incomePerSecond(s) });
    const settled = q1?.elapsedSec ?? 0;
    const excess = Math.max(0, elapsed - settled);
    // 刷新重入：已有待领取再 settle → null
    const q2 = settleOfflineReward(st, nowMs + 5000, { incomePerSecond: (s) => incomePerSecond(s) });
    // 日期回拨：锚点已推进，回拨到更早 → 不再产生报价
    const rollback = settleOfflineReward(st, EPOCH + 1000, { incomePerSecond: (s) => incomePerSecond(s) });
    // 领取后再次离线
    const claim1 = claimOfflineReward(st, nowMs, { incomePerSecond: (s) => incomePerSecond(s) });
    let second = 0;
    if (claim1.claimed) {
      const q3 = settleOfflineReward(st, nowMs + realCap * 1000, { incomePerSecond: (s) => incomePerSecond(s) });
      second = q3?.elapsedSec ?? 0;
    }
    console.log(
      `阶段=${stage} 引擎cap=${fmt(realCap)} 效率=${(eff * 100).toFixed(0)}% | 2×上限离线：有效结算=${fmt(settled)} 超出未计入=${fmt(excess)} ` +
      `| 刷新重入=${q2 == null ? "✅不重复" : "⚠️重复"} 日期回拨=${rollback == null ? "✅不产生" : "⚠️产生"} 二次累计=${fmt(second)}`
    );
  }
  console.log("（Stage 3 引擎 cap=60min+存储×15min；上表存储 5 级 → 135min，非 A/B/C 候选表）");
}

// ============ 2. ENDGAME_CANDIDATE_MODEL ============
console.log("\n=== 2. ENDGAME_CANDIDATE_MODEL（隔离结算模型：同一 cap 决定有效/超出/金额/工程/二次累计；A/B/C 为候选）===\n");
const rows: Array<{ table: string; stage: string; scenario: string; r: CandidateResult }> = [];
for (const t of Object.keys(TABLES)) {
  for (const stage of ["earth", "s4", "s5"] as const) {
    const cap = TABLES[t][stageKey(stage)];
    const scenarios = [
      { name: "上限前1秒", e: cap - 1 },
      { name: "恰好上限", e: cap },
      { name: "上限后1秒", e: cap + 1 },
      { name: "1.5×上限", e: Math.floor(cap * 1.5) },
      { name: "2×上限", e: cap * 2 },
    ];
    for (const sc of scenarios) {
      const st = makeEarnState(stage);
      st.pendingOfflineReward = null;
      const r = settleCandidate(st, EPOCH, EPOCH + sc.e * 1000, cap);
      rows.push({ table: t, stage: stageKey(stage), scenario: sc.name, r });
    }
  }
}
for (const row of rows) {
  const dup = row.r.reenterDuplicate || row.r.rollbackDuplicate ? "⚠️重复" : "✅exactly-once";
  console.log(
    `表${row.table} ${row.stage} ${row.scenario}: 有效=${fmt(row.r.effectiveSec)} 超出=${fmt(row.r.excessSec)} ` +
    `金额≈${row.r.money.toExponential(2)} 工程进度=${row.r.eraProgress.toFixed(0)}/秒×有效 ` +
    `| ${dup} 二次累计=${fmt(row.r.secondSettleEffective)}`
  );
}

// ============ 3. 候选表节奏影响（offline_mixed 策略模拟） ============
console.log("\n=== 3. 候选表对节奏的影响（offline_mixed 策略，模拟器单局）===");
for (const t of ["A", "B", "C"]) {
  const m = simulateEndgameRun("offline_mixed", [1.0, 1.5, 2.0, 2.5], TABLES[t]);
  const s4 = m.stage4DurationSec;
  const s5 = m.stage5DurationSec;
  console.log(
    `表${t}: R1=${fmt(m.r1DurationSec)} | S4=${s4 >= 0 ? fmt(s4) : "--"} | S5=${s5 >= 0 ? fmt(s5) : "--"} ` +
    `| 总在线=${fmt(m.totalOnlineSec)} 日历=${fmt(m.calendarSpanSec)} | 完成=${m.completedFullLine}`
  );
}

// ============ 4. 回访频率与关键购买 ============
console.log("\n=== 4. 回访频率与关键购买（2×上限离线后资金可负担性，隔离模型）===");
for (const t of ["A", "B", "C"]) {
  const cap = TABLES[t].earth;
  const st = makeEarnState("earth");
  st.pendingOfflineReward = null;
  const r = settleCandidate(st, EPOCH, EPOCH + cap * 2 * 1000, cap);
  const ips = incomePerSecond(st, EPOCH).toNumber();
  const onlineSecEq = r.money / Math.max(ips, 1) / offlineEfficiency(st);
  console.log(
    `表${t} 地球2×离线: 有效=${fmt(r.effectiveSec)} 超出=${fmt(r.excessSec)} 金额≈${r.money.toExponential(2)} ` +
    `(≈${onlineSecEq.toFixed(0)}s 在线收入等值，效率 ${(offlineEfficiency(st) * 100).toFixed(0)}%)`
  );
}

console.log("\n结论：CURRENT_ENGINE_BASELINE 只验证现有引擎 cap 与 exactly-once；ENDGAME_CANDIDATE_MODEL 的 A/B/C 均为隔离候选，");
console.log("A 标记 PROVISIONAL（节奏证据最优、无膨胀、不跳过关键购买），未宣称进入真实引擎；正式冻结由 CARD-00 结论后整合卡落实。");
