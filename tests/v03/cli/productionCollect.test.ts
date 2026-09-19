import {
  describe,
  expect,
  test
} from "vitest";

import {
  runProductionCollect
} from "../../../src/v03/cli/productionCollect.js";

import type {
  BulkCollectionResult
} from "../../../src/v03/bulk/bulkTypes.js";


function fixture():
  BulkCollectionResult {

  return {
    rootUrl:
      "https://example.com/",

    discovery: {
      recon: {
        rootUrl:
          "https://example.com/",
        finalPageUrl:
          "https://example.com/",
        exchanges:
          [],
        observationWindowMs:
          1
      },

      qualification: {
        candidates:
          [],
        qualified:
          []
      },

      replay: {
        qualifiedCandidateCount:
          0,
        replayedCandidateCount:
          0,
        discoveries:
          [],
        discoveredUrls:
          [],
        warnings:
          []
      },
      staticTraversal: {
        visitedPages:
          [],
        evidence:
          [],
        warnings:
          []
      },
      sitemap: {
        sitemapDocuments:
          [],
        evidence:
          [],
        warnings:
          []
      },
      renderedDom: {
        used:
          false,
        evidence:
          [],
        warnings:
          []
      },
      evidence:
        [],
      allDiscoveredUrls:
        [],
      channelCounts: {
        STATIC_HTML:
          0,
        SITEMAP:
          0,
        ENDPOINT_REPLAY:
          0,
        RENDERED_DOM:
          0
      }
    },

    candidateUrls:
      [],

    attemptedUrls:
      [],

    identityResolution: {
      clusters:
        [],
      byRequestedUrl:
        {}
    },

    products:
      [],

    cameras:
      [],

    nonCameras:
      [],

    uncertain:
      [],

    errors:
      []
  };
}


describe(
  "V3 production collect runner",
  () => {

    test(
      "runs collection, writes workbook and opens the completed artifact by default when enabled",
      async () => {

        const messages:
          string[] =
            [];

        const exports:
          string[] =
            [];

        const opens:
          string[] =
            [];


        const result =
          await runProductionCollect({
            rootUrl:
              "https://example.com/",

            maxProducts:
              100,

            concurrency:
              3,

            output:
              "C:\\Downloads\\camera-v3.xlsx",

            open:
              true,

            writeInfo:
              message => {
                messages.push(
                  message
                );
              },

            createCollector:
              () => ({
                async collect() {
                  return fixture();
                }
              }),

            exportWorkbook:
              async path => {
                exports.push(
                  path
                );
              },

            openArtifact:
              async path => {
                opens.push(
                  path
                );
              }
          });


        expect(
          exports
        ).toEqual([
          "C:\\Downloads\\camera-v3.xlsx"
        ]);


        expect(
          opens
        ).toEqual([
          "C:\\Downloads\\camera-v3.xlsx"
        ]);


        expect(
          result.openResult
        ).toBe(
          "OPENED"
        );


        expect(
          messages
        ).toEqual(
          expect.arrayContaining([
            "Discovering product data...",
            "Writing Excel...",
            "Saved: C:\\Downloads\\camera-v3.xlsx",
            "Opening Excel..."
          ])
        );
      }
    );


    test(
      "--no-open behavior leaves the completed workbook unopened",
      async () => {

        let openCalls =
          0;


        const result =
          await runProductionCollect({
            rootUrl:
              "https://example.com/",

            maxProducts:
              100,

            concurrency:
              3,

            output:
              "C:\\Downloads\\camera-v3.xlsx",

            open:
              false,

            writeInfo:
              () => {},

            createCollector:
              () => ({
                async collect() {
                  return fixture();
                }
              }),

            exportWorkbook:
              async () => {},

            openArtifact:
              async () => {
                openCalls +=
                  1;
              }
          });


        expect(
          openCalls
        ).toBe(
          0
        );


        expect(
          result.openResult
        ).toBe(
          "DISABLED"
        );
      }
    );


    test(
      "invalid concurrency is rejected before collection starts",
      async () => {

        let collected =
          false;


        await expect(
          runProductionCollect({
            rootUrl:
              "https://example.com/",

            maxProducts:
              100,

            concurrency:
              0,

            open:
              false,

            createCollector:
              () => ({
                async collect() {
                  collected =
                    true;

                  return fixture();
                }
              })
          })
        ).rejects.toThrow(
          "concurrency must be a positive integer"
        );


        expect(
          collected
        ).toBe(
          false
        );
      }
    );
  }
);
