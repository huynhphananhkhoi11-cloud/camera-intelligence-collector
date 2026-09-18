import {
  createHash
} from "node:crypto";

import {
  processRawProductFacts,
  type PipelineResult
} from "../pipeline/productPipeline.js";

import {
  buildEvidenceRows
} from "../evidence/evidenceStore.js";

import {
  detectConflicts,
  type ConflictSeverity
} from "../conflicts/conflictEngine.js";

import {
  parseOfflineReplaySnapshot
} from "../extraction/offlineReplaySnapshot.js";

import {
  SQLiteRunStore
} from "../storage/sqliteRunStore.js";

import type {
  PersistProductAuditInput,
  AuditErrorRecord
} from "../storage/intelligenceAuditStore.js";

import type {
  RunStoreReconciliationReport
} from "../storage/runStore.js";

import type {
  RunErrorRow,
  RunReconciliationReport
} from "../coverage/runReconciliation.js";


export interface PersistentPipelineVersions {
  classifierVersion: string;

  resolverVersion: string;

  auditVersion: string;
}


export type PipelineSiteMode =
  Parameters<
    typeof processRawProductFacts
  >[1];


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


function productNameForAudit(
  result:
    PipelineResult,
  canonicalUrl:
    string
): string {
  const title =
    result.facts.title.trim();

  return title ||
    canonicalUrl;
}


export function replaySnapshotContentHash(
  serializedSnapshot:
    string
): string {
  return createHash(
    "sha256"
  )
    .update(
      serializedSnapshot,
      "utf8"
    )
    .digest(
      "hex"
    );
}


export function toPersistentConflictSeverity(
  severity:
    ConflictSeverity
): "REVIEW" | "INFO" {
  return severity ===
    "HIGH"
      ? "REVIEW"
      : "INFO";
}


function resolvedFieldRows(
  result:
    PipelineResult
): PersistProductAuditInput["resolvedFields"] {
  return [
    {
      field:
        "SPECS",

      selectedValue:
        result.fields.specs.value,

      confidence:
        result.fields.specs.confidence,

      conflict:
        result.fields.specs.conflict
    },
    {
      field:
        "RENTAL_PRICE",

      selectedValue:
        result.fields.rentalPrice.amount,

      confidence:
        result.fields.rentalPrice.confidence,

      conflict:
        result.fields.rentalPrice.conflict
    },
    {
      field:
        "SALE_PRICE",

      selectedValue:
        result.fields.salePrice.amount,

      confidence:
        result.fields.salePrice.confidence,

      conflict:
        result.fields.salePrice.conflict
    },
    {
      field:
        "RENTAL_CONDITIONS",

      selectedValue:
        result.fields.rentalConditions.value,

      confidence:
        result.fields.rentalConditions.confidence,

      conflict:
        result.fields.rentalConditions.conflict
    },
    {
      field:
        "ACCESSORIES",

      selectedValue:
        result.fields.accessories.value,

      confidence:
        result.fields.accessories.confidence,

      conflict:
        result.fields.accessories.conflict
    },
    {
      field:
        "COMBO",

      selectedValue:
        result.fields.combo.value,

      confidence:
        result.fields.combo.confidence,

      conflict:
        result.fields.combo.conflict
    },
    {
      field:
        "RATING",

      selectedValue:
        result.fields.rating.value,

      confidence:
        result.fields.rating.confidence,

      conflict:
        result.fields.rating.conflict
    },
    {
      field:
        "REVIEW_COUNT",

      selectedValue:
        result.fields.reviewCount.value,

      confidence:
        result.fields.reviewCount.confidence,

      conflict:
        result.fields.reviewCount.conflict
    },
    {
      field:
        "STOCK",

      selectedValue:
        result.fields.stock.value,

      confidence:
        result.fields.stock.confidence,

      conflict:
        result.fields.stock.conflict
    }
  ];
}


