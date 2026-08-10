import { access, copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const source = fileURLToPath(new URL("../sites/worker-entry.js", import.meta.url));
const clientIndex = fileURLToPath(new URL("../dist/client/index.html", import.meta.url));
const serverDir = fileURLToPath(new URL("../dist/server/", import.meta.url));
const target = fileURLToPath(new URL("../dist/server/index.js", import.meta.url));

// Sites binds static files from dist/client. Fail before packaging if the Vite
// output is accidentally written to dist/ and would deploy as an empty site.
await access(clientIndex);
await mkdir(serverDir, { recursive: true });
await copyFile(source, target);
console.log(`Sites worker prepared from ${source.slice(projectRoot.length)} with dist/client assets`);
