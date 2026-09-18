import {
  DatabaseSync
} from "node:sqlite";

import {
  configureSqliteConnection
} from "./sqliteRunStore.js";

import {
  runMigrations
} from "./sqliteMigrations.js";

import {
  offlineCacheKey,
  rawCacheKey
} from "./cacheStore.js";

import type {
  CacheEntryRecord,
  CacheReadOptions,
  CacheStore,
  OfflineCacheKeyInput,
  OfflineCacheKind,
  PutOfflineCacheInput,
  PutRawCacheInput,
  RawCacheKeyInput,
  RawCacheWriteResult
} from "./cacheStore.js";


export interface SQLiteCacheStoreOptions {
  timeoutMs?: number;

  now?: () => string;
}


type Statement =
  ReturnType<
    DatabaseSync["prepare"]
  >;


interface SqlCacheRow {
  cache_key: string;

  kind:
    CacheEntryRecord["kind"];

  canonical_url:
    string |
    null;

  scope: string;

  content_hash:
    string |
    null;

  version_key: string;

  config_hash:
    string |
    null;

  contract_version:
    string |
    null;

  status_code:
    number |
    null;

  payload_json: string;

  created_at: string;

  expires_at:
    string |
    null;
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


function requireJson(
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


function positiveInteger(
  value:
    number,
  label:
    string
): number {
  if (
    !Number.isInteger(
      value
    ) ||
    value <= 0
  ) {
    throw new Error(
      `${label} must be a positive integer.`
    );
  }

  return value;
}


function mapRow(
  row:
    SqlCacheRow
): CacheEntryRecord {
  return {
    cacheKey:
      row.cache_key,

    kind:
      row.kind,

    canonicalUrl:
      row.canonical_url,

    scope:
      row.scope,

    contentHash:
      row.content_hash,

    versionKey:
      row.version_key,

    configHash:
      row.config_hash,

    contractVersion:
      row.contract_version,

    statusCode:
      row.status_code,

    payloadJson:
      row.payload_json,

    createdAt:
      row.created_at,

    expiresAt:
      row.expires_at
  };
}


function validateOfflinePolicy(
  input:
    OfflineCacheKeyInput
): void {
  requiredText(
    input.contentHash,
    "contentHash"
  );

  requiredText(
    input.versionKey,
    "versionKey"
  );


  if (
    input.kind ===
    "DETAIL_SNAPSHOT"
  ) {
    if (
      input.canonicalUrl ===
      null
    ) {
      throw new Error(
        "DETAIL_SNAPSHOT cache requires canonicalUrl."
      );
    }

    requiredText(
      input.canonicalUrl,
      "canonicalUrl"
    );

    return;
  }


  if (
    input.kind ===
    "RAW_FACTS"
  ) {
    return;
  }


  if (
    input.kind ===
    "CLASSIFICATION"
  ) {
    if (
      input.configHash ===
      null
    ) {
      throw new Error(
        "CLASSIFICATION cache requires configHash."
      );
    }

    requiredText(
      input.configHash,
      "configHash"
    );

    return;
  }


  if (
    input.kind ===
    "RESOLVED_FIELDS"
  ) {
    if (
      input.contractVersion ===
      null
    ) {
      throw new Error(
        "RESOLVED_FIELDS cache requires contractVersion."
      );
    }

    requiredText(
      input.contractVersion,
      "contractVersion"
    );

    return;
  }


  const exhaustive:
    never =
      input.kind;

  throw new Error(
    `Unsupported offline cache kind: ${String(exhaustive)}`
  );
}


export class SQLiteCacheStore
implements CacheStore {

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
      SQLiteCacheStoreOptions = {}
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
      timeoutMs < 0
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
        "SQLiteCacheStore is closed."
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


  private readByKey(
    cacheKey:
      string
  ): CacheEntryRecord | null {
    const statement =
      this.db.prepare(`
        SELECT
          cache_key,
          kind,
          canonical_url,
          scope,
          content_hash,
          version_key,
          config_hash,
          contract_version,
          status_code,
          payload_json,
          created_at,
          expires_at
        FROM cache_entries
        WHERE cache_key = ?
      `);

    try {
      const row =
        statement.get(
          cacheKey
        ) as
          | SqlCacheRow
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


  private deleteKey(
    cacheKey:
      string
  ): void {
    const statement =
      this.db.prepare(`
        DELETE FROM cache_entries
        WHERE cache_key = ?
      `);

    try {
      statement.run(
        cacheKey
      );
    }
    finally {
      closeStatement(
        statement
      );
    }
  }


  putRawSuccess(
    input:
      PutRawCacheInput
  ): RawCacheWriteResult {
    this.ensureOpen();


    if (
      input.authSensitive
    ) {
      return {
        stored:
          false,

        reason:
          "AUTH_SENSITIVE"
      };
    }


    if (
      !Number.isInteger(
        input.statusCode
      ) ||
      input.statusCode < 200 ||
      input.statusCode > 299
    ) {
      return {
        stored:
          false,

        reason:
          "NON_SUCCESS_STATUS"
      };
    }


    const ttlMs =
      positiveInteger(
        input.ttlMs,
        "ttlMs"
      );

    const payloadJson =
      requireJson(
        input.payloadJson,
        "payloadJson"
      );

    const cacheKey =
      rawCacheKey(
        input
      );

    const createdAt =
      this.timestamp();

    const createdAtMs =
      Date.parse(
        createdAt
      );

    if (
      !Number.isFinite(
        createdAtMs
      )
    ) {
      throw new Error(
        "now() must return a valid ISO timestamp."
      );
    }


    const expiresAt =
      new Date(
        createdAtMs +
        ttlMs
      ).toISOString();


    const statement =
      this.db.prepare(`
        INSERT INTO cache_entries (
          cache_key,
          kind,
          canonical_url,
          scope,
          content_hash,
          version_key,
          config_hash,
          contract_version,
          status_code,
          payload_json,
          created_at,
          expires_at
        )
        VALUES (
          ?,
          ?,
          NULL,
          ?,
          NULL,
          'ttl-v1',
          NULL,
          NULL,
          ?,
          ?,
          ?,
          ?
        )
        ON CONFLICT (
          cache_key
        )
        DO UPDATE SET
          kind =
            excluded.kind,
          scope =
            excluded.scope,
          status_code =
            excluded.status_code,
          payload_json =
            excluded.payload_json,
          created_at =
            excluded.created_at,
          expires_at =
            excluded.expires_at
      `);

    try {
      statement.run(
        cacheKey,
        input.kind,
        requiredText(
          input.scope,
          "scope"
        ),
        input.statusCode,
        payloadJson,
        createdAt,
        expiresAt
      );
    }
    finally {
      closeStatement(
        statement
      );
    }


    return {
      stored:
        true,

      cacheKey
    };
  }


  getRaw(
    input:
      RawCacheKeyInput,
    options:
      CacheReadOptions = {}
  ): CacheEntryRecord | null {
    this.ensureOpen();


    if (
      options.fresh ===
      true
    ) {
      return null;
    }


    const cacheKey =
      rawCacheKey(
        input
      );

    const row =
      this.readByKey(
        cacheKey
      );

    if (!row) {
      return null;
    }


    if (
      row.kind !==
      "HTTP_RAW" &&
      row.kind !==
      "API_RAW"
    ) {
      return null;
    }


    if (
      row.expiresAt ===
      null
    ) {
      this.deleteKey(
        cacheKey
      );

      return null;
    }


    const expiresAt =
      Date.parse(
        row.expiresAt
      );

    const now =
      Date.parse(
        this.timestamp()
      );


    if (
      !Number.isFinite(
        expiresAt
      ) ||
      !Number.isFinite(
        now
      )
    ) {
      this.deleteKey(
        cacheKey
      );

      return null;
    }


    if (
      now >
      expiresAt
    ) {
      this.deleteKey(
        cacheKey
      );

      return null;
    }


    return row;
  }


  putOffline(
    input:
      PutOfflineCacheInput
  ): CacheEntryRecord {
    this.ensureOpen();

    validateOfflinePolicy(
      input
    );

    const payloadJson =
      requireJson(
        input.payloadJson,
        "payloadJson"
      );

    const cacheKey =
      offlineCacheKey(
        input
      );

    const createdAt =
      this.timestamp();


    const statement =
      this.db.prepare(`
        INSERT INTO cache_entries (
          cache_key,
          kind,
          canonical_url,
          scope,
          content_hash,
          version_key,
          config_hash,
          contract_version,
          status_code,
          payload_json,
          created_at,
          expires_at
        )
        VALUES (
          ?,
          ?,
          ?,
          'offline',
          ?,
          ?,
          ?,
          ?,
          NULL,
          ?,
          ?,
          NULL
        )
        ON CONFLICT (
          cache_key
        )
        DO UPDATE SET
          payload_json =
            excluded.payload_json,
          created_at =
            excluded.created_at
      `);

    try {
      statement.run(
        cacheKey,
        input.kind,
        input.canonicalUrl,
        requiredText(
          input.contentHash,
          "contentHash"
        ),
        requiredText(
          input.versionKey,
          "versionKey"
        ),
        input.configHash,
        input.contractVersion,
        payloadJson,
        createdAt
      );
    }
    finally {
      closeStatement(
        statement
      );
    }


    const row =
      this.readByKey(
        cacheKey
      );

    if (!row) {
      throw new Error(
        `Offline cache row disappeared after write: ${cacheKey}`
      );
    }

    return row;
  }


  getOffline(
    input:
      OfflineCacheKeyInput,
    options:
      CacheReadOptions = {}
  ): CacheEntryRecord | null {
    this.ensureOpen();


    if (
      options.fresh ===
      true
    ) {
      return null;
    }


    validateOfflinePolicy(
      input
    );


    const cacheKey =
      offlineCacheKey(
        input
      );

    const row =
      this.readByKey(
        cacheKey
      );

    if (!row) {
      return null;
    }


    const offlineKinds:
      ReadonlySet<
        OfflineCacheKind
      > =
        new Set([
          "DETAIL_SNAPSHOT",
          "RAW_FACTS",
          "CLASSIFICATION",
          "RESOLVED_FIELDS"
        ]);


    if (
      !offlineKinds.has(
        row.kind as
          OfflineCacheKind
      )
    ) {
      return null;
    }


    return row;
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