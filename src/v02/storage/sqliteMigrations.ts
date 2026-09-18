import {
  createHash
} from "node:crypto";

import type {
  DatabaseSync
} from "node:sqlite";


export const LATEST_SCHEMA_VERSION =
  3;


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




const MIGRATION_V2_NAME =
  "phase10_v2_detail_fetches_raw_facts";


const MIGRATION_V2_SQL = `
CREATE TABLE detail_fetches (
  fetch_id INTEGER PRIMARY KEY AUTOINCREMENT,

  run_id TEXT NOT NULL,

  canonical_url TEXT NOT NULL,

  attempt_no INTEGER NOT NULL
    CHECK (
      attempt_no >= 1
    ),

  started_at TEXT NOT NULL,

  finished_at TEXT,

  final_url TEXT,

  status TEXT NOT NULL
    CHECK (
      status IN (
        'STARTED',
        'SUCCEEDED',
        'FAILED'
      )
    ),

  http_status INTEGER
    CHECK (
      http_status IS NULL
      OR (
        http_status >= 100
        AND http_status <= 599
      )
    ),

  duration_ms INTEGER
    CHECK (
      duration_ms IS NULL
      OR duration_ms >= 0
    ),

  error_class TEXT,

  error_message TEXT,

  content_hash TEXT,

  snapshot_path TEXT,

  UNIQUE (
    run_id,
    canonical_url,
    attempt_no
  ),

  FOREIGN KEY (
    run_id,
    canonical_url
  )
    REFERENCES product_urls(
      run_id,
      canonical_url
    )
    ON DELETE CASCADE
) STRICT;

CREATE INDEX
  idx_detail_fetches_run_url_status
ON detail_fetches (
  run_id,
  canonical_url,
  status
);

CREATE TABLE raw_facts (
  raw_fact_id INTEGER PRIMARY KEY AUTOINCREMENT,

  run_id TEXT NOT NULL,

  canonical_url TEXT NOT NULL,

  content_hash TEXT NOT NULL,

  extractor_version TEXT NOT NULL,

  facts_json TEXT NOT NULL,

  captured_at TEXT NOT NULL,

  snapshot_path TEXT,

  UNIQUE (
    run_id,
    canonical_url,
    content_hash,
    extractor_version
  ),

  FOREIGN KEY (
    run_id,
    canonical_url
  )
    REFERENCES product_urls(
      run_id,
      canonical_url
    )
    ON DELETE CASCADE
) STRICT;

CREATE INDEX
  idx_raw_facts_content_lookup
ON raw_facts (
  content_hash,
  extractor_version
);
`;


export const MIGRATION_V2_CHECKSUM =
  createHash(
    "sha256"
  )
    .update(
      MIGRATION_V2_SQL,
      "utf8"
    )
    .digest(
      "hex"
    );



const MIGRATION_V3_NAME =
  "phase10_v3_intelligence_audit";


const MIGRATION_V3_SQL = `
CREATE TABLE classifications (
  classification_id INTEGER PRIMARY KEY AUTOINCREMENT,

  run_id TEXT NOT NULL,

  canonical_url TEXT NOT NULL,

  content_hash TEXT NOT NULL,

  classifier_version TEXT NOT NULL,

  audit_version TEXT NOT NULL,

  entity_json TEXT NOT NULL,

  offer_json TEXT NOT NULL,

  condition_json TEXT NOT NULL,

  validation_json TEXT NOT NULL,

  created_at TEXT NOT NULL,

  UNIQUE (
    run_id,
    canonical_url,
    audit_version
  ),

  FOREIGN KEY (
    run_id,
    canonical_url
  )
    REFERENCES product_urls(
      run_id,
      canonical_url
    )
    ON DELETE CASCADE
) STRICT;


CREATE INDEX
  idx_classifications_content_version
ON classifications (
  content_hash,
  classifier_version
);


CREATE TABLE resolved_fields (
  run_id TEXT NOT NULL,

  canonical_url TEXT NOT NULL,

  audit_version TEXT NOT NULL,

  resolver_version TEXT NOT NULL,

  field TEXT NOT NULL,

  selected_value_json TEXT NOT NULL,

  confidence REAL NOT NULL,

  conflict INTEGER NOT NULL
    CHECK (
      conflict IN (
        0,
        1
      )
    ),

  created_at TEXT NOT NULL,

  PRIMARY KEY (
    run_id,
    canonical_url,
    audit_version,
    field
  ),

  FOREIGN KEY (
    run_id,
    canonical_url
  )
    REFERENCES product_urls(
      run_id,
      canonical_url
    )
    ON DELETE CASCADE
) STRICT;


CREATE TABLE evidence (
  evidence_id INTEGER PRIMARY KEY AUTOINCREMENT,

  run_id TEXT NOT NULL,

  canonical_url TEXT NOT NULL,

  audit_version TEXT NOT NULL,

  product_name TEXT NOT NULL,

  decision TEXT NOT NULL,

  field TEXT NOT NULL,

  selected_value TEXT NOT NULL,

  source TEXT NOT NULL,

  raw TEXT NOT NULL,

  weight REAL,

  confidence_json TEXT NOT NULL,

  rule_id TEXT NOT NULL,

  created_at TEXT NOT NULL,

  FOREIGN KEY (
    run_id,
    canonical_url
  )
    REFERENCES product_urls(
      run_id,
      canonical_url
    )
    ON DELETE CASCADE
) STRICT;


CREATE INDEX
  idx_evidence_run_url_field
ON evidence (
  run_id,
  canonical_url,
  audit_version,
  field
);


CREATE TABLE conflicts (
  conflict_id INTEGER PRIMARY KEY AUTOINCREMENT,

  run_id TEXT NOT NULL,

  canonical_url TEXT NOT NULL,

  audit_version TEXT NOT NULL,

  product_name TEXT NOT NULL,

  field TEXT NOT NULL,

  severity TEXT NOT NULL
    CHECK (
      severity IN (
        'REVIEW',
        'INFO'
      )
    ),

  values_text TEXT NOT NULL,

  explanation TEXT NOT NULL,

  selected_value TEXT,

  meta_json TEXT NOT NULL,

  created_at TEXT NOT NULL,

  FOREIGN KEY (
    run_id,
    canonical_url
  )
    REFERENCES product_urls(
      run_id,
      canonical_url
    )
    ON DELETE CASCADE
) STRICT;


CREATE INDEX
  idx_conflicts_run_url
ON conflicts (
  run_id,
  canonical_url,
  audit_version
);


CREATE TABLE errors (
  error_id INTEGER PRIMARY KEY AUTOINCREMENT,

  run_id TEXT NOT NULL,

  canonical_url TEXT,

  stage TEXT NOT NULL,

  error_class TEXT NOT NULL,

  message TEXT NOT NULL,

  attempts INTEGER NOT NULL
    CHECK (
      attempts >= 0
    ),

  last_status_json TEXT,

  retriable INTEGER NOT NULL
    CHECK (
      retriable IN (
        0,
        1
      )
    ),

  diagnostic_path TEXT,

  created_at TEXT NOT NULL,

  FOREIGN KEY (
    run_id
  )
    REFERENCES runs(
      run_id
    )
    ON DELETE CASCADE
) STRICT;


CREATE INDEX
  idx_errors_run_url
ON errors (
  run_id,
  canonical_url,
  error_id
);
`;


