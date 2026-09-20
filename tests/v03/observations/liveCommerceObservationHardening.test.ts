import {
  describe,
  expect,
  it
} from "vitest";

import {
  collectProductObservationsFromHtml
} from "../../../src/v03/observations/observationCollector.js";


describe(
  "live commerce observation hardening",
  () => {

    it(
      "captures one nested product price and review count from a tab label",
      () => {

        const url =
          "https://shop.example/sony-a7-iv";


        const html =
          `<!doctype html>
          <html>
            <head>
              <link rel="canonical" href="${url}">
              <meta property="og:title" content="Sony Alpha A7 Mark IV">
            </head>
            <body>
              <main>
                <section class="product-detail">
                  <h1>Sony Alpha A7 Mark IV (Body Only)</h1>
                  <div class="product-price">
                    <span>53.990.182 ₫</span>
                  </div>
                  <button role="tab">Đánh giá (7)</button>
                  <button>Đặt mua</button>
                </section>
              </main>
            </body>
          </html>`;


        const result =
          collectProductObservationsFromHtml(
            html,
            url,
            url
          );


        const prices =
          result.observations
            .filter(
              item =>
                item.field ===
                  "PRICE"
            )
            .map(
              item =>
                item.rawValue
            );


        const reviewCounts =
          result.observations
            .filter(
              item =>
                item.field ===
                  "REVIEW_COUNT"
            )
            .map(
              item =>
                item.rawValue
            );


        expect(
          prices
        ).toContain(
          "53.990.182 ₫"
        );


        expect(
          reviewCounts
        ).toContain(
          "7"
        );
      }
    );
  }
);
