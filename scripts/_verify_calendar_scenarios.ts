/**
 * CARD-00 现实日历跨度 4 场景（返修版：离散会话调度，真实离线区间结算）
 *
 * 合同冻结（PM 裁决 #4）：
 *  - 100–168h = 典型玩家现实日历跨度；
 *  - 实际主动操作累计约 3–6h；
 *  - 无强制现实时间锁；连续重度玩家可更早完成，但不应约7h通关；
 *  - 轻度玩家可超 7 日，但必须真实计算。
 *
 * 方法：不再用"总在线 ÷ 人工指定每日分钟数"。
 * 离散会话调度（每个会话都真实结算）：
 *   进入会话 → 在线推进指定时长 → 退出 → 产生真实离线区间 → 按当前阶段候选上限结算（有效/超出）
 *   → 回归继续经营，直到累计在线等效 ≥ 主线要求。
 * 离线结算资金/工程进度（有效=min(离线,阶段cap)，地球70%/宇宙75%），
 * 但每段最多推进到下一个手动门：不自动购节点、领奖、领核心、迭代或进阶段。
 *
 * 输出：实际会话数、在线时间、离线时间、有效离线结算、自然日跨度、最终里程碑。
 * 普通/活跃场景应落 3–7 日；轻度玩家可超 7 日（真实计算）。
 */
import { simulateEndgameRun } from "./simulate-endgame";

const HOUR = 3600;
const DAY = 24 * HOUR;
const H = HOUR;

/** A 表离线上限（首选候选；CARD-00 冻结前保持 PROVISIONAL） */
const OFFLINE_CAP = { earth: 3 * H, s4: 6 * H, s5: 8 * H };

interface SessionResult {
  scene: string;
  sessions: number;
  onlineSec: number;
  offlineSec: number;
  effectiveOfflineSec: number;
  excessOfflineSec: number;
  calendarDays: number;
  finalMilestone: string;
  exceededCapSessions: number;
}

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

/**
 * 离散会话调度：
 *  - 主线要求 = 模拟器 standard 完整在线等效（总在线）
 *  - 阶段里程碑（累计在线秒）：R1 完成=r1、R2 完成=r2、R3 完成=r3、S4 完成=s4、S5 完成=total
 *  - 每会话推进 sessionOnline 秒在线；会话间离线 offHrs，按当前阶段 cap 结算
 *  - 离线结算：有效=min(off, cap)，超出=off-有效；结算金额/进度按 70% 效率折算（报告用）
 *  - 主线完成判定：在线推进 + 有效离线推进达到 total；离线最多停在下一个手动门
 */
function schedule(scene: string, sessionOnlineMin: number, offlineHrs: number): SessionResult {
  const run = simulateEndgameRun("standard");
  const total = run.totalOnlineSec;
  // 阶段里程碑（累计在线秒）
  const r3End = run.r3EraProjectSec;
  const s4End = run.stage4EraProjectSec;
  const stageAt = (online: number): "earth" | "s4" | "s5" => {
    if (s4End > 0 && online >= s4End) return "s5";
    if (s4End > 0 && online >= r3End) return "s4";
    return "earth";
  };

  const sessionOnline = sessionOnlineMin * 60;
  const gates = [run.r1IterationSec, run.r2EraProjectSec, run.r3EraProjectSec, run.stage4EraProjectSec, total]
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  let progressSec = 0;
  let sessions = 0;
  let onlineSec = 0;
  let offlineSec = 0;
  let effectiveOffline = 0;
  let excessOffline = 0;
  let exceededCap = 0;
  let calendarSec = 0;

  while (progressSec < total - 1e-9) {
    sessions += 1;
    // 会话在线推进
    const chunk = Math.min(sessionOnline, total - progressSec);
    onlineSec += chunk;
    progressSec += chunk;
    calendarSec += chunk;
    if (progressSec >= total - 1e-9) break;
    // 退出 → 真实离线区间（按当前阶段 cap 结算）
    const offReal = offlineHrs * HOUR;
    const stage = stageAt(progressSec);
    const cap = OFFLINE_CAP[stage];
    const eff = Math.min(offReal, cap);
    const excess = offReal - eff;
    offlineSec += offReal;
    effectiveOffline += eff;
    excessOffline += excess;
    if (excess > 0) exceededCap += 1;
    calendarSec += offReal;
    const efficiency = stage === "earth" ? 0.70 : 0.75;
    const nextGate = gates.find((gate) => gate > progressSec + 1e-9) ?? total;
    progressSec += Math.min(eff * efficiency, Math.max(0, nextGate - progressSec));
  }

  return {
    scene,
    sessions,
    onlineSec,
    offlineSec,
    effectiveOfflineSec: effectiveOffline,
    excessOfflineSec: excessOffline,
    calendarDays: calendarSec / DAY,
    finalMilestone: run.completedFullLine ? "主线完成（Stage5 戴森球）" : "未完成",
    exceededCapSessions: exceededCap,
  };
}

