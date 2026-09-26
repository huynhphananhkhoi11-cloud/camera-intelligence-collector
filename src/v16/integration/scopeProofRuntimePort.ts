import {
  proveCameraScope
} from "../scope/cameraScopeGate.js";

import type {
  CameraScope,
  CameraScopeGateInput,
  Dev3CollectionEvidence,
  NetworkEvidenceBundleAdapter,
  PageEvidenceBundleAdapter
} from "../scope/cameraScopeGate.js";

import type {
  PageEvidenceBundle
} from "../evidence/pageEvidence.js";

import type {
  NetworkEvidenceBundle,
  NetworkJsonValue
} from "../evidence/networkEvidence.js";

import type {
  JsonValue
} from "../runtime/checkpointStore.js";

import type {
  RuntimePorts,
  ScopeProofResult
} from "../runtime/codeFirstRuntime.js";

import type {
  V16IntegrationContext
} from "./v16IntegrationContext.js";

const MAX_NETWORK_OBJECTS =
  512;

const MAX_NETWORK_DEPTH =
  6;

const MAX_COLLECTIONS =
  256;

const LABEL_KEYS =
  [
    "name",
    "label",
    "title",
    "categoryName",
    "collectionName"
  ] as const;

const URL_KEYS =
  [
    "url",
    "href",
    "link",
    "categoryUrl",
    "collectionUrl"
  ] as const;

const PATH_KEYS =
  [
    "taxonomyPath",
    "categoryPath",
    "breadcrumbPath"
  ] as const;

function abortError(): Error {
  const error =
    new Error(
      "Camera scope proof aborted"
    );

  error.name =
    "AbortError";

  return error;
}

function cleanText(
  value:
    unknown
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .replace(/\s+/gu, " ")
      .trim();

  return normalized ||
    null;
}

function resolveHttpUrl(
  value:
    string | null,

  baseUrl:
    string
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url =
      new URL(
        value,
        baseUrl
      );

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return null;
    }

    url.username = "";
    url.password = "";
    url.hash = "";

    for (
      const key of
      [...url.searchParams.keys()]
    ) {
      if (
        /(api[-_]?key|token|secret|auth|password|credential|signature|sig)/iu
          .test(key)
      ) {
        url.searchParams.delete(
          key
        );
      }
    }

    return url.toString();
  }
  catch {
    return null;
  }
}

