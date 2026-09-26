import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import * as path from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  persistBootstrapSnapshot
} from "../../../src/v02/discovery/bootstrapSnapshot.ts";

import type {
  SiteBootstrapResult
} from "../../../src/v02/discovery/siteBootstrapper.ts";


describe(
  "Bootstrap Snapshot V2",
  () => {

    test(
      "persists bootstrap diagnostic JSON",
      async () => {

        const directory =
          await mkdtemp(
            path.join(
              tmpdir(),
              "camintel-bootstrap-"
            )
          );

        try {

          const result = {
            inputUrl:
              "example.com",

            normalizedUrl:
              "https://example.com/",

            finalUrl:
              "https://example.com/",

            canonicalOrigin:
              "https://example.com/",

            redirect: {
              inputUrl:
                "example.com",

              normalizedUrl:
                "https://example.com/",

              finalUrl:
                "https://example.com/",

              canonicalOrigin:
                "https://example.com/",

              status:
                200,

              method:
                "HEAD",

              redirects: []
            },

            robots: {
              robotsUrl:
                "https://example.com/robots.txt",

              status:
                404,

              available:
                false,

              sitemapUrls: [],
              groups: [],
              rawText: "",
              error: null
            },

            sitemaps: {
              sitemapUrls: [],
              pageUrls: [],
              fetched: [],
              usedFallback:
                true
            },

            menuSeeds: [],

            seeds: [
              {
                url:
                  "https://example.com/",

                sources: [
                  "HOMEPAGE",
                  "ENTRY"
                ],

                confidence:
                  1
              }
            ],

            diagnostics: {
              redirectCount: 0,
              robotsAvailable:
                false,
              sitemapCount: 0,
              sitemapPageCount: 0,
              menuSeedCount: 0,
              seedCount: 1,
              excludedByRobots: 0,
              excludedOutOfScope: 0
            }
          } satisfies SiteBootstrapResult;


          const saved =
            await persistBootstrapSnapshot(
              result,
              {
                outputDir:
                  directory,

                runId:
                  "test-run",

                now:
                  () =>
                    new Date(
                      "2026-09-17T12:00:00.000Z"
                    )
              }
            );


          const raw =
            await readFile(
              saved.path,
              "utf8"
            );

          const parsed =
            JSON.parse(
              raw
            );


          expect(
            parsed.schemaVersion
          ).toBe(1);

          expect(
            parsed.runId
          ).toBe(
            "test-run"
          );

          expect(
            parsed.result
              .canonicalOrigin
          ).toBe(
            "https://example.com/"
          );

          expect(
            parsed.result
              .seeds
          ).toHaveLength(
            1
          );
        }
        finally {

          await rm(
            directory,
            {
              recursive: true,
              force: true
            }
          );
        }
      }
    );

  }
);