const run = simulateEndgameRun("standard");
console.log("=== FINAL-RC 现实日历跨度（4 场景；离散会话调度 + 阶段离线推进）===\n");
console.log(`连续在线等效: ${fmt(run.totalOnlineSec)}（≈${(run.totalOnlineSec / 3600).toFixed(1)}h，必须显著高于7h：${run.totalOnlineSec >= 12 * H ? "✅" : "❌"}）`);
console.log(`阶段里程碑（累计在线）：R3 完成=${fmt(run.r3EraProjectSec)}、S4 完成=${fmt(run.stage4EraProjectSec)}、S5 完成=${fmt(run.stage5DysonSec)}\n`);

const results: SessionResult[] = [
  // 连续在线（压力）：单会话推完（无离线）
  schedule("连续在线（压力）", 24 * 60, 0),
  // 每日1次回归：每天约60min主动操作，会话间23h离线。
  schedule("每日1次回归", 60, 23),
  // 每日2次回归（活跃）：每天2次各30min，会话间11.5h离线。
  schedule("每日2次回归（活跃）", 30, 11.5),
  // 轻度玩家（隔日1次）：每2天约45min主动操作。
  schedule("轻度玩家（隔日1次）", 45, 47.25),
];

for (const r of results) {
  console.log(
    `${r.scene}: 会话数=${r.sessions} | 在线=${fmt(r.onlineSec)} | 离线=${fmt(r.offlineSec)} ` +
    `（有效结算=${fmt(r.effectiveOfflineSec)}、超出未计入=${fmt(r.excessOfflineSec)}、超限会话=${r.exceededCapSessions}） | 自然日跨度=${r.calendarDays.toFixed(1)} 天 | ${r.finalMilestone}`
  );
}

const normal = results.find((r) => r.scene === "每日1次回归")!;
const active = results.find((r) => r.scene === "每日2次回归（活跃）")!;
console.log(`\n标准挂机玩家落 100–168h（4–7天）: ${normal.calendarDays >= 100 / 24 && normal.calendarDays <= 7 ? "✅" : "⚠️（见上表）"}`);
console.log(`标准/活跃累计主动操作 3–6h: ${[normal, active].every((r) => r.onlineSec >= 3 * H && r.onlineSec <= 6 * H) ? "✅" : "⚠️（见上表）"}`);
console.log(`高活跃玩家允许早于4天，但不可约7小时通关: ${active.calendarDays < 100 / 24 && run.totalOnlineSec >= 12 * H ? "✅" : "⚠️"}`);
console.log("轻度玩家可超 7 日（现实行为，不视为失败）；连续在线 ≈1 天为压力上限，不用于证明 3–7 日通过。");
console.log("离线结算按 A 表上限（3h/6h/8h）截断；离线最多推进至下一手动门，不自动购节点、领奖、领核心、迭代或进阶段。");
