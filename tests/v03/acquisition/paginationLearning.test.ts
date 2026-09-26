import {
  describe,
  expect,
  test
} from "vitest";

import {
  buildReplayRequest,
  detectPaginationMutation
} from "../../../src/v03/acquisition/paginationLearning.js";

import type {
  EndpointCandidate
} from "../../../src/v03/acquisition/endpointReplayTypes.js";


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
      2,
    url:
      "https://example.com/api/list",
    method:
      "POST",
    requestContentType:
      "application/x-www-form-urlencoded",
    requestBody:
      "page=1&per_page=20&id=6",
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


describe(
  "V3 pagination learning",
  () => {

    test(
      "mutates an observed page parameter",
      () => {

        const input =
          candidate();


        const mutation =
          detectPaginationMutation(
            input
          );


        expect(
          mutation
        ).toEqual({
          location:
            "BODY",
          key:
            "page",
          currentValue:
            1,
          nextValue:
            2
        });


        expect(
          buildReplayRequest(
            input,
            mutation ??
              undefined
          ).body
        ).toContain(
          "page=2"
        );
      }
    );


    test(
      "does not mistake page_per for a page index",
      () => {

        expect(
          detectPaginationMutation(
            candidate({
              requestBody:
                "id_danhmuc=6&page_per=10000&table_select=product"
            })
          )
        ).toBeNull();
      }
    );


    test(
      "offset advances by demonstrated page size when available",
      () => {

        const mutation =
          detectPaginationMutation(
            candidate({
              requestBody:
                "offset=20&limit=20"
            })
          );


        expect(
          mutation
        ).toEqual({
          location:
            "BODY",
          key:
            "offset",
          currentValue:
            20,
          nextValue:
            40
        });
      }
    );


    test(
      "query pagination is mutated without changing unrelated query parameters",
      () => {

        const input =
          candidate({
            method:
              "GET",
            url:
              "https://example.com/api/list?page=3&id=6",
            requestContentType:
              null,
            requestBody:
              null
          });


        const mutation =
          detectPaginationMutation(
            input
          );


        const request =
          buildReplayRequest(
            input,
            mutation ??
              undefined
          );


        expect(
          request.url
        ).toContain(
          "page=4"
        );

        expect(
          request.url
        ).toContain(
          "id=6"
        );
      }
    );
  }
);
