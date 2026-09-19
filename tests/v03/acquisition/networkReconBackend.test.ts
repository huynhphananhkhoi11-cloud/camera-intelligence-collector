import {
  describe,
  expect,
  test
} from "vitest";

import {
  createAcquisitionContext
} from "../../../src/v03/acquisition/acquisitionContext.js";

import {
  NetworkReconBackend
} from "../../../src/v03/acquisition/networkReconBackend.js";

import type {
  NetworkReconRuntime
} from "../../../src/v03/acquisition/networkReconTypes.js";


function runtime(
  options:
    {
      readonly available?:
        boolean;

      readonly failed?:
        boolean;

      readonly truncated?:
        boolean;
    } = {}
): NetworkReconRuntime {

  return {
    async probe() {
      return {
        available:
          options.available ??
          true,

        reason:
          options.available ===
            false
            ? "browser unavailable"
            : "ready"
      };
    },

    async observe(
      rootUrl:
        string
    ) {
      return {
        rootUrl,

        finalPageUrl:
          rootUrl,

        observationWindowMs:
          3500,

        exchanges: [
          {
            sequence:
              1,

            url:
              "https://example.com/api/paging.php",

            method:
              "POST",

            resourceType:
              "xhr",

            requestContentType:
              "application/x-www-form-urlencoded",

            requestBodyRedacted:
              "page=1&id=6",

            status:
              options.failed
                ? null
                : 200,

            responseContentType:
              "text/html",

            responseBodyPreview:
              options.failed
                ? null
                : "<div class=\"product\">Canon EOS R50</div>",

            responseBodyTruncated:
              options.truncated ??
              false,

            failed:
              options.failed ??
              false,

            failureText:
              options.failed
                ? "network error"
                : null
          }
        ]
      };
    }
  };
}


describe(
  "V3 NetworkReconBackend",
  () => {

    test(
      "maps same-origin XHR/fetch observations into acquisition artifacts",
      async () => {

        const backend =
          new NetworkReconBackend({
            runtime:
              runtime()
          });


        const result =
          await backend.acquire(
            createAcquisitionContext(
              "https://example.com/"
            )
          );


        expect(
          result.backendId
        ).toBe(
          "NETWORK_RECON"
        );

        expect(
          result.discoveredUrls
        ).toEqual([
          "https://example.com/api/paging.php"
        ]);

        expect(
          result.artifacts
        ).toHaveLength(
          1
        );

        expect(
          result.artifacts[0]
        ).toMatchObject({
          kind:
            "HTML",

          url:
            "https://example.com/api/paging.php",

          status:
            200,

          contentType:
            "text/html",

          metadata: {
            method:
              "POST",

            resourceType:
              "xhr",

            requestBody:
              "page=1&id=6"
          }
        });
      }
    );


    test(
      "probe reports runtime health without inventing availability",
      async () => {

        const backend =
          new NetworkReconBackend({
            runtime:
              runtime({
                available:
                  false
              })
          });


        const probe =
          await backend.probe(
            createAcquisitionContext(
              "https://example.com/"
            )
          );


        expect(
          probe
        ).toEqual({
          backendId:
            "NETWORK_RECON",

          status:
            "UNAVAILABLE",

          reason:
            "browser unavailable"
        });
      }
    );


    test(
      "failed and truncated exchanges become warnings, not silent drops",
      async () => {

        const failedBackend =
          new NetworkReconBackend({
            runtime:
              runtime({
                failed:
                  true
              })
          });


        const failedResult =
          await failedBackend.acquire(
            createAcquisitionContext(
              "https://example.com/"
            )
          );


        expect(
          failedResult.artifacts
        ).toHaveLength(
          0
        );

        expect(
          failedResult.warnings[0]
        ).toContain(
          "failed"
        );


        const truncatedBackend =
          new NetworkReconBackend({
            runtime:
              runtime({
                truncated:
                  true
              })
          });


        const truncatedResult =
          await truncatedBackend.acquire(
            createAcquisitionContext(
              "https://example.com/"
            )
          );


        expect(
          truncatedResult.warnings[0]
        ).toContain(
          "truncated"
        );
      }
    );
  }
);
