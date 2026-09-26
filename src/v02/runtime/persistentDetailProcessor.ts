import type {
  AcquisitionError,
  DetailAcquisitionResult
} from "../extraction/detailAcquisitionTypes.js";

import {
  extractRawProductFactsFromAcquisition
} from "../extraction/detailRawProductExtractor.js";

import {
  OFFLINE_REPLAY_SCHEMA_VERSION,
  createOfflineReplaySnapshot,
  parseOfflineReplaySnapshot,
  serializeOfflineReplaySnapshot
} from "../extraction/offlineReplaySnapshot.js";

import {
  processRawProductFacts,
  type PipelineResult
} from "../pipeline/productPipeline.js";

import {
  SQLiteRunStore
} from "../storage/sqliteRunStore.js";

import {
  SQLiteIntelligenceAuditStore
} from "../storage/sqliteIntelligenceAuditStore.js";

import {
  SQLiteCacheStore
} from "../storage/sqliteCacheStore.js";

import type {
  RawFactsRecord
} from "../storage/runStore.js";

import {
  buildPersistProductAuditInput,
  replaySnapshotContentHash,
  type PersistentPipelineVersions,
  type PipelineSiteMode
} from "./persistentPipelineBridge.js";


import {
  crashIfRequested
} from "./crashInjection.js";


const DEFAULT_DETAIL_CACHE_TTL_MS =
  15 * 60 * 1000;


const DETAIL_CACHE_SCOPE =
  "detail-acquisition:" +
  OFFLINE_REPLAY_SCHEMA_VERSION;


export type DetailAcquirer =
  () =>
    Promise<
      DetailAcquisitionResult
    >;


export interface PersistentDetailProcessorOptions {
  siteMode?:
    PipelineSiteMode;

  versions:
    PersistentPipelineVersions;

  timeoutMs?:
    number;

  cacheTtlMs?:
    number;

  now?:
    () => string;
}


export interface PersistentDetailProcessOptions {
  /*
   * The production CLI only allows --fresh for NEW runs.
   * This flag therefore bypasses both run-local replay
   * and reusable persistent cache facts.
   */
  fresh?:
    boolean;
}


export interface PersistentDetailProcessResult {
  source:
    | "LIVE"
    | "REPLAY";

  result:
    PipelineResult;

