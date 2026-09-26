#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  scanArchitectureTree,
  checkFrozenV15,
  checkCamera13HeaderSource,
} from '../../tests/v16/acceptance/dev7GuardLib.mjs';

const repoRoot = path.resolve(process.argv[2] ?? '.');
const manifestPath = path.join(repoRoot, 'tests', 'v16', 'acceptance', 'frozen-v15-manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const architecture = await scanArchitectureTree(repoRoot);
if (!architecture.integrationAvailable) {
  console.error('DEV7_INTEGRATION_NOT_AVAILABLE: src/v16 is absent; live architecture scan waits for DEV0 integration.');
  process.exit(2);
}
const violations = [...architecture.violations, ...checkFrozenV15(repoRoot, manifest)];
try { await checkCamera13HeaderSource(repoRoot); }
catch (error) { violations.push({ code: 'CAMERA13_ORDER_DRIFT', file: 'src/v03/contracts/camera13.ts', message: error instanceof Error ? error.message : String(error) }); }
if (violations.length) {
  for (const item of violations) console.error(`${item.code}\t${item.file}\t${item.message}`);
  process.exit(1);
}
console.log('DEV7_ARCHITECTURE_GUARDS_PASS');
