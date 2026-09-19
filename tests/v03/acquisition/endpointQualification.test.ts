import {
  describe,
  expect,
  test
} from "vitest";

import {
  qualifyEndpointCandidates
} from "../../../src/v03/acquisition/endpointQualification.js";

import type {
  NetworkReconSnapshot
} from "../../../src/v03/acquisition/networkReconTypes.js";


function snapshot():
  NetworkReconSnapshot {

  const productHtml = `
    <div>
      <a href="/camera/a">A</a>
      <a href="/camera/b">B</a>
      <a href="/camera/c">C</a>
      <a href="/camera/d">D</a>
      <a href="/camera/e">E</a>
    </div>
  `;


  return {
    rootUrl:
      "https://example.com/",

    finalPageUrl:
      "https://example.com/",

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
          "id=6&page_per=1000",
        status:
          200,
        responseContentType:
          "text/html",
        responseBodyPreview:
          productHtml,
        responseBodyTruncated:
          true,
        failed:
          false,
        failureText:
          null
      },
      {
        sequence:
          2,
        url:
          "https://example.com/api/paging.php",
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
          productHtml,
        responseBodyTruncated:
          false,
        failed:
          false,
        failureText:
          null
      },
      {
        sequence:
          3,
        url:
          "https://example.com/api/addons.php?type=script-main",
        method:
          "GET",
        resourceType:
          "xhr",
        requestContentType:
          null,
        requestBodyRedacted:
          null,
        status:
          200,
        responseContentType:
          "text/html",
        responseBodyPreview:
          "<script>window.foo=1</script>",
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


describe(
  "V3 endpoint qualification",
  () => {

    test(
      "repeated listing-like XHRs outrank unrelated utility traffic",
      () => {

        const result =
          qualifyEndpointCandidates(
            snapshot()
          );


        expect(
          result.qualified
        ).toHaveLength(
          2
        );


        expect(
          result.qualified.every(
            candidate =>
              candidate.url.endsWith(
                "/api/paging.php"
              )
          )
        ).toBe(true);


        expect(
          result.candidates.at(
            -1
          )?.url
        ).toContain(
          "addons.php"
        );
      }
    );


    test(
      "redacted candidates cannot be replayed automatically",
      () => {

        const input =
          snapshot();


        const modified = {
          ...input,

          exchanges:
            input.exchanges.map(
              (
                exchange,
                index
              ) =>
                index ===
                  0
                  ? {
                      ...exchange,
                      requestBodyRedacted:
                        "id=6&token=[REDACTED]"
                    }
                  : exchange
            )
        };


        const result =
          qualifyEndpointCandidates(
            modified
          );


        expect(
          result.candidates.find(
            candidate =>
              candidate.candidateId.startsWith(
                "1:"
              )
          )?.replayable
        ).toBe(false);
      }
    );
  }
);
