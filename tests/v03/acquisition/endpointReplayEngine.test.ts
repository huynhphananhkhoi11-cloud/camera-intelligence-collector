import {
  describe,
  expect,
  test
} from "vitest";

import {
  EndpointReplayEngine
} from "../../../src/v03/acquisition/endpointReplayEngine.js";

import type {
  EndpointCandidate,
  EndpointReplayRequest,
  EndpointReplayResponse
} from "../../../src/v03/acquisition/endpointReplayTypes.js";

import type {
  EndpointReplayTransport
} from "../../../src/v03/acquisition/endpointReplayTransport.js";


function candidate(
  overrides:
    Partial<
      EndpointCandidate
    > = {}
): EndpointCandidate {

  return {
    candidateId:
      "1:POST:https://example.com/api/list",
    familyKey:
      "POST https://example.com /api/list",
    familyCount:
      3,
    url:
      "https://example.com/api/list",
    method:
      "POST",
    requestContentType:
      "application/x-www-form-urlencoded",
    requestBody:
      "page=1&id=6",
    responseContentType:
      "text/html",
    responseBodyPreview:
      "<a href=\"/camera/a\">A</a>",
    score:
      80,
    reasons:
      [],
    replayable:
      true,
    ...overrides
  };
}


function transport(
  responder:
    (
      request:
        EndpointReplayRequest
    ) =>
      EndpointReplayResponse
): EndpointReplayTransport {

  return {
    async execute(
      request
    ) {
      return responder(
        request
      );
    }
  };
}


describe(
  "V3 endpoint replay engine",
  () => {

    test(
      "replays an observed request and extracts same-origin URLs",
      async () => {

        const engine =
          new EndpointReplayEngine({
            maxPagesPerCandidate:
              5,

            transport:
              transport(
                request => ({
                  request,
                  finalUrl:
                    request.url,
                  status:
                    200,
                  contentType:
                    "text/html",
                  body:
                    '<a href="/camera/a">A</a><a href="/camera/b">B</a>',
                  challengeState:
                    "NONE"
                })
              )
          });


        const result =
          await engine.replayCandidate(
            candidate({
              requestBody:
                "id=6&page_per=10000"
            }),
            "https://example.com/"
          );


        expect(
          result.requests
        ).toHaveLength(
          1
        );

        expect(
          result.discoveredUrls
        ).toEqual([
          "https://example.com/camera/a",
          "https://example.com/camera/b"
        ]);
      }
    );


    test(
      "pagination advances only through the demonstrated page parameter",
      async () => {

        const bodies =
          new Map([
            [
              "1",
              '<a href="/camera/a">A</a>'
            ],
            [
              "2",
              '<a href="/camera/b">B</a>'
            ],
            [
              "3",
              '<a href="/camera/b">B</a>'
            ]
          ]);


        const engine =
          new EndpointReplayEngine({
            maxPagesPerCandidate:
              5,

            transport:
              transport(
                request => {

                  const params =
                    new URLSearchParams(
                      request.body ??
                        ""
                    );


                  const page =
                    params.get(
                      "page"
                    ) ??
                    "1";


                  return {
                    request,
                    finalUrl:
                      request.url,
                    status:
                      200,
                    contentType:
                      "text/html",
                    body:
                      bodies.get(
                        page
                      ) ??
                      "",
                    challengeState:
                      "NONE"
                  };
                }
              )
          });


        const result =
          await engine.replayCandidate(
            candidate(),
            "https://example.com/"
          );


        expect(
          result.requests.map(
            request =>
              new URLSearchParams(
                request.body ??
                  ""
              ).get(
                "page"
              )
          )
        ).toEqual([
          "1",
          "2",
          "3"
        ]);


        expect(
          result.discoveredUrls
        ).toEqual([
          "https://example.com/camera/a",
          "https://example.com/camera/b"
        ]);


        expect(
          result.warnings.some(
            warning =>
              warning.includes(
                "no new URLs"
              ) ||
              warning.includes(
                "response repeated"
              )
          )
        ).toBe(true);
      }
    );


    test(
      "challenge or non-success stops replay rather than silently continuing",
      async () => {

        const engine =
          new EndpointReplayEngine({
            transport:
              transport(
                request => ({
                  request,
                  finalUrl:
                    request.url,
                  status:
                    403,
                  contentType:
                    "text/html",
                  body:
                    "verify you are human",
                  challengeState:
                    "CHALLENGE_CONFIRMED"
                })
              )
          });


        const result =
          await engine.replayCandidate(
            candidate(),
            "https://example.com/"
          );


        expect(
          result.responses
        ).toHaveLength(
          1
        );

        expect(
          result.discoveredUrls
        ).toHaveLength(
          0
        );

        expect(
          result.warnings[0]
        ).toContain(
          "CHALLENGE_CONFIRMED"
        );
      }
    );


    test(
      "qualified candidates with identical observed requests replay once",
      async () => {

        let calls =
          0;


        const engine =
          new EndpointReplayEngine({
            transport:
              transport(
                request => {

                  calls +=
                    1;


                  return {
                    request,
                    finalUrl:
                      request.url,
                    status:
                      200,
                    contentType:
                      "text/html",
                    body:
                      '<a href="/camera/a">A</a>',
                    challengeState:
                      "NONE"
                  };
                }
              )
          });


        const first =
          candidate({
            candidateId:
              "1"
          });


        const second =
          candidate({
            candidateId:
              "2"
          });


        const result =
          await engine.replayQualified(
            {
              candidates:
                [
                  first,
                  second
                ],

              qualified:
                [
                  first,
                  second
                ]
            },
            "https://example.com/"
          );


        expect(
          calls
        ).toBeGreaterThan(
          0
        );

        expect(
          result.replayedCandidateCount
        ).toBe(
          1
        );
      }
    );
  }
);
