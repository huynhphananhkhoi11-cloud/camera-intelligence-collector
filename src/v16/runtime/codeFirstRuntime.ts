import {
  loadCheckpoint,
  saveCheckpointAtomic,
  writeJsonAtomic,
  type JsonValue,
  type ProductCheckpointV16,
  type RunCheckpointV16,
  type RunStatusV16
} from './checkpointStore.js';
import {
  buildDeterministicRunPaths,
  sanitizeUrlForPersistence,
  type DeterministicRunPaths
} from './runPaths.js';

export interface MoneyValueLike {
  readonly value: number;
  readonly currency: string;
}

export interface NormalizedCameraRowLike {
  readonly website: string;
  readonly productName: string | null;
  readonly condition: string | null;
  readonly specs: readonly string[];
  readonly rentalPricePerDay: MoneyValueLike | null;
  readonly rentalTerms: string | null;
  readonly accessoriesIncluded: readonly string[] | null;
  readonly bundleIncluded: readonly string[] | null;
  readonly rating: number | null;
  readonly reviewCount: number | null;
  readonly stock: string | null;
  readonly salePrice: MoneyValueLike | null;
  readonly url: string;
}

export interface RuntimeProduct {
  readonly canonicalId: string;
  readonly url: string;
}

export interface SourceProbeResult {
  readonly sufficientForScopeDiscovery: boolean;
  readonly checkpointData?: JsonValue;
}

export interface NetworkProbeResult {
  readonly checkpointData?: JsonValue;
}

export type ScopeProofResult =
  | {
      readonly kind: 'PROVEN';
      readonly checkpointData: JsonValue;
      readonly routes?: readonly JsonValue[];
      readonly collections?: readonly JsonValue[];
    }
  | {
      readonly kind: 'NEEDS_LEGACY_SCOPE_FALLBACK';
      readonly checkpointData?: JsonValue;
    };

export type ScopeFallbackResult =
  | {
      readonly kind: 'SCOPE_PROVEN';
      readonly checkpointData: JsonValue;
      readonly routes?: readonly JsonValue[];
      readonly collections?: readonly JsonValue[];
    }
  | {
      readonly kind: 'USER_DECLINED_NEW_KEY';
      readonly reason?: string;
    };

export type DirectExtractionResult =
  | {
      readonly kind: 'DIRECT_COMPLETE_ENOUGH';
      readonly row: NormalizedCameraRowLike;
      readonly checkpointData?: JsonValue;
    }
  | {
      readonly kind: 'DIRECT_UNUSABLE';
      readonly checkpointData?: JsonValue;
    }
  | {
      readonly kind: 'NON_CAMERA_EVIDENCE_CONFLICT';
      readonly checkpointData?: JsonValue;
    };

export type ProductFallbackResult =
  | {
      readonly kind: 'FALLBACK_COMPLETE';
      readonly row: NormalizedCameraRowLike;
      readonly evidenceRef?: string;
    }
  | {
      readonly kind: 'USER_DECLINED_NEW_KEY';
      readonly reason?: string;
    };

export interface RuntimeLogger {
  write(line: string): void;
}

export interface RuntimePorts {
  readonly source: {
    inspect(rootUrl: string, signal?: AbortSignal): Promise<SourceProbeResult>;
  };
  readonly network: {
    inspect(rootUrl: string, source: SourceProbeResult, signal?: AbortSignal): Promise<NetworkProbeResult>;
  };
  readonly scope: {
    prove(input: {
      readonly rootUrl: string;
      readonly source: SourceProbeResult;
      readonly network: NetworkProbeResult | null;
    }, signal?: AbortSignal): Promise<ScopeProofResult>;
    discoverProducts(input: {
      readonly rootUrl: string;
      readonly cameraScope: JsonValue;
    }, signal?: AbortSignal): Promise<readonly RuntimeProduct[]>;
  };
  readonly direct: {
    extract(product: RuntimeProduct, signal?: AbortSignal): Promise<DirectExtractionResult>;
  };
  readonly fallback: {
    resolveScope(input: {
      readonly rootUrl: string;
      readonly source: SourceProbeResult;
      readonly network: NetworkProbeResult | null;
      readonly scopeAttempt: ScopeProofResult;
    }, signal?: AbortSignal): Promise<ScopeFallbackResult>;
    extractProduct(product: RuntimeProduct, signal?: AbortSignal): Promise<ProductFallbackResult>;
  };
  readonly exporter: {
    writeWorkbook(rows: readonly NormalizedCameraRowLike[], path: string): Promise<void>;
  };
  readonly resources: {
    close(): Promise<void>;
  };
  readonly logger: RuntimeLogger;
  readonly now?: () => string;
}

