import {
  DatabaseSync
} from "node:sqlite";

import {
  runMigrations
} from "./sqliteMigrations.js";

import type {
  CreateRunInput,
  DetailFetchRecord,
  FinishDetailFetchInput,
  ProductTerminalState,
  ProductUrlRecord,
  RawFactsRecord,
  RegisterProductUrlInput,
  RunRecord,
  RunStore,
  RunStoreReconciliationReport
} from "./runStore.js";


export interface SQLiteRunStoreOptions {
  timeoutMs?: number;

  now?: () => string;
}


type PreparedStatement =
  ReturnType<
    DatabaseSync["prepare"]
  >;


interface SqlRunRow {
  run_id: string;

  input_url: string;

  canonical_origin: string;

  started_at: string;

  finished_at:
    string |
    null;

  code_version: string;

  config_hash: string;

  status: string;
}


interface SqlProductUrlRow {
  run_id: string;

  canonical_url: string;

  discovery_score:
    number |
    null;

  sources_json: string;

  state: string;

  attempts: number;

  discovered_at: string;

  updated_at: string;
}


interface SqlReconciliationRow {
  discovered: number;

  pending: number;

  accepted: number;

  review: number;

  excluded: number;

  error: number;

  in_progress: number;
}



interface SqlDetailFetchRow {
  fetch_id: number;

  run_id: string;

  canonical_url: string;

  attempt_no: number;

  started_at: string;

  finished_at:
    string |
    null;

  final_url:
    string |
    null;

  status: string;

  http_status:
    number |
    null;

  duration_ms:
    number |
    null;

  error_class:
    string |
    null;

  error_message:
    string |
    null;

  content_hash:
    string |
    null;

  snapshot_path:
    string |
    null;
}


interface SqlRawFactsRow {
  raw_fact_id: number;

  run_id: string;

  canonical_url: string;

  content_hash: string;

  extractor_version: string;

  facts_json: string;

  captured_at: string;

  snapshot_path:
    string |
    null;
}


function mapDetailFetchRow(
  row:
    SqlDetailFetchRow
): DetailFetchRecord {
  return {
    fetchId:
      Number(
        row.fetch_id
      ),

    runId:
      row.run_id,

    canonicalUrl:
      row.canonical_url,

    attempt:
      Number(
        row.attempt_no
      ),

    startedAt:
      row.started_at,

    finishedAt:
      row.finished_at,

    finalUrl:
      row.final_url,

    status:
      row.status as
        DetailFetchRecord["status"],

    httpStatus:
      row.http_status,

    durationMs:
      row.duration_ms,

    errorClass:
      row.error_class,

    errorMessage:
      row.error_message,

    contentHash:
      row.content_hash,

    snapshotPath:
      row.snapshot_path
  };
}


function mapRawFactsRow(
  row:
    SqlRawFactsRow
): RawFactsRecord {
  return {
    rawFactId:
      Number(
        row.raw_fact_id
      ),

    runId:
      row.run_id,

    canonicalUrl:
      row.canonical_url,

    contentHash:
      row.content_hash,

    extractorVersion:
      row.extractor_version,

    factsJson:
      row.facts_json,

    capturedAt:
      row.captured_at,

    snapshotPath:
      row.snapshot_path
  };
}

const TERMINAL_STATES =

  new Set<ProductTerminalState>([
    "ACCEPT",
    "REVIEW",
    "EXCLUDE",
    "ERROR"
  ]);


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


function requiredJsonText(
  value:
    string,
  label:
    string
): string {
  const normalized =
    requiredText(
      value,
      label
    );

  try {
    JSON.parse(
      normalized
    );
  }
  catch {
    throw new Error(
      `${label} must be valid JSON.`
    );
  }

  return normalized;
}


function requiredDurationMs(
  value:
    number
): number {
  if (
    !Number.isInteger(
      value
    ) ||
    value < 0
  ) {
    throw new Error(
      "durationMs must be a non-negative integer."
    );
  }

  return value;
}


function optionalHttpStatus(
  value:
    number |
    null
): number | null {
  if (
    value ===
    null
  ) {
    return null;
  }

  if (
    !Number.isInteger(
      value
    ) ||
    value < 100 ||
    value > 599
  ) {
    throw new Error(
      "httpStatus must be null or an integer from 100 to 599."
    );
  }

  return value;
}

