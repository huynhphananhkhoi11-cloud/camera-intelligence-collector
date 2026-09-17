import {
  describe,
  expect,
  test
} from "vitest";

import {
  computeCoverage
} from "../../../src/v02/coverage/coverageEngine.ts";

import type {
  PipelineResult
} from "../../../src/v02/pipeline/productPipeline.ts";


function fake(
  decision:
    "ACCEPT" |
    "REVIEW" |
    "EXCLUDE",

  evidenceCoverage:
    number
): PipelineResult {

  return {
    validation: {
      decision,
      reasons: [],
      evidenceCoverage,
      requiredEvidence: 4,
      provenEvidence:
        Math.round(
          evidenceCoverage *
          4
        )
    }
  } as unknown as
    PipelineResult;
}


describe(
  "Coverage Engine V2",
  () => {

    test(
      "computes independent coverage dimensions",
      () => {

        const report =
          computeCoverage({
            catalogPagesDiscovered:
              2,

            catalogPagesVisited:
              2,

            productUrlsDiscovered:
              3,

            detailPagesAttempted:
              3,

            detailPagesCompleted:
              3,

            results: [
              fake(
                "ACCEPT",
                1
              ),

              fake(
                "REVIEW",
                0.75
              ),

              fake(
                "EXCLUDE",
                1
              )
            ]
          });


        expect(
          report.accepted
        ).toBe(1);

        expect(
          report.review
        ).toBe(1);

        expect(
          report.excluded
        ).toBe(1);


        expect(
          report.metrics.find(
            metric =>
              metric.key ===
              "catalog"
          )?.ratio
        ).toBe(1);


        expect(
          report.metrics.find(
            metric =>
              metric.key ===
              "detail"
          )?.ratio
        ).toBe(1);


        expect(
          report.metrics.find(
            metric =>
              metric.key ===
              "classification"
          )?.ratio
        ).toBe(1);


        expect(
          report.metrics.find(
            metric =>
              metric.key ===
              "evidence"
          )?.ratio
        ).toBeCloseTo(
          2 / 3
        );
      }
    );
  }
);
