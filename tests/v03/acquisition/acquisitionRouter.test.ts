import {
  describe,
  expect,
  test
} from "vitest";

import {
  AcquisitionRouter
} from "../../../src/v03/acquisition/acquisitionRouter.js";

import {
  NoAcquisitionBackendError
} from "../../../src/v03/acquisition/acquisitionErrors.js";

import type {
  AcquisitionBackend,
  AcquisitionProbeStatus,
  AcquisitionResult
} from "../../../src/v03/acquisition/acquisitionTypes.js";

import {
  createAcquisitionContext
} from "../../../src/v03/acquisition/acquisitionContext.js";


function backend(
  id:
    string,
  status:
    AcquisitionProbeStatus,
  options:
    {
      readonly probeError?:
        Error;

      readonly acquireError?:
        Error;

      readonly result?:
        AcquisitionResult;
    } = {}
): AcquisitionBackend {

  return {
    id,

    async probe() {

      if (
        options.probeError
      ) {
        throw options.probeError;
      }


      return {
        backendId:
          id,

        status,

        reason:
          status ===
            "AVAILABLE"
            ? "ready"
            : "not ready"
      };
    },

    async acquire() {

      if (
        options.acquireError
      ) {
        throw options.acquireError;
      }


      return (
        options.result ??
        {
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
        }
      );
    }
  };
}


describe(
  "V3 acquisition capability router",
  () => {

    test(
      "doctor recommends the first available backend in configured order",
      async () => {

        const router =
          new AcquisitionRouter([
            backend(
              "STATIC_HTTP",
              "UNAVAILABLE"
            ),
            backend(
              "NETWORK_RECON",
              "AVAILABLE"
            ),
            backend(
              "BROWSER_RENDERED",
              "AVAILABLE"
            )
          ]);


        const report =
          await router.doctor(
            createAcquisitionContext(
              "https://example.com"
            )
          );


        expect(
          report.probes.map(
            probe =>
              probe.backendId
          )
        ).toEqual([
          "STATIC_HTTP",
          "NETWORK_RECON",
          "BROWSER_RENDERED"
        ]);

        expect(
          report.recommendedBackend
        ).toBe(
          "NETWORK_RECON"
        );
      }
    );


    test(
      "doctor records a probe failure without aborting later backend probes",
      async () => {

        const router =
          new AcquisitionRouter([
            backend(
              "STATIC_HTTP",
              "AVAILABLE",
              {
                probeError:
                  new Error(
                    "network down"
                  )
              }
            ),
            backend(
              "BROWSER_RENDERED",
              "AVAILABLE"
            )
          ]);


        const report =
          await router.doctor(
            createAcquisitionContext(
              "https://example.com"
            )
          );


        expect(
          report.probes[0]
        ).toMatchObject({
          backendId:
            "STATIC_HTTP",
          status:
            "ERROR",
          reason:
            "network down"
        });

        expect(
          report.recommendedBackend
        ).toBe(
          "BROWSER_RENDERED"
        );
      }
    );


    test(
      "acquire falls back when an available backend fails during acquisition",
      async () => {

        const router =
          new AcquisitionRouter([
            backend(
              "STATIC_HTTP",
              "AVAILABLE",
              {
                acquireError:
                  new Error(
                    "response unusable"
                  )
              }
            ),
            backend(
              "NETWORK_RECON",
              "AVAILABLE"
            )
          ]);


        const run =
          await router.acquire(
            createAcquisitionContext(
              "https://example.com"
            )
          );


        expect(
          run.result.backendId
        ).toBe(
          "NETWORK_RECON"
        );

        expect(
          run.attempts
        ).toEqual([
          {
            backendId:
              "STATIC_HTTP",
            phase:
              "PROBE",
            outcome:
              "SUCCESS",
            reason:
              "ready"
          },
          {
            backendId:
              "STATIC_HTTP",
            phase:
              "ACQUIRE",
            outcome:
              "FAILED",
            reason:
              "response unusable"
          },
          {
            backendId:
              "NETWORK_RECON",
            phase:
              "PROBE",
            outcome:
              "SUCCESS",
            reason:
              "ready"
          },
          {
            backendId:
              "NETWORK_RECON",
            phase:
              "ACQUIRE",
            outcome:
              "SUCCESS",
            reason:
              "Acquisition completed."
          }
        ]);
      }
    );


    test(
      "unavailable backend is skipped rather than treated as a failure",
      async () => {

        const router =
          new AcquisitionRouter([
            backend(
              "STATIC_HTTP",
              "UNAVAILABLE"
            ),
            backend(
              "BROWSER_RENDERED",
              "AVAILABLE"
            )
          ]);


        const run =
          await router.acquire(
            createAcquisitionContext(
              "https://example.com"
            )
          );


        expect(
          run.attempts[0]
        ).toEqual({
          backendId:
            "STATIC_HTTP",
          phase:
            "PROBE",
          outcome:
            "SKIPPED",
          reason:
            "not ready"
        });

        expect(
          run.result.backendId
        ).toBe(
          "BROWSER_RENDERED"
        );
      }
    );


    test(
      "duplicate backend ids are rejected deterministically",
      () => {

        expect(
          () =>
            new AcquisitionRouter([
              backend(
                "STATIC_HTTP",
                "AVAILABLE"
              ),
              backend(
                "STATIC_HTTP",
                "AVAILABLE"
              )
            ])
        ).toThrow(
          "Duplicate acquisition backend id: STATIC_HTTP"
        );
      }
    );


    test(
      "no successful backend raises a typed error with attempt history",
      async () => {

        const router =
          new AcquisitionRouter([
            backend(
              "STATIC_HTTP",
              "UNAVAILABLE"
            ),
            backend(
              "NETWORK_RECON",
              "AVAILABLE",
              {
                acquireError:
                  new Error(
                    "recon failed"
                  )
              }
            )
          ]);


        await expect(
          router.acquire(
            createAcquisitionContext(
              "https://example.com"
            )
          )
        ).rejects.toBeInstanceOf(
          NoAcquisitionBackendError
        );
      }
    );
  }
);