function uniqueStrings(
  values:
    readonly string[]
): readonly string[] {
  const seen =
    new Set<string>();

  const result:
    string[] = [];

  for (
    const value of
    values
  ) {
    const cleaned =
      cleanText(value);

    if (!cleaned) {
      continue;
    }

    const key =
      cleaned.toLocaleLowerCase();

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function pageCollections(
  evidence:
    PageEvidenceBundle
): readonly Dev3CollectionEvidence[] {
  const output:
    Dev3CollectionEvidence[] = [];

  const seen =
    new Set<string>();

  const push =
    (
      item:
        Dev3CollectionEvidence
    ): void => {
      if (
        output.length >=
        MAX_COLLECTIONS
      ) {
        return;
      }

      const key =
        [
          item.sourceKind,
          item.collectionRef,
          item.label,
          ...(item.taxonomyPath ?? [])
        ].join("\u001f");

      if (
        seen.has(key)
      ) {
        return;
      }

      seen.add(key);
      output.push(item);
    };

  // Navigation remains neutral taxonomy evidence.
  // DEV3 decides whether any label/path proves camera scope.
  evidence.navigationNodes
    .forEach(
      (
        node,
        index
      ) => {
        const label =
          cleanText(
            node.text
          );

        if (!label) {
          return;
        }

        const absoluteUrl =
          resolveHttpUrl(
            node.href,
            evidence.finalUrl
          );

        if (!absoluteUrl) {
          return;
        }

        push({
          evidenceId:
            `page-nav:${index}`,

          collectionRef:
            absoluteUrl,

          sourceKind:
            "PAGE_TAXONOMY",

          label,

          taxonomyPath:
            [label],

          collectionUrl:
            absoluteUrl
        });
      }
    );

  // Breadcrumb chain represents the current page taxonomy/listing.
  const breadcrumbPath =
    uniqueStrings(
      evidence.breadcrumbs
        .slice()
        .sort(
          (a, b) =>
            (a.position ?? Number.MAX_SAFE_INTEGER) -
            (b.position ?? Number.MAX_SAFE_INTEGER)
        )
        .map(
          item =>
            item.text
        )
    );

  if (
    breadcrumbPath.length >
    0
  ) {
    const label =
      breadcrumbPath[
        breadcrumbPath.length - 1
      ]!;

    const collectionUrl =
      resolveHttpUrl(
        evidence.finalUrl,
        evidence.finalUrl
      );

    push({
      evidenceId:
        "page-breadcrumb-listing",

      collectionRef:
        collectionUrl ??
        `page:${evidence.finalUrl}`,

      sourceKind:
        "PAGE_LISTING",

      label,

      taxonomyPath:
        breadcrumbPath,

      collectionUrl
    });
  }

  // H1/title is only a generic current-page listing candidate.
  // It does not assert that the page is a camera collection.
  const identityLabel =
    cleanText(
      evidence.identityMetadata
        .h1Texts[0]
    ) ??
    cleanText(
      evidence.identityMetadata
        .documentTitle
    );

  if (
    identityLabel &&
    breadcrumbPath.length === 0
  ) {
    const collectionUrl =
      resolveHttpUrl(
        evidence.finalUrl,
        evidence.finalUrl
      );

    push({
      evidenceId:
        "page-current-identity",

      collectionRef:
        collectionUrl ??
        `page:${evidence.finalUrl}`,

      sourceKind:
        "PAGE_LISTING",

      label:
        identityLabel,

      taxonomyPath:
        [identityLabel],

      collectionUrl
    });
  }

  return output;
}

function firstString(
  object:
    Readonly<Record<string, unknown>>,

  keys:
    readonly string[]
): string | null {
  for (
    const key of
    keys
  ) {
    const value =
      cleanText(
        object[key]
      );

    if (value) {
      return value;
    }
  }

  return null;
}

function stringArray(
  value:
    unknown
): readonly string[] {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return uniqueStrings(
    value.filter(
      (
        item
      ): item is string =>
        typeof item ===
        "string"
    )
  );
}

function taxonomyPathFromObject(
  object:
    Readonly<Record<string, unknown>>,

  label:
    string
): readonly string[] {
  for (
    const key of
    PATH_KEYS
  ) {
    const path =
      stringArray(
        object[key]
      );

    if (
      path.length >
      0
    ) {
      return path;
    }
  }

  return [label];
}

function networkCollections(
  evidence:
    NetworkEvidenceBundle
): readonly Dev3CollectionEvidence[] {
  const output:
    Dev3CollectionEvidence[] = [];

  const dedupe =
    new Set<string>();

  let objectsVisited =
    0;

  const push =
    (
      item:
        Dev3CollectionEvidence
    ): void => {
      if (
        output.length >=
        MAX_COLLECTIONS
      ) {
        return;
      }

      const key =
        [
          item.collectionRef,
          item.label,
          ...(item.taxonomyPath ?? [])
        ].join("\u001f");

      if (
        dedupe.has(key)
      ) {
        return;
      }

      dedupe.add(key);
      output.push(item);
    };

  const visit =
    (
      value:
        NetworkJsonValue,

      responseUrl:
        string,

      evidencePrefix:
        string,

      path:
        string,

      depth:
        number
    ): void => {
      if (
        depth >
          MAX_NETWORK_DEPTH ||
        objectsVisited >=
          MAX_NETWORK_OBJECTS ||
        output.length >=
          MAX_COLLECTIONS
      ) {
        return;
      }

      if (
        Array.isArray(value)
      ) {
        for (
          let i = 0;
          i < value.length;
          i += 1
        ) {
          visit(
            value[i]!,
            responseUrl,
            evidencePrefix,
            `${path}[${i}]`,
            depth + 1
          );

          if (
            objectsVisited >=
              MAX_NETWORK_OBJECTS ||
            output.length >=
              MAX_COLLECTIONS
          ) {
            break;
          }
        }

        return;
      }

      if (
        value === null ||
        typeof value !==
          "object"
      ) {
        return;
      }

      objectsVisited += 1;

      const object =
        value as Readonly<
          Record<
            string,
            NetworkJsonValue
          >
        >;

      const label =
        firstString(
          object,
          LABEL_KEYS
        );

      const rawUrl =
        firstString(
          object,
          URL_KEYS
        );

      if (
        label &&
        rawUrl
      ) {
        const collectionUrl =
          resolveHttpUrl(
            rawUrl,
            responseUrl
          );

        if (
          collectionUrl
        ) {
          push({
            evidenceId:
              `${evidencePrefix}:${path}`,

            collectionRef:
              collectionUrl,

            sourceKind:
              "NETWORK_COLLECTION",

            label,

            taxonomyPath:
              taxonomyPathFromObject(
                object,
                label
              ),

            collectionUrl
          });
        }
      }

      for (
        const [
          key,
          child
        ] of
        Object.entries(object)
      ) {
        visit(
          child,
          responseUrl,
          evidencePrefix,
          path
            ? `${path}.${key}`
            : key,
          depth + 1
        );

        if (
          objectsVisited >=
            MAX_NETWORK_OBJECTS ||
          output.length >=
            MAX_COLLECTIONS
        ) {
          break;
        }
      }
    };

  evidence.entries
    .forEach(
      (
        entry,
        index
      ) => {
        if (
          entry.body.kind !==
          "json"
        ) {
          return;
        }

        visit(
          entry.body.value,
          entry.responseUrl,
          `network:${index}:${entry.bodySha256}`,
          "$",
          0
        );
      }
    );

  return output;
}

function toDev3Input(
  rootUrl:
    string,

  source:
    PageEvidenceBundle,

  network:
    NetworkEvidenceBundle | null
): CameraScopeGateInput {
  const pageEvidence:
    PageEvidenceBundleAdapter = {
      rootUrl,

      collections:
        pageCollections(
          source
        )
    };

  const networkEvidence:
    NetworkEvidenceBundleAdapter = {
      pageUrl:
        network?.pageUrl ??
        source.finalUrl,

      collections:
        network
          ? networkCollections(
              network
            )
          : []
    };

  return {
    pageEvidence,
    networkEvidence
  };
}

function safeCameraScopeJson(
  scope:
    CameraScope
): JsonValue {
  return {
    collections:
      scope.collections.map(
        collection => ({
          collectionRef:
            collection.collectionRef,

          sourceKind:
            collection.sourceKind,

          collectionUrl:
            collection.collectionUrl,

          proof: {
            evidenceId:
              collection.proof.evidenceId,

            terminalLabel:
              collection.proof.terminalLabel,

            taxonomyPath:
              [
                ...collection.proof
                  .taxonomyPath
              ]
          }
        })
      )
  };
}

function safeCollectionsJson(
  scope:
    CameraScope
): readonly JsonValue[] {
  return scope.collections.map(
    collection => ({
      collectionRef:
        collection.collectionRef,

      sourceKind:
        collection.sourceKind,

      collectionUrl:
        collection.collectionUrl,

      evidenceId:
        collection.proof
          .evidenceId,

      terminalLabel:
        collection.proof
          .terminalLabel,

      taxonomyPath:
        [
          ...collection.proof
            .taxonomyPath
        ]
    })
  );
}

function safeRoutesJson(
  scope:
    CameraScope
): readonly JsonValue[] {
  return scope.collections
    .map(
      collection =>
        collection.collectionUrl
    )
    .filter(
      (
        value
      ): value is string =>
        typeof value ===
          "string" &&
        value.length > 0
    );
}

export interface CreateScopeProofRuntimePortOptions {
  readonly context:
    V16IntegrationContext;
}

export function createScopeProofRuntimePort(
  options:
    CreateScopeProofRuntimePortOptions
): RuntimePorts["scope"]["prove"] {
  return async (
    input,
    signal
  ): Promise<ScopeProofResult> => {
    if (
      signal?.aborted
    ) {
      throw abortError();
    }

    const sourceEvidence =
      options.context
        .sourceEvidence;

    if (
      !sourceEvidence
    ) {
      return {
        kind:
          "NEEDS_LEGACY_SCOPE_FALLBACK",

        reason:
          "SOURCE_EVIDENCE_UNAVAILABLE"
      } as ScopeProofResult;
    }

    const dev3Input =
      toDev3Input(
        input.rootUrl,
        sourceEvidence,
        options.context
          .networkEvidence
      );

    const result =
      proveCameraScope(
        dev3Input
      );

    if (
      signal?.aborted
    ) {
      throw abortError();
    }

    if (
      result.status ===
      "NEEDS_LEGACY_SCOPE_FALLBACK"
    ) {
      options.context.cameraScope =
        null;

      return {
        kind:
          "NEEDS_LEGACY_SCOPE_FALLBACK",

        reason:
          result.reason
      } as ScopeProofResult;
    }

    options.context.cameraScope =
      result.scope;

    return {
      kind:
        "PROVEN",

      checkpointData:
        safeCameraScopeJson(
          result.scope
        ),

      routes:
        safeRoutesJson(
          result.scope
        ),

      collections:
        safeCollectionsJson(
          result.scope
        )
    };
  };
}