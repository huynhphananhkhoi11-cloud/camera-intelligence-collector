import {
  createHash
} from "node:crypto";

import type {
  DatabaseSync
} from "node:sqlite";


export const LATEST_SCHEMA_VERSION =
  1;


const MIGRATION_V1_NAME =
  "phase10_v1_run_ledger_foundation";


const MIGRATION_V1_SQL = `
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,

  input_url TEXT NOT NULL,

  canonical_origin TEXT NOT NULL,

  started_at TEXT NOT NULL,

  finished_at TEXT,

  code_version TEXT NOT NULL,

  config_hash TEXT NOT NULL,

  status TEXT NOT NULL
    CHECK (
      status IN (
        'CREATED',
        'RUNNING',
        'COMPLETED',
        'COMPLETED_WITH_ERRORS',
        'INTERRUPTED',
        'FAILED_INVARIANT',
        'FAILED_FATAL'
      )
    )
) STRICT;

CREATE TABLE product_urls (
  run_id TEXT NOT NULL,

  canonical_url TEXT NOT NULL,

  discovery_score REAL
    CHECK (
      discovery_score IS NULL
      OR (
        discovery_score >= 0
        AND discovery_score <= 100
      )
    ),

  sources_json TEXT NOT NULL,

  state TEXT NOT NULL
    CHECK (
      state IN (
        'DISCOVERED',
        'IN_PROGRESS',
        'ACCEPT',
        'REVIEW',
        'EXCLUDE',
        'ERROR'
      )
    ),

  attempts INTEGER NOT NULL
    DEFAULT 0
    CHECK (
      attempts >= 0
    ),

  discovered_at TEXT NOT NULL,

  updated_at TEXT NOT NULL,

  PRIMARY KEY (
    run_id,
    canonical_url
  ),

  FOREIGN KEY (
    run_id
  )
    REFERENCES runs(
      run_id
    )
    ON DELETE CASCADE
) STRICT;

CREATE INDEX
  idx_product_urls_run_state
ON product_urls (
  run_id,
  state
);
`;


export const MIGRATION_V1_CHECKSUM =
  createHash(
    "sha256"
  )
    .update(
      MIGRATION_V1_SQL,
      "utf8"
    )
    .digest(
      "hex"
    );


interface MigrationLedgerRow {
  version: number;

  name: string;

  checksum: string;
}


function pragmaScalar(
  db:
    DatabaseSync,
  pragma:
    string
): unknown {
  const row =
    db.prepare(
      pragma
    ).get();

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


function currentSchemaVersion(
  db:
    DatabaseSync
): number {
  const raw =
    pragmaScalar(
      db,
      "PRAGMA user_version"
    );

  const version =
    Number(
      raw
    );

  if (
    !Number.isInteger(
      version
    ) ||
    version < 0
  ) {
    throw new Error(
      `Invalid SQLite user_version: ${String(raw)}`
    );
  }

  return version;
}


function tableExists(
  db:
    DatabaseSync,
  tableName:
    string
): boolean {
  const row =
    db.prepare(`
      SELECT
        name
      FROM sqlite_master
      WHERE
        type = 'table'
        AND name = ?
    `).get(
      tableName
    );

  return row !==
    undefined;
}


function verifyMigrationV1(
  db:
    DatabaseSync
): void {
  if (
    !tableExists(
      db,
      "schema_migrations"
    )
  ) {
    throw new Error(
      "Migration v1 invariant failed: schema_migrations table is missing."
    );
  }

  if (
    !tableExists(
      db,
      "runs"
    )
  ) {
    throw new Error(
      "Migration v1 invariant failed: runs table is missing."
    );
  }

  if (
    !tableExists(
      db,
      "product_urls"
    )
  ) {
    throw new Error(
      "Migration v1 invariant failed: product_urls table is missing."
    );
  }

  const row =
    db.prepare(`
      SELECT
        version,
        name,
        checksum
      FROM schema_migrations
      WHERE version = ?
    `).get(
      1
    ) as
      | MigrationLedgerRow
      | undefined;

  if (!row) {
    throw new Error(
      "Migration v1 invariant failed: migration ledger row is missing."
    );
  }

  if (
    row.name !==
      MIGRATION_V1_NAME
  ) {
    throw new Error(
      `Migration v1 name mismatch: ${row.name}`
    );
  }

  if (
    row.checksum !==
      MIGRATION_V1_CHECKSUM
  ) {
    throw new Error(
      "Migration v1 checksum mismatch."
    );
  }
}


function applyMigrationV1(
  db:
    DatabaseSync
): void {
  db.exec(
    "BEGIN IMMEDIATE"
  );

  try {
    db.exec(
      MIGRATION_V1_SQL
    );

    db.prepare(`
      INSERT INTO schema_migrations (
        version,
        name,
        checksum,
        applied_at
      )
      VALUES (?, ?, ?, ?)
    `).run(
      1,
      MIGRATION_V1_NAME,
      MIGRATION_V1_CHECKSUM,
      new Date()
        .toISOString()
    );

    db.exec(
      "PRAGMA user_version = 1"
    );

    db.exec(
      "COMMIT"
    );
  }
  catch (error) {
    try {
      db.exec(
        "ROLLBACK"
      );
    }
    catch {
      /*
       * Preserve the original migration failure.
       * A rollback error must not replace it.
       */
    }

    throw error;
  }
}


/**
 * Apply all pending application-owned schema migrations.
 *
 * Migration files are immutable after release.
 * user_version is the fast application schema marker;
 * schema_migrations is the auditable migration ledger.
 */
export function runMigrations(
  db:
    DatabaseSync
): void {
  const current =
    currentSchemaVersion(
      db
    );

  if (
    current >
    LATEST_SCHEMA_VERSION
  ) {
    throw new Error(
      `Database schema version ${current} is newer than supported version ${LATEST_SCHEMA_VERSION}.`
    );
  }

  if (
    current === 0
  ) {
    applyMigrationV1(
      db
    );
  }

  const finalVersion =
    currentSchemaVersion(
      db
    );

  if (
    finalVersion !==
    LATEST_SCHEMA_VERSION
  ) {
    throw new Error(
      `Migration incomplete: expected schema version ${LATEST_SCHEMA_VERSION}, got ${finalVersion}.`
    );
  }

  verifyMigrationV1(
    db
  );
}