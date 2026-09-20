import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

import { buildCrawlInput } from "./crawlInputBuilder.js";

const site = process.argv[2];
const inputFile = process.argv[3];
const outputFile = process.argv[4];
const cap = Number(process.argv[5] ?? "15");

if (!site || !inputFile || !outputFile) {
  throw new Error(
    "Usage: npx tsx tests/live/v3/buildCrawlSmokeInput.ts <site> <input.txt> <output.txt> [cap]"
  );
}

const raw = await readFile(resolve(process.cwd(), inputFile), "utf8");
const result = buildCrawlInput(site, raw.split(/\r?\n/u), cap);

if (result.selected.length === 0) {
  throw new Error("No eligible URLs remained after host/dedup filtering.");
}

const target = resolve(process.cwd(), outputFile);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, result.selected.join("\n") + "\n", "utf8");

process.stdout.write(
  JSON.stringify(
    {
      site: result.site,
      selected: result.selected.length,
      rejected: result.rejected.length,
      output: target
    },
    null,
    2
  ) + "\n"
);
