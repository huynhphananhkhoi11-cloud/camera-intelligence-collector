import type {
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

import type {
  RawFactsRecord
} from "../storage/runStore.js";

import {
  buildPersistProductAuditInput,
  replaySnapshotContentHash,
  type PersistentPipelineVersions,
  type PipelineSiteMode
} from "./persistentPipelineBridge.js";


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

  now?:
    () => string;
}


export interface PersistentDetailProcessOptions {
  /*
   * The production CLI only allows --fresh for NEW runs.
   * This flag therefore means "do not reuse run-local replay facts".
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
export class PersistentDetailProcessor {

  private readonly runStore:
    SQLiteRunStore;

  private readonly auditStore:
    SQLiteIntelligenceAuditStore;

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
    }


    this.runStore.startDetailFetch(
      this.runId,
      canonicalUrl
    );


    let fetchFinished =
      false;


    try {
      /*
       * No SQLite transaction is open while acquisition performs
       * browser/network work.
       */
      const acquisition =
        await acquire();


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
                null,

              httpStatus:
                null,

              durationMs:
                0,

              errorClass:
                errorClass(
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
      this.auditStore.close();
    }
    catch (error) {
      firstError =
        error;
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