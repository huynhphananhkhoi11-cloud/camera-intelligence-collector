import {
  describe,
  expect,
  test
} from "vitest";

import {
  classifyOffers
} from "../../src/v02/offerClassifier.ts";


describe(
  "Offer Classifier V2 — RENTAL",
  () => {

    test(
      "Sony A6400 rental page",
      () => {

        const result =
          classifyOffers({
            title:
              "Sony A6400",

            category:
              "THUÊ MÁY ẢNH",

            visiblePriceTexts: [
              "360,000đ / ngày"
            ],

            buttons: [
              "THUÊ NGAY"
            ],

            pageText:
              "THỜI GIAN THUÊ tối thiểu 6 giờ. GIẤY TỜ CẦN THIẾT. GIAO NHẬN.",

            siteMode:
              "RENTAL"
          });

        expect(
          result.rental
        ).toBe(true);

        expect(
          result.sale
        ).toBe(false);
      }
    );


    test(
      "rental price alone is enough strong evidence",
      () => {

        const result =
          classifyOffers({
            visiblePriceTexts: [
              "288.000đ/ngày"
            ]
          });

        expect(
          result.rental
        ).toBe(true);

        expect(
          result.sale
        ).toBe(false);
      }
    );


    test(
      "JSON-LD LeaseOut => RENTAL",
      () => {

        const result =
          classifyOffers({
            jsonLdBusinessFunctions: [
              "http://purl.org/goodrelations/v1#LeaseOut"
            ]
          });

        expect(
          result.rental
        ).toBe(true);

        expect(
          result.sale
        ).toBe(false);
      }
    );
  }
);


describe(
  "Offer Classifier V2 — SALE",
  () => {

    test(
      "Máy Ảnh Top 1 sale product",
      () => {

        const result =
          classifyOffers({
            title:
              "CANON EOS R (BODY) - HÀNG CŨ",

            category:
              "MÁY ẢNH CŨ",

            visiblePriceTexts: [
              "18.000.000đ"
            ],

            buttons: [
              "THÊM VÀO GIỎ HÀNG",
              "MUA NGAY"
            ],

            siteMode:
              "SALE_MIXED"
          });

        expect(
          result.sale
        ).toBe(true);

        expect(
          result.rental
        ).toBe(false);
      }
    );


    test(
      "JSON-LD Sell => SALE",
      () => {

        const result =
          classifyOffers({
            jsonLdBusinessFunctions: [
              "http://purl.org/goodrelations/v1#Sell"
            ]
          });

        expect(
          result.sale
        ).toBe(true);

        expect(
          result.rental
        ).toBe(false);
      }
    );
  }
);


describe(
  "Offer Classifier V2 — both transaction types",
  () => {

    test(
      "same camera can be both rented and sold",
      () => {

        const result =
          classifyOffers({
            visiblePriceTexts: [
              "300.000đ/ngày",
              "15.000.000đ"
            ],

            buttons: [
              "THUÊ NGAY",
              "MUA NGAY"
            ]
          });

        expect(
          result.rental
        ).toBe(true);

        expect(
          result.sale
        ).toBe(true);
      }
    );

    test(
      "explicit bounded rental price is not turned into SALE by generic ecommerce controls",
      () => {

        const result =
          classifyOffers({
            category:
              "Tất Cả Camera Cho Thuê",

            visiblePriceTexts: [
              "250,000₫"
            ],

            buttons: [
              "Liên hệ thuê",
              "Mua ngay"
            ],

            pageText:
              "GIÁ THUÊ: 250.000đ / 1 Ngày. Giá niêm yết này là giá cho thuê theo ngày.",

            siteMode:
              "RENTAL"
          });

        expect(
          result.rental
        ).toBe(true);

        expect(
          result.sale
        ).toBe(false);
      }
    );


    test(
      "explicit rental plus an independent sale price remains mixed",
      () => {

        const result =
          classifyOffers({
            visiblePriceTexts: [
              "300.000đ/ngày",
              "15.000.000đ"
            ],

            buttons: [
              "THUÊ NGAY",
              "MUA NGAY"
            ]
          });

        expect(
          result.rental
        ).toBe(true);

        expect(
          result.sale
        ).toBe(true);
      }
    );

  }
);


describe(
  "Offer Classifier V2 — safety",
  () => {

    test(
      "site mode RENTAL alone cannot classify a product",
      () => {

        const result =
          classifyOffers({
            title:
              "Unknown Product",
            siteMode:
              "RENTAL"
          });

        expect(
          result.rental
        ).toBe(false);

        expect(
          result.sale
        ).toBe(false);
      }
    );


    test(
      "rental category alone cannot classify a product",
      () => {

        const result =
          classifyOffers({
            category:
              "THUÊ MÁY ẢNH"
          });

        expect(
          result.rental
        ).toBe(false);
      }
    );


    test(
      "plain price alone does not prove SALE",
      () => {

        const result =
          classifyOffers({
            visiblePriceTexts: [
              "15.000.000đ"
            ]
          });

        expect(
          result.sale
        ).toBe(false);
      }
    );


    test(
      "651 điểm lấy nét is not an offer",
      () => {

        const result =
          classifyOffers({
            visiblePriceTexts: [
              "651 điểm lấy nét"
            ],

            siteMode:
              "RENTAL"
          });

        expect(
          result.rental
        ).toBe(false);

        expect(
          result.sale
        ).toBe(false);
      }
    );

    test(
      "explicit rental title and rental CTAs override generic ecommerce controls without independent sale truth",
      () => {

        const result =
          classifyOffers({
            title:
              "Cho thuê máy ảnh Sony Alpha A6400",

            visiblePriceTexts: [
              "400.000 ₫ 350.000 ₫"
            ],

            buttons: [
              "Thêm vào giỏ hàng",
              "Liên hệ thuê tại đây",
              "Đặt lịch thuê tại đây"
            ],

            siteMode:
              "RENTAL"
          });

        expect(
          result.rental
        ).toBe(true);

        expect(
          result.sale
        ).toBe(false);
      }
    );

  }
);
