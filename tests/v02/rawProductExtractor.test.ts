import {
  describe,
  expect,
  test
} from "vitest";

import {
  extractRawProductFactsFromHtml
} from "../../src/v02/rawProductExtractor.ts";


describe(
  "RawProductExtractor V2",
  () => {

    const html = `
      <!doctype html>
      <html>
        <head>

          <title>Sony A6400</title>

          <meta
            property="og:title"
            content="Sony A6400"
          />

          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Sony A6400",
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.9",
              "reviewCount": "127"
            },
            "offers": {
              "@type": "Offer",
              "price": "360000.00"
            }
          }
          </script>

        </head>

        <body>

          <nav class="breadcrumb">
            <a>Trang chủ</a>
            <a>THUÊ MÁY ẢNH</a>
            <a>Sony A6400</a>
          </nav>

          <h1>Sony A6400</h1>

          <div class="product-price">
            360.000đ / ngày
          </div>

          <button>
            THUÊ NGAY
          </button>

          <div class="rating">
            4.9/5
          </div>

          <div class="review-count">
            127 đánh giá
          </div>

          <div class="stock-status">
            Còn hàng
          </div>

          <h2>
            THÔNG SỐ KỸ THUẬT
          </h2>

          <div>
            Cảm biến APS-C 24.2MP.
            ISO 100-32000.
            425 điểm lấy nét.
            Quay video 4K.
          </div>

          <h2>
            ĐIỀU KIỆN THUÊ
          </h2>

          <div>
            Cọc CCCD.
          </div>

          <script>
            fake price 17
          </script>

        </body>
      </html>
    `;


    test(
      "extracts basic product identity",
      () => {

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/equipment/21"
          );

        expect(
          facts.title
        ).toBe(
          "Sony A6400"
        );

        expect(
          facts.url
        ).toBe(
          "https://example.com/equipment/21"
        );

        expect(
          facts.listingCategory
        ).toBe(
          "THUÊ MÁY ẢNH"
        );
      }
    );


    test(
      "extracts rental price without parsing it",
      () => {

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/x"
          );

        expect(
          facts.visiblePriceTexts.some(
            value =>
              value.includes(
                "360.000"
              )
          )
        ).toBe(true);
      }
    );


    test(
      "extracts rating and review evidence",
      () => {

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/x"
          );

        expect(
          facts.ratingTexts.join(" ")
        ).toContain(
          "4.9/5"
        );

        expect(
          facts.ratingTexts.join(" ")
        ).toContain(
          "127 đánh giá"
        );
      }
    );


    test(
      "extracts JSON-LD",
      () => {

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/x"
          );

        expect(
          facts.jsonLd.length
        ).toBeGreaterThan(0);
      }
    );


    test(
      "script text does not contaminate page text",
      () => {

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/x"
          );

        expect(
          facts.pageText
        ).not.toContain(
          "fake price 17"
        );
      }
    );
  }
);
