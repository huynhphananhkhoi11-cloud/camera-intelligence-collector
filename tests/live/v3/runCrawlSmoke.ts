import { resolve } from "node:path";

import { validateCrawlWorkbook } from "./crawlSmokeValidator.js";

const site = process.argv[2];
const workbook = process.argv[3];
const cap = Number(process.argv[4] ?? "15");

if (!site || !workbook || !Number.isInteger(cap) || cap < 1) {
  throw new Error(
    "Usage: npx tsx tests/live/v3/runCrawlSmoke.ts <site> <workbook.xlsx> [cap]"
  );
}

const result = await validateCrawlWorkbook(
  site,
  resolve(process.cwd(), workbook),
  cap
);

process.stdout.write(JSON.stringify(result, null, 2) + "\n");

if (result.status !== "PASS") {
  process.exitCode = 1;
}
