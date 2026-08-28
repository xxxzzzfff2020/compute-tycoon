import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

/** 正式构建：自然 1× 流程，关闭验收档、终局快捷入口和菜单调速。 */
export default defineConfig({
  base: "./",
  plugins: [{
    name: "strip-release-only-public-tools",
    async closeBundle() {
      await Promise.all([
        rm(resolve("dist-release", "bgm-review.html"), { force: true }),
        rm(resolve("dist-release", ".DS_Store"), { force: true }),
      ]);
    },
  }],
  define: {
    "import.meta.env.VITE_PLATFORM_REVIEW": JSON.stringify("0"),
    "import.meta.env.VITE_OWNER_NATURAL_REVIEW": JSON.stringify("0"),
    "import.meta.env.VITE_CANDIDATE_E_DEBUG": JSON.stringify("0"),
    "import.meta.env.VITE_RELEASE_PACKAGE": JSON.stringify("1"),
  },
  build: {
    target: "es2022",
    outDir: "dist-release",
    emptyOutDir: true,
  },
});
