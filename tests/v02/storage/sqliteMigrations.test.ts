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
  "Phase 10B SQLite migration contract",
  () => {

    test(
      "migration v1 advances application schema version",
      () => {
        const db =
          new DatabaseSync(
            ":memory:"
          );

        try {
          runMigrations(
            db
          );

          const version =
            Number(
              pragmaScalar(
                db,
                "PRAGMA user_version"
              )
            );

          expect(
            version
          ).toBe(
            LATEST_SCHEMA_VERSION
          );
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "migration v1 creates schema_migrations audit ledger",
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
            tableExists(
              db,
              "schema_migrations"
            )
          ).toBe(true);

          const row =
            db.prepare(`
              SELECT
                version,
                name,
                checksum,
                applied_at
              FROM schema_migrations
              WHERE version = ?
            `).get(
              1
            ) as
              | Record<string, unknown>
              | undefined;

          expect(
            row
          ).toBeDefined();

          expect(
            row?.version
          ).toBe(
            1
          );

          expect(
            row?.name
          ).toBe(
            "phase10_v1_run_ledger_foundation"
          );

          expect(
            row?.checksum
          ).toBe(
            MIGRATION_V1_CHECKSUM
          );

          expect(
            typeof row?.applied_at
          ).toBe(
            "string"
          );
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "migration v1 creates runs and product_urls foundation",
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
            tableExists(
              db,
              "runs"
            )
          ).toBe(true);

          expect(
            tableExists(
              db,
              "product_urls"
            )
          ).toBe(true);

          const index =
            db.prepare(`
              SELECT
                name
              FROM sqlite_master
              WHERE
                type = 'index'
                AND name = 'idx_product_urls_run_state'
            `).get();

          expect(
            index
          ).toBeDefined();
        }
        finally {
          db.close();
        }
      }
    );


    test(
      "migration v1 is idempotent and does not duplicate ledger rows",
      () => {
        const db =
          new DatabaseSync(
            ":memory:"
          );

        try {
          runMigrations(
            db
          );

          const firstAppliedAt =
            db.prepare(`
              SELECT
                applied_at
              FROM schema_migrations
              WHERE version = 1
            `).get() as
              | {
                  applied_at:
                    string;
                }
              | undefined;

          runMigrations(
            db
          );

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

          const secondAppliedAt =
            db.prepare(`
              SELECT
                applied_at
              FROM schema_migrations
              WHERE version = 1
            `).get() as
              | {
                  applied_at:
                    string;
                }
              | undefined;

          expect(
            countRow?.count
          ).toBe(
            1
          );

          expect(
            secondAppliedAt?.applied_at
          ).toBe(
            firstAppliedAt?.applied_at
          );

          expect(
            Number(
              pragmaScalar(
                db,
                "PRAGMA user_version"
              )
            )
          ).toBe(
            1
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