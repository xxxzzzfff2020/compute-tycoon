import { defineConfig } from "vite";

/**
 * TapTap真容器专用候选：正式入口、隔离本地命名空间、隔离云槽，
 * 显式打开云档与榜单适配。不得作为公开Production包上传。
 */
export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.VITE_PLATFORM_REVIEW": JSON.stringify("1"),
  },
  build: {
    target: "es2022",
    outDir: "dist-platform-review",
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    host: true,
  },
});
