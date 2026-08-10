// CARD-00 检查点核对：读取 results 日志并逐项输出合同判定 + 硬停止条件。
import fs from "fs";
import path from "path";
const dir = "scripts";
const files = fs.readdirSync(dir).filter((f) => /^results_card00_/.test(f) && f.endsWith(".log"));
if (files.length === 0) { console.log("无结果文件"); process.exit(1); }
for (const f of files) {
  const txt = fs.readFileSync(path.join(dir, f), "utf8");
  const lines = txt.split("\n");
  console.log(`\n===== ${f} =====`);
  console.log(lines.slice(0, 1).join(""));
  const hasJudgment = lines.some((l) => l.startsWith("  R1="));
  if (!hasJudgment) { console.log("  （判定节缺失——可能未完成或失败）"); continue; }
  const j = lines.filter((l) => l.startsWith("  R1="));
  console.log(j.join("\n"));
}