export const MIGRATION_V3_CHECKSUM =
  createHash(
    "sha256"
  )
    .update(
      MIGRATION_V3_SQL,
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



function verifyMigrationV2(
  db:
    DatabaseSync
): void {
  if (
    !tableExists(
      db,
      "detail_fetches"
    )
  ) {
    throw new Error(
      "Migration v2 invariant failed: detail_fetches table is missing."
    );
  }

  if (
    !tableExists(
      db,
      "raw_facts"
    )
  ) {
    throw new Error(
      "Migration v2 invariant failed: raw_facts table is missing."
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
      2
    ) as
      | MigrationLedgerRow
      | undefined;

  if (!row) {
    throw new Error(
      "Migration v2 invariant failed: migration ledger row is missing."
    );
  }

  if (
    row.name !==
      MIGRATION_V2_NAME
  ) {
    throw new Error(
      `Migration v2 name mismatch: ${row.name}`
    );
  }

  if (
    row.checksum !==
      MIGRATION_V2_CHECKSUM
  ) {
    throw new Error(
      "Migration v2 checksum mismatch."
    );
  }
}


function verifyMigrationV3(
  db:
    DatabaseSync
): void {
  for (
    const tableName
    of [
      "classifications",
      "resolved_fields",
      "evidence",
      "conflicts",
      "errors"
    ]
  ) {
    if (
      !tableExists(
        db,
        tableName
      )
    ) {
      throw new Error(
        `Migration v3 invariant failed: ${tableName} table is missing.`
      );
    }
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
      3
    ) as
      | MigrationLedgerRow
      | undefined;

  if (!row) {
    throw new Error(
      "Migration v3 invariant failed: migration ledger row is missing."
    );
  }

  if (
    row.name !==
      MIGRATION_V3_NAME
  ) {
    throw new Error(
      `Migration v3 name mismatch: ${row.name}`
    );
  }

  if (
    row.checksum !==
      MIGRATION_V3_CHECKSUM
  ) {
    throw new Error(
      "Migration v3 checksum mismatch."
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



function applyMigrationV2(
  db:
    DatabaseSync
): void {
  db.exec(
    "BEGIN IMMEDIATE"
  );

  try {
    db.exec(
      MIGRATION_V2_SQL
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
      2,
      MIGRATION_V2_NAME,
      MIGRATION_V2_CHECKSUM,
      new Date()
        .toISOString()
    );

    db.exec(
      "PRAGMA user_version = 2"
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
       */
    }

    throw error;
  }
}


function applyMigrationV3(
  db:
    DatabaseSync
): void {
  db.exec(
    "BEGIN IMMEDIATE"
  );

  try {
    db.exec(
      MIGRATION_V3_SQL
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
      3,
      MIGRATION_V3_NAME,
      MIGRATION_V3_CHECKSUM,
      new Date()
        .toISOString()
    );

    db.exec(
      "PRAGMA user_version = 3"
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
  let current =
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

    current =
      currentSchemaVersion(
        db
      );
  }

  if (
    current === 1
  ) {
    verifyMigrationV1(
      db
    );

    applyMigrationV2(
      db
    );

    current =
      currentSchemaVersion(
        db
      );
  }

  if (
    current === 2
  ) {
    verifyMigrationV1(
      db
    );

    verifyMigrationV2(
      db
    );

    applyMigrationV3(
      db
    );

    current =
      currentSchemaVersion(
        db
      );
  }

  if (
    current !==
    LATEST_SCHEMA_VERSION
  ) {
    throw new Error(
      `Migration incomplete: expected schema version ${LATEST_SCHEMA_VERSION}, got ${current}.`
    );
  }

  verifyMigrationV1(
    db
  );

  verifyMigrationV2(
    db
  );

  verifyMigrationV3(
    db
  );
}