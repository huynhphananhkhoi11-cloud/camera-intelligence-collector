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

    it(
      "captures a review tab count outside a narrow hero action scope",
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
                <section class="hero">
                  <div class="title-zone">
                    <h1>Sony Alpha A7 Mark IV (Body Only)</h1>
                    <button>Hotline tư vấn</button>
                  </div>
                  <div class="buy-zone">
                    <span class="price">53.990.182 ₫</span>
                    <button>Đặt mua</button>
                  </div>
                </section>

                <nav class="product-tabs">
                  <button role="tab">Đánh giá (7)</button>
                </nav>
              </main>
            </body>
          </html>`;


        const result =
          collectProductObservationsFromHtml(
            html,
            url,
            url
          );


        expect(
          result.observations
            .filter(
              item =>
                item.field ===
                  "REVIEW_COUNT"
            )
            .map(
              item =>
                item.rawValue
            )
        ).toContain(
          "7"
        );
      }
    );

  }
);
