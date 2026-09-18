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
            2
          );
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "migration ledger preserves immutable v1 and records v2",
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
            `).all() as
              unknown as
              Array<{
                version:
                  number;

                name:
                  string;

                checksum:
                  string;
              }>;

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
            }
          ]);
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "latest schema contains run ledger, detail attempts, and raw facts",
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
              "raw_facts"
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

          for (
            const indexName
            of [
              "idx_product_urls_run_state",
              "idx_detail_fetches_run_url_status",
              "idx_raw_facts_content_lookup"
            ]
          ) {
            const row =
              db.prepare(`
                SELECT
                  name
                FROM sqlite_master
                WHERE
                  type = 'index'
                  AND name = ?
              `).get(
                indexName
              );

            expect(
              row
            ).toBeDefined();
          }
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "migrations are idempotent and do not duplicate ledger rows",
      () => {
        const db =
          new DatabaseSync(
            ":memory:"
          );

        try {
          runMigrations(
            db
          );

          const firstRows =
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

          const secondRows =
            db.prepare(`
              SELECT
                version,
                applied_at
              FROM schema_migrations
              ORDER BY version
            `).all();

          const countRow =
            db.prepare(`
              SELECT
                COUNT(*) AS count
              FROM schema_migrations
            `).get() as
              | {
                  count:
                    number;
                }
              | undefined;

          expect(
            countRow?.count
          ).toBe(
            2
          );

          expect(
            secondRows
          ).toEqual(
            firstRows
          );

          expect(
            Number(
              pragmaScalar(
                db,
                "PRAGMA user_version"
              )
            )
          ).toBe(
            2
          );
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "migration rejects a database newer than the supported schema",
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