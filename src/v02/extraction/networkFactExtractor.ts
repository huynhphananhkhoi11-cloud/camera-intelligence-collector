import {
  canonicalizeUrl
} from "../discovery/urlPolicy.js";

import type {
  StoredApiCandidate
} from "../network/apiCandidateStore.js";

import type {
  NetworkObserverSnapshot
} from "../network/networkObserver.js";

import type {
  DetailAcquisitionResult
} from "./detailAcquisitionTypes.js";

export type NetworkFactCorrelationReason =
  | "RESPONSE_URL_MATCH"
  | "SAMPLE_URL_MATCH"
  | "PRODUCT_ID_MATCH"
  | "SLUG_MATCH";

export interface NetworkFactHints {
  productId: string | null;

  name: string | null;

  rawUrl: string | null;

  canonicalUrl: string | null;

  slug: string | null;
}

export interface NetworkFactCorrelation {
  score: number;

  reasons:
    NetworkFactCorrelationReason[];
}

export interface NetworkFact {
  source: "NETWORK_API";

  responseUrl: string;

  method: string;

  status: number;

  contentType: string;

  responseTimestamps: string[];

  candidatePath: string;

  candidateScore: number;

  itemCount: number;

  seenCount: number;

  commonKeys: string[];

  signalKeys: string[];

  sampleIndex: number | null;

  sample:
    Record<string, unknown> | null;

  hints:
    NetworkFactHints;

  correlation:
    NetworkFactCorrelation;
}

type AcquisitionNetworkInput =
  Pick<
    DetailAcquisitionResult,
    | "requestedUrl"
    | "finalUrl"
    | "canonicalUrl"
    | "networkSnapshot"
  >;

const PRODUCT_ID_KEYS =
  new Set([
    "id",
    "productid",
    "product_id",
    "pid",
    "sku"
  ]);

const SAMPLE_ID_KEYS = [
  "id",
  "productid",
  "product_id",
  "sku"
] as const;

const SAMPLE_NAME_KEYS = [
  "name",
  "title",
  "productname",
  "product_name"
] as const;

const SAMPLE_URL_KEYS = [
  "url",
  "href",
  "link",
  "permalink"
] as const;

const SAMPLE_SLUG_KEYS = [
  "slug",
  "handle"
] as const;

function normalizeKey(
  raw: string
): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9_]/g,
      ""
    );
}

function normalizeScalar(
  value: unknown
): string | null {
  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    const text =
      String(value)
        .trim();

    return text || null;
  }

  return null;
}

