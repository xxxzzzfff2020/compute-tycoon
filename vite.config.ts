import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

let releaseOutputDir = resolve("dist");

export default defineConfig({
  base: "./",
  plugins: [{
    name: "strip-release-only-public-tools",
    configResolved(config) {
      releaseOutputDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await Promise.all([
        rm(resolve(releaseOutputDir, "bgm-review.html"), { force: true }),
        rm(resolve(releaseOutputDir, ".DS_Store"), { force: true }),
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
    outDir: "dist",
  },
  server: {
    port: 5173,
    host: true,
  },
});
