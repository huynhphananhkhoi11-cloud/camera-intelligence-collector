import {
  describe,
  expect,
  test
} from "vitest";

import {
  analyzeRawProduct
} from "../../src/v02/evidenceEngine.ts";

import type {
  RawProductFacts
} from "../../src/v02/rawProductExtractor.ts";

function facts(
  input: {
    url?: string;

    title: string;

    category?: string;

    pageText?: string;

    specs?: string;

    jsonLd?: unknown[];

    buttons?: string[];

    visiblePriceTexts?: string[];

    breadcrumbs?: string[];
  }
): RawProductFacts {
  return {
    url:
      input.url ??
      "https://example.com/product",

    title:
      input.title,

    breadcrumbs:
      input.breadcrumbs ??
      [],

    listingCategory:
      input.category ??
      "",

    jsonLd:
      input.jsonLd ??
      [],

    visiblePriceTexts:
      input.visiblePriceTexts ??
      [],

    buttons:
      input.buttons ??
      [],

    sections:
      input.specs
        ? [
            {
              key:
                "SPECS",

              heading:
                "ThÃƒÂ´ng sÃ¡Â»â€˜ kÃ¡Â»Â¹ thuÃ¡ÂºÂ­t",

              normalizedHeading:
                "thong so ky thuat",

              content:
                input.specs
            }
          ]
        : [],

    ratingTexts:
      [],

    stockTexts:
      [],

    listingPriceText:
      "",

    networkFacts:
      [],

    pageText:
      input.pageText ??
      [
        input.title,
        input.category ?? "",
        input.specs ?? ""
      ]
        .filter(Boolean)
        .join(" ")
  };
}

const cameraSpecs =
  [
    "LoÃ¡ÂºÂ¡i mÃƒÂ¡y: Mirrorless",
    "CÃ¡ÂºÂ£m biÃ¡ÂºÂ¿n APS-C CMOS 24.2MP",
    "ISO 100-32000",
    "Dual Pixel CMOS AF II",
    "EVF",
    "Quay video 4K",
    "NgÃƒÂ m RF-S"
  ].join("; ");

