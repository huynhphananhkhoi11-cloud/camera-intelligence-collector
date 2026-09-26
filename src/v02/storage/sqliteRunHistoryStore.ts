import {
  DatabaseSync
} from "node:sqlite";

import {
  isResumableRunStatus,
  type RunHistoryRecord,
  type RunHistoryStore
} from "./runHistoryStore.js";

import type {
  RunStatus
} from "./runStore.js";


interface SqlRunHistoryRow {
  run_id:
    string;

  input_url:
    string;

  canonical_origin:
    string;

  started_at:
    string;

  finished_at:
    string |
    null;

  status:
    string;

  remaining:
    number;
}


function requiredDatabasePath(
  raw:
    string
): string {

  const path =
    raw.trim();


  if (
    path.length ===
      0
  ) {

    throw new Error(
      "databasePath is required."
    );
  }


  return path;
}


function normalizedLimit(
  raw:
    number
): number {

  if (
    !Number.isInteger(
      raw
    ) ||
    raw < 1 ||
    raw > 100
  ) {

    throw new Error(
      "Run history limit must be an integer from 1 to 100."
    );
  }


  return raw;
}


function mapHistoryRow(
  row:
    SqlRunHistoryRow
): RunHistoryRecord {

  const status =
    row.status as
      RunStatus;


  return Object.freeze({
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

    status,

    remaining:
      Number(
        row.remaining
      ),

    resumable:
      isResumableRunStatus(
        status
      )
  });
}


/*
 * Deliberately separate from SQLiteRunStore.
 *
 * Run history is a read model, not lifecycle ownership:
 * - no migrations;
 * - no recovery;
 * - no run status transitions;
 * - no queue mutation;
 * - database is opened read-only.
 */
export class SQLiteRunHistoryStore
implements
  RunHistoryStore {

  private readonly db:
    DatabaseSync;

  private closed =
    false;


  constructor(
    databasePath:
      string
  ) {

    const path =
      requiredDatabasePath(
        databasePath
      );


    this.db =
      new DatabaseSync(
        path,
        {
          readOnly:
            true,

          timeout:
            5000
        }
      );
  }


  private ensureOpen():
    void {

    if (
      this.closed
    ) {

      throw new Error(
        "Run history store is closed."
      );
    }
  }


  listRecentRuns(
    limit:
      number =
        20
  ): readonly RunHistoryRecord[] {

    this.ensureOpen();


    const safeLimit =
      normalizedLimit(
        limit
      );


    const statement =
      this.db.prepare(`
        SELECT
          runs.run_id,
          runs.input_url,
          runs.canonical_origin,
          runs.started_at,
          runs.finished_at,
          runs.status,

          COALESCE(
            SUM(
              CASE
                WHEN product_urls.state IN (
                  'DISCOVERED',
                  'IN_PROGRESS'
                )
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS remaining

        FROM runs

        LEFT JOIN product_urls
          ON product_urls.run_id =
            runs.run_id

        GROUP BY
          runs.run_id,
          runs.input_url,
          runs.canonical_origin,
          runs.started_at,
          runs.finished_at,
          runs.status

        ORDER BY
          runs.started_at DESC,
          runs.run_id DESC

        LIMIT ?
      `);


    const rows =
      statement.all(
        safeLimit
      ) as
        unknown as
        SqlRunHistoryRow[];


    return Object.freeze(
      rows.map(
        mapHistoryRow
      )
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