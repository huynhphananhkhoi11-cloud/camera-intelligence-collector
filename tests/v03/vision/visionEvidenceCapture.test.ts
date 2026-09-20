import {
  afterAll,
  beforeAll,
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

import type {
  EvidenceItem,
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";

import {
  captureVisionEvidencePacket
} from "../../../src/v03/vision/visionEvidenceCapture.js";


function item(
  input:
    EvidenceItem
): EvidenceItem {

  return input;
}


function packet(): EvidencePacket {

  const title =
    item({
      id:
        "ev_title",

      fieldHint:
        "PRODUCT_NAME",

      rawValue:
        "Canon EOS R50",

      sourceKind:
        "VISIBLE_TEXT",

      sourceUrl:
        "https://example.test/camera",

      ownershipHint:
        "PRIMARY_PRODUCT"
    });

  const price =
    item({
      id:
        "ev_price",

      fieldHint:
        "PRICE",

      rawValue:
        "15.990.000 VND",

      normalizedValue:
        15_990_000,

      sourceKind:
        "VISIBLE_TEXT",

      sourceUrl:
        "https://example.test/camera",

      ownershipHint:
        "PRIMARY_PRODUCT"
    });

  const selected =
    item({
      id:
        "ctrl_color",

      fieldHint:
        "CONTROL",

      rawValue:
        "Color | Black",

      sourceKind:
        "DOM",

      sourceUrl:
        "https://example.test/camera",

      locator:
        "select",

      context:
        "selected=true",

      ownershipHint:
        "UNKNOWN"
    });

  const structured =
    item({
      id:
        "ev_jsonld_price",

      fieldHint:
        "PRICE",

      rawValue:
        "15990000",

      normalizedValue:
        15_990_000,

      sourceKind:
        "JSON_LD",

      sourceUrl:
        "https://example.test/camera",

      ownershipHint:
        "PRIMARY_PRODUCT"
    });


  return {
    packetId:
      "packet_fixture",

    pageUrl:
      "https://example.test/camera",

    finalUrl:
      "https://example.test/camera",

    productIdentity:
      "Canon EOS R50",

    primaryRegionText:
      "Canon EOS R50 15.990.000 VND",

    allEvidence: [
      title,
      price,
      selected,
      structured
    ],

    titleCandidates:
      [title],

    breadcrumbs:
      [],

    moneyCandidates: [
      price,
      structured
    ],

    conditionCandidates:
      [],

    stockCandidates:
      [],

    ratingCandidates:
      [],

    reviewCandidates:
      [],

    specCandidates:
      [],

    variantCandidates:
      [selected],

    selectedControls:
      [selected],

    structuredFacts:
      [structured]
  };
}


describe(
  "C9A deterministic vision evidence capture",
  () => {

    let browser:
      Browser;

    let context:
      BrowserContext;

    let page:
      Page;


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

        page =
          await context.newPage();
      }
    );


    afterAll(
      async () => {

        await browser.close();
      }
    );


    it(
      "captures a product-region screenshot and preserves evidence IDs for downstream grounding",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body>",
            '<div id="__camintel_agent_overlay">agent overlay</div>',
            '<main><section itemtype="https://schema.org/Product" style="width:900px;height:500px">',
            "<h1>Canon EOS R50</h1>",
            '<div class="price">15.990.000 VND</div>',
            '<label>Color <select><option selected>Black</option></select></label>',
            "</section></main>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const result =
          await captureVisionEvidencePacket(
            page,
            packet()
          );


        expect(
          result.sourceEvidencePacketId
        ).toBe(
          "packet_fixture"
        );

        expect(
          result.productRegionScreenshot.fallback
        ).toBe(
          false
        );

        expect(
          result.productRegionScreenshot.selectorUsed
        ).toBe(
          '[itemtype*="schema.org/Product"]'
        );

        expect(
          result.productRegionScreenshot.base64.length
        ).toBeGreaterThan(
          100
        );

        expect(
          result.productRegionScreenshot.imageId
        ).toMatch(
          /^vision_image_[a-f0-9]{16}$/u
        );

        expect(
          result.compactDomEvidence.map(
            evidence =>
              evidence.id
          )
        ).toEqual([
          "ev_title",
          "ev_price"
        ]);

        expect(
          result.selectedControls.map(
            evidence =>
              evidence.id
          )
        ).toEqual([
          "ctrl_color"
        ]);

        expect(
          result.structuredFacts.map(
            evidence =>
              evidence.id
          )
        ).toEqual([
          "ev_jsonld_price"
        ]);

        expect(
          result.packetId
        ).toMatch(
          /^vision_packet_[a-f0-9]{16}$/u
        );
      }
    );


    it(
      "uses the viewport as a deterministic fallback when no product region selector is available",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body>",
            "<div>plain page without product container</div>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const first =
          await captureVisionEvidencePacket(
            page,
            packet()
          );

        const second =
          await captureVisionEvidencePacket(
            page,
            packet()
          );


        expect(
          first.productRegionScreenshot.fallback
        ).toBe(
          true
        );

        expect(
          first.productRegionScreenshot.selectorUsed
        ).toBe(
          null
        );

        expect(
          first.productRegionScreenshot.width
        ).toBe(
          1200
        );

        expect(
          first.productRegionScreenshot.height
        ).toBe(
          800
        );

        expect(
          first.packetId
        ).toBe(
          second.packetId
        );
      }
    );


    it(
      "keeps compact DOM evidence bounded and excludes controls plus structured facts from that channel",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body>",
            "<main style=\"width:800px;height:400px\">Camera</main>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const base =
          packet();

        const manyVisible =
          Array.from(
            {
              length:
                40
            },
            (
              _,
              index
            ) =>
              item({
                id:
                  "ev_visible_" +
                  String(
                    index
                  ),

                fieldHint:
                  "DESCRIPTION",

                rawValue:
                  "Visible evidence " +
                  String(
                    index
                  ),

                sourceKind:
                  "VISIBLE_TEXT",

                sourceUrl:
                  base.finalUrl,

                ownershipHint:
                  "PRIMARY_PRODUCT"
              })
          );

        const expanded: EvidencePacket = {
          ...base,

          allEvidence: [
            ...base.allEvidence,
            ...manyVisible
          ],

          specCandidates:
            manyVisible
        };


        const result =
          await captureVisionEvidencePacket(
            page,
            expanded
          );


        expect(
          result.compactDomEvidence.length
        ).toBeLessThanOrEqual(
          24
        );

        expect(
          result.compactDomEvidence.some(
            evidence =>
              evidence.id ===
                "ctrl_color"
          )
        ).toBe(
          false
        );

        expect(
          result.compactDomEvidence.some(
            evidence =>
              evidence.id ===
                "ev_jsonld_price"
          )
        ).toBe(
          false
        );
      }
    );

    it(
      "preserves page state and uses no full-page screenshot",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body style=\"margin:0\">",
            '<div id="__camintel_agent_overlay" style="position:fixed;display:block">agent overlay</div>',
            '<div style="height:200px">top spacer</div>',
            '<section class="product-detail" style="width:850px;height:420px">',
            "<h1>Canon EOS R50</h1>",
            "<div>Body Only</div>",
            "<div>15.990.000 VND</div>",
            '<label>Color <select id="color"><option>Silver</option><option selected>Black</option></select></label>',
            "</section>",
            '<div style="height:1400px">bottom spacer</div>',
            "</body></html>"
          ].join(
            ""
          )
        );

        await page.evaluate(
          "window.scrollTo(0, 120)"
        );

        const before = {
          url:
            page.url(),

          scrollY:
            await page.evaluate(
              "window.scrollY"
            ),

          color:
            await page
              .locator(
                "#color"
              )
              .inputValue(),

          overlayExists:
            await page
              .locator(
                "#__camintel_agent_overlay"
              )
              .count(),

          overlayStyle:
            await page
              .locator(
                "#__camintel_agent_overlay"
              )
              .getAttribute(
                "style"
              )
        };

        const screenshotSpy =
          vi.spyOn(
            page,
            "screenshot"
          );

        await captureVisionEvidencePacket(
          page,
          packet()
        );

        expect(
          screenshotSpy
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          screenshotSpy.mock.calls[0]?.[0]?.fullPage
        ).toBe(
          false
        );

        expect(
          page.url()
        ).toBe(
          before.url
        );

        expect(
          await page.evaluate(
            "window.scrollY"
          )
        ).toBe(
          before.scrollY
        );

        expect(
          await page
            .locator(
              "#color"
            )
            .inputValue()
        ).toBe(
          before.color
        );

        expect(
          await page
            .locator(
              "#__camintel_agent_overlay"
            )
            .count()
        ).toBe(
          before.overlayExists
        );

        expect(
          await page
            .locator(
              "#__camintel_agent_overlay"
            )
            .getAttribute(
              "style"
            )
        ).toBe(
          before.overlayStyle
        );

        screenshotSpy.mockRestore();
      }
    );


    it(
      "keeps packet and image IDs stable for identical deterministic inputs",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body style=\"margin:0\">",
            '<section class="product-detail" style="width:820px;height:420px">',
            "<h1>Canon EOS R50</h1>",
            "<div>Body Only</div>",
            "<div>15.990.000 VND</div>",
            "</section>",
            "</body></html>"
          ].join(
            ""
          )
        );

        const first =
          await captureVisionEvidencePacket(
            page,
            packet()
          );

        const second =
          await captureVisionEvidencePacket(
            page,
            packet()
          );

        expect(
          first.productRegionScreenshot.fallback
        ).toBe(
          false
        );

        expect(
          second.productRegionScreenshot.fallback
        ).toBe(
          false
        );

        expect(
          first.packetId
        ).toBe(
          second.packetId
        );

        expect(
          first.productRegionScreenshot.imageId
        ).toBe(
          second.productRegionScreenshot.imageId
        );
      }
    );


    it(
      "hides a high-z promotional popup in screenshot styling without mutating page state",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body style=\"margin:0\">",
            '<div style="height:140px">top spacer</div>',
            '<main><section itemtype="https://schema.org/Product" style="width:900px;height:500px">',
            "<h1>Canon EOS R50</h1>",
            "<div>15.990.000 VND</div>",
            '<label>Variant <select id="variant"><option selected>Body Only</option><option>Kit 18-45mm</option></select></label>',
            "</section></main>",
            '<div id="mystery-offer" style="position:fixed;inset:80px;z-index:9999;background:white">',
            "<div>Bấm vào để nhận ưu đãi 10% ngay hôm nay</div>",
            '<button id="offer-action" onclick="window.__offerClicks=(window.__offerClicks||0)+1">Nhận ưu đãi</button>',
            "</div>",
            "</body></html>"
          ].join(
            ""
          )
        );

        await page.evaluate(
          "window.scrollTo(0, 120)"
        );


        const before = {
          url:
            page.url(),

          scrollY:
            await page.evaluate(
              "window.scrollY"
            ),

          variant:
            await page
              .locator(
                "#variant"
              )
              .inputValue(),

          html:
            await page.evaluate(
              "document.documentElement.outerHTML"
            ),

          offerClicks:
            await page.evaluate(
              "window.__offerClicks || 0"
            )
        };


        const screenshotSpy =
          vi.spyOn(
            page,
            "screenshot"
          );


        await captureVisionEvidencePacket(
          page,
          packet()
        );


        const options =
          screenshotSpy.mock.calls[0]?.[0];

        const style =
          String(
            options?.style ??
            ""
          );


        expect(
          style
        ).toContain(
          "#mystery-offer"
        );

        expect(
          options?.fullPage
        ).toBe(
          false
        );

        expect(
          page.url()
        ).toBe(
          before.url
        );

        expect(
          await page.evaluate(
            "window.scrollY"
          )
        ).toBe(
          before.scrollY
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
            "window.__offerClicks || 0"
          )
        ).toBe(
          before.offerClicks
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
      "does not hide a product dialog that contains the primary product identity",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body style=\"margin:0\">",
            '<main><section itemtype="https://schema.org/Product" style="width:900px;height:500px">',
            "<h1>Canon EOS R50</h1>",
            "<div>15.990.000 VND</div>",
            "</section></main>",
            '<div id="coupon-product-config" class="promo-popup" role="dialog" aria-modal="true" style="position:fixed;inset:100px;z-index:9999;background:white">',
            "<h2>Canon EOS R50</h2>",
            "<div>Ưu đãi cho Body Only / Kit 18-45mm</div>",
            "</div>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const screenshotSpy =
          vi.spyOn(
            page,
            "screenshot"
          );


        await captureVisionEvidencePacket(
          page,
          packet()
        );


        const style =
          String(
            screenshotSpy.mock.calls[0]?.[0]?.style ??
            ""
          );


        expect(
          style
        ).not.toContain(
          "#coupon-product-config"
        );


        expect(
          await page.locator(
            "#coupon-product-config"
          ).count()
        ).toBe(
          1
        );


        screenshotSpy.mockRestore();
      }
    );

  }
);
