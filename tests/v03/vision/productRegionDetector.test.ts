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
  detectProductRegion
} from "../../../src/v03/vision/productRegionDetector.js";


function evidence(
  input:
    EvidenceItem
): EvidenceItem {

  return input;
}


function packet(
  overrides: {
    readonly productIdentity?:
      string;

    readonly selectedValues?:
      readonly string[];

    readonly priceValues?:
      readonly string[];
  } = {}
): EvidencePacket {

  const productIdentity =
    overrides.productIdentity ??
    "Canon EOS R50";

  const title =
    evidence({
      id:
        "ev_title",

      fieldHint:
        "PRODUCT_NAME",

      rawValue:
        productIdentity,

      sourceKind:
        "VISIBLE_TEXT",

      sourceUrl:
        "https://example.test/camera",

      ownershipHint:
        "PRIMARY_PRODUCT"
    });

  const selectedControls =
    (
      overrides.selectedValues ??
      [
        "Body Only"
      ]
    ).map(
      (
        value,
        index
      ) =>
        evidence({
          id:
            "ctrl_" +
            String(
              index
            ),

          fieldHint:
            "CONTROL",

          rawValue:
            "Kit | " +
            value,

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
        })
    );

  const moneyCandidates =
    (
      overrides.priceValues ??
      [
        "15.990.000 VND"
      ]
    ).map(
      (
        value,
        index
      ) =>
        evidence({
          id:
            "price_" +
            String(
              index
            ),

          fieldHint:
            "PRICE",

          rawValue:
            value,

          sourceKind:
            "VISIBLE_TEXT",

          sourceUrl:
            "https://example.test/camera",

          ownershipHint:
            "PRIMARY_PRODUCT"
        })
    );


  return {
    packetId:
      "packet_detector_fixture",

    pageUrl:
      "https://example.test/camera",

    finalUrl:
      "https://example.test/camera",

    productIdentity,

    primaryRegionText:
      productIdentity,

    allEvidence: [
      title,
      ...selectedControls,
      ...moneyCandidates
    ],

    titleCandidates:
      [title],

    breadcrumbs:
      [],

    moneyCandidates,

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
      selectedControls,

    selectedControls,

    structuredFacts:
      []
  };
}


describe(
  "C9A2 product region detector",
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
      "specific product container wins over a giant generic main",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body style=\"margin:0\">",
            '<main style="width:1200px;height:780px">',
            "<nav>Home Cameras News Contact</nav>",
            '<section class="product-detail-card" style="width:760px;height:430px">',
            "<h1>Canon EOS R50</h1>",
            "<div>Body Only</div>",
            "<div>15.990.000 VND</div>",
            "</section>",
            "<footer>Store information</footer>",
            "</main>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const result =
          await detectProductRegion(
            page,
            packet()
          );


        expect(
          result
        ).not.toBeNull();

        expect(
          result?.selector
        ).toContain(
          "product"
        );

        expect(
          result?.box.width
        ).toBeLessThan(
          1200
        );

        expect(
          result?.score
        ).toBeGreaterThanOrEqual(
          5
        );
      }
    );


    it(
      "identity plus selected variant plus price wins a deterministic tie",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body style=\"margin:0\">",
            '<section id="product-summary" style="width:720px;height:300px">',
            "<h1>Canon EOS R50</h1>",
            "<div>Body Only</div>",
            "<div>15.990.000 VND</div>",
            "</section>",
            '<section class="product-related" style="width:680px;height:260px">',
            "<h2>Canon EOS R50 accessories</h2>",
            "<div>12.000.000 VND</div>",
            "</section>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const first =
          await detectProductRegion(
            page,
            packet()
          );

        const second =
          await detectProductRegion(
            page,
            packet()
          );


        expect(
          first
        ).not.toBeNull();

        expect(
          first?.selector
        ).toBe(
          second?.selector
        );

        expect(
          first?.box
        ).toEqual(
          second?.box
        );

        expect(
          first?.selector
        ).toContain(
          "product"
        );
      }
    );


    it(
      "blog article without product evidence returns null",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body>",
            "<main>",
            '<article style="width:900px;height:500px">',
            "<h1>How to choose a camera for travel</h1>",
            "<p>This editorial article discusses photography techniques.</p>",
            "<p>No store offer or selected product variant is present.</p>",
            "</article>",
            "</main>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const result =
          await detectProductRegion(
            page,
            packet({
              productIdentity:
                "Canon EOS R50",

              selectedValues:
                [],

              priceValues:
                []
            })
          );


        expect(
          result
        ).toBeNull();
      }
    );


    it(
      "does not auto-scroll an off-screen product region into view",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body style=\"margin:0\">",
            '<div style="height:1200px">Spacer</div>',
            '<section class="product-detail" style="width:800px;height:400px">',
            "<h1>Canon EOS R50</h1>",
            "<div>Body Only</div>",
            "<div>15.990.000 VND</div>",
            "</section>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const before =
          await page.evaluate(
            "window.scrollY"
          );

        const result =
          await detectProductRegion(
            page,
            packet()
          );

        const after =
          await page.evaluate(
            "window.scrollY"
          );


        expect(
          result
        ).toBeNull();

        expect(
          before
        ).toBe(
          0
        );

        expect(
          after
        ).toBe(
          before
        );
      }
    );


    it(
      "clips the selected region to the current viewport",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body style=\"margin:0\">",
            '<section class="product-detail" style="position:absolute;left:900px;top:650px;width:600px;height:400px">',
            "<h1>Canon EOS R50</h1>",
            "<div>Body Only</div>",
            "<div>15.990.000 VND</div>",
            "</section>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const result =
          await detectProductRegion(
            page,
            packet()
          );


        expect(
          result
        ).not.toBeNull();

        expect(
          result?.box.x
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          result?.box.y
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          (
            result?.box.x ??
            0
          ) +
          (
            result?.box.width ??
            0
          )
        ).toBeLessThanOrEqual(
          1200
        );

        expect(
          (
            result?.box.y ??
            0
          ) +
          (
            result?.box.height ??
            0
          )
        ).toBeLessThanOrEqual(
          800
        );
      }
    );


    it(
      "prefers smaller visible area when score is tied",
      async () => {

        await page.setContent(
          [
            "<!doctype html>",
            "<html><body style=\"margin:0\">",
            '<section class="product-shell" style="position:absolute;left:0;top:0;width:900px;height:500px">',
            "<h1>Canon EOS R50</h1>",
            "<div>Body Only</div>",
            "<div>15.990.000 VND</div>",
            "</section>",
            '<section id="product-card" style="position:absolute;left:0;top:0;width:700px;height:350px">',
            "<h1>Canon EOS R50</h1>",
            "<div>Body Only</div>",
            "<div>15.990.000 VND</div>",
            "</section>",
            "</body></html>"
          ].join(
            ""
          )
        );


        const result =
          await detectProductRegion(
            page,
            packet()
          );


        expect(
          result
        ).not.toBeNull();

        expect(
          (
            result?.box.width ??
            0
          ) *
          (
            result?.box.height ??
            0
          )
        ).toBe(
          700 *
          350
        );
      }
    );
  }
);
