import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";

import {
  dirname
} from "node:path";

import type {
  RawProductFacts
} from "../rawProductExtractor.js";

import type {
  AcquisitionError,
  DetailAcquisitionResult,
  DetailAcquisitionTiming,
  InteractionEvent
} from "./detailAcquisitionTypes.js";

export const OFFLINE_REPLAY_SCHEMA_VERSION =
  "camera-intelligence.raw-product-facts.v1";

export interface OfflineReplayAcquisitionSummary {
  requestedUrl: string;

  finalUrl: string;

  canonicalUrl: string;

  interactions:
    InteractionEvent[];

  timing:
    DetailAcquisitionTiming;

  errors:
    AcquisitionError[];
}

export interface OfflineReplaySnapshot {
  schemaVersion:
    typeof OFFLINE_REPLAY_SCHEMA_VERSION;

  capturedAt: string;

  acquisition:
    OfflineReplayAcquisitionSummary;

  facts:
    RawProductFacts;
}

export interface CreateOfflineReplaySnapshotOptions {
  capturedAt?: string;
}

function cloneJsonValue<T>(
  value: T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requireString(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `Invalid offline replay snapshot: ${label} must be a string.`
    );
  }

  return value;
}

function requireArray(
  value: unknown,
  label: string
): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid offline replay snapshot: ${label} must be an array.`
    );
  }

  return value;
}

function requireObject(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(
      `Invalid offline replay snapshot: ${label} must be an object.`
    );
  }

  return value;
}

function validateFactsShape(
  value: unknown
): RawProductFacts {
  const facts =
    requireObject(
      value,
      "facts"
    );

  requireString(
    facts.url,
    "facts.url"
  );

  requireString(
    facts.title,
    "facts.title"
  );

  requireArray(
    facts.breadcrumbs,
    "facts.breadcrumbs"
  );

  requireArray(
    facts.jsonLd,
    "facts.jsonLd"
  );

  requireArray(
    facts.visiblePriceTexts,
    "facts.visiblePriceTexts"
  );

  requireArray(
    facts.buttons,
    "facts.buttons"
  );

  requireArray(
    facts.sections,
    "facts.sections"
  );

  requireArray(
    facts.ratingTexts,
    "facts.ratingTexts"
  );

  requireArray(
    facts.stockTexts,
    "facts.stockTexts"
  );

  requireArray(
    facts.networkFacts,
    "facts.networkFacts"
  );

  requireString(
    facts.listingCategory,
    "facts.listingCategory"
  );

  requireString(
    facts.listingPriceText,
    "facts.listingPriceText"
  );

  requireString(
    facts.pageText,
    "facts.pageText"
  );

  return facts as unknown as RawProductFacts;
}

function validateAcquisitionShape(
  value: unknown
): OfflineReplayAcquisitionSummary {
  const acquisition =
    requireObject(
      value,
      "acquisition"
    );

  const timing =
    requireObject(
      acquisition.timing,
      "acquisition.timing"
    );

  for (
    const key
    of [
      "navigationMs",
      "settleMs",
      "interactionMs",
      "totalMs"
    ]
  ) {
    const timingValue =
      timing[key];

    if (
      typeof timingValue !==
        "number" ||
      !Number.isFinite(
        timingValue
      ) ||
      timingValue < 0
    ) {
      throw new Error(
        `Invalid offline replay snapshot: acquisition.timing.${key} must be a finite non-negative number.`
      );
    }
  }

  return {
    requestedUrl:
      requireString(
        acquisition.requestedUrl,
        "acquisition.requestedUrl"
      ),

    finalUrl:
      requireString(
        acquisition.finalUrl,
        "acquisition.finalUrl"
      ),

    canonicalUrl:
      requireString(
        acquisition.canonicalUrl,
        "acquisition.canonicalUrl"
      ),

    interactions:
      requireArray(
        acquisition.interactions,
        "acquisition.interactions"
      ) as InteractionEvent[],

    timing:
      timing as unknown as DetailAcquisitionTiming,

    errors:
      requireArray(
        acquisition.errors,
        "acquisition.errors"
      ) as AcquisitionError[]
  };
}

/**
 * Create the durable offline representation used to rerun
 * classifiers/resolvers without opening the product website.
 *
 * Rendered HTML and the full NetworkObserver snapshot are not
 * persisted here because their normalized evidence has already
 * been transferred into RawProductFacts.
 */
export function createOfflineReplaySnapshot(
  acquisition:
    Pick<
      DetailAcquisitionResult,
      | "requestedUrl"
      | "finalUrl"
      | "canonicalUrl"
      | "interactions"
      | "timing"
      | "errors"
    >,
  facts:
    RawProductFacts,
  options:
    CreateOfflineReplaySnapshotOptions = {}
): OfflineReplaySnapshot {
  const capturedAt =
    options.capturedAt ||
    new Date().toISOString();

  return cloneJsonValue({
    schemaVersion:
      OFFLINE_REPLAY_SCHEMA_VERSION,

    capturedAt,

    acquisition: {
      requestedUrl:
        acquisition.requestedUrl,

      finalUrl:
        acquisition.finalUrl,

      canonicalUrl:
        acquisition.canonicalUrl,

      interactions:
        acquisition.interactions,

      timing:
        acquisition.timing,

      errors:
        acquisition.errors
    },

    facts
  });
}

export function serializeOfflineReplaySnapshot(
  snapshot:
    OfflineReplaySnapshot
): string {
  return (
    JSON.stringify(
      snapshot,
      null,
      2
    ) +
    "\n"
  );
}

export function parseOfflineReplaySnapshot(
  text: string
): OfflineReplaySnapshot {
  let raw:
    unknown;

  try {
    raw =
      JSON.parse(text);
  }
  catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : String(error);

    throw new Error(
      `Invalid offline replay snapshot JSON: ${detail}`
    );
  }

  const root =
    requireObject(
      raw,
      "root"
    );

  if (
    root.schemaVersion !==
      OFFLINE_REPLAY_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported offline replay snapshot schemaVersion: ${String(root.schemaVersion)}`
    );
  }

  const capturedAt =
    requireString(
      root.capturedAt,
      "capturedAt"
    );

  if (
    Number.isNaN(
      Date.parse(
        capturedAt
      )
    )
  ) {
    throw new Error(
      "Invalid offline replay snapshot: capturedAt must be an ISO-compatible timestamp."
    );
  }

  const acquisition =
    validateAcquisitionShape(
      root.acquisition
    );

  const facts =
    validateFactsShape(
      root.facts
    );

  return cloneJsonValue({
    schemaVersion:
      OFFLINE_REPLAY_SCHEMA_VERSION,

    capturedAt,

    acquisition,

    facts
  });
}

export async function writeOfflineReplaySnapshot(
  filePath: string,
  snapshot:
    OfflineReplaySnapshot
): Promise<void> {
  await mkdir(
    dirname(
      filePath
    ),
    {
      recursive: true
    }
  );

  await writeFile(
    filePath,
    serializeOfflineReplaySnapshot(
      snapshot
    ),
    "utf8"
  );
}

export async function readOfflineReplaySnapshot(
  filePath: string
): Promise<OfflineReplaySnapshot> {
  const text =
    await readFile(
      filePath,
      "utf8"
    );

  return parseOfflineReplaySnapshot(
    text
  );
}