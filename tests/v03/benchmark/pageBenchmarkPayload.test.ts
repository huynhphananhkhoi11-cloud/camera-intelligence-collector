import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildFullEvidencePayload,
  sanitizeRenderedHtmlForBenchmark
} from "../../../src/v03/benchmark/pageBenchmarkPayload.js";

import type {
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";


describe(
  "page benchmark payload",
  () => {

    it(
      "removes executable page noise while preserving JSON-LD",
      () => {

        const html =
          `
            <html>
              <head>
                <style>
                  body { color: red; }
                </style>

                <script>
                  window.tracker = true;
                </script>

                <script type="application/ld+json">
                  {
                    "@type":"Product",
                    "name":"Canon EOS R50",
                    "offers":{
                      "price":"15990000"
                    }
                  }
                </script>
              </head>

              <body onclick="buy()">
                <!-- tracking comment -->

                <h1>
                  Canon EOS R50
                </h1>

                <img
                  src="data:image/png;base64,AAAAAA"
                />

                <svg>
                  <path d="M0 0" />
                </svg>
              </body>
            </html>
          `;


        const sanitized =
          sanitizeRenderedHtmlForBenchmark(
            html
          );


        expect(
          sanitized
        ).toContain(
          "Canon EOS R50"
        );


        expect(
          sanitized
        ).toContain(
          "application/ld+json"
        );


        expect(
          sanitized
        ).toContain(
          "15990000"
        );


        expect(
          sanitized
        ).not.toContain(
          "window.tracker"
        );


        expect(
          sanitized
        ).not.toContain(
          "body { color: red; }"
        );


        expect(
          sanitized
        ).not.toContain(
          "onclick="
        );


        expect(
          sanitized
        ).not.toContain(
          "M0 0"
        );


        expect(
          sanitized
        ).not.toContain(
          "base64,AAAAAA"
        );
      }
    );


    it(
      "keeps every evidence id in FULL_EVIDENCE mode",
      () => {

        const packet =
          {
            packetId:
              "packet_test",

            pageUrl:
              "https://example.test/r50",

            finalUrl:
              "https://example.test/r50",

            productIdentity:
              "Canon EOS R50",

            primaryRegionText:
              "Canon EOS R50 15,990,000",

            allEvidence: [
              {
                id:
                  "ev_1",

                fieldHint:
                  "PRODUCT_NAME",

                rawValue:
                  "Canon EOS R50",

                sourceKind:
                  "VISIBLE_TEXT",

                sourceUrl:
                  "https://example.test/r50",

                locator:
                  "h1",

                context:
                  null
              },
              {
                id:
                  "ev_2",

                fieldHint:
                  "AVAILABILITY",

                rawValue:
                  "InStock",

                sourceKind:
                  "JSON_LD",

                sourceUrl:
                  "https://example.test/r50",

                locator:
                  "Product.offers.availability",

                context:
                  "Primary Product",

                ownershipHint:
                  "PRIMARY_PRODUCT"
              }
            ],

            titleCandidates:
              [],

            breadcrumbs:
              [],

            moneyCandidates:
              [],

            conditionCandidates:
              [],

            stockCandidates:
              [],

            ratingCandidates:
              [],

            reviewCandidates:
              [],

            specCandidates:
              [],

            variantCandidates:
              [],

            selectedControls:
              [],

            structuredFacts:
              []
          } as unknown as
            EvidencePacket;


        const payload =
          JSON.parse(
            buildFullEvidencePayload(
              packet
            )
          );


        expect(
          payload.evidence.map(
            (
              item:
                {
                  id:
                    string;
                }
            ) =>
              item.id
          )
        ).toEqual([
          "ev_1",
          "ev_2"
        ]);
      }
    );
  }
);