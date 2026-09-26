import {
  proveCameraScope,
  type CameraScope,
  type CameraScopeGateInput,
  type ProvenCameraCollection
} from "../scope/cameraScopeGate.js";

export type ProductEvidenceSourceKind =
  | "PAGE_PRODUCT_CARD"
  | "NETWORK_PRODUCT";

export interface ProductRecordEvidence {
  readonly evidenceId: string;
  readonly sourceKind: ProductEvidenceSourceKind;
  readonly primaryUrl: string;
  readonly alternateUrls?: readonly string[];
  readonly canonicalUrl?: string | null;
  readonly stableProductId?: string | null;
}

export type ContinuationKind =
  | "PAGE"
  | "CURSOR"
  | "INFINITE";

export interface ContinuationEvidence {
  readonly kind: ContinuationKind;
  readonly key: string;
}

export interface CollectionBatch {
  readonly collectionRef: string;
  readonly products: readonly ProductRecordEvidence[];
  readonly ambientLinks?: readonly string[];
  readonly continuation?: ContinuationEvidence | null;
}

export interface CollectionBatchReader {
  readInitial(
    collectionRef: string,
    collection: ProvenCameraCollection
  ): Promise<CollectionBatch | null>;

  readContinuation(
    collectionRef: string,
    continuation: ContinuationEvidence,
    collection: ProvenCameraCollection
  ): Promise<CollectionBatch | null>;
}

export interface ProductCandidate {
  readonly identity: string;
  readonly url: string;
  readonly alternateUrls: readonly string[];
  readonly collectionRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceKinds: readonly ProductEvidenceSourceKind[];
}

export interface ProductDiscoveryResult {
  readonly products: readonly ProductCandidate[];
  readonly batchesRead: number;
}

export interface ProductDiscoveryOptions {
  readonly maxBatchesPerCollection?: number;
}

export type ScopeAndDiscoveryResult =
  | {
      readonly status: "DISCOVERED";
      readonly scope: CameraScope;
      readonly products: readonly ProductCandidate[];
      readonly batchesRead: number;
    }
  | {
      readonly status: "NEEDS_LEGACY_SCOPE_FALLBACK";
      readonly reason: "NO_PROVEN_CAMERA_COLLECTION";
    };

interface MutableCandidate {
  identity: string;
  url: string;
  alternateUrls: string[];
  collectionRefs: string[];
  evidenceRefs: string[];
  sourceKinds: ProductEvidenceSourceKind[];
}

const DEFAULT_MAX_BATCHES_PER_COLLECTION = 20;
const MAX_CONFIGURED_BATCHES_PER_COLLECTION = 100;

function normalizeHttpUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/u, "");
    }

    const sortedParams: Array<[string, string]> = [];
    url.searchParams.forEach((value, key) => {
      sortedParams.push([key, value]);
    });
    sortedParams.sort(
      ([leftKey, leftValue], [rightKey, rightValue]) => {
        const keyCompare = leftKey.localeCompare(rightKey);
        return keyCompare !== 0
          ? keyCompare
          : leftValue.localeCompare(rightValue);
      }
    );

    url.search = "";
    for (const [key, value] of sortedParams) {
      url.searchParams.append(key, value);
    }

    return url.toString();
  }
  catch {
    return null;
  }
}

function stableIdIdentity(
  record: ProductRecordEvidence,
  normalizedPrimaryUrl: string
): string | null {
  const stableProductId = record.stableProductId?.trim();
  if (!stableProductId) {
    return null;
  }

  try {
    const origin = new URL(normalizedPrimaryUrl).origin.toLowerCase();
    return `${origin}|id:${stableProductId}`;
  }
  catch {
    return `id:${stableProductId}`;
  }
}

