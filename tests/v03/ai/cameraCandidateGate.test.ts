import {
  describe,
  expect,
  test
} from "vitest";

import {
  decideCameraCandidate
} from "../../../src/v03/ai/cameraCandidateGate.js";

import type {
  UrlDiscoveryEvidence
} from "../../../src/v03/discovery/multiSourceDiscoveryTypes.js";


function evidence(
  url:
    string,
  anchorText:
    string
): UrlDiscoveryEvidence[] {

  return [
    {
      url,
      channel:
        "STATIC_HTML",
      parentUrl:
        "https://shop.example/",
      anchorText,
      score:
        50
    }
  ];
}


describe(
  "conservative camera candidate gate",
  () => {

    test(
      "keeps obvious camera bodies",
      () => {

        const result =
          decideCameraCandidate(
            "https://shop.example/canon-eos-r50-body",
            evidence(
              "https://shop.example/canon-eos-r50-body",
              "Canon EOS R50 Body Only"
            )
          );


        expect(
          result.route
        ).toBe(
          "CAMERA_CANDIDATE"
        );
      }
    );


    test(
      "skips clear lens products only when evidence is strongly non-camera",
      () => {

        const result =
          decideCameraCandidate(
            "https://shop.example/ong-kinh/sony-fe-24-70mm-lens",
            evidence(
              "https://shop.example/ong-kinh/sony-fe-24-70mm-lens",
              "Ống kính Sony FE 24-70mm Lens"
            )
          );


        expect(
          result.route
        ).toBe(
          "CLEAR_NON_CAMERA"
        );
      }
    );


    test(
      "does not drop camera kits just because the title contains lens",
      () => {

        const result =
          decideCameraCandidate(
            "https://shop.example/canon-eos-r50-kit",
            evidence(
              "https://shop.example/canon-eos-r50-kit",
              "Canon EOS R50 + Lens 18-45mm Kit"
            )
          );


        expect(
          result.route
        ).not.toBe(
          "CLEAR_NON_CAMERA"
        );
      }
    );


    test(
      "passes ambiguous products to AI instead of guessing",
      () => {

        const result =
          decideCameraCandidate(
            "https://shop.example/product/12345",
            evidence(
              "https://shop.example/product/12345",
              "Nikon Zf"
            )
          );


        expect(
          [
            "CAMERA_CANDIDATE",
            "UNKNOWN"
          ]
        ).toContain(
          result.route
        );
      }
    );

    test(
      "skips workshop pages even when camera brands and models appear in the title",
      () => {

        const result =
          decideCameraCandidate(
            "https://shop.example/workshop-chup-anh-ao-dai-cung-sony-alpha-11-2-2026.html",
            evidence(
              "https://shop.example/workshop-chup-anh-ao-dai-cung-sony-alpha-11-2-2026.html",
              "Workshop chụp ảnh Áo Dài cùng Sony Alpha"
            )
          );


        expect(
          result.route
        ).toBe(
          "CLEAR_NON_PRODUCT_CONTENT"
        );
      }
    );

  }
);
