import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  EXPECTED_CAMERA13_FIELDS,
  EXPECTED_CAMERA13_HEADERS,
  scanArchitectureSource,
  assertFrozenManifestShape,
  findSecretOccurrences,
  validateBenchmarkMetrics,
  compareBenchmarkPair,
} from './dev7GuardLib.mjs';
import { DEV7_FIXTURES } from './dev7Fixtures.mjs';

const cleanV16Source = `
export function discoverFromProvenCards(cards) {
  return cards.filter(card => card.scope === 'CAMERA').map(card => card.href);
}
`;

test('unit/fixture matrix covers DEV1 through DEV6 contract cases', () => {
  assert.deepEqual(Object.keys(DEV7_FIXTURES).filter(key => /^DEV[1-6]$/u.test(key)), ['DEV1','DEV2','DEV3','DEV4','DEV5','DEV6']);
  assert.equal(DEV7_FIXTURES.DEV1.rawSource.kind, 'RAW_HTML');
  assert.equal(DEV7_FIXTURES.DEV1.renderedDom.productCards.length, 2);
  assert.equal(DEV7_FIXTURES.DEV1.jsonLd['@type'], 'Product');
  assert.equal(DEV7_FIXTURES.DEV1.embeddedState.products.length, 1);
  assert.equal(DEV7_FIXTURES.DEV2.network.reloadCount, 1);
  assert.equal(DEV7_FIXTURES.DEV2.expected.dedupedResponses, 1);
  assert.equal(DEV7_FIXTURES.DEV2.expected.secretsPersisted, 0);
  assert.equal(DEV7_FIXTURES.DEV2.expected.oversizedBodiesAccepted, 0);
  assert.deepEqual(DEV7_FIXTURES.DEV3.positiveScope.expectedApproved, ['Máy ảnh']);
  assert.equal(DEV7_FIXTURES.DEV3.ambiguous.expected, 'NEEDS_LEGACY_SCOPE_FALLBACK');
  assert.deepEqual(DEV7_FIXTURES.DEV3.productCardOnly.expectedQueue, ['/camera-a','/camera-b']);
  assert.equal(DEV7_FIXTURES.DEV3.canonicalDedupe.expectedUnique, 1);
  assert.equal(DEV7_FIXTURES.DEV3.pagination.maxPages, 3);
  assert.equal(DEV7_FIXTURES.DEV3.pagination.stopOnNoNewProducts, true);
  assert.deepEqual(DEV7_FIXTURES.DEV4.expectedFields, EXPECTED_CAMERA13_FIELDS);
  assert.equal(DEV7_FIXTURES.DEV4.precedence[0], 'EXPLICIT_PRODUCT_JSON_OR_JSONLD');
  assert.equal(DEV7_FIXTURES.DEV4.optionalNulls.rentalPricePerDay, null);
  assert.equal(DEV7_FIXTURES.DEV4.noInvention, true);
  assert.equal(DEV7_FIXTURES.DEV5.fallback.expected, 'LEGACY_FALLBACK');
  assert.equal(DEV7_FIXTURES.DEV5.keyLoop.sequence.join('>'), 'A_EXHAUSTED>B_INVALID>C_VALID');
  assert.equal(DEV7_FIXTURES.DEV5.invalidKey.expectedAction, 'ASK_Y_N_AGAIN');
  assert.equal(DEV7_FIXTURES.DEV5.rpd.expectedAction, 'CHECKPOINT_THEN_PROMPT');
  assert.equal(DEV7_FIXTURES.DEV5.rpm.expectedAction, 'BOUNDED_BACKOFF_THEN_PROMPT_IF_STILL_UNAVAILABLE');
  assert.equal(DEV7_FIXTURES.DEV5.userN.expected, 'USER_DECLINED_NEW_KEY');
  assert.deepEqual(DEV7_FIXTURES.DEV6.checkpoint.completedProductIds, ['A','B']);
  assert.equal(DEV7_FIXTURES.DEV6.partialExport.status, 'PARTIAL_QUOTA_STOP');
  assert.equal(DEV7_FIXTURES.DEV6.ctrlC.checkpointUsable, true);
  assert.deepEqual(DEV7_FIXTURES.DEV6.resume.skips, ['A','B']);
  assert.equal(DEV7_FIXTURES.DEV6.resume.duplicateRows, 0);
});

test('exact logical 13-field order is frozen', () => {
  assert.deepEqual(EXPECTED_CAMERA13_FIELDS, [
    'website','productName','condition','specs','rentalPricePerDay','rentalTerms',
    'accessoriesIncluded','bundleIncluded','rating','reviewCount','stock','salePrice','url'
  ]);
  assert.equal(EXPECTED_CAMERA13_HEADERS.length, 13);
});

