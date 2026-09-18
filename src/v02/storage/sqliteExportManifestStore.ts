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
  ExportManifestRecord,
  ExportManifestStore,
  RecordCompletedExportInput
} from "./exportManifestStore.js";


export interface SQLiteExportManifestStoreOptions {
  timeoutMs?: number;

  now?: () => string;
}


type Statement =
  ReturnType<
    DatabaseSync["prepare"]
  >;


interface SqlExportManifestRow {
  export_id: number;

  run_id: string;

  path: string;

  file_hash: string;

  file_size: number;

  schema_version: string;

  created_at: string;
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


function normalizeTimeout(
  value:
    number
): number {

  if (
    !Number.isSafeInteger(
      value
    ) ||
    value <
      0
  ) {
    throw new Error(
      `timeoutMs must be a non-negative safe integer: ${String(value)}`
    );
  }

  return value;
}


function normalizeFileHash(
  value:
    string
): string {

  const normalized =
    requiredText(
      value,
      "fileHash"
    )
      .toLowerCase();


  if (
    !/^[a-f0-9]{64}$/
      .test(
        normalized
      )
  ) {
    throw new Error(
      "fileHash must be a SHA-256 hexadecimal digest."
    );
  }


  return normalized;
}


function normalizeFileSize(
  value:
    number
): number {

  if (
    !Number.isSafeInteger(
      value
    ) ||
    value <
      0
  ) {
    throw new Error(
      `fileSize must be a non-negative safe integer: ${String(value)}`
    );
  }

  return value;
}


function mapRow(
  row:
    SqlExportManifestRow
): ExportManifestRecord {

  return {
    exportId:
      Number(
        row.export_id
      ),

    runId:
      row.run_id,

    path:
      row.path,

    fileHash:
      row.file_hash,

    fileSize:
      Number(
        row.file_size
      ),

    schemaVersion:
      row.schema_version,

    createdAt:
      row.created_at
  };
}


/**
 * Persist only COMPLETED export identities.
 *
 * There is intentionally no STARTED manifest row:
 * - workbook writer must return successfully;
 * - caller hashes the finished file;
 * - only then may recordCompletedExport() be called.
 *
 * A crash before that point therefore leaves no completed
 * export_manifest row.
 */
export class SQLiteExportManifestStore
implements ExportManifestStore {

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
      SQLiteExportManifestStoreOptions = {}
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


    this.now =
      options.now ??
      (() =>
        new Date()
          .toISOString()
      );


    this.db =
      new DatabaseSync(
        path
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
         * Preserve constructor failure.
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
        "SQLiteExportManifestStore is closed."
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


  recordCompletedExport(
    input:
      RecordCompletedExportInput
  ): ExportManifestRecord {

    this.ensureOpen();


    const runId =
      requiredText(
        input.runId,
        "runId"
      );

    const path =
      requiredText(
        input.path,
        "path"
      );

    const fileHash =
      normalizeFileHash(
        input.fileHash
      );

    const fileSize =
      normalizeFileSize(
        input.fileSize
      );

    const schemaVersion =
      requiredText(
        input.schemaVersion,
        "schemaVersion"
      );

    const createdAt =
      this.timestamp();


    const statement =
      this.db.prepare(`
        INSERT INTO export_manifest (
          run_id,
          path,
          file_hash,
          file_size,
          schema_version,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)

        ON CONFLICT (
          run_id,
          path
        )
        DO UPDATE SET
          file_hash =
            excluded.file_hash,

          file_size =
            excluded.file_size,

          schema_version =
            excluded.schema_version,

          created_at =
            excluded.created_at
      `);


    try {
      statement.run(
        runId,
        path,
        fileHash,
        fileSize,
        schemaVersion,
        createdAt
      );
    }
    finally {
      closeStatement(
        statement
      );
    }


    const record =
      this.findCompletedExport(
        runId,
        path
      );


    if (!record) {
      throw new Error(
        `Completed export manifest was not readable after persistence: ${runId} ${path}`
      );
    }


    return record;
  }


  findCompletedExport(
    rawRunId:
      string,

    rawPath:
      string
  ): ExportManifestRecord | null {

    this.ensureOpen();


    const runId =
      requiredText(
        rawRunId,
        "runId"
      );

    const path =
      requiredText(
        rawPath,
        "path"
      );


    const statement =
      this.db.prepare(`
        SELECT
          export_id,
          run_id,
          path,
          file_hash,
          file_size,
          schema_version,
          created_at
        FROM export_manifest
        WHERE
          run_id = ?
          AND path = ?
      `);


    try {
      const row =
        statement.get(
          runId,
          path
        ) as
          | SqlExportManifestRow
          | undefined;


      return row
        ? mapRow(
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


  listCompletedExports(
    rawRunId:
      string
  ): ExportManifestRecord[] {

    this.ensureOpen();


    const runId =
      requiredText(
        rawRunId,
        "runId"
      );


    const statement =
      this.db.prepare(`
        SELECT
          export_id,
          run_id,
          path,
          file_hash,
          file_size,
          schema_version,
          created_at
        FROM export_manifest
        WHERE run_id = ?
        ORDER BY
          created_at,
          export_id
      `);


    try {
      return (
        statement.all(
          runId
        ) as unknown as
          SqlExportManifestRow[]
      ).map(
        mapRow
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