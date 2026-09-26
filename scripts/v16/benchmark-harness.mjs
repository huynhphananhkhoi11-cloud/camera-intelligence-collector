#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { compareBenchmarkPair, renderBenchmarkTable, validateBenchmarkMetrics } from '../../tests/v16/acceptance/dev7GuardLib.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const v15Path = arg('--v15');
const v16Path = arg('--v16');
const outPath = arg('--out');
if (!v15Path || !v16Path || !outPath) {
  console.error('Usage: node scripts/v16/benchmark-harness.mjs --v15 <v15-metrics.json> --v16 <v16-metrics.json> --out <report.md>');
  process.exit(2);
}
const readArray = async file => {
  const parsed = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  const array = Array.isArray(parsed) ? parsed : [parsed];
  return array.map(validateBenchmarkMetrics);
};
const v15 = await readArray(v15Path);
const v16 = await readArray(v16Path);
const bySite = new Map(v16.map(item => [item.site, item]));
const comparisons = v15.map(oldRun => {
  const next = bySite.get(oldRun.site);
  if (!next) throw new Error(`MISSING_V16_BENCHMARK_SITE:${oldRun.site}`);
  return compareBenchmarkPair(oldRun, next);
});
const hardViolations = comparisons.flatMap(c => [
  ...(c.v16IrrelevantUrlCandidates === 0 ? [] : [`${c.site}: V16 irrelevantUrlCandidates=${c.v16IrrelevantUrlCandidates}, expected 0 queued irrelevant candidates.`]),
  ...(c.v16DirectGeminiCalls === 0 ? [] : [`${c.site}: V16 geminiCallsForDirectProducts=${c.v16DirectGeminiCalls}, expected 0.`])
]);
const markdown = [
  '# V15 vs V16 Code-First Benchmark',
  '',
  '> Runtime is measured, not pre-promised. “Materially narrower” is reported through candidate/page/screenshot/Gemini deltas; no invented fixed speed threshold is imposed.',
  '',
  renderBenchmarkTable(comparisons),
  '## Hard acceptance violations',
  '',
  ...(hardViolations.length ? hardViolations.map(x => `- ${x}`) : ['- None']),
  ''
].join('\n');
await fs.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
await fs.writeFile(path.resolve(outPath), markdown);
console.log(`DEV7_BENCHMARK_REPORT_WRITTEN ${path.resolve(outPath)}`);
if (hardViolations.length) process.exit(1);
