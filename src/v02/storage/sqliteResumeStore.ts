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
  RunRecord
} from "./runStore.js";

import type {
  ResumePlan,
  ResumeStore
} from "./resumeStore.js";


export interface SQLiteResumeStoreOptions {
  timeoutMs?: number;

  now?: () => string;
}


type Statement =
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

  status:
    RunRecord["status"];
}


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


function mapRun(
  row:
    SqlRunRow
): RunRecord {
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
      row.status
  };
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
       * Preserve the original recovery error.
       */
    }

    throw error;
  }
}


export class SQLiteResumeStore
implements ResumeStore {

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
      SQLiteResumeStoreOptions = {}
  ) {
    const path =
      requiredText(
        databasePath,
        "databasePath"
      );

    const timeoutMs =
      options.timeoutMs ??
      5000;

    if (
      !Number.isInteger(
        timeoutMs
      ) ||
      timeoutMs <
        0
    ) {
      throw new Error(
        "timeoutMs must be a non-negative integer."
      );
    }


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
    if (
      this.closed
    ) {
      throw new Error(
        "SQLiteResumeStore is closed."
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


  private getRun(
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

      return row
        ? mapRun(
            row
          )
        : null;
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  findLatestIncompleteRun(
    rawCanonicalOrigin:
      string
  ): RunRecord | null {
    this.ensureOpen();

    const canonicalOrigin =
      requiredText(
        rawCanonicalOrigin,
        "canonicalOrigin"
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
        WHERE
          canonical_origin = ?
          AND status IN (
            'CREATED',
            'RUNNING',
            'INTERRUPTED'
          )
        ORDER BY
          started_at DESC,
          run_id DESC
        LIMIT 1
      `);

    try {
      const row =
        statement.get(
          canonicalOrigin
        ) as
          | SqlRunRow
          | undefined;

      return row
        ? mapRun(
            row
          )
        : null;
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  prepareResume(
    rawRunId:
      string
  ): ResumePlan {
    this.ensureOpen();

    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    const now =
      this.timestamp();


    return withImmediateTransaction(
      this.db,
      () => {
        const run =
          this.getRun(
            runId
          );

        if (!run) {
          throw new Error(
            `Run was not registered: ${runId}`
          );
        }


        if (
          run.status !==
            "CREATED" &&
          run.status !==
            "RUNNING" &&
          run.status !==
            "INTERRUPTED"
        ) {
          throw new Error(
            `Run is not resumable from status ${run.status}: ${runId}`
          );
        }


        /*
         * Capture queue state before recovery so the returned plan
         * explains where work came from.
         */
        const discoveredStatement =
          this.db.prepare(`
            SELECT
              COUNT(*) AS count
            FROM product_urls
            WHERE
              run_id = ?
              AND state = 'DISCOVERED'
          `);

        let alreadyDiscovered =
          0;

        try {
          const row =
            discoveredStatement.get(
              runId
            ) as
              | {
                  count:
                    number;
                }
              | undefined;

          alreadyDiscovered =
            Number(
              row?.count ??
              0
            );
        }
        finally {
          closeStatement(
            discoveredStatement
          );
        }


        /*
         * A process may die after startDetailFetch() but before
         * finishDetailFetch(). Preserve that acquisition row and
         * close it as a technical recovery failure.
         *
         * We only touch STARTED fetches whose product URL itself
         * is stale IN_PROGRESS.
         */
        const recoverFetches =
          this.db.prepare(`
            UPDATE detail_fetches
            SET
              status =
                'FAILED',

              finished_at =
                ?,

              error_class =
                'ResumeRecovery',

              error_message =
                'Recovered stale STARTED detail fetch during resume after interruption or crash.'
            WHERE
              run_id = ?
              AND status =
                'STARTED'
              AND EXISTS (
                SELECT
                  1
                FROM product_urls
                WHERE
                  product_urls.run_id =
                    detail_fetches.run_id
                  AND product_urls.canonical_url =
                    detail_fetches.canonical_url
                  AND product_urls.state =
                    'IN_PROGRESS'
              )
          `);

        let staleFetchesRecovered =
          0;

        try {
          staleFetchesRecovered =
            Number(
              recoverFetches.run(
                now,
                runId
              ).changes
            );
        }
        finally {
          closeStatement(
            recoverFetches
          );
        }


        /*
         * Stale product worker ownership cannot survive process
         * death. Requeue without erasing attempts/history.
         */
        const recoverProducts =
          this.db.prepare(`
            UPDATE product_urls
            SET
              state =
                'DISCOVERED',

              updated_at =
                ?
            WHERE
              run_id = ?
              AND state =
                'IN_PROGRESS'
          `);

        let recoveredInProgress =
          0;

        try {
          recoveredInProgress =
            Number(
              recoverProducts.run(
                now,
                runId
              ).changes
            );
        }
        finally {
          closeStatement(
            recoverProducts
          );
        }


        /*
         * ERROR is only requeued when the most recent
         * URL-scoped technical error explicitly says retriable.
         *
         * A missing error row or latest retriable=0 leaves ERROR
         * terminal for this run.
         */
        const recoverErrors =
          this.db.prepare(`
            UPDATE product_urls
            SET
              state =
                'DISCOVERED',

              updated_at =
                ?
            WHERE
              run_id = ?
              AND state =
                'ERROR'
              AND EXISTS (
                SELECT
                  1
                FROM errors
                WHERE
                  errors.run_id =
                    product_urls.run_id
                  AND errors.canonical_url =
                    product_urls.canonical_url
                  AND errors.error_id = (
                    SELECT
                      MAX(latest.error_id)
                    FROM errors AS latest
                    WHERE
                      latest.run_id =
                        product_urls.run_id
                      AND latest.canonical_url =
                        product_urls.canonical_url
                  )
                  AND errors.retriable =
                    1
              )
          `);

        let requeuedRetriableErrors =
          0;

        try {
          requeuedRetriableErrors =
            Number(
              recoverErrors.run(
                now,
                runId
              ).changes
            );
        }
        finally {
          closeStatement(
            recoverErrors
          );
        }


        /*
         * CREATED means URLs may have been persisted before worker
         * startup. INTERRUPTED means graceful cancellation.
         * RUNNING may be crash residue.
         *
         * All three converge to RUNNING for the resumed process.
         */
        const activateRun =
          this.db.prepare(`
            UPDATE runs
            SET
              status =
                'RUNNING',

              finished_at =
                NULL
            WHERE
              run_id = ?
              AND status IN (
                'CREATED',
                'INTERRUPTED'
              )
          `);

        try {
          activateRun.run(
            runId
          );
        }
        finally {
          closeStatement(
            activateRun
          );
        }


        const queueStatement =
          this.db.prepare(`
            SELECT
              canonical_url
            FROM product_urls
            WHERE
              run_id = ?
              AND state =
                'DISCOVERED'
            ORDER BY
              canonical_url
          `);

        let queuedUrls:
          string[];

        try {
          const rows =
            queueStatement.all(
              runId
            ) as
              unknown as
              Array<{
                canonical_url:
                  string;
              }>;

          queuedUrls =
            rows.map(
              row =>
                row.canonical_url
            );
        }
        finally {
          closeStatement(
            queueStatement
          );
        }


        const terminalStatement =
          this.db.prepare(`
            SELECT
              COUNT(*) AS count
            FROM product_urls
            WHERE
              run_id = ?
              AND state IN (
                'ACCEPT',
                'REVIEW',
                'EXCLUDE',
                'ERROR'
              )
          `);

        let skippedTerminal =
          0;

        try {
          const row =
            terminalStatement.get(
              runId
            ) as
              | {
                  count:
                    number;
                }
              | undefined;

          skippedTerminal =
            Number(
              row?.count ??
              0
            );
        }
        finally {
          closeStatement(
            terminalStatement
          );
        }


        return {
          runId,

          queuedUrls,

          alreadyDiscovered,

          recoveredInProgress,

          requeuedRetriableErrors,

          staleFetchesRecovered,

          skippedTerminal
        };
      }
    );
  }


  close():
    void {
    if (
      this.closed
    ) {
      return;
    }

    this.db.close();

    this.closed =
      true;
  }
}