  contentHash:
    string;
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


function errorClass(
  error:
    unknown
): string {
  if (
    error instanceof Error &&
    error.name.trim()
  ) {
    return error.name.trim();
  }

  return "Error";
}


function errorMessage(
  error:
    unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  const normalized =
    String(
      error
    ).trim();

  return normalized ||
    "Unknown detail acquisition failure.";
}


function validDuration(
  value:
    number
): number {
  if (
    !Number.isFinite(
      value
    ) ||
    value < 0
  ) {
    throw new Error(
      `Invalid acquisition durationMs: ${value}`
    );
  }

  return Math.round(
    value
  );
}


function latestCompatibleFacts(
  rows:
    readonly RawFactsRecord[]
): RawFactsRecord | null {
  let selected:
    RawFactsRecord |
    null =
      null;

  for (
    const row
    of rows
  ) {
    if (
      row.extractorVersion !==
      OFFLINE_REPLAY_SCHEMA_VERSION
    ) {
      continue;
    }

    if (
      selected ===
        null ||
      row.rawFactId >
        selected.rawFactId
    ) {
      selected =
        row;
    }
  }

  return selected;
}


/**
 * Persistent boundary between product lifecycle and detail acquisition.
 *
 * Caller responsibilities:
 * - RunCoordinator.beginProduct() before process();
 * - append/terminalize technical ERROR when process() rejects;
 * - terminalize ACCEPT/REVIEW/EXCLUDE after successful result.
 *
 * Processor responsibilities:
 * - reuse compatible run-local replay facts;
 * - persist live detail attempt + replay facts atomically at fetch finish;
 * - rerun deterministic product pipeline from facts;
 * - persist versioned intelligence/audit;
 * - never decide product lifecycle state itself.
 */
/**
 * Structured acquisition failures are returned by collectBrowserDetail()
 * rather than necessarily being thrown.
 *
 * Keep the original technical metadata available to the orchestration
 * layer so Phase 10 can write an accurate ERROR ledger.
 */
export class DetailAcquisitionFailure
extends Error {

  readonly stage:
    AcquisitionError["stage"];

  readonly code:
    string;

  readonly retriable:
    boolean;

  readonly status:
    number |
    null;


  constructor(
    failure:
      AcquisitionError
  ) {
    super(
      failure.message
    );

    this.name =
      "DetailAcquisitionFailure";

    this.stage =
      failure.stage;

    this.code =
      failure.code;

    this.retriable =
      failure.retriable;

    this.status =
      failure.status;
  }
}


function primaryAcquisitionError(
  errors:
    readonly AcquisitionError[]
): AcquisitionError | null {
  /*
   * Permanent failure dominates a retriable/partial failure.
   * This prevents a 404/410 from being hidden behind an earlier
   * settle/network warning.
   */
  for (
    const error
    of errors
  ) {
    if (
      !error.retriable
    ) {
      return error;
    }
  }


  return errors.length >
    0
      ? errors[0]!
      : null;
}


function failedAcquisitionDuration(
  acquisition:
    DetailAcquisitionResult |
    null
): number {
  if (
    acquisition ===
    null
  ) {
    return 0;
  }


  const value =
    acquisition.timing.totalMs;


  if (
    !Number.isFinite(
      value
    ) ||
    value < 0
  ) {
    return 0;
  }


  return Math.round(
    value
  );
}


function failedAcquisitionFinalUrl(
  acquisition:
    DetailAcquisitionResult |
    null
): string | null {
  if (
    acquisition ===
    null
  ) {
    return null;
  }


  const finalUrl =
    acquisition.finalUrl.trim();

  if (finalUrl) {
    return finalUrl;
  }


  const canonicalUrl =
    acquisition.canonicalUrl.trim();

  return canonicalUrl ||
    null;
}


function normalizedCacheUrl(
  raw:
    string
): string | null {
  try {
    const url =
      new URL(
        raw
      );

    url.hash =
      "";

    return url.toString();
  }
  catch {
    return null;
  }
}


function cacheableNavigationStatus(
  acquisition:
    DetailAcquisitionResult
): number | null {
  const targets =
    new Set<
      string
    >();


  for (
    const raw
    of [
      acquisition.requestedUrl,
      acquisition.finalUrl,
      acquisition.canonicalUrl
    ]
  ) {
    const normalized =
      normalizedCacheUrl(
        raw
      );

    if (
      normalized !==
        null
    ) {
      targets.add(
        normalized
      );
    }
  }


  for (
    let index =
      acquisition.networkSnapshot.responses.length -
      1;
    index >=
      0;
    index -=
      1
  ) {
    const response =
      acquisition.networkSnapshot.responses[
        index
      ]!;


    if (
      response.resourceType !==
        "document"
    ) {
      continue;
    }


    const normalized =
      normalizedCacheUrl(
        response.url
      );


    if (
      normalized ===
        null ||
      !targets.has(
        normalized
      )
    ) {
      continue;
    }


    if (
      Number.isInteger(
        response.status
      ) &&
      response.status >=
        200 &&
      response.status <=
        299
    ) {
      return response.status;
    }
  }


  return null;
}


export class PersistentDetailProcessor {

  private readonly runStore:
    SQLiteRunStore;

  private readonly auditStore:
    SQLiteIntelligenceAuditStore;

  private readonly cacheStore:
    SQLiteCacheStore;

  private readonly cacheTtlMs:
    number;

  private readonly runId:
    string;

  private readonly siteMode:
    PipelineSiteMode;

  private readonly versions:
    PersistentPipelineVersions;

  private readonly now:
    () => string;

  private closed =
    false;


