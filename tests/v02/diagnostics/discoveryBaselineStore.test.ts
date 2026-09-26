import {
  mkdtemp,
  readFile
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  discoveryBaselinePath,
  loadDiscoveryBaseline,
  persistDiscoveryBaseline,
  shouldPromoteDiscoveryBaseline
} from "../../../src/v02/diagnostics/discoveryBaselineStore.ts";

import type {
  DiscoveryAuditReport
} from "../../../src/v02/diagnostics/discoveryAuditEngine.ts";

import type {
  DiscoveryBaseline
} from "../../../src/v02/diagnostics/discoveryRegression.ts";


function baseline():
  DiscoveryBaseline {

  return {
    schemaVersion:
      "discovery-baseline-v1",

    canonicalOrigin:
      "https://shop.test/",

    capturedAt:
      "2026-09-17T00:00:00.000Z",

    sitemapPageCount:
      100,

    graphNodeCount:
      98,

    rootCount:
      2,

    graphErrorCount:
      0,

    sourceNodeCounts: {
      SITEMAP_PATTERN:
        98
    },

    productGraphMs:
      5000
  };
}


function report(
  status:
    "PASS" |
    "WARN" |
    "FAIL",
  warningRule?:
    string
): DiscoveryAuditReport {

  return {
    schemaVersion:
      "discovery-audit-v1",

    telemetry:
      {} as
        DiscoveryAuditReport[
          "telemetry"
        ],

    findings:
      warningRule
        ? [
            {
              ruleId:
                warningRule,

              status:
                "WARN",

              confidence:
                "HIGH",

              title:
                "test",

              message:
                "test",

              evidence:
                {},

              recommendation:
                null
            }
          ]
        : [],

    summary: {
      status,

      passed:
        status ===
        "PASS"
          ? 1
          : 0,

      warnings:
        status ===
        "WARN"
          ? 1
          : 0,

      failures:
        status ===
        "FAIL"
          ? 1
          : 0,

      total:
        1
    }
  };
}


describe(
  "Discovery Baseline Store",
  () => {

    test(
      "persists and reloads a same-origin baseline",
      async () => {

        const root =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-baseline-"
            )
          );


        const savedPath =
          await persistDiscoveryBaseline(
            baseline(),
            root
          );


        expect(
          savedPath
        ).toBe(
          discoveryBaselinePath(
            "https://shop.test/",
            root
          )
        );


        const loaded =
          await loadDiscoveryBaseline(
            "https://shop.test/",
            root
          );


        expect(
          loaded.status
        ).toBe(
          "FOUND"
        );


        expect(
          loaded.baseline
            ?.graphNodeCount
        ).toBe(
          98
        );


        const raw =
          await readFile(
            savedPath,
            "utf8"
          );


        expect(
          raw
        ).toContain(
          "discovery-baseline-v1"
        );
      }
    );


    test(
      "reports missing baseline without throwing",
      async () => {

        const root =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-baseline-missing-"
            )
          );


        const loaded =
          await loadDiscoveryBaseline(
            "https://shop.test/",
            root
          );


        expect(
          loaded.status
        ).toBe(
          "MISSING"
        );


        expect(
          loaded.baseline
        ).toBeNull();
      }
    );


    test(
      "does not promote deterministic failures",
      () => {

        expect(
          shouldPromoteDiscoveryBaseline(
            report(
              "FAIL"
            ),
            false
          ).promote
        ).toBe(
          false
        );
      }
    );


    test(
      "allows first non-failing run to establish a baseline",
      () => {

        expect(
          shouldPromoteDiscoveryBaseline(
            report(
              "WARN",
              "SOURCE_CONCENTRATION"
            ),
            false
          ).promote
        ).toBe(
          true
        );
      }
    );


    test(
      "does not overwrite a baseline during recall regression",
      () => {

        const decision =
          shouldPromoteDiscoveryBaseline(
            report(
              "WARN",
              "COVERAGE_REGRESSION"
            ),
            true
          );


        expect(
          decision.promote
        ).toBe(
          false
        );
      }
    );

  }
);