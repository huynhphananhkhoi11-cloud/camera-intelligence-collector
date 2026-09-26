import {
  DatabaseSync
} from "node:sqlite";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  LATEST_SCHEMA_VERSION,
  MIGRATION_V1_CHECKSUM,
  MIGRATION_V2_CHECKSUM,
  MIGRATION_V3_CHECKSUM,
  MIGRATION_V4_CHECKSUM,
  MIGRATION_V5_CHECKSUM,
  runMigrations
} from "../../../src/v02/storage/sqliteMigrations.ts";


function pragmaScalar(
  db:
    DatabaseSync,

  pragma:
    string
): unknown {

  const row =
    db.prepare(
      pragma
    ).get() as
      | Record<string, unknown>
      | undefined;


  if (!row) {
    return undefined;
  }


  const values =
    Object.values(
      row
    );


  return values[0];
}


function tableExists(
  db:
    DatabaseSync,

  tableName:
    string
): boolean {

  return (
    db.prepare(`
      SELECT
        name
      FROM sqlite_master
      WHERE
        type = 'table'
        AND name = ?
    `).get(
      tableName
    ) !==
    undefined
  );
}


describe(
  "Phase 10 SQLite migration contract",
  () => {

    test(
      "migrations advance application schema to latest version",
      () => {

        const db =
          new DatabaseSync(
            ":memory:"
          );


        try {
          runMigrations(
            db
          );


          expect(
            Number(
              pragmaScalar(
                db,
                "PRAGMA user_version"
              )
            )
          ).toBe(
            LATEST_SCHEMA_VERSION
          );


          expect(
            LATEST_SCHEMA_VERSION
          ).toBe(
            5
          );
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "migration ledger preserves v1 through v4 and records v5",
      () => {

        const db =
          new DatabaseSync(
            ":memory:"
          );


        try {
          runMigrations(
            db
          );


          const rows =
            db.prepare(`
              SELECT
                version,
                name,
                checksum
              FROM schema_migrations
              ORDER BY version
            `).all();


          expect(
            rows
          ).toEqual([
            {
              version:
                1,

              name:
                "phase10_v1_run_ledger_foundation",

              checksum:
                MIGRATION_V1_CHECKSUM
            },
            {
              version:
                2,

              name:
                "phase10_v2_detail_fetches_raw_facts",

              checksum:
                MIGRATION_V2_CHECKSUM
            },
            {
              version:
                3,

              name:
                "phase10_v3_intelligence_audit",

              checksum:
                MIGRATION_V3_CHECKSUM
            },
            {
              version:
                4,

              name:
                "phase10_v4_cache_reuse",

              checksum:
                MIGRATION_V4_CHECKSUM
            },
            {
              version:
                5,

              name:
                "phase10_v5_export_manifest",

              checksum:
                MIGRATION_V5_CHECKSUM
            }
          ]);
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "latest schema contains all Phase 10 tables including export_manifest",
      () => {

        const db =
          new DatabaseSync(
            ":memory:"
          );


        try {
          runMigrations(
            db
          );


          for (
            const tableName
            of [
              "schema_migrations",
              "runs",
              "product_urls",
              "detail_fetches",
              "raw_facts",
              "classifications",
              "resolved_fields",
              "evidence",
              "conflicts",
              "errors",
              "cache_entries",
              "export_manifest"
            ]
          ) {
            expect(
              tableExists(
                db,
                tableName
              )
            ).toBe(
              true
            );
          }
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "migrations remain idempotent",
      () => {

        const db =
          new DatabaseSync(
            ":memory:"
          );


        try {
          runMigrations(
            db
          );


          const first =
            db.prepare(`
              SELECT
                version,
                applied_at
              FROM schema_migrations
              ORDER BY version
            `).all();


          runMigrations(
            db
          );


          const second =
            db.prepare(`
              SELECT
                version,
                applied_at
              FROM schema_migrations
              ORDER BY version
            `).all();


          expect(
            second
          ).toEqual(
            first
          );


          expect(
            second
          ).toHaveLength(
            5
          );
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "migration rejects newer unsupported schema",
      () => {

        const db =
          new DatabaseSync(
            ":memory:"
          );


        try {
          db.exec(
            "PRAGMA user_version = 999"
          );


          expect(
            () =>
              runMigrations(
                db
              )
          ).toThrow(
            /newer than supported/i
          );
        }
        finally {
          db.close();
        }
      }
    );
  }
);