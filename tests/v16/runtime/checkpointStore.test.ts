import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertCheckpointSafe,
  loadCheckpoint,
  saveCheckpointAtomic,
  type RunCheckpointV16
} from '../../../src/v16/runtime/checkpointStore.js';
import { buildDeterministicRunPaths } from '../../../src/v16/runtime/runPaths.js';

test('deterministic paths are stable for the same sanitized root URL', () => {
  const a = buildDeterministicRunPaths('/tmp/out', 'https://user:pass@shop.test/cameras?token=secret#x');
  const b = buildDeterministicRunPaths('/tmp/out', 'https://shop.test/cameras');
  assert.deepEqual(a, b);
  assert.match(a.workbookPath, /camera-products\.xlsx$/);
  assert.match(a.reportPath, /run-report\.json$/);
});

test('checkpoint write is loadable and rejects secret-bearing structures', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v16-checkpoint-'));
  try {
    const path = join(dir, 'checkpoint.json');
    const checkpoint: RunCheckpointV16 = {
      schemaVersion: 1,
      rootUrl: 'https://shop.test/',
      status: 'RUNNING',
      cameraScope: null,
      routes: [],
      collections: [],
      discoveryComplete: false,
      products: {},
      productOrder: [],
      updatedAt: '2026-09-26T00:00:00.000Z'
    };
    await saveCheckpointAtomic(path, checkpoint);
    assert.deepEqual(await loadCheckpoint(path), checkpoint);
    assert.doesNotThrow(() => assertCheckpointSafe(checkpoint));
    assert.throws(() => assertCheckpointSafe({ ...checkpoint, apiKey: 'secret' } as unknown as RunCheckpointV16), /secret-bearing/i);
    assert.throws(() => assertCheckpointSafe({ ...checkpoint, cameraScope: { endpoint: 'https://shop.test/api?token=abc123' } } as RunCheckpointV16), /secret-bearing/i);
    assert.doesNotMatch(await readFile(path, 'utf8'), /secret/i);
  }
  finally { await rm(dir, { recursive: true, force: true }); }
});
