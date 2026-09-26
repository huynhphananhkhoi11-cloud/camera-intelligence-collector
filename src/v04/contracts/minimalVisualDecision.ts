import { z } from "zod";

export type VisualClassification =
  | "CAMERA_PRODUCT"
  | "NON_CAMERA"
  | "REVIEW";

export interface MoneyValue {
  readonly value: number;
  readonly currency: string;
}

export interface Camera13Row {
  readonly website: string;
  readonly productName: string | null;
  readonly condition: "NEW" | "USED" | null;
  readonly specs: readonly string[];
  readonly rentalPricePerDay: MoneyValue | null;
  readonly rentalTerms: string | null;
  readonly accessoriesIncluded: readonly string[] | null;
  readonly bundleIncluded: readonly string[] | null;
  readonly rating: number | null;
  readonly reviewCount: number | null;
  readonly stock: string | null;
  readonly salePrice: MoneyValue | null;
  readonly url: string;
}

export interface MinimalVisualDecision {
  readonly classification: VisualClassification;
  readonly row: Camera13Row | null;
}

const MoneyValueSchema = z.object({
  value: z.number().finite(),
  currency: z.string().min(1)
});

const RentalPricePerDaySchema = MoneyValueSchema.describe(
  "Explicit visible price for renting the primary product for exactly one day or per day. If a visible rental selector/list includes a one-day option with a price, use that amount and currency here. Do not calculate a daily price from a multi-day option."
);

const RentalTermsSchema = z.string().describe(
  "Other visible rental durations, options, deposits, or conditions. This field is not a substitute for rentalPricePerDay when an explicit one-day/per-day price is visible."
);

export const Camera13RowSchema = z.object({
  website: z.string(),
  productName: z.string().nullable(),
  condition: z.enum(["NEW", "USED"]).nullable(),
  specs: z.array(z.string()),
  rentalPricePerDay: RentalPricePerDaySchema.nullable().describe(
    "If an explicit one-day or per-day rental amount is visibly supported, this field must contain that amount instead of null, even when the page also shows other rental options."
  ),
  rentalTerms: RentalTermsSchema.nullable().describe(
    "Keep other rental durations/conditions here; do not place the one-day/per-day price only here while leaving rentalPricePerDay null."
  ),
  accessoriesIncluded: z.array(z.string()).nullable(),
  bundleIncluded: z.array(z.string()).nullable(),
  rating: z.number().finite().nullable(),
  reviewCount: z.number().finite().nullable(),
  stock: z.string().nullable(),
  salePrice: MoneyValueSchema.nullable(),
  url: z.string()
});

export const MinimalVisualDecisionSchema = z.object({
  classification: z.enum(["CAMERA_PRODUCT", "NON_CAMERA", "REVIEW"]),
  row: Camera13RowSchema.nullable()
});

const GEMINI_UNSUPPORTED_JSON_SCHEMA_KEYS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "pattern",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "uniqueItems",
  "const",
  "examples",
  "default",
  "contentEncoding",
  "contentMediaType"
]);

function sanitizeProviderSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeProviderSchema);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (GEMINI_UNSUPPORTED_JSON_SCHEMA_KEYS.has(key)) continue;
    output[key] = sanitizeProviderSchema(child);
  }

  return output;
}

export const MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA =
  sanitizeProviderSchema(
    z.toJSONSchema(MinimalVisualDecisionSchema)
  );