  constructor(
    databasePath:
      string,
    rawRunId:
      string,
    options:
      PersistentDetailProcessorOptions
  ) {
    const path =
      requiredText(
        databasePath,
        "databasePath"
      );

    this.runId =
      requiredText(
        rawRunId,
        "runId"
      );

    this.siteMode =
      options.siteMode ??
      "UNKNOWN";

    this.versions = {
      classifierVersion:
        requiredText(
          options.versions.classifierVersion,
          "classifierVersion"
        ),

      resolverVersion:
        requiredText(
          options.versions.resolverVersion,
          "resolverVersion"
        ),

      auditVersion:
        requiredText(
          options.versions.auditVersion,
          "auditVersion"
        )
    };

    this.now =
      options.now ??
      (() =>
        new Date()
          .toISOString()
      );


    const cacheTtlMs =
      options.cacheTtlMs ??
      DEFAULT_DETAIL_CACHE_TTL_MS;


    if (
      !Number.isInteger(
        cacheTtlMs
      ) ||
      cacheTtlMs <=
        0
    ) {
      throw new Error(
        "cacheTtlMs must be a positive integer."
      );
    }


    this.cacheTtlMs =
      cacheTtlMs;


    this.runStore =
      new SQLiteRunStore(
        path,
        {
          timeoutMs:
            options.timeoutMs,

          now:
            this.now
        }
      );


    try {
      this.auditStore =
        new SQLiteIntelligenceAuditStore(
          path,
          {
            timeoutMs:
              options.timeoutMs,

            now:
              this.now
          }
        );
    }
    catch (error) {
      this.runStore.close();

      throw error;
    }


    try {
      this.cacheStore =
        new SQLiteCacheStore(
          path,
          {
            timeoutMs:
              options.timeoutMs,

            now:
              this.now
          }
        );
    }
    catch (error) {
      try {
        this.auditStore.close();
      }
      catch {
        /*
         * Preserve the cache-construction error.
         */
      }

      try {
        this.runStore.close();
      }
      catch {
        /*
         * Preserve the cache-construction error.
         */
      }

      throw error;
    }
  }


  private ensureOpen():
    void {
    if (
      this.closed
    ) {
      throw new Error(
        "PersistentDetailProcessor is closed."
      );
    }
  }


  private detailCacheKey(
    canonicalUrl:
      string
  ) {
    return {
      kind:
        "HTTP_RAW" as const,

      canonicalRequest:
        canonicalUrl,

      relevantHeaders:
        {},

      scope:
        DETAIL_CACHE_SCOPE
    };
  }


  private loadCachedReplay(
    canonicalUrl:
      string
  ) {
    try {
      const cached =
        this.cacheStore.getRaw(
          this.detailCacheKey(
            canonicalUrl
          )
        );


      if (
        cached ===
          null
      ) {
        return null;
      }


      if (
        cached.statusCode ===
          null ||
        cached.statusCode <
          200 ||
        cached.statusCode >
          299
      ) {
        return null;
      }


      const snapshot =
        parseOfflineReplaySnapshot(
          cached.payloadJson
        );


      return {
        cached,
        snapshot
      };
    }
    catch {
      /*
       * Cache must never become business truth.
       *
       * A bad cache entry therefore degrades to a live acquisition
       * instead of changing classifier/resolver/validator behavior.
       */
      return null;
    }
  }


  private cacheSuccessfulReplay(
    canonicalUrl:
      string,
    acquisition:
      DetailAcquisitionResult,
    payloadJson:
      string
  ): void {
    const statusCode =
      cacheableNavigationStatus(
        acquisition
      );


    if (
      statusCode ===
        null
    ) {
      return;
    }


    try {
      this.cacheStore.putRawSuccess({
        ...this.detailCacheKey(
          canonicalUrl
        ),

        statusCode,

        /*
         * Production collector uses a fresh anonymous
         * BrowserContext. Authenticated cache scopes must be
         * introduced explicitly if that architecture changes.
         */
        authSensitive:
          false,

        ttlMs:
          this.cacheTtlMs,

        payloadJson
      });
    }
    catch {
      /*
       * Reusable cache is an optimization only.
       * Durable run facts remain authoritative.
       */
    }
  }


  private persistAuditIfNeeded(
    canonicalUrl:
      string,
    contentHash:
      string,
    result:
      PipelineResult
  ): void {
    const existing =
      this.auditStore.getProductAudit(
        this.runId,
        canonicalUrl,
        this.versions.auditVersion
      );


    if (existing) {
      if (
        existing.contentHash !==
          contentHash ||
        existing.classifierVersion !==
          this.versions.classifierVersion ||
        existing.resolverVersion !==
          this.versions.resolverVersion
      ) {
        throw new Error(
          [
            "Persistent audit version collision.",
            `run=${this.runId}`,
            `url=${canonicalUrl}`,
            `auditVersion=${this.versions.auditVersion}`
          ].join(
            " "
          )
        );
      }

      return;
    }


    this.auditStore.persistProductAudit(
      buildPersistProductAuditInput(
        result,
        this.runId,
        canonicalUrl,
        contentHash,
        this.versions
      )
    );
  }


