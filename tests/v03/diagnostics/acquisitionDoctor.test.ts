import {
  describe,
  expect,
  test
} from "vitest";

import {
  AcquisitionRouter
} from "../../../src/v03/acquisition/acquisitionRouter.js";

import type {
  AcquisitionBackend
} from "../../../src/v03/acquisition/acquisitionTypes.js";

import {
  formatAcquisitionDoctorReport,
  runAcquisitionDoctor
} from "../../../src/v03/diagnostics/acquisitionDoctor.js";


function backend(
  id:
    string,
  available:
    boolean
): AcquisitionBackend {

  return {
    id,

    async probe() {
      return {
        backendId:
          id,

        status:
          available
            ? "AVAILABLE"
            : "UNAVAILABLE",

        reason:
          available
            ? "ready"
            : "not ready"
      };
    },

    async acquire() {
      return {
        backendId:
          id,

        artifacts:
          [],

        discoveredUrls:
          [],

        warnings:
          [],

        complete:
          true
      };
    }
  };
}


describe(
  "V3 acquisition doctor",
  () => {

    test(
      "reports backend health and recommendation without crawling",
      async () => {

        const router =
          new AcquisitionRouter([
            backend(
              "STATIC_HTTP",
              true
            ),
            backend(
              "NETWORK_RECON",
              false
            )
          ]);


        const report =
          await runAcquisitionDoctor(
            router,
            "https://example.com"
          );

        const rendered =
          formatAcquisitionDoctorReport(
            report
          );


        expect(
          report.recommendedBackend
        ).toBe(
          "STATIC_HTTP"
        );

        expect(
          rendered
        ).toContain(
          "STATIC_HTTP"
        );

        expect(
          rendered
        ).toContain(
          "NETWORK_RECON"
        );

        expect(
          rendered
        ).toContain(
          "Recommended: STATIC_HTTP"
        );
      }
    );
  }
);