function normalizeTimeout(

  value:
    number
): number {
  if (
    !Number.isInteger(
      value
    ) ||
    value < 0
  ) {
    throw new Error(
      "SQLite timeoutMs must be a non-negative integer."
    );
  }

  return value;
}


function closeStatement(
  statement:
    PreparedStatement
): void {
  /*
   * StatementSync.close() exists on current Node 24,
   * but keeping this runtime-safe avoids coupling
   * compilation to one exact @types/node declaration.
   */
  const candidate =
    statement as
      PreparedStatement & {
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


function pragmaScalar(
  db:
    DatabaseSync,
  sql:
    string
): unknown {
  const statement =
    db.prepare(
      sql
    );

  try {
    const row =
      statement.get();

    if (
      !row ||
      typeof row !==
        "object"
    ) {
      return undefined;
    }

    return Object.values(
      row
    )[0];
  }
  finally {
    closeStatement(
      statement
    );
  }
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
       * Keep the original application/SQLite error.
       * Rollback cleanup must not replace it.
       */
    }

    throw error;
  }
}


/**
 * Apply and verify SQLite connection policy.
 *
 * This is runtime connection policy, not schema migration.
 * It must run before any explicit transaction begins.
 */
export function configureSqliteConnection(
  db:
    DatabaseSync,
  timeoutMs:
    number = 5000
): void {
  const timeout =
    normalizeTimeout(
      timeoutMs
    );

  /*
   * Set busy timeout before journal-mode conversion because
   * switching to WAL may itself need to wait for a lock.
   */
  db.exec(
    `PRAGMA busy_timeout = ${timeout};`
  );

  /*
   * foreign_keys cannot be meaningfully enabled from inside
   * a pending transaction, so configure it at connection open.
   */
  db.exec(
    "PRAGMA foreign_keys = ON;"
  );

  /*
   * WAL is required for the local persistent run ledger.
   * SQLite may refuse WAL on an unsupported filesystem/VFS,
   * therefore verify instead of assuming success.
   */
  db.exec(
    "PRAGMA journal_mode = WAL;"
  );

  db.exec(
    "PRAGMA synchronous = FULL;"
  );


  const journalMode =
    String(
      pragmaScalar(
        db,
        "PRAGMA journal_mode"
      )
    )
      .toLowerCase();

  if (
    journalMode !==
    "wal"
  ) {
    throw new Error(
      `SQLite WAL mode required, got: ${journalMode || "<unknown>"}`
    );
  }


  const foreignKeys =
    Number(
      pragmaScalar(
        db,
        "PRAGMA foreign_keys"
      )
    );

  if (
    foreignKeys !==
    1
  ) {
    throw new Error(
      `SQLite foreign_keys must be ON, got: ${String(foreignKeys)}`
    );
  }


  const synchronous =
    Number(
      pragmaScalar(
        db,
        "PRAGMA synchronous"
      )
    );

  if (
    synchronous !==
    2
  ) {
    throw new Error(
      `SQLite synchronous must be FULL (2), got: ${String(synchronous)}`
    );
  }


  const busyTimeout =
    Number(
      pragmaScalar(
        db,
        "PRAGMA busy_timeout"
      )
    );

  if (
    busyTimeout !==
    timeout
  ) {
    throw new Error(
      `SQLite busy_timeout mismatch: expected ${timeout}, got ${String(busyTimeout)}`
    );
  }
}


/**
 * Persistent implementation of the Phase 10 RunStore lifecycle.
 *
 * Storage owns lifecycle persistence only.
 * Business truth remains in:
 * acquisition -> classification -> resolution -> validation.
 */
