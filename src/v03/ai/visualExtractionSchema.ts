import { z } from "zod";

export const GEMINI_36_FLASH_MODEL = "gemini-3.6-flash" as const;

export const VisualShotSchema = z.object({
  shotId: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  base64: z.string().min(1),
  resolution: z.enum(["low", "medium", "high", "ultra_high"]).default("high"),
  sectionLabel: z.string().min(1).nullable().optional()
}).strict();

export const VisualExtractionRequestSchema = z.object({
  pageUrl: z.string().url(),
  finalUrl: z.string().url().optional(),
  shots: z.array(VisualShotSchema).min(1).max(6)
}).strict();

const EvidenceTextSchema = z.object({
  value: z.string().min(1),
  rawText: z.string().min(1),
  shotId: z.string().min(1)
}).strict();

const MoneyEvidenceSchema = z.object({
  value: z.number().positive(),
  currency: z.string().min(1).max(12),
  rawText: z.string().min(1),
  shotId: z.string().min(1)
}).strict();

const ConditionEvidenceSchema = z.object({
  value: z.enum(["NEW", "USED"]),
  rawText: z.string().min(1),
  shotId: z.string().min(1)
}).strict();

const ReviewCountEvidenceSchema = z.object({
  value: z.number().int().nonnegative(),
  rawText: z.string().min(1),
  shotId: z.string().min(1)
}).strict();

const RatingEvidenceSchema = z.object({
  value: z.number().min(0).max(5),
  rawText: z.string().min(1),
  shotId: z.string().min(1)
}).strict();

export const VisualExtractionSchema = z.object({
  disposition: z.enum(["CAMERA", "NON_CAMERA", "NON_PRODUCT", "UNCERTAIN"]),
  website: z.string().min(1),
  productName: EvidenceTextSchema.nullable(),
  condition: ConditionEvidenceSchema.nullable(),
  specs: z.array(EvidenceTextSchema).max(64),
  rentalPricePerDay: MoneyEvidenceSchema.nullable(),
  rentalTerms: EvidenceTextSchema.nullable(),
  accessoriesIncluded: z.array(EvidenceTextSchema).max(32).nullable(),
  bundleIncluded: z.array(EvidenceTextSchema).max(32).nullable(),
  rating: RatingEvidenceSchema.nullable(),
  reviewCount: ReviewCountEvidenceSchema.nullable(),
  stock: EvidenceTextSchema.nullable(),
  salePrice: MoneyEvidenceSchema.nullable(),
  url: z.string().url()
}).strict();

export const VISUAL_EXTRACTION_JSON_SCHEMA = z.toJSONSchema(VisualExtractionSchema);

export type VisualShot = z.infer<typeof VisualShotSchema>;
export type VisualExtractionRequest = z.infer<typeof VisualExtractionRequestSchema>;
export type VisualExtraction = z.infer<typeof VisualExtractionSchema>;
