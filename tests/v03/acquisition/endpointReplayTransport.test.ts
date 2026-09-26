import {
  describe,
  expect,
  test
} from "vitest";

import {
  FetchEndpointReplayTransport
} from "../../../src/v03/acquisition/endpointReplayTransport.js";

import type {
  EndpointReplayRequest
} from "../../../src/v03/acquisition/endpointReplayTypes.js";


function request(
  overrides:
    Partial<
      EndpointReplayRequest
    > = {}
): EndpointReplayRequest {

  return {
    candidateId:
      "candidate-1",
    url:
      "https://example.com/api/list",
    method:
      "POST",
    contentType:
      "application/x-www-form-urlencoded",
    body:
      "page=1&id=6",
    reason:
      "observed_request",
    ...overrides
  };
}


describe(
  "V3 FetchEndpointReplayTransport",
  () => {

    test(
      "replays same-origin POST with observed content type and body",
      async () => {

        let captured:
          {
            url:
              string;

            init:
              RequestInit;
          } |
          null =
            null;


        const transport =
          new FetchEndpointReplayTransport({
            fetchFn:
              (async (
                url:
                  string |
                  URL |
                  Request,
                init?:
                  RequestInit
              ) => {

                captured = {
                  url:
                    String(
                      url
                    ),

                  init:
                    init ??
                    {}
                };


                return new Response(
                  '<a href="/camera/a">A</a>',
                  {
                    status:
                      200,

                    headers: {
                      "content-type":
                        "text/html"
                    }
                  }
                );
              }) as
                typeof fetch
          });


        const response =
          await transport.execute(
            request(),
            "https://example.com/"
          );


        expect(
          captured?.url
        ).toBe(
          "https://example.com/api/list"
        );

        expect(
          captured?.init.method
        ).toBe(
          "POST"
        );

        expect(
          captured?.init.body
        ).toBe(
          "page=1&id=6"
        );

        expect(
          response
        ).toMatchObject({
          status:
            200,

          contentType:
            "text/html",

          challengeState:
            "NONE"
        });
      }
    );


    test(
      "refuses cross-origin replay",
      async () => {

        const transport =
          new FetchEndpointReplayTransport({
            fetchFn:
              fetch
          });


        await expect(
          transport.execute(
            request({
              url:
                "https://outside.example/api/list"
            }),
            "https://example.com/"
          )
        ).rejects.toThrow(
          "cross-origin"
        );
      }
    );


    test(
      "reports a challenge response instead of treating it as product data",
      async () => {

        const transport =
          new FetchEndpointReplayTransport({
            fetchFn:
              (async () =>
                new Response(
                  '<div class="cf-turnstile"></div>',
                  {
                    status:
                      403,

                    headers: {
                      "content-type":
                        "text/html"
                    }
                  }
                )) as
                typeof fetch
          });


        const response =
          await transport.execute(
            request(),
            "https://example.com/"
          );


        expect(
          response.challengeState
        ).toBe(
          "CHALLENGE_CONFIRMED"
        );
      }
    );
  }
);
