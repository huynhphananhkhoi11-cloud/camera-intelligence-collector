import {
  describe,
  expect,
  test
} from "vitest";

import {
  discoverProductUrlsFromHtml
} from "../../../src/v02/discovery/productUrlDiscovery.ts";


function isStaticAsset(
  raw: string
): boolean {

  return /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|mjs|map|mp4|png|svg|ttf|webm|webp|woff2?)$/i
    .test(
      new URL(raw).pathname
    );
}


describe(
  "product URL static-asset purity",
  () => {

    test(
      "product-looking static resources are never candidates",
      () => {

        const html = `
          <html>
            <body>

              <a href="/product/canon-r50">
                Canon R50
              </a>

              <a href="/watermark/product/upload/product/canon-r50.jpg">
                image
              </a>

              <a href="/upload/product/canon-r50.webp">
                webp
              </a>

              <a href="/assets/product/canon-r50.js">
                script
              </a>

            </body>
          </html>
        `;


        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://shop.test/"
          );


        const allUrls = [
          ...result.candidates,
          ...result.weakCandidates
        ].map(
          item => item.url
        );


        expect(
          result.candidates.map(
            item => item.url
          )
        ).toContain(
          "https://shop.test/product/canon-r50"
        );


        expect(
          allUrls.some(
            isStaticAsset
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "asset-looking query does not reject real product page",
      () => {

        const html = `
          <a href="/product/canon-r50?preview=photo.jpg">
            Canon R50
          </a>
        `;


        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://shop.test/"
          );


        expect(
          result.candidates.map(
            item => item.url
          )
        ).toContain(
          "https://shop.test/product/canon-r50?preview=photo.jpg"
        );
      }
    );

  }
);