describe(
  "Phase 7B product intelligence golden cases",
  () => {
    test(
      "NEW sale camera: CAMERA -> SALE -> NEW",
      () => {
        const raw =
          facts({
            title:
              "Canon EOS R50",

            category:
              "MÃƒÂ¡y Ã¡ÂºÂ£nh",

            specs:
              cameraSpecs,

            buttons: [
              "Mua ngay"
            ],

            visiblePriceTexts: [
              "15.990.000 Ã„â€˜"
            ],

            jsonLd: [
              {
                "@context":
                  "https://schema.org",

                "@type":
                  "Product",

                name:
                  "Canon EOS R50",

                offers: {
                  "@type":
                    "Offer",

                  businessFunction:
                    "http://purl.org/goodrelations/v1#Sell",

                  itemCondition:
                    "https://schema.org/NewCondition",

                  price:
                    "15990000",

                  priceCurrency:
                    "VND"
                }
              }
            ]
          });

        const result =
          analyzeRawProduct(
            raw,
            "UNKNOWN"
          );

        expect(
          result.entity.type
        ).toBe(
          "CAMERA"
        );

        expect(
          result.entity.isCamera
        ).toBe(true);

        expect(
          result.offer.sale
        ).toBe(true);

        expect(
          result.offer.rental
        ).toBe(false);

        expect(
          result.condition.condition
        ).toBe(
          "NEW"
        );

        expect(
          result.condition.confidence
        ).not.toBe(
          "LOW"
        );
      }
    );

    test(
      "USED sale camera: CAMERA -> SALE -> USED",
      () => {
        const raw =
          facts({
            title:
              "Canon EOS R - HÃƒÂ ng cÃ…Â©",

            category:
              "MÃƒÂ¡y Ã¡ÂºÂ£nh cÃ…Â©",

            specs:
              cameraSpecs,

            buttons: [
              "Mua ngay"
            ],

            visiblePriceTexts: [
              "18.000.000 Ã„â€˜"
            ],

            jsonLd: [
              {
                "@context":
                  "https://schema.org",

                "@type":
                  "Product",

                name:
                  "Canon EOS R - HÃƒÂ ng cÃ…Â©",

                offers: {
                  "@type":
                    "Offer",

                  businessFunction:
                    "http://purl.org/goodrelations/v1#Sell",

                  itemCondition:
                    "https://schema.org/UsedCondition",

                  price:
                    "18000000",

                  priceCurrency:
                    "VND"
                }
              }
            ]
          });

        const result =
          analyzeRawProduct(
            raw,
            "UNKNOWN"
          );

        expect(
          result.entity.type
        ).toBe(
          "CAMERA"
        );

        expect(
          result.offer.sale
        ).toBe(true);

        expect(
          result.condition.condition
        ).toBe(
          "USED"
        );

        expect(
          result.forms
        ).toContain(
          "SECOND_HAND"
        );

        expect(
          result.condition.evidence
            .some(
              evidence =>
                evidence.ruleId ===
                  "condition.used.json_ld" ||
                evidence.ruleId ===
                  "condition.used.title"
            )
        ).toBe(true);
      }
    );

    test(
      "rental camera: CAMERA -> RENTAL while condition stays UNKNOWN",
      () => {
        const raw =
          facts({
            title:
              "Sony A6400",

            category:
              "MÃƒÂ¡y Ã¡ÂºÂ£nh",

            specs:
              [
                "LoÃ¡ÂºÂ¡i mÃƒÂ¡y: Mirrorless",
                "CÃ¡ÂºÂ£m biÃ¡ÂºÂ¿n APS-C CMOS",
                "ISO 100-32000",
                "Autofocus",
                "EVF",
                "Video 4K"
              ].join("; "),

            buttons: [
              "ThuÃƒÂª ngay"
            ],

            visiblePriceTexts: [
              "360.000 Ã„â€˜/ngÃƒÂ y"
            ],

            pageText:
              "Sony A6400 ThuÃƒÂª ngay 360.000 Ã„â€˜/ngÃƒÂ y Ã„ÂiÃ¡Â»Âu kiÃ¡Â»â€¡n thuÃƒÂª ThÃ¡Â»Âi gian thuÃƒÂª",

            jsonLd: [
              {
                "@context":
                  "https://schema.org",

                "@type":
                  "Product",

                name:
                  "Sony A6400",

                offers: {
                  "@type":
                    "Offer",

                  businessFunction:
                    "http://purl.org/goodrelations/v1#LeaseOut"
                }
              }
            ]
          });

        const result =
          analyzeRawProduct(
            raw,
            "SALE_NEW"
          );

        expect(
          result.entity.type
        ).toBe(
          "CAMERA"
        );

        expect(
          result.offer.rental
        ).toBe(true);

        expect(
          result.offer.sale
        ).toBe(false);

        expect(
          result.condition.condition
        ).toBe(
          "UNKNOWN"
        );

        expect(
          result.condition.evidence
        ).toEqual([]);

        expect(
          result.offer.evidence
            .some(
              evidence =>
                evidence.source ===
                  "SITE_PRIOR" &&
                evidence.weight ===
                  0
            )
        ).toBe(true);
      }
    );

    test(
      "lens is classified as non-camera LENS",
      () => {
        const raw =
          facts({
            title:
              "Canon RF 50mm F1.8 STM",

            category:
              "LENS",

            specs:
              [
                "focal length 50mm",
                "aperture f/1.8",
                "filter size 43mm"
              ].join("; "),

            jsonLd: [
              {
                "@type":
                  "Product",

                name:
                  "Canon RF 50mm F1.8 STM",

                offers: {
                  businessFunction:
                    "http://purl.org/goodrelations/v1#Sell"
                }
              }
            ]
          });

        const result =
          analyzeRawProduct(
            raw,
            "SALE_NEW"
          );

        expect(
          result.entity.type
        ).toBe(
          "LENS"
        );

        expect(
          result.entity.isCamera
        ).toBe(false);

        expect(
          result.entity.confidence
        ).toBe(
          "HIGH"
        );

        expect(
          result.entity.evidence
            .some(
              evidence =>
                evidence.ruleId ===
                  "entity.lens.category"
            )
        ).toBe(true);

        expect(
          result.decision
        ).toBe(
          "EXCLUDE"
        );
      }
    );
    test(
      "printer is classified as non-camera PRINTER",
      () => {
        const raw =
          facts({
            title:
              "Canon SELPHY CP1500 Photo Printer",

            category:
              "MÃƒÂ¡y in Ã¡ÂºÂ£nh",

            specs:
              [
                "CÃƒÂ´ng nghÃ¡Â»â€¡ in nhiÃ¡Â»â€¡t",
                "Ã„ÂÃ¡Â»â„¢ phÃƒÂ¢n giÃ¡ÂºÂ£i in 300 x 300 dpi",
                "KhÃ¡Â»â€¢ giÃ¡ÂºÂ¥y postcard",
                "TÃ¡Â»â€˜c Ã„â€˜Ã¡Â»â„¢ in Ã¡ÂºÂ£nh"
              ].join("; "),

            buttons: [
              "Mua ngay"
            ]
          });

        const result =
          analyzeRawProduct(
            raw,
            "SALE_NEW"
          );

        expect(
          result.entity.type
        ).toBe(
          "PRINTER"
        );

        expect(
          result.entity.isCamera
        ).toBe(false);
      }
    );

    test(
      "photobooth is classified as non-camera PHOTOBOOTH",
      () => {
        const raw =
          facts({
            title:
              "DÃ¡Â»â€¹ch vÃ¡Â»Â¥ Photobooth sÃ¡Â»Â± kiÃ¡Â»â€¡n",

            category:
              "Photobooth",

            pageText:
              "DÃ¡Â»â€¹ch vÃ¡Â»Â¥ photobooth chÃ¡Â»Â¥p Ã¡ÂºÂ£nh sÃ¡Â»Â± kiÃ¡Â»â€¡n, booth chÃ¡Â»Â¥p hÃƒÂ¬nh tÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng"
          });

        const result =
          analyzeRawProduct(
            raw,
            "UNKNOWN"
          );

        expect(
          result.entity.type
        ).toBe(
          "PHOTOBOOTH"
        );

        expect(
          result.entity.isCamera
        ).toBe(false);
      }
    );

    test(
      "siteMode alone cannot convert an unknown product into sale or rental truth",
      () => {
        const raw =
          facts({
            title:
              "Canon EOS R50",

            category:
              "MÃƒÂ¡y Ã¡ÂºÂ£nh",

            specs:
              cameraSpecs
          });

        const unknown =
          analyzeRawProduct(
            raw,
            "UNKNOWN"
          );

        const salePrior =
          analyzeRawProduct(
            raw,
            "SALE_NEW"
          );

        const rentalPrior =
          analyzeRawProduct(
            raw,
            "RENTAL"
          );

        expect(
          salePrior.offer.sale
        ).toBe(
          unknown.offer.sale
        );

        expect(
          rentalPrior.offer.rental
        ).toBe(
          unknown.offer.rental
        );

        expect(
          salePrior.offer.sale
        ).toBe(false);

        expect(
          rentalPrior.offer.rental
        ).toBe(false);
      }
    );
  }
);