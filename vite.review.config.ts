import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

function resolveReviewCommit(): string {
  const explicitCommit = process.env.VITE_REVIEW_COMMIT?.trim();
  if (explicitCommit) return explicitCommit;

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}

export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.VITE_REVIEW_COMMIT": JSON.stringify(resolveReviewCommit()),
  },
  build: {
    target: "es2022",
    outDir: "dist-review",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./review.html", import.meta.url)),
    },
  },
  server: {
    port: 5174,
    host: true,
  },
});