  private replay(
    canonicalUrl:
      string,
    raw:
      RawFactsRecord
  ): PersistentDetailProcessResult {
    const actualHash =
      replaySnapshotContentHash(
        raw.factsJson
      );


    if (
      actualHash !==
      raw.contentHash
    ) {
      throw new Error(
        [
          "Persistent replay content hash mismatch.",
          `run=${this.runId}`,
          `url=${canonicalUrl}`,
          `stored=${raw.contentHash}`,
          `actual=${actualHash}`
        ].join(
          " "
        )
      );
    }


    let snapshot;

    try {
      snapshot =
        parseOfflineReplaySnapshot(
          raw.factsJson
        );
    }
    catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : String(
              error
            );

      throw new Error(
        `Persistent replay snapshot invariant failed for ${canonicalUrl}: ${detail}`
      );
    }


    const result =
      processRawProductFacts(
        snapshot.facts,
        this.siteMode
      );


    this.persistAuditIfNeeded(
      canonicalUrl,
      raw.contentHash,
      result
    );


    return {
      source:
        "REPLAY",

      result,

      contentHash:
        raw.contentHash
    };
  }


  async process(
    rawCanonicalUrl:
      string,
    acquire:
      DetailAcquirer,
    options:
      PersistentDetailProcessOptions = {}
  ): Promise<
    PersistentDetailProcessResult
  > {
    this.ensureOpen();


    const canonicalUrl =
      requiredText(
        rawCanonicalUrl,
        "canonicalUrl"
      );


    if (
      options.fresh !==
      true
    ) {
      const reusable =
        latestCompatibleFacts(
          this.runStore.listRawFacts(
            this.runId,
            canonicalUrl
          )
        );

      if (reusable) {
        return this.replay(
          canonicalUrl,
          reusable
        );
      }


      const cachedReplay =
        this.loadCachedReplay(
          canonicalUrl
        );


      if (
        cachedReplay !==
          null
      ) {
        const payloadJson =
          cachedReplay.cached
            .payloadJson;

        const contentHash =
          replaySnapshotContentHash(
            payloadJson
          );

        const cachedFinalUrl =
          cachedReplay.snapshot
            .acquisition
            .finalUrl
            .trim() ||
          cachedReplay.snapshot
            .acquisition
            .canonicalUrl
            .trim() ||
          canonicalUrl;


        this.runStore.startDetailFetch(
          this.runId,
          canonicalUrl
        );


        this.runStore.finishDetailFetch(
          this.runId,
          canonicalUrl,
          {
            status:
              "SUCCEEDED",

            finalUrl:
              cachedFinalUrl,

            httpStatus:
              cachedReplay.cached
                .statusCode,

            durationMs:
              0,

            errorClass:
              null,

            errorMessage:
              null,

            contentHash,

            snapshotPath:
              null,

            rawFacts: {
              contentHash,

              extractorVersion:
                OFFLINE_REPLAY_SCHEMA_VERSION,

              factsJson:
                payloadJson,

              snapshotPath:
                null
            }
          }
        );


        crashIfRequested(
          "AFTER_RAW_FACTS_PERSISTED",
          {
            runId:
              this.runId,

            url:
              canonicalUrl
          }
        );


        const result =
          processRawProductFacts(
            cachedReplay.snapshot
              .facts,
            this.siteMode
          );


        this.persistAuditIfNeeded(
          canonicalUrl,
          contentHash,
          result
        );


        return {
          source:
            "REPLAY",

          result,

          contentHash
        };
      }
    }


    this.runStore.startDetailFetch(
      this.runId,
      canonicalUrl
    );


    let fetchFinished =
      false;

    let acquisitionResult:
      DetailAcquisitionResult |
      null =
        null;


    try {
      /*
       * No SQLite transaction is open while acquisition performs
       * browser/network work.
       */
      acquisitionResult =
        await acquire();


      const structuredFailure =
        primaryAcquisitionError(
          acquisitionResult.errors
        );


      if (
        structuredFailure !==
        null
      ) {
        throw new DetailAcquisitionFailure(
          structuredFailure
        );
      }


      const acquisition =
        acquisitionResult;


      const facts =
        extractRawProductFactsFromAcquisition(
          acquisition
        );


      const snapshot =
        createOfflineReplaySnapshot(
          acquisition,
          facts,
          {
            capturedAt:
              requiredText(
                this.now(),
                "now()"
              )
          }
        );


      const serialized =
        serializeOfflineReplaySnapshot(
          snapshot
        );


      /*
       * Integrity must cover the exact representation crossing the
       * persistence boundary.
       *
       * Offline replay serialization deliberately permits outer JSON
       * whitespace. Normalize that non-semantic whitespace once before
       * BOTH hashing and persistence so close/reopen/resume remains
       * byte-stable without weakening corruption detection.
       */
      const persistedReplayJson =
        serialized.trim();


      const contentHash =
        replaySnapshotContentHash(
          persistedReplayJson
        );


      const finalUrl =
        acquisition.finalUrl.trim() ||
        acquisition.canonicalUrl.trim() ||
        canonicalUrl;


      this.runStore.finishDetailFetch(
        this.runId,
        canonicalUrl,
        {
          status:
            "SUCCEEDED",

          finalUrl,

          /*
           * DetailAcquisitionResult currently does not expose the
           * navigation response status as a top-level field.
           */
          httpStatus:
            null,

          durationMs:
            validDuration(
              acquisition.timing.totalMs
            ),

          errorClass:
            null,

          errorMessage:
            null,

          contentHash,

          snapshotPath:
            null,

          rawFacts: {
            contentHash,

            extractorVersion:
              OFFLINE_REPLAY_SCHEMA_VERSION,

            factsJson:
              persistedReplayJson,

            snapshotPath:
              null
          }
        }
      );


      fetchFinished =
        true;

      crashIfRequested(
        "AFTER_RAW_FACTS_PERSISTED",
        {
          runId:
            this.runId,

          url:
            canonicalUrl
        }
      );


      this.cacheSuccessfulReplay(
        canonicalUrl,
        acquisition,
        persistedReplayJson
      );


      const result =
        processRawProductFacts(
          facts,
          this.siteMode
        );


      this.persistAuditIfNeeded(
        canonicalUrl,
        contentHash,
        result
      );


      return {
        source:
          "LIVE",

        result,

        contentHash
      };
    }
    catch (error) {
      /*
       * Only an unfinished acquisition attempt becomes FAILED.
       *
       * If raw facts were already committed and the downstream
       * pipeline/audit failed, keep the SUCCEEDED fetch + facts.
       * Resume can then replay them without another browser fetch.
       */
      if (
        !fetchFinished
      ) {
        try {
          this.runStore.finishDetailFetch(
            this.runId,
            canonicalUrl,
            {
              status:
                "FAILED",

              finalUrl:
                failedAcquisitionFinalUrl(
                  acquisitionResult
                ),

              httpStatus:
                error instanceof
                  DetailAcquisitionFailure
                  ? error.status
                  : null,

              durationMs:
                failedAcquisitionDuration(
                  acquisitionResult
                ),

              errorClass:
                error instanceof
                  DetailAcquisitionFailure
                  ? error.code
                  : errorClass(
                      error
                    ),

              errorMessage:
                errorMessage(
                  error
                ),

              contentHash:
                null,

              snapshotPath:
                null,

              rawFacts:
                null
            }
          );
        }
        catch (persistenceError) {
          throw new AggregateError(
            [
              error,
              persistenceError
            ],
            `Detail acquisition failed and FAILED-attempt persistence also failed for ${canonicalUrl}.`
          );
        }
      }

      throw error;
    }
  }


  close():
    void {
    if (
      this.closed
    ) {
      return;
    }


    let firstError:
      unknown =
        null;


    try {
      this.cacheStore.close();
    }
    catch (error) {
      firstError =
        error;
    }


    try {
      this.auditStore.close();
    }
    catch (error) {
      if (
        firstError ===
          null
      ) {
        firstError =
          error;
      }
    }


    try {
      this.runStore.close();
    }
    catch (error) {
      if (
        firstError ===
        null
      ) {
        firstError =
          error;
      }
    }


    this.closed =
      true;


    if (
      firstError !==
      null
    ) {
      throw firstError;
    }
  }
}