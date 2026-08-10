import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(process.argv[2] ?? "dist-review");
const sourceHtml = resolve(outputDirectory, "review.html");
const targetHtml = resolve(outputDirectory, "index.html");

await rm(targetHtml, { force: true });
await rename(sourceHtml, targetHtml);

const assetDirectory = resolve(outputDirectory, "assets");
const assetNames = await readdir(assetDirectory);
const javascript = (await Promise.all(
  assetNames
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFile(resolve(assetDirectory, name), "utf8")),
)).join("\n");

if (!javascript.includes("FOUNDER CONCENTRATED REVIEW")) {
  throw new Error("Review build entry marker missing");
}
if (!javascript.includes("compute_tycoon_h5_review_v2")) {
  throw new Error("Review storage namespace marker missing");
}

// 只存在于私密 Review 包：用同源 iframe 固定真实移动端视口宽度，供浏览器控制层
// 做 320/350/390/430px 响应式核验。Production build 不包含此入口。
const responsiveProbe = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>算力大亨 · 响应式探针</title>
<style>html,body{margin:0;min-height:100%;background:#050812}body{display:grid;place-items:start center;padding:12px;box-sizing:border-box}iframe{display:block;border:1px solid #263a63;border-radius:12px;background:#07101f;box-shadow:0 18px 48px rgba(0,0,0,.4)}</style></head>
<body><iframe id="responsive-probe" title="算力大亨移动端体验"></iframe>
<script>const p=new URLSearchParams(location.search);const allowed=[320,350,390,430];const width=allowed.includes(Number(p.get('width')))?Number(p.get('width')):390;const height=Math.max(568,Math.min(1000,Number(p.get('height'))||867));const frame=document.getElementById('responsive-probe');frame.width=String(width);frame.height=String(height);frame.src=p.get('src')||'/?checkpoint=endgame_perpetual&debug=1&speed=32';document.documentElement.dataset.probeWidth=String(width);</script></body></html>`;
await writeFile(resolve(outputDirectory, "responsive-probe.html"), responsiveProbe, "utf8");

console.log(`Review build finalized in ${outputDirectory}`);
