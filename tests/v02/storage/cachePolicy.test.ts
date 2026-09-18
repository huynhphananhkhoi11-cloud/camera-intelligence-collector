import {
  mkdtempSync,
  rmSync
} from "node:fs";

import {
  join
} from "node:path";

import {
  tmpdir
} from "node:os";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  SQLiteCacheStore
} from "../../../src/v02/storage/sqliteCacheStore.ts";


function tempDatabase() {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-phase10h-"
      )
    );

  return {
    directory,

    path:
      join(
        directory,
        "runtime.sqlite"
      ),

    cleanup:
      () =>
        rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true
          }
        )
  };
}


describe(
  "Phase 10H cache and reuse policy",
  () => {

    test(
      "raw success cache hits before TTL and expires deterministically",
      () => {
        const temp =
          tempDatabase();

        let now =
          "2026-09-18T08:00:00.000Z";

        const store =
          new SQLiteCacheStore(
            temp.path,
            {
              now:
                () =>
                  now
            }
          );

        const key = {
          kind:
            "HTTP_RAW" as const,

          canonicalRequest:
            "https://example.com/api/products?page=1",

          relevantHeaders: {
            accept:
              "application/json"
          },

          scope:
            "public"
        };

        try {
          expect(
            store.putRawSuccess({
              ...key,

              payloadJson:
                JSON.stringify({
                  ok:
                    true
                }),

              statusCode:
                200,

              ttlMs:
                60000,

              authSensitive:
                false
            })
          ).toMatchObject({
            stored:
              true
          });


          expect(
            store.getRaw(
              key
            )
          ).toMatchObject({
            kind:
              "HTTP_RAW",

            statusCode:
              200,

            payloadJson:
              JSON.stringify({
                ok:
                  true
              }),

            createdAt:
              "2026-09-18T08:00:00.000Z",

            expiresAt:
              "2026-09-18T08:01:00.000Z"
          });


          now =
            "2026-09-18T08:01:00.001Z";


          expect(
            store.getRaw(
              key
            )
          ).toBeNull();


          expect(
            store.getRaw(
              key
            )
          ).toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "fresh policy bypasses valid cache without deleting it",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteCacheStore(
            temp.path,
            {
              now:
                () =>
                  "2026-09-18T08:00:00.000Z"
            }
          );

        const key = {
          kind:
            "API_RAW" as const,

          canonicalRequest:
            "https://example.com/api/p/1",

          relevantHeaders:
            {},

          scope:
            "public"
        };

        try {
          store.putRawSuccess({
            ...key,

            payloadJson:
              "{}",

            statusCode:
              200,

            ttlMs:
              60000,

            authSensitive:
              false
          });


          expect(
            store.getRaw(
              key,
              {
                fresh:
                  true
              }
            )
          ).toBeNull();


          expect(
            store.getRaw(
              key
            )
          ).not.toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "error responses are never persisted as reusable raw cache",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteCacheStore(
            temp.path
          );

        const key = {
          kind:
            "HTTP_RAW" as const,

          canonicalRequest:
            "https://example.com/failure",

          relevantHeaders:
            {},

          scope:
            "public"
        };

        try {
          expect(
            store.putRawSuccess({
              ...key,

              payloadJson:
                JSON.stringify({
                  error:
                    true
                }),

              statusCode:
                503,

              ttlMs:
                60000,

              authSensitive:
                false
            })
          ).toEqual({
            stored:
              false,

            reason:
              "NON_SUCCESS_STATUS"
          });


          expect(
            store.getRaw(
              key
            )
          ).toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "auth-sensitive raw responses are never persisted",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteCacheStore(
            temp.path
          );

        const key = {
          kind:
            "HTTP_RAW" as const,

          canonicalRequest:
            "https://example.com/account",

          relevantHeaders: {
            authorization:
              "Bearer synthetic"
          },

          scope:
            "authenticated"
        };

        try {
          expect(
            store.putRawSuccess({
              ...key,

              payloadJson:
                "{}",

              statusCode:
                200,

              ttlMs:
                60000,

              authSensitive:
                true
            })
          ).toEqual({
            stored:
              false,

            reason:
              "AUTH_SENSITIVE"
          });


          expect(
            store.getRaw(
              key
            )
          ).toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "raw cache key varies by relevant headers and scope",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteCacheStore(
            temp.path
          );

        const base = {
          kind:
            "API_RAW" as const,

          canonicalRequest:
            "https://example.com/api/p/1"
        };

        try {
          store.putRawSuccess({
            ...base,

            relevantHeaders: {
              accept:
                "application/json"
            },

            scope:
              "public",

            payloadJson:
              JSON.stringify({
                source:
                  "public-json"
              }),

            statusCode:
              200,

            ttlMs:
              60000,

            authSensitive:
              false
          });


          expect(
            store.getRaw({
              ...base,

              relevantHeaders: {
                accept:
                  "text/html"
              },

              scope:
                "public"
            })
          ).toBeNull();


          expect(
            store.getRaw({
              ...base,

              relevantHeaders: {
                accept:
                  "application/json"
              },

              scope:
                "different-scope"
            })
          ).toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "raw facts reuse requires exact content hash and extractor version",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteCacheStore(
            temp.path
          );

        const exact = {
          kind:
            "RAW_FACTS" as const,

          canonicalUrl:
            null,

          contentHash:
            "hash-a",

          versionKey:
            "extractor-v1",

          configHash:
            null,

          contractVersion:
            null
        };

        try {
          store.putOffline({
            ...exact,

            payloadJson:
              JSON.stringify({
                title:
                  "Camera"
              })
          });


          expect(
            store.getOffline(
              exact
            )
          ).not.toBeNull();


          expect(
            store.getOffline({
              ...exact,

              contentHash:
                "hash-b"
            })
          ).toBeNull();


          expect(
            store.getOffline({
              ...exact,

              versionKey:
                "extractor-v2"
            })
          ).toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "classification reuse invalidates when config hash changes",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteCacheStore(
            temp.path
          );

        const exact = {
          kind:
            "CLASSIFICATION" as const,

          canonicalUrl:
            null,

          contentHash:
            "content-1",

          versionKey:
            "classifier-v1",

          configHash:
            "config-a",

          contractVersion:
            null
        };

        try {
          store.putOffline({
            ...exact,

            payloadJson:
              JSON.stringify({
                entity:
                  "CAMERA"
              })
          });


          expect(
            store.getOffline(
              exact
            )
          ).not.toBeNull();


          expect(
            store.getOffline({
              ...exact,

              configHash:
                "config-b"
            })
          ).toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "resolved-field reuse invalidates when field contract changes",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteCacheStore(
            temp.path
          );

        const exact = {
          kind:
            "RESOLVED_FIELDS" as const,

          canonicalUrl:
            null,

          contentHash:
            "content-1",

          versionKey:
            "resolver-v1",

          configHash:
            null,

          contractVersion:
            "fields-v1"
        };

        try {
          store.putOffline({
            ...exact,

            payloadJson:
              JSON.stringify({
                rentalPrice:
                  360000
              })
          });


          expect(
            store.getOffline(
              exact
            )
          ).not.toBeNull();


          expect(
            store.getOffline({
              ...exact,

              contractVersion:
                "fields-v2"
            })
          ).toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "detail snapshot reuse requires canonical URL content hash and schema version",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteCacheStore(
            temp.path
          );

        const exact = {
          kind:
            "DETAIL_SNAPSHOT" as const,

          canonicalUrl:
            "https://example.com/p/1",

          contentHash:
            "snapshot-hash",

          versionKey:
            "camera-intelligence.raw-product-facts.v1",

          configHash:
            null,

          contractVersion:
            null
        };

        try {
          store.putOffline({
            ...exact,

            payloadJson:
              JSON.stringify({
                schemaVersion:
                  "camera-intelligence.raw-product-facts.v1"
              })
          });


          expect(
            store.getOffline(
              exact
            )
          ).not.toBeNull();


          expect(
            store.getOffline({
              ...exact,

              canonicalUrl:
                "https://example.com/p/2"
            })
          ).toBeNull();


          expect(
            store.getOffline({
              ...exact,

              versionKey:
                "camera-intelligence.raw-product-facts.v2"
            })
          ).toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "offline fresh policy bypasses reuse but leaves artifact intact",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteCacheStore(
            temp.path
          );

        const exact = {
          kind:
            "RAW_FACTS" as const,

          canonicalUrl:
            null,

          contentHash:
            "content-fresh",

          versionKey:
            "extractor-v1",

          configHash:
            null,

          contractVersion:
            null
        };

        try {
          store.putOffline({
            ...exact,

            payloadJson:
              "{}"
          });


          expect(
            store.getOffline(
              exact,
              {
                fresh:
                  true
              }
            )
          ).toBeNull();


          expect(
            store.getOffline(
              exact
            )
          ).not.toBeNull();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "cache survives close and reopen",
      () => {
        const temp =
          tempDatabase();

        const exact = {
          kind:
            "RAW_FACTS" as const,

          canonicalUrl:
            null,

          contentHash:
            "persistent-content",

          versionKey:
            "extractor-v1",

          configHash:
            null,

          contractVersion:
            null
        };

        try {
          const first =
            new SQLiteCacheStore(
              temp.path
            );

          try {
            first.putOffline({
              ...exact,

              payloadJson:
                JSON.stringify({
                  durable:
                    true
                })
            });
          }
          finally {
            first.close();
          }


          const reopened =
            new SQLiteCacheStore(
              temp.path
            );

          try {
            expect(
              reopened.getOffline(
                exact
              )
            ).toMatchObject({
              payloadJson:
                JSON.stringify({
                  durable:
                    true
                })
            });
          }
          finally {
            reopened.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );
  }
);