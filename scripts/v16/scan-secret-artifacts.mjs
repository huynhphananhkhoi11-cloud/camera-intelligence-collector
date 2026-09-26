#!/usr/bin/env node
import path from 'node:path';
import { findSecretOccurrences } from '../../tests/v16/acceptance/dev7GuardLib.mjs';

const root = path.resolve(process.argv[2] ?? '.');
let needles;
try { needles = JSON.parse(process.env.DEV7_SECRET_NEEDLES ?? '[]'); }
catch { throw new Error('DEV7_SECRET_NEEDLES must be a JSON array.'); }
const hits = await findSecretOccurrences(root, needles, { scanXlsx: true });
if (hits.length) {
  for (const hit of hits) console.error(`SECRET_LEAK\t${hit.file}\t${hit.location ?? hit.offset}\t${hit.needle}`);
  process.exit(1);
}
console.log('DEV7_SECRET_SCAN_PASS occurrences=0');