test('architecture guard allows structural code-first source', () => {
  assert.deepEqual(scanArchitectureSource('src/v16/discovery.ts', cleanV16Source), []);
});

test('architecture guard rejects whole-document a[href] crawling', () => {
  const violations = scanArchitectureSource('src/v16/discovery.ts', `
    const links = document.querySelectorAll("a[href]");
    return [...links].map(a => a.href);
  `);
  assert.ok(violations.some(v => v.code === 'WHOLE_DOCUMENT_LINK_CRAWL'));
});

test('architecture guard rejects retailer hostname branch', () => {
  const violations = scanArchitectureSource('src/v16/discovery.ts', `
    if (hostname === "vjshop.vn") return specialCase();
  `);
  assert.ok(violations.some(v => v.code === 'RETAILER_HOST_BRANCH'));
});

test('architecture guard rejects retailer-specific path blocklist core logic', () => {
  const violations = scanArchitectureSource('src/v16/discovery.ts', `
    const excludedPaths = ["/tin-tuc/", "/blog/"];
  `);
  assert.ok(violations.some(v => v.code === 'RETAILER_PATH_BLOCKLIST'));
});

test('architecture guard rejects run-state polling observer', () => {
  const violations = scanArchitectureSource('src/v16/observer.ts', `
    setInterval(() => readFile("run-state.json"), 1000);
  `);
  assert.ok(violations.some(v => v.code === 'RUN_STATE_POLLING'));
});

test('architecture guard flags likely secret persistence source', () => {
  const violations = scanArchitectureSource('src/v16/state.ts', `
    await writeFile(reportPath, JSON.stringify({ apiKey, authorization, cookie }));
  `);
  assert.ok(violations.some(v => v.code === 'SECRET_PERSISTENCE_SOURCE'));
});

test('frozen V15 manifest contains prompt/model/schema/validator guards', () => {
  const manifest = DEV7_FIXTURES.frozenV15Manifest;
  assertFrozenManifestShape(manifest);
  const paths = new Set(manifest.files.map(x => x.path));
  for (const required of [
    'src/v03/ai/gemini36VisualExtractor.ts',
    'src/v03/ai/geminiVisionProvider.ts',
    'src/v03/ai/geminiSemanticProvider.ts',
    'src/v03/ai/ollamaSemanticProvider.ts',
    'src/v03/ai/visualExtractionSchema.ts',
    'src/v03/ai/semanticContracts.ts',
    'src/v03/contracts/camera13.ts',
    'src/v03/validation/visualExtractionValidator.ts',
  ]) assert.ok(paths.has(required), required);
});

test('distinctive dummy secrets are detected in logs/run-state/json/report and clean artifacts are zero', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dev7-secrets-'));
  const needles = ['DEV7_DUMMY_GEMINI_KEY_A_9f4c7d2e', 'DEV7_DUMMY_AUTH_BEARER_51cc88'];
  await fs.writeFile(path.join(root, 'run.log'), `ok ${needles[0]} bad`);
  await fs.writeFile(path.join(root, 'run-state.json'), JSON.stringify({ token: needles[1] }));
  await fs.writeFile(path.join(root, 'report.json'), JSON.stringify({ status: 'TEST' }));
  const hits = await findSecretOccurrences(root, needles, { scanXlsx: false });
  assert.equal(hits.length, 2);
  await fs.writeFile(path.join(root, 'run.log'), 'redacted');
  await fs.writeFile(path.join(root, 'run-state.json'), JSON.stringify({ token: '[REDACTED]' }));
  const clean = await findSecretOccurrences(root, needles, { scanXlsx: false });
  assert.equal(clean.length, 0);
});

test('benchmark contract rejects Gemini calls for products completed DIRECT', () => {
  const metrics = { ...DEV7_FIXTURES.benchmark.v16DirectSuccess, geminiCallsForDirectProducts: 1 };
  assert.throws(() => validateBenchmarkMetrics(metrics), /DIRECT_COMPLETED_PRODUCT_CALLED_GEMINI/);
});

test('benchmark contract accepts direct-success with zero Gemini and zero irrelevant candidates', () => {
  assert.doesNotThrow(() => validateBenchmarkMetrics(DEV7_FIXTURES.benchmark.v16DirectSuccess));
});

test('benchmark comparison measures runtime and narrowness without fixed runtime promise', () => {
  const comparison = compareBenchmarkPair(
    DEV7_FIXTURES.benchmark.v15Reference,
    DEV7_FIXTURES.benchmark.v16DirectSuccess,
  );
  assert.equal(comparison.site, 'FixtureShop');
  assert.equal(typeof comparison.wallClockDeltaMs, 'number');
  assert.equal(typeof comparison.totalUrlCandidateDelta, 'number');
  assert.equal(comparison.v16IrrelevantUrlCandidates, 0);
});
