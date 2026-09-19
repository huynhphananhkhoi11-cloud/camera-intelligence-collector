import {
  describe,
  expect,
  test
} from "vitest";

import {
  scoreDiscoveredUrl,
  shouldTraverseAsCatalog
} from "../../../src/v03/discovery/urlDiscoveryScoring.js";


describe(
  "V3 discovery scoring",
  () => {

    test(
      "camera commerce URLs outrank utility URLs",
      () => {

        const camera =
          scoreDiscoveredUrl(
            "https://example.com/may-anh/canon-eos-r50",
            "STATIC_HTML",
            "Canon EOS R50"
          );


        const cart =
          scoreDiscoveredUrl(
            "https://example.com/cart",
            "STATIC_HTML",
            "Giỏ hàng"
          );


        expect(
          camera
        ).toBeGreaterThan(
          cart
        );
      }
    );


    test(
      "camera and commerce category routes are traversable but news and account routes are not",
      () => {

        expect(
          shouldTraverseAsCatalog(
            "https://example.com/may-anh",
            "Máy ảnh"
          )
        ).toBe(true);


        expect(
          shouldTraverseAsCatalog(
            "https://example.com/tin-tuc/camera-review",
            "Tin tức"
          )
        ).toBe(false);


        expect(
          shouldTraverseAsCatalog(
            "https://example.com/account",
            "Tài khoản"
          )
        ).toBe(false);
      }
    );

    test(
      "workshop and editorial camera URLs rank below real product URLs",
      () => {

        const product =
          scoreDiscoveredUrl(
            "https://example.com/canon-eos-r50-vi.html",
            "SITEMAP",
            "Canon EOS R50 Body Only Chính hãng"
          );


        const workshop =
          scoreDiscoveredUrl(
            "https://example.com/workshop-chup-anh-cung-sony-alpha-20-8-2026.html",
            "SITEMAP",
            "Workshop chụp ảnh cùng Sony Alpha"
          );


        expect(
          product
        ).toBeGreaterThan(
          workshop
        );


        expect(
          shouldTraverseAsCatalog(
            "https://example.com/workshop-chup-anh-cung-sony-alpha-20-8-2026.html",
            "Workshop Sony Alpha"
          )
        ).toBe(
          false
        );
      }
    );

  }
);
