import {
  DatabaseSync
} from "node:sqlite";

import {
  configureSqliteConnection
} from "./sqliteRunStore.js";

import {
  runMigrations
} from "./sqliteMigrations.js";

import type {
  AppendAuditErrorInput,
  AuditConfidence,
  AuditErrorRecord,
  ConflictAuditRecord,
  EvidenceAuditRecord,
  IntelligenceAuditStore,
  PersistProductAuditInput,
  ProductAuditSnapshot,
  ResolvedFieldAuditRecord
} from "./intelligenceAuditStore.js";


export interface SQLiteIntelligenceAuditStoreOptions {
  timeoutMs?: number;

  now?: () => string;
}


type Statement =
  ReturnType<
    DatabaseSync["prepare"]
  >;


function closeStatement(
  statement:
    Statement
): void {
  const candidate =
    statement as
      Statement & {
        close?:
          () => void;
      };

  if (
    typeof candidate.close ===
    "function"
  ) {
    candidate.close();
  }
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


function optionalText(
  value:
    string |
    null,
  label:
    string
): string | null {
  if (
    value ===
    null
  ) {
    return null;
  }

  return requiredText(
    value,
    label
  );
}


function serializeJson(
  value:
    unknown,
  label:
    string
): string {
  let serialized:
    string |
    undefined;

  try {
    serialized =
      JSON.stringify(
        value
      );
  }
  catch {
    throw new Error(
      `${label} must be JSON serializable.`
    );
  }

  if (
    serialized ===
    undefined
  ) {
    throw new Error(
      `${label} must be JSON serializable.`
    );
  }

  return serialized;
}


function parseJson(
  value:
    string
): unknown {
  return JSON.parse(
    value
  );
}


function finiteNumber(
  value:
    number,
  label:
    string
): number {
  if (
    !Number.isFinite(
      value
    )
  ) {
    throw new Error(
      `${label} must be finite.`
    );
  }

  return value;
}


function optionalFiniteNumber(
  value:
    number |
    null,
  label:
    string
): number | null {
  if (
    value ===
    null
  ) {
    return null;
  }

  return finiteNumber(
    value,
    label
  );
}


function nonNegativeInteger(
  value:
    number,
  label:
    string
): number {
  if (
    !Number.isInteger(
      value
    ) ||
    value < 0
  ) {
    throw new Error(
      `${label} must be a non-negative integer.`
    );
  }

  return value;
}


function withImmediateTransaction<T>(
  db:
    DatabaseSync,
  work:
    () => T
): T {
  db.exec(
    "BEGIN IMMEDIATE"
  );

  try {
    const result =
      work();

    db.exec(
      "COMMIT"
    );

    return result;
  }
  catch (error) {
    try {
      db.exec(
        "ROLLBACK"
      );
    }
    catch {
      /*
       * Preserve original persistence failure.
       */
    }

    throw error;
  }
}


interface ClassificationRow {
  run_id: string;

  canonical_url: string;

  content_hash: string;

  classifier_version: string;

  audit_version: string;

  entity_json: string;

  offer_json: string;

  condition_json: string;

  validation_json: string;

  created_at: string;
}


interface ResolvedRow {
  run_id: string;

  canonical_url: string;

  audit_version: string;

  resolver_version: string;

  field: string;

  selected_value_json: string;

  confidence: number;

  conflict: number;

  created_at: string;
}


interface EvidenceRow {
  evidence_id: number;

  run_id: string;

  canonical_url: string;

  audit_version: string;

  product_name: string;

  decision: string;

  field: string;

  selected_value: string;

  source: string;

  raw: string;

  weight:
    number |
    null;

  confidence_json: string;

  rule_id: string;

  created_at: string;
}


interface ConflictRow {
  conflict_id: number;

  run_id: string;

  canonical_url: string;

  audit_version: string;

  product_name: string;

  field: string;

  severity:
    | "REVIEW"
    | "INFO";

  values_text: string;

  explanation: string;

  selected_value:
    string |
    null;

  meta_json: string;

  created_at: string;
}


interface ErrorRow {
  error_id: number;

  run_id: string;

  canonical_url:
    string |
    null;

  stage: string;

  error_class: string;

  message: string;

  attempts: number;

  last_status_json:
    string |
    null;

  retriable: number;

  diagnostic_path:
    string |
    null;

  created_at: string;
}


export class SQLiteIntelligenceAuditStore
implements IntelligenceAuditStore {

  private readonly db:
    DatabaseSync;

  private readonly now:
    () => string;

  private closed =
    false;


  constructor(
    databasePath:
      string,
    options:
      SQLiteIntelligenceAuditStoreOptions = {}
  ) {
    const path =
      requiredText(
        databasePath,
        "databasePath"
      );

    const timeoutMs =
      options.timeoutMs ??
      5000;

    this.db =
      new DatabaseSync(
        path,
        {
          timeout:
            timeoutMs
        }
      );

    this.now =
      options.now ??
      (() =>
        new Date()
          .toISOString()
      );

    try {
      configureSqliteConnection(
        this.db,
        timeoutMs
      );

      runMigrations(
        this.db
      );
    }
    catch (error) {
      try {
        this.db.close();
      }
      catch {
      }

      throw error;
    }
  }


  private ensureOpen():
    void {
    if (this.closed) {
      throw new Error(
        "SQLiteIntelligenceAuditStore is closed."
      );
    }
  }


  private timestamp():
    string {
    return requiredText(
      this.now(),
      "now()"
    );
  }


  private requireRun(
    runId:
      string
  ): void {
    const statement =
      this.db.prepare(`
        SELECT
          run_id
        FROM runs
        WHERE run_id = ?
      `);

    try {
      if (
        statement.get(
          runId
        ) ===
        undefined
      ) {
        throw new Error(
          `Run was not registered: ${runId}`
        );
      }
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  private requireProduct(
    runId:
      string,
    canonicalUrl:
      string
  ): void {
    const statement =
      this.db.prepare(`
        SELECT
          canonical_url
        FROM product_urls
        WHERE
          run_id = ?
          AND canonical_url = ?
      `);

    try {
      if (
        statement.get(
          runId,
          canonicalUrl
        ) ===
        undefined
      ) {
        throw new Error(
          `URL was not registered for run ${runId}: ${canonicalUrl}`
        );
      }
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  private requireRawFacts(
    runId:
      string,
    canonicalUrl:
      string,
    contentHash:
      string
  ): void {
    const statement =
      this.db.prepare(`
        SELECT
          raw_fact_id
        FROM raw_facts
        WHERE
          run_id = ?
          AND canonical_url = ?
          AND content_hash = ?
        LIMIT 1
      `);

    try {
      if (
        statement.get(
          runId,
          canonicalUrl,
          contentHash
        ) ===
        undefined
      ) {
        throw new Error(
          `Raw facts content hash was not captured for URL: ${contentHash}`
        );
      }
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  persistProductAudit(
    input:
      PersistProductAuditInput
  ): void {
    this.ensureOpen();

    const runId =
      requiredText(
        input.runId,
        "runId"
      );

    const canonicalUrl =
      requiredText(
        input.canonicalUrl,
        "canonicalUrl"
      );

    const contentHash =
      requiredText(
        input.contentHash,
        "contentHash"
      );

    const classifierVersion =
      requiredText(
        input.classifierVersion,
        "classifierVersion"
      );

    const resolverVersion =
      requiredText(
        input.resolverVersion,
        "resolverVersion"
      );

    const auditVersion =
      requiredText(
        input.auditVersion,
        "auditVersion"
      );

    const entityJson =
      serializeJson(
        input.entity,
        "entity"
      );

    const offerJson =
      serializeJson(
        input.offer,
        "offer"
      );

    const conditionJson =
      serializeJson(
        input.condition,
        "condition"
      );

    const validationJson =
      serializeJson(
        input.validation,
        "validation"
      );

    const resolved =
      input.resolvedFields.map(
        row => ({
          field:
            requiredText(
              row.field,
              "resolvedFields.field"
            ),

          selectedValueJson:
            serializeJson(
              row.selectedValue,
              "resolvedFields.selectedValue"
            ),

          confidence:
            finiteNumber(
              row.confidence,
              "resolvedFields.confidence"
            ),

          conflict:
            row.conflict
              ? 1
              : 0
        })
      );

    const evidence =
      input.evidence.map(
        row => ({
          productName:
            requiredText(
              row.productName,
              "evidence.productName"
            ),

          decision:
            requiredText(
              row.decision,
              "evidence.decision"
            ),

          field:
            requiredText(
              row.field,
              "evidence.field"
            ),

          selectedValue:
            row.selectedValue,

          source:
            requiredText(
              row.source,
              "evidence.source"
            ),

          raw:
            row.raw,

          weight:
            optionalFiniteNumber(
              row.weight,
              "evidence.weight"
            ),

          confidenceJson:
            serializeJson(
              row.confidence,
              "evidence.confidence"
            ),

          ruleId:
            requiredText(
              row.ruleId,
              "evidence.ruleId"
            )
        })
      );

    const conflicts =
      input.conflicts.map(
        row => ({
          productName:
            requiredText(
              row.productName,
              "conflicts.productName"
            ),

          field:
            requiredText(
              row.field,
              "conflicts.field"
            ),

          severity:
            row.severity,

          values:
            row.values,

          explanation:
            requiredText(
              row.explanation,
              "conflicts.explanation"
            ),

          selectedValue:
            optionalText(
              row.selectedValue,
              "conflicts.selectedValue"
            ),

          metaJson:
            serializeJson(
              row.meta,
              "conflicts.meta"
            )
        })
      );


    this.requireRun(
      runId
    );

    this.requireProduct(
      runId,
      canonicalUrl
    );

    this.requireRawFacts(
      runId,
      canonicalUrl,
      contentHash
    );


    const createdAt =
      this.timestamp();


    withImmediateTransaction(
      this.db,
      () => {
        const classification =
          this.db.prepare(`
            INSERT INTO classifications (
              run_id,
              canonical_url,
              content_hash,
              classifier_version,
              audit_version,
              entity_json,
              offer_json,
              condition_json,
              validation_json,
              created_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?
            )
            ON CONFLICT (
              run_id,
              canonical_url,
              audit_version
            )
            DO UPDATE SET
              content_hash =
                excluded.content_hash,
              classifier_version =
                excluded.classifier_version,
              entity_json =
                excluded.entity_json,
              offer_json =
                excluded.offer_json,
              condition_json =
                excluded.condition_json,
              validation_json =
                excluded.validation_json,
              created_at =
                excluded.created_at
          `);

        try {
          classification.run(
            runId,
            canonicalUrl,
            contentHash,
            classifierVersion,
            auditVersion,
            entityJson,
            offerJson,
            conditionJson,
            validationJson,
            createdAt
          );
        }
        finally {
          closeStatement(
            classification
          );
        }


        for (
          const tableName
          of [
            "resolved_fields",
            "evidence",
            "conflicts"
          ]
        ) {
          this.db.prepare(`
            DELETE FROM ${tableName}
            WHERE
              run_id = ?
              AND canonical_url = ?
              AND audit_version = ?
          `).run(
            runId,
            canonicalUrl,
            auditVersion
          );
        }


        const resolvedStatement =
          this.db.prepare(`
            INSERT INTO resolved_fields (
              run_id,
              canonical_url,
              audit_version,
              resolver_version,
              field,
              selected_value_json,
              confidence,
              conflict,
              created_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?
            )
          `);

        try {
          for (
            const row
            of resolved
          ) {
            resolvedStatement.run(
              runId,
              canonicalUrl,
              auditVersion,
              resolverVersion,
              row.field,
              row.selectedValueJson,
              row.confidence,
              row.conflict,
              createdAt
            );
          }
        }
        finally {
          closeStatement(
            resolvedStatement
          );
        }


        const evidenceStatement =
          this.db.prepare(`
            INSERT INTO evidence (
              run_id,
              canonical_url,
              audit_version,
              product_name,
              decision,
              field,
              selected_value,
              source,
              raw,
              weight,
              confidence_json,
              rule_id,
              created_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?
            )
          `);

        try {
          for (
            const row
            of evidence
          ) {
            evidenceStatement.run(
              runId,
              canonicalUrl,
              auditVersion,
              row.productName,
              row.decision,
              row.field,
              row.selectedValue,
              row.source,
              row.raw,
              row.weight,
              row.confidenceJson,
              row.ruleId,
              createdAt
            );
          }
        }
        finally {
          closeStatement(
            evidenceStatement
          );
        }


        const conflictStatement =
          this.db.prepare(`
            INSERT INTO conflicts (
              run_id,
              canonical_url,
              audit_version,
              product_name,
              field,
              severity,
              values_text,
              explanation,
              selected_value,
              meta_json,
              created_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?
            )
          `);

        try {
          for (
            const row
            of conflicts
          ) {
            conflictStatement.run(
              runId,
              canonicalUrl,
              auditVersion,
              row.productName,
              row.field,
              row.severity,
              row.values,
              row.explanation,
              row.selectedValue,
              row.metaJson,
              createdAt
            );
          }
        }
        finally {
          closeStatement(
            conflictStatement
          );
        }
      }
    );
  }


  getProductAudit(
    rawRunId:
      string,
    rawCanonicalUrl:
      string,
    rawAuditVersion:
      string
  ): ProductAuditSnapshot | null {
    this.ensureOpen();

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

    const auditVersion =
      requiredText(
        rawAuditVersion,
        "auditVersion"
      );


    const classificationStatement =
      this.db.prepare(`
        SELECT
          run_id,
          canonical_url,
          content_hash,
          classifier_version,
          audit_version,
          entity_json,
          offer_json,
          condition_json,
          validation_json,
          created_at
        FROM classifications
        WHERE
          run_id = ?
          AND canonical_url = ?
          AND audit_version = ?
      `);

    let classification:
      | ClassificationRow
      | undefined;

    try {
      classification =
        classificationStatement.get(
          runId,
          canonicalUrl,
          auditVersion
        ) as
          | ClassificationRow
          | undefined;
    }
    finally {
      closeStatement(
        classificationStatement
      );
    }

    if (!classification) {
      return null;
    }


    const resolvedStatement =
      this.db.prepare(`
        SELECT
          run_id,
          canonical_url,
          audit_version,
          resolver_version,
          field,
          selected_value_json,
          confidence,
          conflict,
          created_at
        FROM resolved_fields
        WHERE
          run_id = ?
          AND canonical_url = ?
          AND audit_version = ?
        ORDER BY field
      `);

    let resolved:
      ResolvedFieldAuditRecord[];

    try {
      const rows =
        resolvedStatement.all(
          runId,
          canonicalUrl,
          auditVersion
        ) as
          unknown as
          ResolvedRow[];

      resolved =
        rows.map(
          row => ({
            runId:
              row.run_id,

            canonicalUrl:
              row.canonical_url,

            auditVersion:
              row.audit_version,

            resolverVersion:
              row.resolver_version,

            field:
              row.field,

            selectedValue:
              parseJson(
                row.selected_value_json
              ),

            confidence:
              Number(
                row.confidence
              ),

            conflict:
              Number(
                row.conflict
              ) ===
              1,

            createdAt:
              row.created_at
          })
        );
    }
    finally {
      closeStatement(
        resolvedStatement
      );
    }


    const evidenceStatement =
      this.db.prepare(`
        SELECT
          evidence_id,
          run_id,
          canonical_url,
          audit_version,
          product_name,
          decision,
          field,
          selected_value,
          source,
          raw,
          weight,
          confidence_json,
          rule_id,
          created_at
        FROM evidence
        WHERE
          run_id = ?
          AND canonical_url = ?
          AND audit_version = ?
        ORDER BY evidence_id
      `);

    let evidence:
      EvidenceAuditRecord[];

    try {
      const rows =
        evidenceStatement.all(
          runId,
          canonicalUrl,
          auditVersion
        ) as
          unknown as
          EvidenceRow[];

      evidence =
        rows.map(
          row => ({
            evidenceId:
              Number(
                row.evidence_id
              ),

            runId:
              row.run_id,

            canonicalUrl:
              row.canonical_url,

            auditVersion:
              row.audit_version,

            productName:
              row.product_name,

            decision:
              row.decision,

            field:
              row.field,

            selectedValue:
              row.selected_value,

            source:
              row.source,

            raw:
              row.raw,

            weight:
              row.weight,

            confidence:
              parseJson(
                row.confidence_json
              ) as
                AuditConfidence,

            ruleId:
              row.rule_id,

            createdAt:
              row.created_at
          })
        );
    }
    finally {
      closeStatement(
        evidenceStatement
      );
    }


    const conflictStatement =
      this.db.prepare(`
        SELECT
          conflict_id,
          run_id,
          canonical_url,
          audit_version,
          product_name,
          field,
          severity,
          values_text,
          explanation,
          selected_value,
          meta_json,
          created_at
        FROM conflicts
        WHERE
          run_id = ?
          AND canonical_url = ?
          AND audit_version = ?
        ORDER BY conflict_id
      `);

    let conflicts:
      ConflictAuditRecord[];

    try {
      const rows =
        conflictStatement.all(
          runId,
          canonicalUrl,
          auditVersion
        ) as
          unknown as
          ConflictRow[];

      conflicts =
        rows.map(
          row => ({
            conflictId:
              Number(
                row.conflict_id
              ),

            runId:
              row.run_id,

            canonicalUrl:
              row.canonical_url,

            auditVersion:
              row.audit_version,

            productName:
              row.product_name,

            field:
              row.field,

            severity:
              row.severity,

            values:
              row.values_text,

            explanation:
              row.explanation,

            selectedValue:
              row.selected_value,

            meta:
              parseJson(
                row.meta_json
              ),

            createdAt:
              row.created_at
          })
        );
    }
    finally {
      closeStatement(
        conflictStatement
      );
    }


    const resolverVersion =
      resolved[0]
        ?.resolverVersion ??
      "";

    return {
      runId:
        classification.run_id,

      canonicalUrl:
        classification.canonical_url,

      contentHash:
        classification.content_hash,

      classifierVersion:
        classification.classifier_version,

      resolverVersion,

      auditVersion:
        classification.audit_version,

      entity:
        parseJson(
          classification.entity_json
        ),

      offer:
        parseJson(
          classification.offer_json
        ),

      condition:
        parseJson(
          classification.condition_json
        ),

      validation:
        parseJson(
          classification.validation_json
        ),

      createdAt:
        classification.created_at,

      resolvedFields:
        resolved,

      evidence,

      conflicts
    };
  }


  appendError(
    input:
      AppendAuditErrorInput
  ): AuditErrorRecord {
    this.ensureOpen();

    const runId =
      requiredText(
        input.runId,
        "runId"
      );

    const canonicalUrl =
      optionalText(
        input.canonicalUrl,
        "canonicalUrl"
      );

    const stage =
      requiredText(
        input.stage,
        "stage"
      );

    const errorClass =
      requiredText(
        input.errorClass,
        "errorClass"
      );

    const message =
      requiredText(
        input.message,
        "message"
      );

    const attempts =
      nonNegativeInteger(
        input.attempts,
        "attempts"
      );

    const lastStatusJson =
      input.lastStatus ===
      null
        ? null
        : serializeJson(
            input.lastStatus,
            "lastStatus"
          );

    const diagnosticPath =
      optionalText(
        input.diagnosticPath,
        "diagnosticPath"
      );

    this.requireRun(
      runId
    );

    if (
      canonicalUrl !==
      null
    ) {
      this.requireProduct(
        runId,
        canonicalUrl
      );
    }

    const createdAt =
      this.timestamp();

    const statement =
      this.db.prepare(`
        INSERT INTO errors (
          run_id,
          canonical_url,
          stage,
          error_class,
          message,
          attempts,
          last_status_json,
          retriable,
          diagnostic_path,
          created_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `);

    try {
      const result =
        statement.run(
          runId,
          canonicalUrl,
          stage,
          errorClass,
          message,
          attempts,
          lastStatusJson,
          input.retriable
            ? 1
            : 0,
          diagnosticPath,
          createdAt
        );

      return {
        ...input,

        canonicalUrl,

        errorId:
          Number(
            result.lastInsertRowid
          ),

        createdAt
      };
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  listErrors(
    rawRunId:
      string
  ): AuditErrorRecord[] {
    this.ensureOpen();

    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    this.requireRun(
      runId
    );

    const statement =
      this.db.prepare(`
        SELECT
          error_id,
          run_id,
          canonical_url,
          stage,
          error_class,
          message,
          attempts,
          last_status_json,
          retriable,
          diagnostic_path,
          created_at
        FROM errors
        WHERE run_id = ?
        ORDER BY error_id
      `);

    try {
      const rows =
        statement.all(
          runId
        ) as
          unknown as
          ErrorRow[];

      return rows.map(
        row => ({
          errorId:
            Number(
              row.error_id
            ),

          runId:
            row.run_id,

          canonicalUrl:
            row.canonical_url,

          stage:
            row.stage,

          errorClass:
            row.error_class,

          message:
            row.message,

          attempts:
            Number(
              row.attempts
            ),

          lastStatus:
            row.last_status_json ===
            null
              ? null
              : parseJson(
                  row.last_status_json
                ) as
                  | string
                  | number,

          retriable:
            Number(
              row.retriable
            ) ===
            1,

          diagnosticPath:
            row.diagnostic_path,

          createdAt:
            row.created_at
        })
      );
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  close():
    void {
    if (this.closed) {
      return;
    }

    this.db.close();

    this.closed =
      true;
  }
}