import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT = 4 * 1024;
const size = gzipSync(readFileSync(new URL("../dist/index.js", import.meta.url))).length;

console.log(`dist/index.js: ${size} B gzipped (limit ${LIMIT} B)`);
if (size > LIMIT) {
  console.error("Bundle is over the size limit.");
  process.exit(1);
}