function canonicalIdentity(
  record: ProductRecordEvidence
): {
  readonly identity: string;
  readonly preferredUrl: string;
  readonly observedUrls: readonly string[];
} | null {
  const primaryUrl = normalizeHttpUrl(record.primaryUrl);
  if (!primaryUrl) {
    return null;
  }

  const canonicalUrl = record.canonicalUrl
    ? normalizeHttpUrl(record.canonicalUrl)
    : null;

  const identity =
    stableIdIdentity(record, primaryUrl) ??
    (canonicalUrl ? `url:${canonicalUrl}` : `url:${primaryUrl}`);

  const observedUrls: string[] = [];
  const seenUrls = new Set<string>();

  for (const rawUrl of [
    record.primaryUrl,
    ...(record.alternateUrls ?? []),
    ...(canonicalUrl ? [canonicalUrl] : [])
  ]) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized || seenUrls.has(normalized)) {
      continue;
    }
    seenUrls.add(normalized);
    observedUrls.push(normalized);
  }

  return {
    identity,
    preferredUrl: canonicalUrl ?? primaryUrl,
    observedUrls
  };
}

function mergeUnique<T>(target: T[], values: readonly T[]): void {
  const seen = new Set(target);
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    target.push(value);
  }
}

function normalizedBatchLimit(
  configured: number | undefined
): number {
  if (
    configured === undefined ||
    !Number.isFinite(configured)
  ) {
    return DEFAULT_MAX_BATCHES_PER_COLLECTION;
  }

  return Math.min(
    MAX_CONFIGURED_BATCHES_PER_COLLECTION,
    Math.max(1, Math.floor(configured))
  );
}

export async function discoverCameraProducts(
  scope: CameraScope,
  reader: CollectionBatchReader,
  options: ProductDiscoveryOptions = {}
): Promise<ProductDiscoveryResult> {
  const candidates = new Map<string, MutableCandidate>();
  const maxBatches = normalizedBatchLimit(
    options.maxBatchesPerCollection
  );
  let batchesRead = 0;

  for (const collection of scope.collections) {
    const seenContinuations = new Set<string>();
    let batch = await reader.readInitial(
      collection.collectionRef,
      collection
    );
    let batchesForCollection = 0;

    while (batch && batchesForCollection < maxBatches) {
      batchesForCollection += 1;
      batchesRead += 1;

      if (batch.collectionRef !== collection.collectionRef) {
        break;
      }

      let newUniqueProducts = 0;

      for (const record of batch.products) {
        const canonical = canonicalIdentity(record);
        if (!canonical) {
          continue;
        }

        const existing = candidates.get(canonical.identity);
        if (!existing) {
          candidates.set(canonical.identity, {
            identity: canonical.identity,
            url: canonical.preferredUrl,
            alternateUrls: [...canonical.observedUrls],
            collectionRefs: [collection.collectionRef],
            evidenceRefs: [record.evidenceId],
            sourceKinds: [record.sourceKind]
          });
          newUniqueProducts += 1;
          continue;
        }

        mergeUnique(existing.alternateUrls, canonical.observedUrls);
        mergeUnique(existing.collectionRefs, [collection.collectionRef]);
        mergeUnique(existing.evidenceRefs, [record.evidenceId]);
        mergeUnique(existing.sourceKinds, [record.sourceKind]);
      }

      if (newUniqueProducts === 0) {
        break;
      }

      const continuation = batch.continuation ?? null;
      if (
        !continuation ||
        batchesForCollection >= maxBatches ||
        seenContinuations.has(continuation.key)
      ) {
        break;
      }

      seenContinuations.add(continuation.key);
      batch = await reader.readContinuation(
        collection.collectionRef,
        continuation,
        collection
      );
    }
  }

  return {
    products: [...candidates.values()].map(candidate => ({
      identity: candidate.identity,
      url: candidate.url,
      alternateUrls: candidate.alternateUrls,
      collectionRefs: candidate.collectionRefs,
      evidenceRefs: candidate.evidenceRefs,
      sourceKinds: candidate.sourceKinds
    })),
    batchesRead
  };
}

export async function scopeAndDiscoverCameraProducts(
  evidence: CameraScopeGateInput,
  reader: CollectionBatchReader,
  options: ProductDiscoveryOptions = {}
): Promise<ScopeAndDiscoveryResult> {
  const scopeResult = proveCameraScope(evidence);
  if (scopeResult.status !== "PROVEN_CAMERA_SCOPE") {
    return scopeResult;
  }

  const discovery = await discoverCameraProducts(
    scopeResult.scope,
    reader,
    options
  );

  return {
    status: "DISCOVERED",
    scope: scopeResult.scope,
    products: discovery.products,
    batchesRead: discovery.batchesRead
  };
}
