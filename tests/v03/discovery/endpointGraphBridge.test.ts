import {
  describe,
  expect,
  test
} from "vitest";

import {
  endpointReplayEvidence
} from "../../../src/v03/discovery/endpointGraphBridge.js";

import type {
  EndpointDiscoveryRun
} from "../../../src/v03/acquisition/endpointReplayTypes.js";


describe(
  "V3 endpoint replay to product URL graph bridge",
  () => {

    test(
      "keeps endpoint provenance on every discovered URL",
      () => {

        const run:
          EndpointDiscoveryRun = {
            qualifiedCandidateCount:
              1,
            replayedCandidateCount:
              1,
            warnings:
              [],
            discoveredUrls: [
              "https://example.com/canon-r50",
              "https://example.com/canon-r8"
            ],
            discoveries: [
              {
                candidate: {
                  candidateId:
                    "candidate-1",
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
                    "category=6",
                  responseContentType:
                    "text/html",
                  responseBodyPreview:
                    "<a>...</a>",
                  score:
                    80,
                  reasons:
                    [],
                  replayable:
                    true
                },
                requests:
                  [],
                responses:
                  [],
                discoveredUrls: [
                  "https://example.com/canon-r50",
                  "https://example.com/canon-r8"
                ],
                warnings:
                  []
              }
            ]
          };


        const evidence =
          endpointReplayEvidence(
            run
          );


        expect(
          evidence
        ).toHaveLength(
          2
        );

        expect(
          evidence[0]
        ).toMatchObject({
          parentUrl:
            "https://example.com/api/list",
          sourceKind:
            "ENDPOINT_REPLAY",
          ownerKind:
            "ENDPOINT_RESPONSE",
          relation:
            "PRODUCT_LINK",
          sourceRef:
            "candidate-1",
          metadata: {
            requestBody:
              "category=6"
          }
        });
      }
    );
  }
);
