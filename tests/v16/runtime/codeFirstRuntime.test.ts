import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runCodeFirstRuntime,
  type RuntimePorts,
  type RuntimeProduct,
  type NormalizedCameraRowLike
} from '../../../src/v16/runtime/codeFirstRuntime.js';

function row(id: string): NormalizedCameraRowLike {
  return {
    website: 'shop.test',
    productName: id,
    condition: 'NEW',
    specs: [],
    rentalPricePerDay: null,
    rentalTerms: null,
    accessoriesIncluded: null,
    bundleIncluded: null,
    rating: null,
    reviewCount: null,
    stock: null,
    salePrice: null,
    url: `https://shop.test/${id}`
  };
}

function products(...ids: string[]): RuntimeProduct[] {
  return ids.map(id => ({ canonicalId: id, url: `https://shop.test/${id}` }));
}

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'v16-dev6-test-'));
  try { await fn(dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

function basePorts(overrides: Partial<RuntimePorts> = {}): RuntimePorts {
  let closeCount = 0;
  return {
    source: {
      inspect: async () => ({ sufficientForScopeDiscovery: true, checkpointData: { source: 'ready' } })
    },
    network: {
      inspect: async () => { throw new Error('network should not be called'); }
    },
    scope: {
      prove: async () => ({ kind: 'PROVEN', checkpointData: { collectionIds: ['camera'] } }),
      discoverProducts: async () => products('p1', 'p2')
    },
    direct: {
      extract: async product => ({
        kind: 'DIRECT_COMPLETE_ENOUGH',
        row: row(product.canonicalId),
        checkpointData: { kind: 'direct' }
      })
    },
    fallback: {
      resolveScope: async () => ({ kind: 'SCOPE_PROVEN', checkpointData: {} }),
      extractProduct: async () => { throw new Error('fallback should not be called'); }
    },
    exporter: {
      writeWorkbook: async () => undefined
    },
    resources: {
      close: async () => { closeCount += 1; }
    },
    logger: { write: () => undefined },
    now: () => '2026-09-26T00:00:00.000Z',
    ...overrides,
    __getCloseCount: () => closeCount
  } as RuntimePorts & { __getCloseCount: () => number };
}

test('direct-only run never calls network or fallback and exports all completed rows', async () => {
  await withTempDir(async outputRoot => {
    let fallbackCalls = 0;
    let networkCalls = 0;
    let exported: NormalizedCameraRowLike[] = [];
    const ports = basePorts({
      network: { inspect: async () => { networkCalls += 1; return { checkpointData: {} }; } },
      fallback: {
        resolveScope: async () => ({ kind: 'SCOPE_PROVEN', checkpointData: {} }),
        extractProduct: async () => { fallbackCalls += 1; throw new Error('unexpected fallback'); }
      },
      exporter: { writeWorkbook: async rows => { exported = [...rows]; } }
    });

    const result = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(networkCalls, 0);
    assert.equal(fallbackCalls, 0);
    assert.deepEqual(exported.map(r => r.productName), ['p1', 'p2']);
  });
});

test('USER_DECLINED_NEW_KEY exports completed rows only, keeps checkpoint, no duplicates, and reports PARTIAL_QUOTA_STOP', async () => {
  await withTempDir(async outputRoot => {
    let exported: NormalizedCameraRowLike[] = [];
    let directIndex = 0;
    const ports = basePorts({
      scope: {
        prove: async () => ({ kind: 'PROVEN', checkpointData: { collectionIds: ['camera'] } }),
        discoverProducts: async () => [...products('p1', 'p1', 'p2', 'p3')]
      },
      direct: {
        extract: async product => {
          directIndex += 1;
          if (product.canonicalId === 'p1') {
            return { kind: 'DIRECT_COMPLETE_ENOUGH', row: row('p1'), checkpointData: { n: directIndex } };
          }
          return { kind: 'DIRECT_UNUSABLE', checkpointData: { n: directIndex } };
        }
      },
      fallback: {
        resolveScope: async () => ({ kind: 'SCOPE_PROVEN', checkpointData: {} }),
        extractProduct: async product => product.canonicalId === 'p2'
          ? { kind: 'FALLBACK_COMPLETE', row: row('p2'), evidenceRef: 'evidence/p2.json' }
          : { kind: 'USER_DECLINED_NEW_KEY', reason: 'quota' }
      },
      exporter: { writeWorkbook: async rows => { exported = [...rows]; } }
    });

    const result = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports });
    assert.equal(result.status, 'PARTIAL_QUOTA_STOP');
    assert.deepEqual(exported.map(r => r.productName), ['p1', 'p2']);
    assert.equal(new Set(exported.map(r => r.productName)).size, exported.length);

    const checkpointText = await readFile(result.paths.checkpointPath, 'utf8');
    const checkpoint = JSON.parse(checkpointText);
    assert.equal(checkpoint.status, 'PARTIAL_QUOTA_STOP');
    assert.equal(checkpoint.products.p1.completion, 'DIRECT_DONE');
    assert.equal(checkpoint.products.p2.completion, 'FALLBACK_DONE');
    assert.equal(checkpoint.products.p2.directResult.kind, 'DIRECT_UNUSABLE');
    assert.equal(checkpoint.products.p3.completion, 'FALLBACK_WAITING');

    const report = JSON.parse(await readFile(result.paths.reportPath, 'utf8'));
    assert.equal(report.status, 'PARTIAL_QUOTA_STOP');
    assert.equal(report.completedRows, 2);
    assert.equal(report.totalProducts, 3);
    assert.equal(report.remainingProducts, 1);
  });
});

