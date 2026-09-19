import {
  describe,
  expect,
  test
} from "vitest";

import {
  AdaptiveEndpointDiscovery
} from "../../../src/v03/acquisition/adaptiveEndpointDiscovery.js";

import {
  EndpointReplayEngine
} from "../../../src/v03/acquisition/endpointReplayEngine.js";

import type {
  EndpointReplayTransport
} from "../../../src/v03/acquisition/endpointReplayTransport.js";

import type {
  NetworkReconRuntime
} from "../../../src/v03/acquisition/networkReconTypes.js";


describe(
  "V3 adaptive endpoint discovery",
  () => {

    test(
      "observes, qualifies and replays listing-like traffic end to end",
      async () => {

        const networkRuntime:
          NetworkReconRuntime = {
            async probe() {
              return {
                available:
                  true,
                reason:
                  "ready"
              };
            },

            async observe(
              rootUrl:
                string
            ) {
              const body =
                '<a href="/camera/a">A</a>' +
                '<a href="/camera/b">B</a>' +
                '<a href="/camera/c">C</a>' +
                '<a href="/camera/d">D</a>' +
                '<a href="/camera/e">E</a>';


              return {
                rootUrl,
                finalPageUrl:
                  rootUrl,
                observationWindowMs:
                  10,
                exchanges: [
                  {
                    sequence:
                      1,
                    url:
                      "https://example.com/api/list",
                    method:
                      "POST",
                    resourceType:
                      "xhr",
                    requestContentType:
                      "application/x-www-form-urlencoded",
                    requestBodyRedacted:
                      "id=6&page_per=1000",
                    status:
                      200,
                    responseContentType:
                      "text/html",
                    responseBodyPreview:
                      body,
                    responseBodyTruncated:
                      false,
                    failed:
                      false,
                    failureText:
                      null
                  },
                  {
                    sequence:
                      2,
                    url:
                      "https://example.com/api/list",
                    method:
                      "POST",
                    resourceType:
                      "xhr",
                    requestContentType:
                      "application/x-www-form-urlencoded",
                    requestBodyRedacted:
                      "id=10&page_per=1000",
                    status:
                      200,
                    responseContentType:
                      "text/html",
                    responseBodyPreview:
                      body,
                    responseBodyTruncated:
                      false,
                    failed:
                      false,
                    failureText:
                      null
                  }
                ]
              };
            }
          };


        const transport:
          EndpointReplayTransport = {
            async execute(
              request
            ) {
              return {
                request,
                finalUrl:
                  request.url,
                status:
                  200,
                contentType:
                  "text/html",
                body:
                  '<a href="/camera/a">A</a>' +
                  '<a href="/camera/b">B</a>',
                challengeState:
                  "NONE"
              };
            }
          };


        const discovery =
          new AdaptiveEndpointDiscovery({
            networkRuntime,

            replayEngine:
              new EndpointReplayEngine({
                transport
              })
          });


        const result =
          await discovery.discover(
            "https://example.com/"
          );


        expect(
          result.qualification.qualified
        ).toHaveLength(
          2
        );

        expect(
          result.replay.replayedCandidateCount
        ).toBe(
          2
        );

        expect(
          result.replay.discoveredUrls
        ).toEqual([
          "https://example.com/camera/a",
          "https://example.com/camera/b"
        ]);
      }
    );
  }
);