export class SQLiteRunStore
implements RunStore {

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
      SQLiteRunStoreOptions = {}
  ) {
    const path =
      requiredText(
        databasePath,
        "databasePath"
      );

    const timeoutMs =
      normalizeTimeout(
        options.timeoutMs ??
        5000
      );

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
        /*
         * Constructor failure cleanup only.
         * Preserve the original failure.
         */
      }

      throw error;
    }
  }


  private ensureOpen():
    void {
    if (this.closed) {
      throw new Error(
        "SQLiteRunStore is closed."
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
    rawRunId:
      string
  ): RunRecord {
    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    const run =
      this.getRun(
        runId
      );

    if (!run) {
      throw new Error(
        `Run was not registered: ${runId}`
      );
    }

    return run;
  }


  private productState(
    runId:
      string,
    canonicalUrl:
      string
  ): ProductUrlRecord | null {
    const statement =
      this.db.prepare(`
        SELECT
          run_id,
          canonical_url,
          discovery_score,
          sources_json,
          state,
          attempts,
          discovered_at,
          updated_at
        FROM product_urls
        WHERE
          run_id = ?
          AND canonical_url = ?
      `);

    try {
      const row =
        statement.get(
          runId,
          canonicalUrl
        ) as
          | SqlProductUrlRow
          | undefined;

      if (!row) {
        return null;
      }

      return {
        runId:
          row.run_id,

        canonicalUrl:
          row.canonical_url,

        discoveryScore:
          row.discovery_score,

        sourcesJson:
          row.sources_json,

        state:
          row.state as
            ProductUrlRecord["state"],

        attempts:
          Number(
            row.attempts
          ),

        discoveredAt:
          row.discovered_at,

        updatedAt:
          row.updated_at
      };
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  private detailFetchById(
    fetchId:
      number
  ): DetailFetchRecord {
    const statement =
      this.db.prepare(`
        SELECT
          fetch_id,
          run_id,
          canonical_url,
          attempt_no,
          started_at,
          finished_at,
          final_url,
          status,
          http_status,
          duration_ms,
          error_class,
          error_message,
          content_hash,
          snapshot_path
        FROM detail_fetches
        WHERE fetch_id = ?
      `);

    try {
      const row =
        statement.get(
          fetchId
        ) as
          | SqlDetailFetchRow
          | undefined;

      if (!row) {
        throw new Error(
          `Detail fetch row disappeared: ${fetchId}`
        );
      }

      return mapDetailFetchRow(
        row
      );
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  /*
   * URL-scoped guard:
   * one product's acquisition must never block another product
   * from reaching its own terminal state.
   */
  private countStartedDetailFetchesForUrl(
    runId:
      string,
    canonicalUrl:
      string
  ): number {
    const statement =
      this.db.prepare(`
        SELECT
          COUNT(*) AS count
        FROM detail_fetches
        WHERE
          run_id = ?
          AND canonical_url = ?
          AND status = 'STARTED'
      `);

    try {
      const row =
        statement.get(
          runId,
          canonicalUrl
        ) as
          | {
              count:
                number;
            }
          | undefined;

      return Number(
        row?.count ??
        0
      );
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  /*
   * Run-scoped guard:
   * finalizing a run still requires zero unfinished acquisition
   * attempts anywhere in that run.
   */
  private countStartedDetailFetchesForRun(
    runId:
      string
  ): number {
    const statement =
      this.db.prepare(`
        SELECT
          COUNT(*) AS count
        FROM detail_fetches
        WHERE
          run_id = ?
          AND status = 'STARTED'
      `);

    try {
      const row =
        statement.get(
          runId
        ) as
          | {
              count:
                number;
            }
          | undefined;

      return Number(
        row?.count ??
        0
      );
    }
    finally {
      closeStatement(
        statement
      );
    }
  }

  createRun(
    input:
      CreateRunInput
  ): void {
    this.ensureOpen();

    const statement =
      this.db.prepare(`
        INSERT INTO runs (
          run_id,
          input_url,
          canonical_origin,
          started_at,
          finished_at,
          code_version,
          config_hash,
          status
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          NULL,
          ?,
          ?,
          'CREATED'
        )
      `);

    try {
      statement.run(
        requiredText(
          input.runId,
          "runId"
        ),

        requiredText(
          input.inputUrl,
          "inputUrl"
        ),

        requiredText(
          input.canonicalOrigin,
          "canonicalOrigin"
        ),

        requiredText(
          input.startedAt,
          "startedAt"
        ),

        requiredText(
          input.codeVersion,
          "codeVersion"
        ),

        requiredText(
          input.configHash,
          "configHash"
        )
      );
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  getRun(
    rawRunId:
      string
  ): RunRecord | null {
    this.ensureOpen();

    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    const statement =
      this.db.prepare(`
        SELECT
          run_id,
          input_url,
          canonical_origin,
          started_at,
          finished_at,
          code_version,
          config_hash,
          status
        FROM runs
        WHERE run_id = ?
      `);

    try {
      const row =
        statement.get(
          runId
        ) as
          | SqlRunRow
          | undefined;

      if (!row) {
        return null;
      }

      return {
        runId:
          row.run_id,

        inputUrl:
          row.input_url,

        canonicalOrigin:
          row.canonical_origin,

        startedAt:
          row.started_at,

        finishedAt:
          row.finished_at,

        codeVersion:
          row.code_version,

        configHash:
          row.config_hash,

        status:
          row.status as
            RunRecord["status"]
      };
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  startRun(
    rawRunId:
      string
  ): void {
    this.ensureOpen();

    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    const statement =
      this.db.prepare(`
        UPDATE runs
        SET
          status = 'RUNNING'
        WHERE
          run_id = ?
          AND status = 'CREATED'
      `);

    let changes =
      0;

    try {
      const result =
        statement.run(
          runId
        );

      changes =
        Number(
          result.changes
        );
    }
    finally {
      closeStatement(
        statement
      );
    }

    if (
      changes ===
      1
    ) {
      return;
    }

    const current =
      this.requireRun(
        runId
      );

    throw new Error(
      `Run cannot start from status ${current.status}: ${runId}`
    );
  }


  interruptRun(
    rawRunId:
      string
  ): void {
    this.ensureOpen();

    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    const statement =
      this.db.prepare(`
        UPDATE runs
        SET
          status = 'INTERRUPTED'
        WHERE
          run_id = ?
          AND status = 'RUNNING'
      `);

    let changes =
      0;

    try {
      const result =
        statement.run(
          runId
        );

      changes =
        Number(
          result.changes
        );
    }
    finally {
      closeStatement(
        statement
      );
    }

    if (
      changes ===
      1
    ) {
      return;
    }

    const current =
      this.requireRun(
        runId
      );

    throw new Error(
      `Run cannot be interrupted from status ${current.status}: ${runId}`
    );
  }

  registerProductUrls(

    rawRunId:
      string,
    urls:
      readonly RegisterProductUrlInput[]
  ): void {
    this.ensureOpen();

    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    if (
      !this.getRun(
        runId
      )
    ) {
      throw new Error(
        `Run was not registered: ${runId}`
      );
    }

    /*
     * First occurrence wins inside one registration batch.
     * Repeated calls are additionally protected by the PK.
     */
    const unique =
      new Map<
        string,
        RegisterProductUrlInput
      >();

    for (
      const input
      of urls
    ) {
      const canonicalUrl =
        requiredText(
          input.canonicalUrl,
          "canonicalUrl"
        );

      if (
        unique.has(
          canonicalUrl
        )
      ) {
        continue;
      }

      unique.set(
        canonicalUrl,
        {
          ...input,
          canonicalUrl
        }
      );
    }

    if (
      unique.size ===
      0
    ) {
      return;
    }

    const timestamp =
      this.timestamp();

    withImmediateTransaction(
      this.db,
      () => {
        const statement =
          this.db.prepare(`
            INSERT INTO product_urls (
              run_id,
              canonical_url,
              discovery_score,
              sources_json,
              state,
              attempts,
              discovered_at,
              updated_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              'DISCOVERED',
              0,
              ?,
              ?
            )
            ON CONFLICT (
              run_id,
              canonical_url
            )
            DO NOTHING
          `);

        try {
          for (
            const input
            of unique.values()
          ) {
            statement.run(
              runId,
              input.canonicalUrl,
              input.discoveryScore,
              requiredText(
                input.sourcesJson,
                "sourcesJson"
              ),
              timestamp,
              timestamp
            );
          }
        }
        finally {
          closeStatement(
            statement
          );
        }
      }
    );
  }


  listProductUrls(
    rawRunId:
      string
  ): ProductUrlRecord[] {
    this.ensureOpen();

    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    const statement =
      this.db.prepare(`
        SELECT
          run_id,
          canonical_url,
          discovery_score,
          sources_json,
          state,
          attempts,
          discovered_at,
          updated_at
        FROM product_urls
        WHERE run_id = ?
        ORDER BY canonical_url
      `);

    try {
      const rows =
        statement.all(
          runId
        ) as
          unknown as
          SqlProductUrlRow[];

      return rows.map(
        row => ({
          runId:
            row.run_id,

          canonicalUrl:
            row.canonical_url,

          discoveryScore:
            row.discovery_score,

          sourcesJson:
            row.sources_json,

          state:
            row.state as
              ProductUrlRecord["state"],

          attempts:
            Number(
              row.attempts
            ),

          discoveredAt:
            row.discovered_at,

          updatedAt:
            row.updated_at
        })
      );
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  beginAttempt(
    rawRunId:
      string,
    rawCanonicalUrl:
      string
  ): void {
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

    const timestamp =
      this.timestamp();

    const statement =
      this.db.prepare(`
        UPDATE product_urls
        SET
          state = 'IN_PROGRESS',
          attempts = attempts + 1,
          updated_at = ?
        WHERE
          run_id = ?
          AND canonical_url = ?
          AND state = 'DISCOVERED'
      `);

    let changes =
      0;

    try {
      const result =
        statement.run(
          timestamp,
          runId,
          canonicalUrl
        );

      changes =
        Number(
          result.changes
        );
    }
    finally {
      closeStatement(
        statement
      );
    }

    if (
      changes ===
      1
    ) {
      return;
    }

    const current =
      this.productState(
        runId,
        canonicalUrl
      );

    if (!current) {
      throw new Error(
        `URL was not registered for run ${runId}: ${canonicalUrl}`
      );
    }

    throw new Error(
      `URL cannot begin attempt from state ${current.state}: ${canonicalUrl}`
    );
  }


  startDetailFetch(
    rawRunId:
      string,
    rawCanonicalUrl:
      string
  ): DetailFetchRecord {
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

    const startedAt =
      this.timestamp();

    return withImmediateTransaction(
      this.db,
      () => {
        const product =
          this.productState(
            runId,
            canonicalUrl
          );

        if (!product) {
          throw new Error(
            `URL was not registered for run ${runId}: ${canonicalUrl}`
          );
        }

        if (
          product.state !==
          "IN_PROGRESS"
        ) {
          throw new Error(
            `Detail fetch requires IN_PROGRESS product state, got ${product.state}: ${canonicalUrl}`
          );
        }

        const latestStatement =
          this.db.prepare(`
            SELECT
              attempt_no,
              status
            FROM detail_fetches
            WHERE
              run_id = ?
              AND canonical_url = ?
            ORDER BY attempt_no DESC
            LIMIT 1
          `);

        let latest:
          | {
              attempt_no:
                number;

              status:
                string;
            }
          | undefined;

        try {
          latest =
            latestStatement.get(
              runId,
              canonicalUrl
            ) as
              | {
                  attempt_no:
                    number;

                  status:
                    string;
                }
              | undefined;
        }
        finally {
          closeStatement(
            latestStatement
          );
        }

        if (
          latest?.status ===
          "STARTED"
        ) {
          throw new Error(
            `Detail fetch already STARTED for URL: ${canonicalUrl}`
          );
        }

        if (
          latest?.status ===
          "SUCCEEDED"
        ) {
          throw new Error(
            `Successful detail fetch already recorded for URL: ${canonicalUrl}`
          );
        }

        const nextAttempt =
          Number(
            latest?.attempt_no ??
            0
          ) +
          1;

        const insertStatement =
          this.db.prepare(`
            INSERT INTO detail_fetches (
              run_id,
              canonical_url,
              attempt_no,
              started_at,
              finished_at,
              final_url,
              status,
              http_status,
              duration_ms,
              error_class,
              error_message,
              content_hash,
              snapshot_path
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              NULL,
              NULL,
              'STARTED',
              NULL,
              NULL,
              NULL,
              NULL,
              NULL,
              NULL
            )
          `);

        try {
          const result =
            insertStatement.run(
              runId,
              canonicalUrl,
              nextAttempt,
              startedAt
            );

          return this.detailFetchById(
            Number(
              result.lastInsertRowid
            )
          );
        }
        finally {
          closeStatement(
            insertStatement
          );
        }
      }
    );
  }


  finishDetailFetch(
    rawRunId:
      string,
    rawCanonicalUrl:
      string,
    input:
      FinishDetailFetchInput
  ): DetailFetchRecord {
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

    const finishedAt =
      this.timestamp();

    const finalUrl =
      optionalText(
        input.finalUrl,
        "finalUrl"
      );

    const httpStatus =
      optionalHttpStatus(
        input.httpStatus
      );

    const durationMs =
      requiredDurationMs(
        input.durationMs
      );

    const snapshotPath =
      optionalText(
        input.snapshotPath,
        "snapshotPath"
      );

    let contentHash:
      string |
      null =
        input.contentHash ===
        null
          ? null
          : requiredText(
              input.contentHash,
              "contentHash"
            );

    let errorClass:
      string |
      null =
        input.errorClass ===
        null
          ? null
          : requiredText(
              input.errorClass,
              "errorClass"
            );

    let errorMessage:
      string |
      null =
        input.errorMessage ===
        null
          ? null
          : requiredText(
              input.errorMessage,
              "errorMessage"
            );

    let rawFacts:
      {
        contentHash:
          string;

        extractorVersion:
          string;

        factsJson:
          string;

        snapshotPath:
          string |
          null;
      }
      | null =
        null;


    if (
      input.status ===
      "SUCCEEDED"
    ) {
      contentHash =
        requiredText(
          contentHash ??
            "",
          "contentHash"
        );

      if (!input.rawFacts) {
        throw new Error(
          "SUCCEEDED detail fetch requires rawFacts."
        );
      }

      if (
        errorClass !==
        null ||
        errorMessage !==
        null
      ) {
        throw new Error(
          "SUCCEEDED detail fetch cannot contain errorClass/errorMessage."
        );
      }

      const rawContentHash =
        requiredText(
          input.rawFacts.contentHash,
          "rawFacts.contentHash"
        );

      if (
        rawContentHash !==
        contentHash
      ) {
        throw new Error(
          "rawFacts.contentHash must match detail fetch contentHash."
        );
      }

      rawFacts = {
        contentHash:
          rawContentHash,

        extractorVersion:
          requiredText(
            input.rawFacts.extractorVersion,
            "rawFacts.extractorVersion"
          ),

        factsJson:
          requiredJsonText(
            input.rawFacts.factsJson,
            "rawFacts.factsJson"
          ),

        snapshotPath:
          optionalText(
            input.rawFacts.snapshotPath,
            "rawFacts.snapshotPath"
          )
      };
    }
    else if (
      input.status ===
      "FAILED"
    ) {
      if (
        input.rawFacts !==
        null
      ) {
        throw new Error(
          "FAILED detail fetch cannot persist rawFacts."
        );
      }

      errorClass =
        requiredText(
          errorClass ??
            "",
          "errorClass"
        );

      errorMessage =
        requiredText(
          errorMessage ??
            "",
          "errorMessage"
        );
    }
    else {
      throw new Error(
        `Invalid detail fetch terminal status: ${String(input.status)}`
      );
    }


    return withImmediateTransaction(
      this.db,
      () => {
        const product =
          this.productState(
            runId,
            canonicalUrl
          );

        if (!product) {
          throw new Error(
            `URL was not registered for run ${runId}: ${canonicalUrl}`
          );
        }

        if (
          product.state !==
          "IN_PROGRESS"
        ) {
          throw new Error(
            `Detail fetch finish requires IN_PROGRESS product state, got ${product.state}: ${canonicalUrl}`
          );
        }

        const activeStatement =
          this.db.prepare(`
            SELECT
              fetch_id,
              run_id,
              canonical_url,
              attempt_no,
              started_at,
              finished_at,
              final_url,
              status,
              http_status,
              duration_ms,
              error_class,
              error_message,
              content_hash,
              snapshot_path
            FROM detail_fetches
            WHERE
              run_id = ?
              AND canonical_url = ?
              AND status = 'STARTED'
            ORDER BY attempt_no DESC
            LIMIT 1
          `);

        let active:
          | SqlDetailFetchRow
          | undefined;

        try {
          active =
            activeStatement.get(
              runId,
              canonicalUrl
            ) as
              | SqlDetailFetchRow
              | undefined;
        }
        finally {
          closeStatement(
            activeStatement
          );
        }

        if (!active) {
          throw new Error(
            `No STARTED detail fetch exists for URL: ${canonicalUrl}`
          );
        }

        const updateStatement =
          this.db.prepare(`
            UPDATE detail_fetches
            SET
              finished_at = ?,
              final_url = ?,
              status = ?,
              http_status = ?,
              duration_ms = ?,
              error_class = ?,
              error_message = ?,
              content_hash = ?,
              snapshot_path = ?
            WHERE
              fetch_id = ?
              AND status = 'STARTED'
          `);

        try {
          const result =
            updateStatement.run(
              finishedAt,
              finalUrl,
              input.status,
              httpStatus,
              durationMs,
              errorClass,
              errorMessage,
              contentHash,
              snapshotPath,
              active.fetch_id
            );

          if (
            Number(
              result.changes
            ) !==
            1
          ) {
            throw new Error(
              `Detail fetch lost lifecycle ownership: ${active.fetch_id}`
            );
          }
        }
        finally {
          closeStatement(
            updateStatement
          );
        }


        if (rawFacts) {
          const rawStatement =
            this.db.prepare(`
              INSERT INTO raw_facts (
                run_id,
                canonical_url,
                content_hash,
                extractor_version,
                facts_json,
                captured_at,
                snapshot_path
              )
              VALUES (
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
                content_hash,
                extractor_version
              )
              DO NOTHING
            `);

          try {
            rawStatement.run(
              runId,
              canonicalUrl,
              rawFacts.contentHash,
              rawFacts.extractorVersion,
              rawFacts.factsJson,
              finishedAt,
              rawFacts.snapshotPath
            );
          }
          finally {
            closeStatement(
              rawStatement
            );
          }
        }

        return this.detailFetchById(
          Number(
            active.fetch_id
          )
        );
      }
    );
  }


  listDetailFetches(
    rawRunId:
      string,
    rawCanonicalUrl:
      string
  ): DetailFetchRecord[] {
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

    const statement =
      this.db.prepare(`
        SELECT
          fetch_id,
          run_id,
          canonical_url,
          attempt_no,
          started_at,
          finished_at,
          final_url,
          status,
          http_status,
          duration_ms,
          error_class,
          error_message,
          content_hash,
          snapshot_path
        FROM detail_fetches
        WHERE
          run_id = ?
          AND canonical_url = ?
        ORDER BY attempt_no
      `);

    try {
      const rows =
        statement.all(
          runId,
          canonicalUrl
        ) as
          unknown as
          SqlDetailFetchRow[];

      return rows.map(
        mapDetailFetchRow
      );
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  listRawFacts(
    rawRunId:
      string,
    rawCanonicalUrl:
      string
  ): RawFactsRecord[] {
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

    const statement =
      this.db.prepare(`
        SELECT
          raw_fact_id,
          run_id,
          canonical_url,
          content_hash,
          extractor_version,
          facts_json,
          captured_at,
          snapshot_path
        FROM raw_facts
        WHERE
          run_id = ?
          AND canonical_url = ?
        ORDER BY raw_fact_id
      `);

    try {
      const rows =
        statement.all(
          runId,
          canonicalUrl
        ) as
          unknown as
          SqlRawFactsRow[];

      return rows.map(
        mapRawFactsRow
      );
    }
    finally {
      closeStatement(
        statement
      );
    }
  }

  terminalize(

    rawRunId:
      string,
    rawCanonicalUrl:
      string,
    state:
      ProductTerminalState
  ): void {
    this.ensureOpen();

    if (
      !TERMINAL_STATES.has(
        state
      )
    ) {
      throw new Error(
        `Invalid terminal state: ${String(state)}`
      );
    }

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

    const openDetailFetches =
      this.countStartedDetailFetchesForUrl(
        runId,
        canonicalUrl
      );

    if (
      openDetailFetches >
      0
    ) {
      throw new Error(
        `URL cannot terminalize while a detail fetch is STARTED: ${canonicalUrl}`
      );
    }

    const timestamp =
      this.timestamp();

    const statement =
      this.db.prepare(`
        UPDATE product_urls
        SET
          state = ?,
          updated_at = ?
        WHERE
          run_id = ?
          AND canonical_url = ?
          AND state = 'IN_PROGRESS'
      `);

    let changes =
      0;

    try {
      const result =
        statement.run(
          state,
          timestamp,
          runId,
          canonicalUrl
        );

      changes =
        Number(
          result.changes
        );
    }
    finally {
      closeStatement(
        statement
      );
    }

    if (
      changes ===
      1
    ) {
      return;
    }

    const current =
      this.productState(
        runId,
        canonicalUrl
      );

    if (!current) {
      throw new Error(
        `URL was not registered for run ${runId}: ${canonicalUrl}`
      );
    }

    throw new Error(
      `URL cannot enter terminal state ${state} from state ${current.state}: ${canonicalUrl}`
    );
  }


  getReconciliationReport(
    rawRunId:
      string
  ): RunStoreReconciliationReport {
    this.ensureOpen();

    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    /*
     * Do not allow a ghost reconciliation report for an
     * unregistered run.
     */
    this.requireRun(
      runId
    );

    const statement =
      this.db.prepare(`
        SELECT
          COUNT(*) AS discovered,

          COALESCE(
            SUM(
              CASE
                WHEN state = 'DISCOVERED'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS pending,

          COALESCE(
            SUM(
              CASE
                WHEN state = 'ACCEPT'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS accepted,

          COALESCE(
            SUM(
              CASE
                WHEN state = 'REVIEW'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS review,

          COALESCE(
            SUM(
              CASE
                WHEN state = 'EXCLUDE'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS excluded,

          COALESCE(
            SUM(
              CASE
                WHEN state = 'ERROR'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS error,

          COALESCE(
            SUM(
              CASE
                WHEN state = 'IN_PROGRESS'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS in_progress

        FROM product_urls
        WHERE run_id = ?
      `);

    try {
      const row =
        statement.get(
          runId
        ) as
          | SqlReconciliationRow
          | undefined;

      const discovered =
        Number(
          row?.discovered ??
          0
        );

      const pending =
        Number(
          row?.pending ??
          0
        );

      const accepted =
        Number(
          row?.accepted ??
          0
        );

      const review =
        Number(
          row?.review ??
          0
        );

      const excluded =
        Number(
          row?.excluded ??
          0
        );

      const error =
        Number(
          row?.error ??
          0
        );

      const inProgress =
        Number(
          row?.in_progress ??
          0
        );

      const accounted =
        pending +
        accepted +
        review +
        excluded +
        error +
        inProgress;

      const balanced =
        discovered ===
        accounted;

      const complete =
        balanced &&
        pending ===
          0 &&
        inProgress ===
          0;

      return {
        runId,

        discovered,

        pending,

        accepted,

        review,

        excluded,

        error,

        inProgress,

        accounted,

        balanced,

        complete
      };
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  completeRun(
    rawRunId:
      string
  ): void {
    this.ensureOpen();

    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    /*
     * Final status and reconciliation must be evaluated under
     * the same short write transaction so another writer cannot
     * change URL lifecycle between reconciliation and finalization.
     *
     * No browser/network work is performed inside this transaction.
     */
    withImmediateTransaction(
      this.db,
      () => {
        const current =
          this.requireRun(
            runId
          );

        if (
          current.status !==
          "RUNNING"
        ) {
          throw new Error(
            `Run cannot complete from status ${current.status}: ${runId}`
          );
        }

        const report =
          this.getReconciliationReport(
            runId
          );

        if (
          !report.complete
        ) {
          throw new Error(
            [
              "Run reconciliation incomplete:",
              `run=${runId}`,
              `discovered=${report.discovered}`,
              `pending=${report.pending}`,
              `accepted=${report.accepted}`,
              `review=${report.review}`,
              `excluded=${report.excluded}`,
              `error=${report.error}`,
              `inProgress=${report.inProgress}`,
              `accounted=${report.accounted}`
            ].join(
              " "
            )
          );
        }

        const openDetailFetches =
          this.countStartedDetailFetchesForRun(
            runId
          );

        if (
          openDetailFetches >
          0
        ) {
          throw new Error(
            `Run cannot complete with ${openDetailFetches} STARTED detail fetch(es): ${runId}`
          );
        }

        const finalStatus =
          report.error >
            0
            ? "COMPLETED_WITH_ERRORS"
            : "COMPLETED";

        const finishedAt =
          this.timestamp();

        const statement =
          this.db.prepare(`
            UPDATE runs
            SET
              status = ?,
              finished_at = ?
            WHERE
              run_id = ?
              AND status = 'RUNNING'
          `);

        try {
          const result =
            statement.run(
              finalStatus,
              finishedAt,
              runId
            );

          if (
            Number(
              result.changes
            ) !==
            1
          ) {
            throw new Error(
              `Run finalization lost lifecycle ownership: ${runId}`
            );
          }
        }
        finally {
          closeStatement(
            statement
          );
        }
      }
    );
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