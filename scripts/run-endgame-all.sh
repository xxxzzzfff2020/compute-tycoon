#!/bin/bash
# FINAL-RC 全量模拟：8 策略 × 1000 局（倍率 A、离线 A），并行执行
cd "$(dirname "$0")/.."
STRATS="standard reasonable_training server_first model_first income_first offline_mixed idle_offline click_bulk"
for s in $STRATS; do
  RUNS=1000 STRATEGY_FILTER=$s npm run simulate:endgame > "scripts/results_final_rc_${s}.log" 2>&1 &
done
wait
echo "ALL_DONE"
