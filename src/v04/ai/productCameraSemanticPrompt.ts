import {
  MinimalVisualDecisionSchema,
  MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA,
  type MinimalVisualDecision
} from "../contracts/minimalVisualDecision.js";

import type {
  FrozenProductVisualPacket
} from "../contracts/v15PipelineContracts.js";

import {
  V14_COLUMN_SEMANTIC_CONTRACT
} from "./simpleSemantic13Prompt.js";

export const PRODUCT_CAMERA_SEMANTIC_MODEL =
  "gemini-3.5-flash-lite" as const;

export interface ProductCameraSemanticImage {
  readonly sequence:
    number;

  readonly shotId:
    string;

  readonly pageZone:
    FrozenProductVisualPacket["screenshots"][number]["pageZone"];

  readonly isAuthoritativeHero:
    boolean;

  readonly role:
    "hero" |
    "viewport" |
    "interaction";

  readonly resolution:
    "high" |
    "ultra_high";

  readonly bytes:
    Buffer;
}

export interface ProductCameraSemanticRequest {
  readonly model:
    typeof PRODUCT_CAMERA_SEMANTIC_MODEL;

  readonly prompt:
    string;

  readonly schema:
    unknown;

  readonly images:
    readonly ProductCameraSemanticImage[];
}

export interface ProductCameraSemanticProvider {
  readonly analyze:
    (
      request:
        ProductCameraSemanticRequest
    ) => Promise<{
      readonly text:
        string;
    }>;
}

const ROW_FIELDS = [
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
] as const;

export function buildProductCameraSemanticPrompt():
  string {

  return [
    "Read all supplied screenshots together as one frozen product-page packet.",
    "Use your own visual and language understanding.",
    "Identify the primary item being sold on the page.",
    "",
    "Classify with exactly one of these values:",
    "CAMERA_PRODUCT = the primary item is a camera, a camera body, or a camera kit whose primary product includes a camera body.",
    "NON_CAMERA = the primary item is not a camera. Standalone lenses, accessories, bags, batteries, memory cards, tripods, flashes, filters, grips, vouchers, services, and unrelated products are NON_CAMERA when they are the primary item.",
    "A camera product may visibly include gifts or accessories and still be CAMERA_PRODUCT.",
    "",
    "All supplied screenshots belong to ONE product URL.",
    "Read screenshots in numerical order.",
    "Screenshot 1 (01-hero-final) is the final post-settle authoritative primary-product hero and anchors product identity.",
    "Screenshots 2..N may add specs, description, rental information, accessories, bundle information, rating/reviews, availability, and other visible facts for the same primary product.",
    "Later or lower screenshots may contain recommended or related products, repeated product cards, or footer/company information.",
    "Do not use another product's name, price, rating, review count, stock, specs, accessories, or bundle for the primary row.",
    "",
    "For NON_CAMERA return row as null.",
    "For CAMERA_PRODUCT fill the 13 workbook fields using what is visibly supported across all supplied screenshots.",
    "The exact row fields are: " + ROW_FIELDS.join(", ") + ".",
    V14_COLUMN_SEMANTIC_CONTRACT,
    "For stock, use only explicit availability or inventory wording for the primary product. A statement that one or more stores/branches have the product is stock/availability. Warranty duration, authenticity wording, product condition, shipping, or service policy is not stock.",
    "For a short stock/availability phrase, transcribe the complete visible wording exactly as written. Do not paraphrase it, substitute synonyms, reorder words, omit words, or insert extra words. If the exact wording is not legible enough to transcribe faithfully, return null rather than reconstructing it.",
    "Rental mapping is field-exclusive: rentalPricePerDay is the explicit visible price for exactly one day or per day; rentalTerms is for the other durations or rental conditions.",
    "If any screenshot visibly shows an explicit one-day/per-day rental amount, rentalPricePerDay MUST be non-null and must use that amount and visible currency.",
    "Do not leave rentalPricePerDay null merely because the one-day option appears inside a rental selector/list together with multi-day options.",
    "Do not put the one-day/per-day amount only in rentalTerms. Keep other durations, deposits, or conditions in rentalTerms instead.",
    "Do not calculate a one-day value from a multi-day price.",
    "Before emitting JSON, verify that every visibly supported one-day/per-day rental amount has been mapped to rentalPricePerDay.",
    "If a value is not visibly supported, return null or [] as appropriate.",
    "Do not guess.",
    "Preserve specific visible wording when the wording itself is the requested value.",
    "Summarize descriptive text concisely in your own words.",
    "Do not reproduce long product descriptions, reviews, manuals, articles, or marketing copy verbatim.",
    "Do not use benchmark expectations or retailer assumptions.",
    "Do not perform a second-pass repair or invent missing semantic values.",
    "Return one JSON object only matching the supplied schema.",
    "When multiple visible values could map to the same field, choose the value presented by the page as the dedicated factual state for that field rather than promotional, persuasive, urgency, or descriptive copy."
  ].join(
    "\n"
  );
}

function assertCameraOnlyDecision(
  decision:
    MinimalVisualDecision
): void {

  if (
    decision.classification ===
      "REVIEW"
  ) {
    throw new Error(
      "V15_PRODUCT_SEMANTIC_REVIEW_NOT_ALLOWED"
    );
  }

  if (
    decision.classification ===
      "NON_CAMERA" &&
    decision.row !==
      null
  ) {
    throw new Error(
      "V15_NON_CAMERA_ROW_MUST_BE_NULL"
    );
  }

  if (
    decision.classification ===
      "CAMERA_PRODUCT" &&
    decision.row ===
      null
  ) {
    throw new Error(
      "V15_CAMERA_PRODUCT_ROW_REQUIRED"
    );
  }
}

export async function interpretFrozenProductWithGemini(
  packet:
    FrozenProductVisualPacket,
  provider:
    ProductCameraSemanticProvider
): Promise<
  MinimalVisualDecision
> {

  const response =
    await provider.analyze({
      model:
        PRODUCT_CAMERA_SEMANTIC_MODEL,

      prompt:
        buildProductCameraSemanticPrompt(),

      schema:
        MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA,

      images:
        packet.screenshots.map(
          screenshot => ({
            sequence:
              screenshot.sequence,

            shotId:
              screenshot.shotId,

            pageZone:
              screenshot.pageZone,

            isAuthoritativeHero:
              screenshot.isAuthoritativeHero,

            role:
              screenshot.role,

            resolution:
              screenshot.isAuthoritativeHero
                ? "ultra_high" as const
                : "high" as const,

            bytes:
              screenshot.bytes
          })
        )
    });

  let parsed:
    unknown;

  try {
    parsed =
      JSON.parse(
        response.text
      );
  }
  catch {
    throw new Error(
      "V15_PRODUCT_SEMANTIC_INVALID_JSON"
    );
  }

  const decision =
    MinimalVisualDecisionSchema.parse(
      parsed
    );

  assertCameraOnlyDecision(
    decision
  );

  if (
    decision.classification ===
      "NON_CAMERA"
  ) {
    return decision;
  }

  return {
    ...decision,

    row: {
      ...decision.row!,

      website:
        packet.website,

      url:
        packet.finalUrl
    }
  };
}
