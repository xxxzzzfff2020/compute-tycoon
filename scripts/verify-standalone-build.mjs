import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const outDir = resolve(process.argv[2] ?? "dist");
const html = await readFile(resolve(outDir, "index.html"), "utf8");
assert(html.includes('content="20260828-standalone-h5-v1"'), "single-player version marker missing");
const entry = html.match(/<script[^>]+src="([^\"]+\.js)"/);
assert(entry, "production entry module missing");
const bundle = await readFile(resolve(outDir, entry[1]), "utf8");
for (const forbidden of [
  "createRewardedVideoAd",
  "getCloudSaveManager",
  "getLeaderboardManager",
  "createAchievementManager",
  "getFileSystemManager",
  "submitScores",
  "bootstrapPlatformAccount",
  "archiveUUID",
  "USER_DATA_PATH",
  "__CT_REVIEW_RUNTIME_OVERRIDE__",
  "candidate-e-debug-panel",
  'data-command="cloud_upload"',
  'data-command="cloud_restore"',
  "archive_tab:hall",
]) {
  assert(!bundle.includes(forbidden), `production bundle contains disabled capability: ${forbidden}`);
}
assert(bundle.includes("standalone.adsDisabled"), "disabled-ad presentation missing");
assert(bundle.includes("standalone.status"), "local-save presentation missing");
await Promise.all(["official-site/index.html", "official-site/styles.css", "official-site/site.js"].map((file) => access(resolve(outDir, file))));
console.log("Single-player build verified: version, no platform SDK/debug entry, official site intact.");
