import {
  describe,
  expect,
  test
} from "vitest";

import {
  processProductHtml
} from "../../../src/v02/pipeline/productPipeline.ts";

import {
  buildEvidenceRows
} from "../../../src/v02/evidence/evidenceStore.ts";

describe(
  "Evidence Store V2",
  () => {
    test(
      "accepted fields remain traceable to raw evidence",
      () => {
        const html = `
          <nav class="breadcrumb">
            <a>Home</a>
            <a>THU\u00ca M\u00c1Y \u1ea2NH</a>
            <a>Sony A6400</a>
          </nav>

          <h1>Sony A6400</h1>

          <div class="price">
            360.000\u0111/ng\u00e0y
          </div>

          <button>
            THU\u00ca NGAY
          </button>

          <h2>
            TH\u00d4NG S\u1ed0 K\u1ef8 THU\u1eacT
          </h2>

          <div>
            Mirrorless.
            C\u1ea3m bi\u1ebfn APS-C.
            ISO 100-32000.
            AF 425 \u0111i\u1ec3m.
            EVF.
            Quay video 4K.
          </div>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/a6400",
            "RENTAL"
          );

        const rows =
          buildEvidenceRows(
            result
          );

        expect(
          result.fields.rentalPrice.amount
        ).toBe(360000);

        expect(
          result.fields.rentalPrice.evidence.some(
            evidence =>
              evidence.source ===
                "VISIBLE" &&
              evidence.raw.includes(
                "360.000"
              )
          )
        ).toBe(true);

        expect(
          rows.some(
            row =>
              row.field ===
                "RENTAL_PRICE" &&
              row.value ===
                "360000" &&
              row.source ===
                "VISIBLE" &&
              row.raw.includes(
                "360.000"
              )
          )
        ).toBe(true);

        expect(
          rows.some(
            row =>
              row.field ===
              "ENTITY"
          )
        ).toBe(true);

        expect(
          rows.some(
            row =>
              row.field ===
              "OFFER"
          )
        ).toBe(true);
      }
    );
  }
);
