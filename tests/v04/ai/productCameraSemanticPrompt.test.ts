// V15 numbered-product semantic acceptance markers:
// exact model gemini-3.5-flash-lite
// screenshots are sent as separate image parts, never a collage or contact sheet
// authoritative final hero ultra-high; other semantic images high
import {
  readFileSync
} from "node:fs";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  PRODUCT_CAMERA_SEMANTIC_MODEL,
  buildProductCameraSemanticPrompt,
  interpretFrozenProductWithGemini,
  type ProductCameraSemanticProvider
} from "../../../src/v04/ai/productCameraSemanticPrompt.js";

import {
  V14_COLUMN_SEMANTIC_CONTRACT
} from "../../../src/v04/ai/simpleSemantic13Prompt.js";

import type {
  FrozenProductVisualPacket
} from "../../../src/v04/contracts/v15PipelineContracts.js";

function packet():
  FrozenProductVisualPacket {

  return {
    itemId:
      "item-1",

    sequence:
      0,

    website:
      "shop.example",

    pageUrl:
      "https://shop.example/listing/camera-x",

    finalUrl:
      "https://shop.example/camera-x",

    screenshots: [
      {
        sequence:
          1,
        shotId:
          "01-hero-final",
        pageZone:
          "HERO",
        scrollY:
          0,
        documentHeight:
          4800,
        dimensions: {
          width:
            1200,
          height:
            900
        },
        width:
          1200,
        height:
          900,
        path:
          "product-1/01-hero-final.png",
        contentHash:
          "hash-01",
        isAuthoritativeHero:
          true,
        role:
          "hero",
        bytes:
          Buffer.from("native-hero"),
        fingerprint: {
          imageHash:
            "hash-01",
          scrollY:
            0,
          documentHeight:
            4800
        }
      },
      {
        sequence:
          2,
        shotId:
          "02-upper",
        pageZone:
          "UPPER",
        scrollY:
          850,
        documentHeight:
          4800,
        dimensions: {
          width:
            1200,
          height:
            900
        },
        width:
          1200,
        height:
          900,
        path:
          "product-1/02-upper.png",
        contentHash:
          "hash-02",
        isAuthoritativeHero:
          false,
        role:
          "viewport",
        bytes:
          Buffer.from("native-upper"),
        fingerprint: {
          imageHash:
            "hash-02",
          scrollY:
            850,
          documentHeight:
            4800
        }
      },
      {
        sequence:
          3,
        shotId:
          "03-middle",
        pageZone:
          "MIDDLE",
        scrollY:
          1900,
        documentHeight:
          4800,
        dimensions: {
          width:
            1200,
          height:
            900
        },
        width:
          1200,
        height:
          900,
        path:
          "product-1/03-middle.webp",
        contentHash:
          "hash-03",
        isAuthoritativeHero:
          false,
        role:
          "viewport",
        bytes:
          Buffer.from("native-middle"),
        fingerprint: {
          imageHash:
            "hash-03",
          scrollY:
            1900,
          documentHeight:
            4800
        }
      }
    ],

    manifest: {
      schemaVersion:
        1,
      url:
        "https://shop.example/listing/camera-x",
      finalUrl:
        "https://shop.example/camera-x",
      captureTimestamp:
        "2026-09-22T00:00:00.000Z",
      shots:
        []
    },

    manifestPath:
      "product-1/capture-audit.html",

    imagePaths: [
      "product-1/01-hero-final.png",
      "product-1/02-upper.png",
      "product-1/03-middle.webp"
    ]
  };
}

const cameraDecision = {
  classification:
    "CAMERA_PRODUCT",
  row: {
    website:
      "model.example",
    productName:
      "Camera X",
    condition:
      "NEW",
    specs: [
      "24 MP"
    ],
    rentalPricePerDay:
      null,
    rentalTerms:
      null,
    accessoriesIncluded: [
      "Battery"
    ],
    bundleIncluded:
      null,
    rating:
      4.8,
    reviewCount:
      12,
    stock:
      "In stock",
    salePrice: {
      value:
        18_000_000,
      currency:
        "VND"
    },
    url:
      "https://model.example/wrong"
  }
} as const;

