import {
  describe,
  expect,
  test
} from "vitest";

import {
  processProductHtml
} from "../../../src/v02/pipeline/productPipeline.ts";

import {
  detectConflicts
} from "../../../src/v02/conflicts/conflictEngine.ts";


function saleCameraHtml(
  stockVisible:
    string,
  visibleRating:
    string
): string {

  return `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context":
            "https://schema.org",

          "@type":
            "Product",

          "name":
            "Canon EOS R50",

          "itemCondition":
            "https://schema.org/NewCondition",

          "aggregateRating": {
            "@type":
              "AggregateRating",

            "ratingValue":
              "4.8",

            "reviewCount":
              "87"
          },

          "offers": {
            "@type":
              "Offer",

            "price":
              "18000000.00",

            "priceCurrency":
              "VND",

            "availability":
              "https://schema.org/InStock"
          }
        }
        </script>
      </head>

      <body>
        <h1>
          Canon EOS R50 NEW 100%
        </h1>

        <div class="price">
          18.000.000&#273;
        </div>

        <button>
          MUA NGAY
        </button>

        <div class="rating">
          ${visibleRating}
        </div>

        <div class="review-count">
          87 reviews
        </div>

        <div class="stock">
          ${stockVisible}
        </div>

        <h2>
          TH&#212;NG S&#7888; K&#7928; THU&#7852;T
        </h2>

        <div>
          Mirrorless.
          APS-C sensor.
          ISO 100-32000.
          Autofocus.
          EVF.
          4K video.
        </div>
      </body>
    </html>
  `;
}


describe(
  "Phase 9C validator consumes audit severity",
  () => {

    test(
      "HIGH stock conflict stays audited while confirmed camera remains ACCEPT",
      () => {

        const result =
          processProductHtml(
            saleCameraHtml(
              "H&#7871;t h&#224;ng",
              "4.8/5"
            ),
            "https://example.com/high-stock-conflict",
            "UNKNOWN"
          );

        const conflicts =
          detectConflicts(
            result
          );

        expect(
          conflicts.some(
            conflict =>
              conflict.field ===
                "STOCK" &&
              conflict.severity ===
                "HIGH"
          )
        ).toBe(true);

        expect(
          result.validation.decision
        ).toBe(
          "ACCEPT"
        );

        expect(
          result.validation.reasons.some(
            reason =>
              reason.includes(
                "STOCK"
              )
          )
        ).toBe(true);
      }
    );


    test(
      "HIGH condition conflict stays audited while confirmed camera remains ACCEPT",
      () => {

        const html =
          saleCameraHtml(
            "C&#242;n h&#224;ng",
            "4.8/5"
          ).replace(
            "https://schema.org/NewCondition",
            "https://schema.org/UsedCondition"
          );

        const result =
          processProductHtml(
            html,
            "https://example.com/condition-conflict",
            "UNKNOWN"
          );

        const conflicts =
          detectConflicts(
            result
          );

        expect(
          result.analysis.entity.type
        ).toBe(
          "CAMERA"
        );

        expect(
          result.analysis.condition.conflict
        ).toBe(true);

        expect(
          conflicts.some(
            conflict =>
              conflict.field ===
                "CONDITION" &&
              conflict.severity ===
                "HIGH"
          )
        ).toBe(true);

        expect(
          result.validation.decision
        ).toBe(
          "ACCEPT"
        );

        expect(
          result.validation.reasons.some(
            reason =>
              reason.includes(
                "CONDITION"
              )
          )
        ).toBe(true);
      }
    );


    test(
      "MEDIUM rating conflict does not by itself force REVIEW",
      () => {

        const result =
          processProductHtml(
            saleCameraHtml(
              "C&#242;n h&#224;ng",
              "4.5/5"
            ),
            "https://example.com/medium-rating-conflict",
            "UNKNOWN"
          );

        const conflicts =
          detectConflicts(
            result
          );

        expect(
          conflicts.some(
            conflict =>
              conflict.field ===
                "RATING" &&
              conflict.severity ===
                "MEDIUM"
          )
        ).toBe(true);

        expect(
          conflicts.some(
            conflict =>
              conflict.severity ===
                "HIGH"
          )
        ).toBe(false);

        expect(
          result.validation.decision
        ).toBe(
          "ACCEPT"
        );
      }
    );
  }
);