export interface RuntimeReport {
  readonly status: RunStatusV16;
  readonly totalProducts: number;
  readonly completedRows: number;
  readonly directCompleted: number;
  readonly fallbackCompleted: number;
  readonly remainingProducts: number;
  readonly workbookPath: string;
  readonly checkpointPath: string;
}

export interface RuntimeResult {
  readonly status: RunStatusV16;
  readonly paths: DeterministicRunPaths;
  readonly report: RuntimeReport;
}

export interface RunCodeFirstRuntimeOptions {
  readonly rootUrl: string;
  readonly outputRoot: string;
  readonly ports: RuntimePorts;
  readonly signal?: AbortSignal;
}

function sanitizeRowForPersistence(row: NormalizedCameraRowLike): NormalizedCameraRowLike {
  return {
    ...row,
    url: sanitizeUrlForPersistence(row.url)
  };
}

function asJsonRow(row: NormalizedCameraRowLike): JsonValue {
  return sanitizeRowForPersistence(row) as unknown as JsonValue;
}

function fromJsonRow(value: JsonValue | undefined): NormalizedCameraRowLike | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as unknown as NormalizedCameraRowLike
    : null;
}

function dedupeProducts(products: readonly RuntimeProduct[]): RuntimeProduct[] {
  const seen = new Set<string>();
  const output: RuntimeProduct[] = [];
  for (const product of products) {
    if (!product.canonicalId || seen.has(product.canonicalId)) continue;
    seen.add(product.canonicalId);
    output.push(product);
  }
  return output;
}

function collectCompletedRows(checkpoint: RunCheckpointV16): NormalizedCameraRowLike[] {
  const rows: NormalizedCameraRowLike[] = [];
  const seen = new Set<string>();
  for (const id of checkpoint.productOrder) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = checkpoint.products[id];
    if (!item || (item.completion !== 'DIRECT_DONE' && item.completion !== 'FALLBACK_DONE')) continue;
    const row = fromJsonRow(item.row);
    if (row) rows.push(row);
  }
  return rows;
}

function buildReport(
  checkpoint: RunCheckpointV16,
  paths: DeterministicRunPaths
): RuntimeReport {
  let directCompleted = 0;
  let fallbackCompleted = 0;
  for (const id of checkpoint.productOrder) {
    const item = checkpoint.products[id];
    if (!item) continue;
    if (item.completion === 'DIRECT_DONE') directCompleted += 1;
    if (item.completion === 'FALLBACK_DONE') fallbackCompleted += 1;
  }
  const completedRows = directCompleted + fallbackCompleted;
  return {
    status: checkpoint.status,
    totalProducts: checkpoint.productOrder.length,
    completedRows,
    directCompleted,
    fallbackCompleted,
    remainingProducts: Math.max(0, checkpoint.productOrder.length - completedRows),
    workbookPath: paths.workbookPath,
    checkpointPath: paths.checkpointPath
  };
}

async function persist(
  checkpoint: RunCheckpointV16,
  paths: DeterministicRunPaths,
  now: () => string
): Promise<void> {
  checkpoint.updatedAt = now();
  await saveCheckpointAtomic(paths.checkpointPath, checkpoint);
}

async function writeReport(
  checkpoint: RunCheckpointV16,
  paths: DeterministicRunPaths
): Promise<RuntimeReport> {
  const report = buildReport(checkpoint, paths);
  await writeJsonAtomic(paths.reportPath, report);
  return report;
}

