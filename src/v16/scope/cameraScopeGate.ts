export type Dev3CollectionSourceKind =
  | "PAGE_TAXONOMY"
  | "PAGE_LISTING"
  | "NETWORK_COLLECTION";

export interface Dev3CollectionEvidence {
  readonly evidenceId: string;
  readonly collectionRef: string;
  readonly sourceKind: Dev3CollectionSourceKind;
  readonly label: string;
  readonly taxonomyPath?: readonly string[];
  readonly collectionUrl?: string | null;
}

export interface PageEvidenceBundleAdapter {
  readonly rootUrl: string;
  readonly collections: readonly Dev3CollectionEvidence[];
}

export interface NetworkEvidenceBundleAdapter {
  readonly pageUrl: string;
  readonly collections: readonly Dev3CollectionEvidence[];
}

export interface ProvenCameraCollection {
  readonly collectionRef: string;
  readonly sourceKind: Dev3CollectionSourceKind;
  readonly collectionUrl: string | null;
  readonly proof: {
    readonly evidenceId: string;
    readonly terminalLabel: string;
    readonly taxonomyPath: readonly string[];
  };
}

export interface CameraScope {
  readonly collections: readonly ProvenCameraCollection[];
}

export type CameraScopeGateResult =
  | {
      readonly status: "PROVEN_CAMERA_SCOPE";
      readonly scope: CameraScope;
    }
  | {
      readonly status: "NEEDS_LEGACY_SCOPE_FALLBACK";
      readonly reason: "NO_PROVEN_CAMERA_COLLECTION";
    };

export interface CameraScopeGateInput {
  readonly pageEvidence: PageEvidenceBundleAdapter;
  readonly networkEvidence: NetworkEvidenceBundleAdapter;
}

const CAMERA_PRIMARY_TERMINALS = new Set([
  "camera",
  "cameras",
  "camera body",
  "camera bodies",
  "digital camera",
  "digital cameras",
  "may anh",
  "mirrorless",
  "mirrorless camera",
  "mirrorless cameras",
  "dslr",
  "dslr camera",
  "dslr cameras",
  "compact camera",
  "compact cameras"
]);

const CAMERA_PRIMARY_ANCESTORS = new Set([
  "camera",
  "cameras",
  "camera body",
  "camera bodies",
  "digital camera",
  "digital cameras",
  "may anh"
]);

function normalizeScopeLabel(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function isCameraPrimaryTerminal(
  label: string,
  taxonomyPath: readonly string[]
): boolean {
  const normalizedLabel = normalizeScopeLabel(label);
  if (CAMERA_PRIMARY_TERMINALS.has(normalizedLabel)) {
    return true;
  }

  if (normalizedLabel !== "compact") {
    return false;
  }

  return taxonomyPath
    .slice(0, -1)
    .some(item =>
      CAMERA_PRIMARY_ANCESTORS.has(
        normalizeScopeLabel(item)
      )
    );
}

function proveCollection(
  evidence: Dev3CollectionEvidence
): ProvenCameraCollection | null {
  const taxonomyPath = (evidence.taxonomyPath ?? [evidence.label])
    .map(item => item.trim())
    .filter(Boolean);
  const terminalLabel =
    taxonomyPath[taxonomyPath.length - 1] ?? evidence.label.trim();

  if (
    !terminalLabel ||
    !isCameraPrimaryTerminal(terminalLabel, taxonomyPath)
  ) {
    return null;
  }

  return {
    collectionRef: evidence.collectionRef,
    sourceKind: evidence.sourceKind,
    collectionUrl: evidence.collectionUrl ?? null,
    proof: {
      evidenceId: evidence.evidenceId,
      terminalLabel,
      taxonomyPath: [...taxonomyPath]
    }
  };
}

export function proveCameraScope(
  input: CameraScopeGateInput
): CameraScopeGateResult {
  const proven: ProvenCameraCollection[] = [];
  const seenCollectionRefs = new Set<string>();

  for (const evidence of [
    ...input.pageEvidence.collections,
    ...input.networkEvidence.collections
  ]) {
    if (seenCollectionRefs.has(evidence.collectionRef)) {
      continue;
    }

    const collection = proveCollection(evidence);
    if (!collection) {
      continue;
    }

    seenCollectionRefs.add(evidence.collectionRef);
    proven.push(collection);
  }

  if (proven.length === 0) {
    return {
      status: "NEEDS_LEGACY_SCOPE_FALLBACK",
      reason: "NO_PROVEN_CAMERA_COLLECTION"
    };
  }

  return {
    status: "PROVEN_CAMERA_SCOPE",
    scope: {
      collections: proven
    }
  };
}