test('resume skips completed direct and fallback products and does not duplicate rows', async () => {
  await withTempDir(async outputRoot => {
    const calls = { direct: [] as string[], fallback: [] as string[] };
    let phase = 1;
    const ports = basePorts({
      scope: {
        prove: async () => ({ kind: 'PROVEN', checkpointData: { collectionIds: ['camera'] } }),
        discoverProducts: async () => products('p1', 'p2', 'p3')
      },
      direct: {
        extract: async product => {
          calls.direct.push(`${phase}:${product.canonicalId}`);
          if (product.canonicalId === 'p1') return { kind: 'DIRECT_COMPLETE_ENOUGH', row: row('p1'), checkpointData: {} };
          return { kind: 'DIRECT_UNUSABLE', checkpointData: {} };
        }
      },
      fallback: {
        resolveScope: async () => ({ kind: 'SCOPE_PROVEN', checkpointData: {} }),
        extractProduct: async product => {
          calls.fallback.push(`${phase}:${product.canonicalId}`);
          if (phase === 1 && product.canonicalId === 'p3') return { kind: 'USER_DECLINED_NEW_KEY', reason: 'quota' };
          return { kind: 'FALLBACK_COMPLETE', row: row(product.canonicalId), evidenceRef: `evidence/${product.canonicalId}.json` };
        }
      }
    });

    const first = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports });
    assert.equal(first.status, 'PARTIAL_QUOTA_STOP');
    phase = 2;
    const second = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports });
    assert.equal(second.status, 'COMPLETED');

    assert.deepEqual(calls.direct, ['1:p1', '1:p2', '1:p3']);
    assert.deepEqual(calls.fallback, ['1:p2', '1:p3', '2:p3']);
    assert.equal(second.report.completedRows, 3);
  });
});