describe(
  "V15 product camera semantic prompt",
  () => {

    test(
      "defines camera-only classification and the exact 13-field semantic scope",
      () => {

        const prompt =
          buildProductCameraSemanticPrompt();

        expect(prompt).toContain(
          "CAMERA_PRODUCT = the primary item is a camera, a camera body, or a camera kit whose primary product includes a camera body."
        );

        expect(prompt).toContain(
          "NON_CAMERA = the primary item is not a camera."
        );

        expect(prompt).toContain(
          "A camera product may visibly include gifts or accessories and still be CAMERA_PRODUCT."
        );

        expect(prompt).toContain(
          "All supplied screenshots belong to ONE product URL."
        );

        expect(prompt).toContain(
          "Read screenshots in numerical order."
        );

        expect(prompt).toContain(
          "Screenshot 1 (01-hero-final) is the final post-settle authoritative primary-product hero and anchors product identity."
        );

        expect(prompt).toContain(
          "Screenshots 2..N may add specs, description, rental information, accessories, bundle information, rating/reviews, availability, and other visible facts for the same primary product."
        );

        expect(prompt).toContain(
          "Later or lower screenshots may contain recommended or related products, repeated product cards, or footer/company information."
        );

        expect(prompt).toContain(
          "Do not use another product's name, price, rating, review count, stock, specs, accessories, or bundle for the primary row."
        );

        for (
          const field
          of [
            "website",
            "productName",
            "condition",
            "specs",
            "rentalPricePerDay",
            "rentalTerms",
            "accessoriesIncluded",
            "bundleIncluded",
            "rating",
            "reviewCount",
            "stock",
            "salePrice",
            "url"
          ]
        ) {
          expect(prompt).toContain(
            field
          );
        }

        expect(prompt).toContain(
          "If a value is not visibly supported, return null or [] as appropriate."
        );

        expect(prompt).toContain(
          "For stock, use only explicit availability or inventory wording for the primary product."
        );

        expect(prompt).toContain(
          "Warranty duration, authenticity wording, product condition, shipping, or service policy is not stock."
        );

        expect(prompt).toContain(
          "For a short stock/availability phrase, transcribe the complete visible wording exactly as written."
        );

        expect(prompt).toContain(
          "Do not paraphrase it, substitute synonyms, reorder words, omit words, or insert extra words."
        );

        expect(prompt).toContain(
          "If the exact wording is not legible enough to transcribe faithfully, return null rather than reconstructing it."
        );

        expect(prompt).toContain(
          "Rental mapping is field-exclusive: rentalPricePerDay is the explicit visible price for exactly one day or per day"
        );

        expect(prompt).toContain(
          "If any screenshot visibly shows an explicit one-day/per-day rental amount, rentalPricePerDay MUST be non-null"
        );

        expect(prompt).toContain(
          "Do not put the one-day/per-day amount only in rentalTerms."
        );

        expect(prompt).toContain(
          "Before emitting JSON, verify that every visibly supported one-day/per-day rental amount has been mapped to rentalPricePerDay."
        );

        expect(prompt).toContain(
          "Do not guess."
        );

        const fix13ArbitrationRule =
          "When multiple visible values could map to the same field, choose the value presented by the page as the dedicated factual state for that field rather than promotional, persuasive, urgency, or descriptive copy.";

        expect(prompt).toContain(
          fix13ArbitrationRule
        );

        for (
          const forbidden
          of [
            "rawText",
            "evidenceIds",
            "zshop",
            "vjshop",
            "mayanhtop1",
            "400,000"
          ]
        ) {
          expect(
            prompt.toLowerCase()
          ).not.toContain(
            forbidden.toLowerCase()
          );
        }
      }
    );



    test(
      "uses medium thinking for the single product-semantic Gemini call",
      () => {
        const source = readFileSync(
          new URL(
            "../../../src/v04/pipeline/cameraOnlyDiscoveryPipeline.ts",
            import.meta.url
          ),
          "utf8"
        );

        expect(source).toMatch(
          /createProductSemanticProvider[\s\S]*?thinking_level:\s*"medium"[\s\S]*?max_output_tokens:\s*4_096/
        );
      }
    );

    test(
      "reuses the exact frozen V14.1 semantic contract without a local duplicate",
      () => {

        const prompt =
          buildProductCameraSemanticPrompt();

        expect(prompt).toContain(
          V14_COLUMN_SEMANTIC_CONTRACT
        );

        const source =
          readFileSync(
            new URL(
              "../../../src/v04/ai/productCameraSemanticPrompt.ts",
              import.meta.url
            ),
            "utf8"
          );

        expect(source).toContain(
          "V14_COLUMN_SEMANTIC_CONTRACT"
        );

        expect(source).not.toContain(
          "V14_1_COLUMN_SEMANTICS"
        );
      }
    );

    test(
      "uses one provider call, sends every frozen screenshot, and overwrites only authoritative transport fields",
      async () => {

        const requests:
          unknown[] =
            [];

        const provider:
          ProductCameraSemanticProvider = {
            analyze:
              async request => {
                requests.push(
                  request
                );

                return {
                  text:
                    JSON.stringify(
                      cameraDecision
                    )
                };
              }
          };

        const input =
          packet();

        const result =
          await interpretFrozenProductWithGemini(
            input,
            provider
          );

        expect(requests).toHaveLength(
          1
        );

        const request =
          requests[0] as {
            model:
              string;
            images:
              readonly {
                sequence:
                  number;
                shotId:
                  string;
                pageZone:
                  string;
                isAuthoritativeHero:
                  boolean;
                role:
                  string;
                resolution:
                  string;
                bytes:
                  Buffer;
              }[];
          };

        expect(request.model).toBe(
          PRODUCT_CAMERA_SEMANTIC_MODEL
        );

        expect(request.images).toHaveLength(
          3
        );

        expect(
          request.images.map(
            image =>
              image.sequence
          )
        ).toEqual([
          1,
          2,
          3
        ]);

        expect(
          request.images.map(
            image =>
              image.shotId
          )
        ).toEqual([
          "01-hero-final",
          "02-upper",
          "03-middle"
        ]);

        expect(
          request.images.map(
            image =>
              image.pageZone
          )
        ).toEqual([
          "HERO",
          "UPPER",
          "MIDDLE"
        ]);

        expect(request.images[0]).toMatchObject({
          sequence:
            1,
          shotId:
            "01-hero-final",
          pageZone:
            "HERO",
          isAuthoritativeHero:
            true,
          resolution:
            "ultra_high"
        });

        // Explicit one-line regression evidence required by the numbered-packet architecture guard.
        expect(request.images[0]?.resolution).toBe("ultra_high");
        expect(request.images[1]?.resolution).toBe("high");

        expect(
          request.images.map(
            image =>
              image.bytes.toString()
          )
        ).toEqual([
          "native-hero",
          "native-upper",
          "native-middle"
        ]);

        expect(request.images[0]?.bytes).toBe(
          input.screenshots[0]?.bytes
        );

        expect(request.images[1]?.bytes).toBe(
          input.screenshots[1]?.bytes
        );

        expect(request.images[2]?.bytes).toBe(
          input.screenshots[2]?.bytes
        );

        expect(
          request.images.map(
            image =>
              image.resolution
          )
        ).toEqual([
          "ultra_high",
          "high",
          "high"
        ]);

        expect(
          JSON.stringify(
            request
          )
        ).not.toContain(
          "capture-audit.html"
        );

        expect(result.row?.website).toBe(
          "shop.example"
        );

        expect(result.row?.url).toBe(
          "https://shop.example/camera-x"
        );

        expect(result.row?.stock).toBe(
          "In stock"
        );

        expect(result.row?.accessoriesIncluded).toEqual([
          "Battery"
        ]);

        expect(result.row?.salePrice).toEqual({
          value:
            18_000_000,
          currency:
            "VND"
        });
      }
    );

    test(
      "returns NON_CAMERA only with a null row",
      async () => {

        const provider:
          ProductCameraSemanticProvider = {
            analyze:
              async () => ({
                text:
                  JSON.stringify({
                    classification:
                      "NON_CAMERA",
                    row:
                      null
                  })
              })
          };

        await expect(
          interpretFrozenProductWithGemini(
            packet(),
            provider
          )
        ).resolves.toEqual({
          classification:
            "NON_CAMERA",
          row:
            null
        });
      }
    );

    test(
      "rejects REVIEW instead of adding a local semantic repair pass",
      async () => {

        const provider:
          ProductCameraSemanticProvider = {
            analyze:
              async () => ({
                text:
                  JSON.stringify({
                    classification:
                      "REVIEW",
                    row:
                      null
                  })
              })
          };

        await expect(
          interpretFrozenProductWithGemini(
            packet(),
            provider
          )
        ).rejects.toThrow(
          "V15_PRODUCT_SEMANTIC_REVIEW_NOT_ALLOWED"
        );
      }
    );
  }
);