function normalizeComparison(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

function normalizedRecord(
  record:
    Record<string, unknown>
): Map<string, unknown> {
  const result =
    new Map<
      string,
      unknown
    >();

  for (
    const [key, value]
    of Object.entries(record)
  ) {
    const normalized =
      normalizeKey(key);

    if (
      normalized &&
      !result.has(normalized)
    ) {
      result.set(
        normalized,
        value
      );
    }
  }

  return result;
}

function firstScalar(
  record:
    Map<string, unknown>,
  keys:
    readonly string[]
): string | null {
  for (const key of keys) {
    const value =
      normalizeScalar(
        record.get(
          normalizeKey(key)
        )
      );

    if (value) {
      return value;
    }
  }

  return null;
}

function safeUrl(
  value: string
): URL | null {
  try {
    return new URL(value);
  }
  catch {
    return null;
  }
}

function canonicalTargets(
  acquisition:
    AcquisitionNetworkInput
): string[] {
  const output =
    new Set<string>();

  for (
    const raw
    of [
      acquisition.requestedUrl,
      acquisition.finalUrl,
      acquisition.canonicalUrl
    ]
  ) {
    if (!raw) {
      continue;
    }

    const canonical =
      canonicalizeUrl(raw);

    if (canonical) {
      output.add(canonical);
    }
  }

  return Array.from(output);
}

function targetIds(
  urls:
    readonly string[]
): Set<string> {
  const output =
    new Set<string>();

  for (const urlText of urls) {
    const url =
      safeUrl(urlText);

    if (!url) {
      continue;
    }

    for (
      const [key, value]
      of url.searchParams.entries()
    ) {
      if (
        PRODUCT_ID_KEYS.has(
          normalizeKey(key)
        )
      ) {
        const normalized =
          normalizeComparison(
            value
          );

        if (normalized) {
          output.add(
            normalized
          );
        }
      }
    }
  }

  return output;
}

function pathSlug(
  rawUrl: string
): string | null {
  const url =
    safeUrl(rawUrl);

  if (!url) {
    return null;
  }

  const segments =
    url.pathname
      .split("/")
      .filter(Boolean);

  const raw =
    segments[
      segments.length - 1
    ];

  if (!raw) {
    return null;
  }

  try {
    return normalizeComparison(
      decodeURIComponent(raw)
    );
  }
  catch {
    return normalizeComparison(raw);
  }
}

function targetSlugs(
  urls:
    readonly string[]
): Set<string> {
  const output =
    new Set<string>();

  for (const url of urls) {
    const slug =
      pathSlug(url);

    if (slug) {
      output.add(slug);
    }
  }

  return output;
}

function looksUrlLike(
  raw: string
): boolean {
  const text =
    raw.trim();

  return (
    /^https?:\/\//i.test(text) ||
    text.startsWith("/") ||
    text.startsWith("./") ||
    text.startsWith("../")
  );
}

function canonicalSampleUrl(
  raw:
    string | null,
  baseUrl:
    string | null
): string | null {
  if (
    !raw ||
    !baseUrl ||
    !looksUrlLike(raw)
  ) {
    return null;
  }

  return canonicalizeUrl(
    raw,
    baseUrl
  );
}

function candidateTimestamps(
  snapshot:
    NetworkObserverSnapshot,
  candidate:
    StoredApiCandidate
): string[] {
  const output =
    new Set<string>();

  for (
    const response
    of snapshot.responses
  ) {
    if (
      response.url ===
        candidate.responseUrl &&
      response.status ===
        candidate.status
    ) {
      output.add(
        response.timestamp
      );
    }
  }

  return Array.from(output);
}

function correlationFor(
  candidate:
    StoredApiCandidate,
  hints:
    NetworkFactHints,
  targets:
    readonly string[],
  ids:
    ReadonlySet<string>,
  slugs:
    ReadonlySet<string>
): NetworkFactCorrelation {
  let score =
    0;

  const reasons:
    NetworkFactCorrelationReason[] =
      [];

  const canonicalResponse =
    canonicalizeUrl(
      candidate.responseUrl
    );

  if (
    canonicalResponse &&
    targets.includes(
      canonicalResponse
    )
  ) {
    score += 35;

    reasons.push(
      "RESPONSE_URL_MATCH"
    );
  }

  if (
    hints.canonicalUrl &&
    targets.includes(
      hints.canonicalUrl
    )
  ) {
    score += 80;

    reasons.push(
      "SAMPLE_URL_MATCH"
    );
  }

  if (hints.productId) {
    const normalizedId =
      normalizeComparison(
        hints.productId
      );

    if (
      ids.has(
        normalizedId
      )
    ) {
      score += 65;

      reasons.push(
        "PRODUCT_ID_MATCH"
      );
    }
  }

  const slugCandidates =
    new Set<string>();

  if (hints.slug) {
    slugCandidates.add(
      normalizeComparison(
        hints.slug
      )
    );
  }

  if (hints.canonicalUrl) {
    const urlSlug =
      pathSlug(
        hints.canonicalUrl
      );

    if (urlSlug) {
      slugCandidates.add(
        urlSlug
      );
    }
  }

  for (
    const slug
    of slugCandidates
  ) {
    if (slugs.has(slug)) {
      score += 45;

      reasons.push(
        "SLUG_MATCH"
      );

      break;
    }
  }

  return {
    score:
      Math.min(
        score,
        100
      ),

    reasons:
      Array.from(
        new Set(reasons)
      )
  };
}

function buildHints(
  sample:
    Record<string, unknown> | null,
  baseUrl:
    string | null
): NetworkFactHints {
  if (!sample) {
    return {
      productId: null,
      name: null,
      rawUrl: null,
      canonicalUrl: null,
      slug: null
    };
  }

  const record =
    normalizedRecord(sample);

  const productId =
    firstScalar(
      record,
      SAMPLE_ID_KEYS
    );

  const name =
    firstScalar(
      record,
      SAMPLE_NAME_KEYS
    );

  const rawUrl =
    firstScalar(
      record,
      SAMPLE_URL_KEYS
    );

  let slug =
    firstScalar(
      record,
      SAMPLE_SLUG_KEYS
    );

  const canonicalUrl =
    canonicalSampleUrl(
      rawUrl,
      baseUrl
    );

  if (
    !slug &&
    rawUrl &&
    !looksUrlLike(rawUrl)
  ) {
    slug =
      rawUrl;
  }

  return {
    productId,
    name,
    rawUrl,
    canonicalUrl,
    slug
  };
}

function factsForCandidate(
  candidate:
    StoredApiCandidate,
  snapshot:
    NetworkObserverSnapshot,
  targets:
    readonly string[],
  ids:
    ReadonlySet<string>,
  slugs:
    ReadonlySet<string>,
  baseUrl:
    string | null
): NetworkFact[] {
  const timestamps =
    candidateTimestamps(
      snapshot,
      candidate
    );

  const samples =
    candidate.sample.length > 0
      ? candidate.sample
      : [null];

  return samples.map(
    (
      sample,
      index
    ): NetworkFact => {
      const copiedSample =
        sample
          ? { ...sample }
          : null;

      const hints =
        buildHints(
          copiedSample,
          baseUrl
        );

      return {
        source:
          "NETWORK_API",

        responseUrl:
          candidate.responseUrl,

        method:
          candidate.method,

        status:
          candidate.status,

        contentType:
          candidate.contentType,

        responseTimestamps:
          [...timestamps],

        candidatePath:
          candidate.path,

        candidateScore:
          candidate.score,

        itemCount:
          candidate.itemCount,

        seenCount:
          candidate.seenCount,

        commonKeys:
          [...candidate.commonKeys],

        signalKeys:
          [...candidate.signalKeys],

        sampleIndex:
          sample
            ? index
            : null,

        sample:
          copiedSample,

        hints,

        correlation:
          correlationFor(
            candidate,
            hints,
            targets,
            ids,
            slugs
          )
      };
    }
  );
}

/**
 * Convert already-guarded NetworkObserver API candidates
 * into replayable raw facts with provenance.
 *
 * This function does not decide product entity, offer type,
 * condition, price, stock or any other business truth.
 */
export function extractNetworkFacts(
  acquisition:
    AcquisitionNetworkInput
): NetworkFact[] {
  const targets =
    canonicalTargets(
      acquisition
    );

  const ids =
    targetIds(
      targets
    );

  const slugs =
    targetSlugs(
      targets
    );

  const baseUrl =
    acquisition.finalUrl ||
    acquisition.canonicalUrl ||
    acquisition.requestedUrl ||
    null;

  const output:
    NetworkFact[] = [];

  for (
    const candidate
    of acquisition
      .networkSnapshot
      .apiCandidates
  ) {
    output.push(
      ...factsForCandidate(
        candidate,
        acquisition.networkSnapshot,
        targets,
        ids,
        slugs,
        baseUrl
      )
    );
  }

  return output;
}