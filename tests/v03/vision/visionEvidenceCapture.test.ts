import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
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
  }
);