export function buildPersistProductAuditInput(
  result:
    PipelineResult,
  rawRunId:
    string,
  rawCanonicalUrl:
    string,
  rawContentHash:
    string,
  versions:
    PersistentPipelineVersions
): PersistProductAuditInput {
  const runId =
    requiredText(
      rawRunId,
      "runId"
    );

  const canonicalUrl =
    requiredText(
      rawCanonicalUrl,
      "canonicalUrl"
    );

  const contentHash =
    requiredText(
      rawContentHash,
      "contentHash"
    );

  const classifierVersion =
    requiredText(
      versions.classifierVersion,
      "classifierVersion"
    );

  const resolverVersion =
    requiredText(
      versions.resolverVersion,
      "resolverVersion"
    );

  const auditVersion =
    requiredText(
      versions.auditVersion,
      "auditVersion"
    );


  const evidenceRows =
    buildEvidenceRows(
      result,
      runId
    );


  const selectedByField =
    new Map<
      string,
      string
    >();

  for (
    const row
    of evidenceRows
  ) {
    if (
      !selectedByField.has(
        row.field
      )
    ) {
      selectedByField.set(
        row.field,
        row.selectedValue
      );
    }
  }


  const productName =
    productNameForAudit(
      result,
      canonicalUrl
    );


  const conflicts =
    detectConflicts({
      facts:
        result.facts,

      analysis:
        result.analysis,

      fields:
        result.fields
    });


  return {
    runId,

    canonicalUrl,

    contentHash,

    classifierVersion,

    resolverVersion,

    auditVersion,

    entity:
      result.analysis.entity,

    offer:
      result.analysis.offer,

    condition:
      result.analysis.condition,

    validation:
      result.validation,

    resolvedFields:
      resolvedFieldRows(
        result
      ),

    evidence:
      evidenceRows.map(
        row => ({
          productName:
            row.productName.trim() ||
            productName,

          decision:
            row.decision,

          field:
            row.field,

          selectedValue:
            row.selectedValue,

          source:
            row.source,

          raw:
            row.raw,

          weight:
            row.weight,

          confidence:
            row.confidence,

          ruleId:
            row.ruleId
        })
      ),

    conflicts:
      conflicts.map(
        conflict => {
          const rawSelected =
            selectedByField.get(
              conflict.field
            ) ??
            "";

          const selectedValue =
            rawSelected.trim()
              ? rawSelected
              : null;

          return {
            productName:
              conflict.productName.trim() ||
              productName,

            field:
              conflict.field,

            severity:
              toPersistentConflictSeverity(
                conflict.severity
              ),

            values:
              conflict.values,

            explanation:
              conflict.explanation,

            selectedValue,

            meta: {
              source:
                "ConflictEngine",

              sourceSeverity:
                conflict.severity
            }
          };
        }
      )
  };
}


/**
 * Rebuild every business-terminal product from persisted replay facts.
 *
 * This is deliberately independent from the current process' in-memory
 * `results[]`. That property is what prevents resume from silently
 * omitting products completed before a crash.
 */
export function loadTerminalPipelineResults(
  databasePath:
    string,
  rawRunId:
    string,
  siteMode:
    PipelineSiteMode =
      "UNKNOWN"
): PipelineResult[] {
  const runId =
    requiredText(
      rawRunId,
      "runId"
    );

  const store =
    new SQLiteRunStore(
      databasePath
    );

  try {
    const terminalRows =
      store.listProductUrls(
        runId
      )
        .filter(
          row =>
            row.state ===
              "ACCEPT" ||
            row.state ===
              "REVIEW" ||
            row.state ===
              "EXCLUDE"
        )
        .sort(
          (
            left,
            right
          ) =>
            left.canonicalUrl.localeCompare(
              right.canonicalUrl
            )
        );


    return terminalRows.map(
      product => {
        const persistedFacts =
          store.listRawFacts(
            runId,
            product.canonicalUrl
          );

        if (
          persistedFacts.length ===
          0
        ) {
          throw new Error(
            `Terminal product has no persisted raw facts/replay snapshot: ${product.canonicalUrl}`
          );
        }


        const latest =
          persistedFacts[
            persistedFacts.length - 1
          ]!;


        let snapshot;

        try {
          snapshot =
            parseOfflineReplaySnapshot(
              latest.factsJson
            );
        }
        catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : String(error);

          throw new Error(
            `Terminal product replay snapshot is invalid for ${product.canonicalUrl}: ${detail}`
          );
        }


        const result =
          processRawProductFacts(
            snapshot.facts,
            siteMode
          );


        if (
          result.validation.decision !==
          product.state
        ) {
          throw new Error(
            [
              "Persisted decision drift detected.",
              `url=${product.canonicalUrl}`,
              `persisted=${product.state}`,
              `replayed=${result.validation.decision}`
            ].join(
              " "
            )
          );
        }


        return result;
      }
    );
  }
  finally {
    store.close();
  }
}


export function toExportReconciliation(
  report:
    RunStoreReconciliationReport
): RunReconciliationReport {
  if (
    !report.complete ||
    !report.balanced ||
    report.pending !==
      0 ||
    report.inProgress !==
      0
  ) {
    throw new Error(
      [
        "Persistent reconciliation is incomplete and cannot be exported.",
        `run=${report.runId}`,
        `pending=${report.pending}`,
        `inProgress=${report.inProgress}`,
        `balanced=${report.balanced}`,
        `complete=${report.complete}`
      ].join(
        " "
      )
    );
  }


  return {
    runId:
      report.runId,

    discovered:
      report.discovered,

    accepted:
      report.accepted,

    review:
      report.review,

    excluded:
      report.excluded,

    error:
      report.error,

    inProgress:
      report.inProgress,

    accounted:
      report.accounted,

    balanced:
      report.balanced,

    complete:
      report.complete
  };
}


export function toExportErrorRows(
  errors:
    readonly AuditErrorRecord[]
): RunErrorRow[] {
  return errors.map(
    error => ({
      runId:
        error.runId,

      url:
        error.canonicalUrl ??
        "",

      stage:
        error.stage,

      errorClass:
        error.errorClass,

      message:
        error.message,

      attempts:
        error.attempts,

      lastStatus:
        typeof error.lastStatus ===
        "number"
          ? error.lastStatus
          : null,

      retriable:
        error.retriable,

      diagnosticPath:
        error.diagnosticPath
    })
  );
}