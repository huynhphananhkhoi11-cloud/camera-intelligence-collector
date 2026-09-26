import {
  createHash
} from "node:crypto";


export type RawCacheKind =
  | "HTTP_RAW"
  | "API_RAW";


export type OfflineCacheKind =
  | "DETAIL_SNAPSHOT"
  | "RAW_FACTS"
  | "CLASSIFICATION"
  | "RESOLVED_FIELDS";


export type CacheKind =
  | RawCacheKind
  | OfflineCacheKind;


export interface RawCacheKeyInput {
  kind:
    RawCacheKind;

  canonicalRequest:
    string;

  relevantHeaders:
    Readonly<
      Record<
        string,
        string
      >
    >;

  scope:
    string;
}


export interface PutRawCacheInput
extends RawCacheKeyInput {
  payloadJson: string;

  statusCode: number;

  ttlMs: number;

  authSensitive: boolean;
}


export interface OfflineCacheKeyInput {
  kind:
    OfflineCacheKind;

  canonicalUrl:
    string |
    null;

  contentHash: string;

  versionKey: string;

  configHash:
    string |
    null;

  contractVersion:
    string |
    null;
}


export interface PutOfflineCacheInput
extends OfflineCacheKeyInput {
  payloadJson: string;
}


export interface CacheEntryRecord {
  cacheKey: string;

  kind:
    CacheKind;

  canonicalUrl:
    string |
    null;

  scope: string;

  contentHash:
    string |
    null;

  versionKey: string;

  configHash:
    string |
    null;

  contractVersion:
    string |
    null;

  statusCode:
    number |
    null;

  payloadJson: string;

  createdAt: string;

  expiresAt:
    string |
    null;
}


export type RawCacheWriteResult =
  | {
      stored: true;

      cacheKey: string;
    }
  | {
      stored: false;

      reason:
        | "AUTH_SENSITIVE"
        | "NON_SUCCESS_STATUS";
    };


export interface CacheReadOptions {
  /*
   * Phase 10H semantic equivalent of CLI --fresh.
   * 10I will wire the actual command-line flag.
   */
  fresh?:
    boolean;
}


function requiredText(
  value:
    string,
  label:
    string
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${label} must not be blank.`
    );
  }

  return normalized;
}


function normalizedHeaders(
  headers:
    Readonly<
      Record<
        string,
        string
      >
    >
): Array<
  readonly [
    string,
    string
  ]
> {
  const normalized =
    new Map<
      string,
      string
    >();

  for (
    const [
      rawName,
      rawValue
    ]
    of Object.entries(
      headers
    )
  ) {
    const name =
      requiredText(
        rawName,
        "header name"
      )
        .toLowerCase();

    const value =
      rawValue.trim();

    normalized.set(
      name,
      value
    );
  }

  return Array.from(
    normalized.entries()
  ).sort(
    (
      left,
      right
    ) =>
      left[0].localeCompare(
        right[0]
      )
  );
}


function sha256(
  value:
    string
): string {
  return createHash(
    "sha256"
  )
    .update(
      value,
      "utf8"
    )
    .digest(
      "hex"
    );
}


export function rawCacheKey(
  input:
    RawCacheKeyInput
): string {
  return sha256(
    JSON.stringify({
      kind:
        input.kind,

      canonicalRequest:
        requiredText(
          input.canonicalRequest,
          "canonicalRequest"
        ),

      relevantHeaders:
        normalizedHeaders(
          input.relevantHeaders
        ),

      scope:
        requiredText(
          input.scope,
          "scope"
        )
    })
  );
}


export function offlineCacheKey(
  input:
    OfflineCacheKeyInput
): string {
  return sha256(
    JSON.stringify({
      kind:
        input.kind,

      canonicalUrl:
        input.canonicalUrl ===
        null
          ? null
          : requiredText(
              input.canonicalUrl,
              "canonicalUrl"
            ),

      contentHash:
        requiredText(
          input.contentHash,
          "contentHash"
        ),

      versionKey:
        requiredText(
          input.versionKey,
          "versionKey"
        ),

      configHash:
        input.configHash ===
        null
          ? null
          : requiredText(
              input.configHash,
              "configHash"
            ),

      contractVersion:
        input.contractVersion ===
        null
          ? null
          : requiredText(
              input.contractVersion,
              "contractVersion"
            )
    })
  );
}


export interface CacheStore {
  putRawSuccess(
    input:
      PutRawCacheInput
  ): RawCacheWriteResult;

  getRaw(
    input:
      RawCacheKeyInput,
    options?:
      CacheReadOptions
  ): CacheEntryRecord | null;

  putOffline(
    input:
      PutOfflineCacheInput
  ): CacheEntryRecord;

  getOffline(
    input:
      OfflineCacheKeyInput,
    options?:
      CacheReadOptions
  ): CacheEntryRecord | null;

  close(): void;
}