/**
 * CARD-00 旧档迁移候选模拟（仅模拟，不决定正式降级；隔离样本用新命名空间+新档）
 *
 * 场景：
 *  M1: v3 正式档 0 次迭代 → 新体系 R1 起点（保留进度/收藏，按 R1 规则映射）
 *  M2: 已有永久 ×2 档（旧体系一次迭代即 ×2）→ 候选①保留 ×2 继续（不等价 3 核心体系）
 *  M3: 已有永久 ×2 档 → 候选②折算为核心等价（×1.5 + 核心进度 1/3）
 *  M4: 异常倍率档（如 ×1.99999 或手工修改）→ 保留原值 + 打标日志字段
 *
 * 输出：候选在模拟器链路上的节奏差异（R1 起点收入/迭代后倍率），供集中真人裁决，
 * 本轮不实施任何正式迁移。
 */
import Decimal from "decimal.js";
import { freshSaveData } from "../src/save/storage";
import { acquireFirstModel, incomePerSecond, enableAutomation, acceptOrder } from "../src/economy/engine";
import { simulateEndgameRun } from "./simulate-endgame";

const HOUR = 3600;

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

/** 旧档迁移后的 R1 起点收入（迁移候选比较） */
function migrationStartIncome(candidate: string): number {
  const st = freshSaveData(0);
  acquireFirstModel(st, "codex");
  enableAutomation(st);
  st.serverCount = 8;
  st.stage2 = { settlementShown: true, completedAtMs: 0, stageIncome: 0 };
  st.rentalCompute = { active: false, units: 0, unitCostPerSec: 0 };
  st.serverPower = 100;
  st.modelProgress = { modelId: "codex", level: 5, trainingCount: 1 };
  st.automation = true;
  if (candidate === "M1_fresh_r1") {
    // 新档 R1：iteration 0、permanent ×1.0
    st.technologyIterationCount = 0;
    st.permanentMultiplier = 1;
  } else if (candidate === "M2_keep_x2") {
    // 旧永久 ×2 保留：iteration 1、permanent ×2.0
    st.technologyIterationCount = 1;
    st.permanentMultiplier = 2;
  } else if (candidate === "M3_x2_as_core_progress") {
    // 旧 ×2 → 核心等价：×1.5 + 核心进度 1/3（假设后续仍可拿核心2/3）
    st.technologyIterationCount = 1;
    st.permanentMultiplier = 1.5;
  } else if (candidate === "M4_abnormal_x1_99999") {
    // 异常倍率：保留原值 + 打标（日志字段在正式迁移卡设计）
    st.technologyIterationCount = 0;
    st.permanentMultiplier = 1.99999;
  }
  const now = 0;
  return incomePerSecond(st, now).toNumber();
}

console.log("=== CARD-00 旧档迁移候选（仅模拟，不实施）===");
const candidates = ["M1_fresh_r1", "M2_keep_x2", "M3_x2_as_core_progress", "M4_abnormal_x1_99999"];
for (const c of candidates) {
  const ips = migrationStartIncome(c);
  console.log(`${c}: R1起点收入=${ips.toFixed(0)}/s`);
}
console.log("\n倍率差异（相对新档 R1 ×1.0）:");
const base = migrationStartIncome("M1_fresh_r1");
for (const c of candidates) {
  const ips = migrationStartIncome(c);
  console.log(`  ${c}: ${(ips / base).toFixed(3)}×`);
}
console.log("\n结论：M2 保留 ×2 不削弱既有奖励（不归一为 ×1.5）；M3 折算方案需集中真人裁决；M4 保留原值+打标。本轮不实施正式迁移，隔离样本使用新命名空间和新档。");