test('safe abort leaves a usable checkpoint and closes resources', async () => {
  await withTempDir(async outputRoot => {
    const controller = new AbortController();
    let count = 0;
    let closeCount = 0;
    const ports = basePorts({
      scope: {
        prove: async () => ({ kind: 'PROVEN', checkpointData: {} }),
        discoverProducts: async () => products('p1', 'p2', 'p3')
      },
      direct: {
        extract: async product => {
          count += 1;
          if (count === 1) controller.abort();
          return { kind: 'DIRECT_COMPLETE_ENOUGH', row: row(product.canonicalId), checkpointData: {} };
        }
      },
      resources: { close: async () => { closeCount += 1; } }
    });

    const result = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports, signal: controller.signal });
    assert.equal(result.status, 'ABORTED');
    assert.equal(closeCount, 1);
    const checkpoint = JSON.parse(await readFile(result.paths.checkpointPath, 'utf8'));
    assert.equal(checkpoint.status, 'ABORTED');
    assert.equal(checkpoint.products.p1.completion, 'DIRECT_DONE');
    assert.equal(checkpoint.products.p2.completion, 'PENDING');
  });
});


test('product URLs persisted in checkpoint do not retain credentials or secret-bearing query parameters', async () => {
  await withTempDir(async outputRoot => {
    let exported: NormalizedCameraRowLike[] = [];
    const signedUrl = 'https://user:pass@shop.test/camera?view=full&token=abc123#frag';
    const ports = basePorts({
      scope: {
        prove: async () => ({ kind: 'PROVEN', checkpointData: {} }),
        discoverProducts: async () => [{
          canonicalId: 'signed-product',
          url: signedUrl
        }]
      },
      direct: {
        extract: async () => ({
          kind: 'DIRECT_COMPLETE_ENOUGH',
          row: { ...row('signed-product'), url: signedUrl },
          checkpointData: {}
        })
      },
      exporter: { writeWorkbook: async rows => { exported = [...rows]; } }
    });

    const result = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports });
    assert.equal(result.status, 'COMPLETED');
    const checkpoint = JSON.parse(await readFile(result.paths.checkpointPath, 'utf8'));
    assert.equal(checkpoint.products['signed-product'].url, 'https://shop.test/camera?view=full');
    assert.equal(checkpoint.products['signed-product'].row.url, 'https://shop.test/camera?view=full');
    assert.equal(exported[0]?.url, 'https://shop.test/camera?view=full');
    assert.doesNotMatch(JSON.stringify(checkpoint), /abc123|user:pass/);
  });
});


test('resume does not redo proven scope or completed zero-product discovery', async () => {
  await withTempDir(async outputRoot => {
    const calls = { source: 0, prove: 0, discover: 0 };
    const ports = basePorts({
      source: {
        inspect: async () => {
          calls.source += 1;
          return { sufficientForScopeDiscovery: true, checkpointData: {} };
        }
      },
      scope: {
        prove: async () => {
          calls.prove += 1;
          return { kind: 'PROVEN', checkpointData: { collectionIds: ['camera'] } };
        },
        discoverProducts: async () => {
          calls.discover += 1;
          return [];
        }
      }
    });

    const first = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports });
    const second = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports });
    assert.equal(first.status, 'COMPLETED');
    assert.equal(second.status, 'COMPLETED');
    assert.deepEqual(calls, { source: 1, prove: 1, discover: 1 });
  });
});


test('source-insufficient flow probes network exactly once before scope discovery', async () => {
  await withTempDir(async outputRoot => {
    let networkCalls = 0;
    let scopeSawNetwork = false;
    const ports = basePorts({
      source: {
        inspect: async () => ({ sufficientForScopeDiscovery: false, checkpointData: {} })
      },
      network: {
        inspect: async () => {
          networkCalls += 1;
          return { checkpointData: { xhr: 'camera collection' } };
        }
      },
      scope: {
        prove: async input => {
          scopeSawNetwork = input.network !== null;
          return { kind: 'PROVEN', checkpointData: {} };
        },
        discoverProducts: async () => []
      }
    });

    const result = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(networkCalls, 1);
    assert.equal(scopeSawNetwork, true);
  });
});

test('resources close exactly once after a normal completed run', async () => {
  await withTempDir(async outputRoot => {
    let closeCount = 0;
    const ports = basePorts({ resources: { close: async () => { closeCount += 1; } } });
    const result = await runCodeFirstRuntime({ rootUrl: 'https://shop.test/', outputRoot, ports });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(closeCount, 1);
  });
});