async function finishPartialQuotaStop(
  checkpoint: RunCheckpointV16,
  paths: DeterministicRunPaths,
  ports: RuntimePorts,
  now: () => string
): Promise<RuntimeResult> {
  checkpoint.status = 'PARTIAL_QUOTA_STOP';
  await persist(checkpoint, paths, now);
  const rows = collectCompletedRows(checkpoint);
  await ports.exporter.writeWorkbook(rows, paths.workbookPath);
  ports.logger.write('[EXPORT] partial workbook written');
  const report = await writeReport(checkpoint, paths);
  return { status: checkpoint.status, paths, report };
}

async function finishAborted(
  checkpoint: RunCheckpointV16,
  paths: DeterministicRunPaths,
  now: () => string
): Promise<RuntimeResult> {
  checkpoint.status = 'ABORTED';
  await persist(checkpoint, paths, now);
  const report = await writeReport(checkpoint, paths);
  return { status: checkpoint.status, paths, report };
}

function isCompleted(item: ProductCheckpointV16): boolean {
  return item.completion === 'DIRECT_DONE' || item.completion === 'FALLBACK_DONE';
}

export async function runCodeFirstRuntime(
  options: RunCodeFirstRuntimeOptions
): Promise<RuntimeResult> {
  const { ports, signal } = options;
  const now = ports.now ?? (() => new Date().toISOString());
  const paths = buildDeterministicRunPaths(options.outputRoot, options.rootUrl);
  let checkpoint: RunCheckpointV16 | null = null;

  try {
    checkpoint = await loadCheckpoint(paths.checkpointPath);
    if (checkpoint && checkpoint.rootUrl !== paths.normalizedRootUrl) {
      throw new Error('Checkpoint root URL mismatch');
    }

    if (!checkpoint) {
      checkpoint = {
        schemaVersion: 1,
        rootUrl: paths.normalizedRootUrl,
        status: 'RUNNING',
        cameraScope: null,
        routes: [],
        collections: [],
        discoveryComplete: false,
        products: {},
        productOrder: [],
        updatedAt: now()
      };
      await persist(checkpoint, paths, now);
    }
    else {
      checkpoint.status = 'RUNNING';
      await persist(checkpoint, paths, now);
    }

    if (signal?.aborted) return await finishAborted(checkpoint, paths, now);

    if (checkpoint.cameraScope === null) {
      const source = await ports.source.inspect(paths.normalizedRootUrl, signal);
      ports.logger.write(source.sufficientForScopeDiscovery
        ? '[SOURCE] direct evidence ready'
        : '[SOURCE] direct evidence insufficient');

      if (signal?.aborted) return await finishAborted(checkpoint, paths, now);

      let network: NetworkProbeResult | null = null;
      if (!source.sufficientForScopeDiscovery) {
        ports.logger.write('[NETWORK] probing Fetch/XHR');
        network = await ports.network.inspect(paths.normalizedRootUrl, source, signal);
      }

      if (signal?.aborted) return await finishAborted(checkpoint, paths, now);

      const scopeAttempt = await ports.scope.prove({
        rootUrl: paths.normalizedRootUrl,
        source,
        network
      }, signal);

      if (scopeAttempt.kind === 'PROVEN') {
        checkpoint.cameraScope = scopeAttempt.checkpointData;
        checkpoint.routes = [...(scopeAttempt.routes ?? [])];
        checkpoint.collections = [...(scopeAttempt.collections ?? [])];
      }
      else {
        ports.logger.write('[SCOPE] camera scope ambiguous; invoking legacy scope fallback');
        const fallbackScope = await ports.fallback.resolveScope({
          rootUrl: paths.normalizedRootUrl,
          source,
          network,
          scopeAttempt
        }, signal);

        if (fallbackScope.kind === 'USER_DECLINED_NEW_KEY') {
          ports.logger.write('[QUOTA] fallback credential unavailable; user declined another key');
          return await finishPartialQuotaStop(checkpoint, paths, ports, now);
        }

        checkpoint.cameraScope = fallbackScope.checkpointData;
        checkpoint.routes = [...(fallbackScope.routes ?? [])];
        checkpoint.collections = [...(fallbackScope.collections ?? [])];
      }

      ports.logger.write('[SCOPE] camera collection proven');
      await persist(checkpoint, paths, now);
    }

    if (!checkpoint.discoveryComplete) {
      const discovered = dedupeProducts(await ports.scope.discoverProducts({
        rootUrl: paths.normalizedRootUrl,
        cameraScope: checkpoint.cameraScope
      }, signal));

      for (const product of discovered) {
        if (!checkpoint.products[product.canonicalId]) {
          checkpoint.products[product.canonicalId] = {
            canonicalId: product.canonicalId,
            url: sanitizeUrlForPersistence(product.url),
            completion: 'PENDING'
          };
          checkpoint.productOrder.push(product.canonicalId);
        }
      }
      checkpoint.discoveryComplete = true;
      ports.logger.write(`[DISCOVERY] unique camera products=${checkpoint.productOrder.length}`);
      await persist(checkpoint, paths, now);
    }

    const total = checkpoint.productOrder.length;
    for (let index = 0; index < total; index += 1) {
      if (signal?.aborted) return await finishAborted(checkpoint, paths, now);

      const id = checkpoint.productOrder[index];
      const item = checkpoint.products[id];
      if (!item || isCompleted(item)) continue;

      const product: RuntimeProduct = { canonicalId: item.canonicalId, url: item.url };

      if (item.completion === 'PENDING') {
        ports.logger.write(`[PRODUCT ${index + 1}/${total}] DIRECT`);
        const direct = await ports.direct.extract(product, signal);
        item.directResult = {
          kind: direct.kind,
          data: direct.checkpointData ?? null
        };

        if (direct.kind === 'DIRECT_COMPLETE_ENOUGH') {
          item.row = asJsonRow(direct.row);
          item.completion = 'DIRECT_DONE';
          item.fallbackState = 'NOT_REQUIRED';
          await persist(checkpoint, paths, now);
          continue;
        }

        if (direct.kind === 'NON_CAMERA_EVIDENCE_CONFLICT') {
          item.completion = 'SCOPE_REVIEW_REQUIRED';
          await persist(checkpoint, paths, now);
          throw new Error('Direct extraction reported camera-scope conflict requiring DEV3/DEV0 review');
        }

        item.completion = 'FALLBACK_WAITING';
        item.fallbackState = 'WAITING';
        await persist(checkpoint, paths, now);
      }

      if (signal?.aborted) return await finishAborted(checkpoint, paths, now);

      if (item.completion === 'FALLBACK_WAITING') {
        ports.logger.write(`[PRODUCT ${index + 1}/${total}] FALLBACK`);
        const fallback = await ports.fallback.extractProduct(product, signal);
        if (fallback.kind === 'USER_DECLINED_NEW_KEY') {
          item.fallbackState = 'WAITING';
          await persist(checkpoint, paths, now);
          ports.logger.write('[QUOTA] current Gemini credential unavailable');
          return await finishPartialQuotaStop(checkpoint, paths, ports, now);
        }

        item.row = asJsonRow(fallback.row);
        item.completion = 'FALLBACK_DONE';
        item.fallbackState = 'DONE';
        if (fallback.evidenceRef) item.fallbackEvidenceRef = fallback.evidenceRef;
        await persist(checkpoint, paths, now);
      }
    }

    checkpoint.status = 'COMPLETED';
    await persist(checkpoint, paths, now);
    const rows = collectCompletedRows(checkpoint);
    await ports.exporter.writeWorkbook(rows, paths.workbookPath);
    ports.logger.write('[EXPORT] workbook written');
    const report = await writeReport(checkpoint, paths);
    return { status: checkpoint.status, paths, report };
  }
  catch (error) {
    if (checkpoint) {
      if (signal?.aborted) return await finishAborted(checkpoint, paths, now);
      checkpoint.status = 'ERROR';
      try {
        await persist(checkpoint, paths, now);
        await writeReport(checkpoint, paths);
      }
      catch {
        // Keep the original runtime error authoritative.
      }
    }
    ports.logger.write('[ERROR] runtime failed');
    return {
      status: 'ERROR',
      paths,
      report: checkpoint
        ? buildReport(checkpoint, paths)
        : {
            status: 'ERROR',
            totalProducts: 0,
            completedRows: 0,
            directCompleted: 0,
            fallbackCompleted: 0,
            remainingProducts: 0,
            workbookPath: paths.workbookPath,
            checkpointPath: paths.checkpointPath
          }
    };
  }
  finally {
    await ports.resources.close();
  }
}
