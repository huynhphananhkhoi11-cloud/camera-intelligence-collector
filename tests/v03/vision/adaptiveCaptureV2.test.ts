import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page
} from "playwright";

import {
  captureAdaptiveVisualEvidence
} from "../../../src/v03/vision/adaptiveCapture.js";


describe(
  "V3 adaptive visual capture",
  () => {

    let browser:
      Browser;

    let context:
      BrowserContext;

    let page:
      Page;

    let outputDir:
      string;


    beforeAll(
      async () => {

        browser =
          await chromium.launch({
            headless:
              true
          });

        context =
          await browser.newContext({
            viewport: {
              width:
                1200,

              height:
                800
            }
          });
      }
    );


    beforeEach(
      async () => {

        page =
          await context.newPage();

        outputDir =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-v3-capture-"
            )
          );
      }
    );


    afterEach(
      async () => {

        await page.close();

        await rm(
          outputDir,
          {
            recursive:
              true,

            force:
              true
          }
        );
      }
    );


    afterAll(
      async () => {

        await browser.close();
      }
    );


    it(
      "captures hero with sibling price plus specs/reviews and writes a durable manifest",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<main id="product-page">',
            '<section id="product-hero" style="width:1000px;min-height:480px">',
            '<div class="title-column"><h1>Canon EOS R50</h1></div>',
            '<div class="commerce-column"><div class="price">15.990.000đ</div><div>Còn hàng</div></div>',
            "</section>",
            '<div style="height:200px"></div>',
            '<section id="specs" style="width:1000px;min-height:420px">',
            "<h2>Thông số kỹ thuật</h2>",
            "<p>Cảm biến APS-C CMOS 24.2MP</p>",
            "</section>",
            '<section id="reviews" style="width:1000px;min-height:360px">',
            "<h2>Đánh giá sản phẩm</h2>",
            "<p>4.8/5 từ 21 đánh giá</p>",
            "</section>",
            "</main>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const result =
          await captureAdaptiveVisualEvidence(
            page,
            {
              outputDir,
              maxShots:
                6
            }
          );


        expect(
          result.manifest.shots[0]?.shotId
        ).toBe(
          "hero-01"
        );

        expect(
          result.manifest.shots.map(
            shot =>
              shot.shotId
          )
        ).toContain(
          "specs-03"
        );

        expect(
          result.manifest.shots.map(
            shot =>
              shot.shotId
          )
        ).toContain(
          "reviews-04"
        );

        expect(
          result.manifest.shots.length
        ).toBeLessThanOrEqual(
          6
        );

        expect(
          result.manifest.shots.every(
            shot =>
              /^[a-f0-9]{64}$/u.test(
                shot.contentHash
              )
          )
        ).toBe(
          true
        );

        const manifestJson =
          JSON.parse(
            await readFile(
              result.manifestPath,
              "utf8"
            )
          ) as {
            readonly schemaVersion:
              number;

            readonly shots:
              readonly {
                readonly shotId:
                  string;
              }[];
          };

        expect(
          manifestJson.schemaVersion
        ).toBe(
          1
        );

        expect(
          manifestJson.shots.map(
            shot =>
              shot.shotId
          )
        ).toEqual(
          result.manifest.shots.map(
            shot =>
              shot.shotId
          )
        );
      }
    );


    it(
      "shields a promotional overlay only during screenshots and never mutates selected product state",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<main><section id="product-hero" style="width:1000px;min-height:520px">',
            "<h1>Canon EOS R50</h1>",
            "<div>15.990.000đ</div>",
            '<label>Phiên bản <select id="variant"><option selected>Body Only</option><option>Kit 18-45mm</option></select></label>',
            '<button id="buy" onclick="window.__cartClicks=(window.__cartClicks||0)+1">Mua ngay</button>',
            "</section></main>",
            '<div id="promo-popup" class="newsletter coupon-modal" style="position:fixed;inset:60px;z-index:9999;background:white">',
            "<strong>Nhận ưu đãi 10% - đăng ký newsletter</strong>",
            '<button onclick="window.__promoClicks=(window.__promoClicks||0)+1">Nhận ngay</button>',
            "</div>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const before = {
          html:
            await page.evaluate(
              "document.documentElement.outerHTML"
            ),

          variant:
            await page
              .locator(
                "#variant"
              )
              .inputValue(),

          cartClicks:
            await page.evaluate(
              "window.__cartClicks || 0"
            )
        };


        const screenshotSpy =
          vi.spyOn(
            page,
            "screenshot"
          );


        await captureAdaptiveVisualEvidence(
          page,
          {
            outputDir,
            maxShots:
              3
          }
        );


        const styles =
          screenshotSpy.mock.calls.map(
            call =>
              String(
                call[0]?.style ??
                ""
              )
          );

        expect(
          styles.some(
            style =>
              style.includes(
                "#promo-popup"
              )
          )
        ).toBe(
          true
        );

        expect(
          await page
            .locator(
              "#variant"
            )
            .inputValue()
        ).toBe(
          before.variant
        );

        expect(
          await page.evaluate(
            "window.__cartClicks || 0"
          )
        ).toBe(
          before.cartClicks
        );

        expect(
          await page.evaluate(
            "document.documentElement.outerHTML"
          )
        ).toBe(
          before.html
        );


        screenshotSpy.mockRestore();
      }
    );


    it(
      "opens read-only specs/review controls but never cart or variant controls",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<main><section id="product-hero" style="width:1000px;min-height:480px">',
            "<h1>Canon EOS R50</h1>",
            "<div>15.990.000đ</div>",
            '<select id="variant" onchange="window.__variantChanges=(window.__variantChanges||0)+1"><option selected>Body Only</option><option>Kit 18-45mm</option></select>',
            '<button id="buy" onclick="window.__cartClicks=(window.__cartClicks||0)+1">Thêm vào giỏ hàng</button>',
            "</section>",
            '<button id="specs-toggle" aria-expanded="false" onclick="this.setAttribute(\'aria-expanded\',\'true\');document.getElementById(\'specs\').style.display=\'block\';window.__specOpens=(window.__specOpens||0)+1">Thông số kỹ thuật</button>',
            '<section id="specs" style="display:none;width:1000px;min-height:400px"><h2>Thông số kỹ thuật</h2><p>APS-C CMOS 24.2MP</p></section>',
            '<button id="reviews-toggle" role="tab" aria-selected="false" onclick="document.getElementById(\'reviews\').style.display=\'block\';window.__reviewOpens=(window.__reviewOpens||0)+1">Đánh giá</button>',
            '<section id="reviews" style="display:none;width:1000px;min-height:320px"><h2>Đánh giá</h2><p>4.8/5 từ 21 lượt</p></section>',
            "</main>",
            "</body></html>"
          ].join(
            ""
          )
        );


        await captureAdaptiveVisualEvidence(
          page,
          {
            outputDir,
            maxShots:
              6
          }
        );


        expect(
          await page.evaluate(
            "window.__specOpens || 0"
          )
        ).toBe(
          1
        );

        expect(
          await page.evaluate(
            "window.__reviewOpens || 0"
          )
        ).toBe(
          1
        );

        expect(
          await page.evaluate(
            "window.__cartClicks || 0"
          )
        ).toBe(
          0
        );

        expect(
          await page.evaluate(
            "window.__variantChanges || 0"
          )
        ).toBe(
          0
        );

        expect(
          await page
            .locator(
              "#variant"
            )
            .inputValue()
        ).toBe(
          "Body Only"
        );
      }
    );
  }
);
