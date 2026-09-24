import { z } from "zod";

export const SemanticClassificationSchema = z.enum([
  "CAMERA_PRODUCT",
  "NON_CAMERA",
  "REVIEW"
]);

export const SemanticEvidenceSchema = z.object({
  shotId: z.string().min(1),
  rawText: z.string().min(1)
}).strict();

const EvidenceListSchema =
  z.array(SemanticEvidenceSchema).max(64).default([]);

export const SemanticEvidenceMapSchema = z.object({
  classification: EvidenceListSchema,
  productName: EvidenceListSchema,
  condition: EvidenceListSchema,
  specs: EvidenceListSchema,
  rentalPricePerDay: EvidenceListSchema,
  rentalTerms: EvidenceListSchema,
  accessoriesIncluded: EvidenceListSchema,
  bundleIncluded: EvidenceListSchema,
  rating: EvidenceListSchema,
  reviewCount: EvidenceListSchema,
  stock: EvidenceListSchema,
  salePrice: EvidenceListSchema
}).strict();

export const SemanticMoneySchema = z.object({
  value: z.number().positive(),
  currency: z.string().min(1).max(12)
}).strict();

const AiSemanticRowSchema = z.object({
  website: z.string().nullable().optional(),
  productName: z.string().min(1).nullable(),
  condition: z.enum(["NEW", "USED"]).nullable(),
  specs: z.array(z.string().min(1)).max(64),
  rentalPricePerDay: SemanticMoneySchema.nullable(),
  rentalTerms: z.string().min(1).nullable(),
  accessoriesIncluded: z.array(z.string().min(1)).max(32).nullable(),
  bundleIncluded: z.array(z.string().min(1)).max(32).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
  stock: z.string().min(1).nullable(),
  salePrice: SemanticMoneySchema.nullable(),
  url: z.string().nullable().optional()
}).strict();

const AiSemanticDecisionSchema = z.object({
  classification: SemanticClassificationSchema,
  reviewReason: z.string().min(1).nullable().optional(),
  row: AiSemanticRowSchema.nullable(),
  evidence: SemanticEvidenceMapSchema
}).strict();

export interface SemanticRow {
  readonly website: string;
  readonly productName: string | null;
  readonly condition: "NEW" | "USED" | null;
  readonly specs: readonly string[];
  readonly rentalPricePerDay: {
    readonly value: number;
    readonly currency: string;
  } | null;
  readonly rentalTerms: string | null;
  readonly accessoriesIncluded: readonly string[] | null;
  readonly bundleIncluded: readonly string[] | null;
  readonly rating: number | null;
  readonly reviewCount: number | null;
  readonly stock: string | null;
  readonly salePrice: {
    readonly value: number;
    readonly currency: string;
  } | null;
  readonly url: string;
}

export type SemanticEvidence =
  z.infer<typeof SemanticEvidenceSchema>;

export type SemanticEvidenceMap =
  z.infer<typeof SemanticEvidenceMapSchema>;

export type SemanticClassification =
  z.infer<typeof SemanticClassificationSchema>;

export type SemanticMoney =
  z.infer<typeof SemanticMoneySchema>;

export interface SemanticDecision {
  readonly classification: SemanticClassification;
  readonly reviewReason: string | null;
  readonly row: SemanticRow | null;
  readonly evidence: SemanticEvidenceMap;
}

export interface SemanticDecisionIssue {
  readonly code: string;
  readonly field?: string;
  readonly message: string;
}

export interface SemanticDecisionValidationResult {
  readonly status: "VALIDATED" | "REVIEW";
  readonly issues: readonly SemanticDecisionIssue[];
  readonly value: SemanticRow | null;
  readonly decision: SemanticDecision;
}

export interface SemanticDecisionValidationContext {
  readonly website: string;
  readonly url: string;
  readonly shotIds: ReadonlySet<string>;
}

const FIELD_KEYS = [
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
  "salePrice"
] as const;

type SemanticFieldKey =
  typeof FIELD_KEYS[number];

function emptyEvidence(): SemanticEvidenceMap {
  return {
    classification: [],
    productName: [],
    condition: [],
    specs: [],
    rentalPricePerDay: [],
    rentalTerms: [],
    accessoriesIncluded: [],
    bundleIncluded: [],
    rating: [],
    reviewCount: [],
    stock: [],
    salePrice: []
  };
}

function reviewResult(
  code: string,
  message: string,
  decision?: SemanticDecision
): SemanticDecisionValidationResult {
  const normalized: SemanticDecision =
    decision ?? {
      classification: "REVIEW",
      reviewReason: message,
      row: null,
      evidence: emptyEvidence()
    };

  return {
    status: "REVIEW",
    issues: [{ code, message }],
    value: null,
    decision: normalized
  };
}

function isPopulated(
  row: SemanticRow,
  field: SemanticFieldKey
): boolean {
  const value = row[field];

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== null;
}

function normalizeRow(
  input: z.infer<typeof AiSemanticRowSchema>,
  context: SemanticDecisionValidationContext
): SemanticRow {
  return {
    website: context.website,
    productName: input.productName,
    condition: input.condition,
    specs: [...input.specs],
    rentalPricePerDay: input.rentalPricePerDay,
    rentalTerms: input.rentalTerms,
    accessoriesIncluded:
      input.accessoriesIncluded === null
        ? null
        : [...input.accessoriesIncluded],
    bundleIncluded:
      input.bundleIncluded === null
        ? null
        : [...input.bundleIncluded],
    rating: input.rating,
    reviewCount: input.reviewCount,
    stock: input.stock,
    salePrice: input.salePrice,
    url: context.url
  };
}

export function validateSemanticDecision(
  raw: unknown,
  context: SemanticDecisionValidationContext
): SemanticDecisionValidationResult {
  const parsed = AiSemanticDecisionSchema.safeParse(raw);

  if (!parsed.success) {
    return reviewResult(
      "SEMANTIC_DECISION_STRUCTURE_INVALID",
      parsed.error.issues
        .slice(0, 8)
        .map(issue =>
          issue.path.join(".") + ": " + issue.message
        )
        .join(" | ")
    );
  }

  const base = parsed.data;
  const row =
    base.row === null
      ? null
      : normalizeRow(base.row, context);

  const decision: SemanticDecision = {
    classification: base.classification,
    reviewReason: base.reviewReason ?? null,
    row,
    evidence: base.evidence
  };

  for (const [field, items] of Object.entries(decision.evidence)) {
    for (const item of items) {
      if (!context.shotIds.has(item.shotId)) {
        return reviewResult(
          "SEMANTIC_EVIDENCE_UNKNOWN_SHOT",
          "Evidence for " + field +
            " cites unknown shotId " + item.shotId + ".",
          {
            ...decision,
            classification: "REVIEW",
            reviewReason:
              "Invalid screenshot provenance.",
            row: null
          }
        );
      }
    }
  }

  if (decision.classification === "REVIEW") {
    return {
      status: "REVIEW",
      issues: [],
      value: null,
      decision: {
        ...decision,
        row: null
      }
    };
  }

  if (decision.classification === "NON_CAMERA") {
    if (decision.row !== null) {
      return reviewResult(
        "NON_CAMERA_ROW_MUST_BE_NULL",
        "NON_CAMERA decisions must not contain a product row.",
        {
          ...decision,
          classification: "REVIEW",
          reviewReason:
            "NON_CAMERA decision contained a row.",
          row: null
        }
      );
    }

    if (decision.evidence.classification.length === 0) {
      return reviewResult(
        "NON_CAMERA_EVIDENCE_REQUIRED",
        "NON_CAMERA classification requires screenshot evidence.",
        {
          ...decision,
          classification: "REVIEW",
          reviewReason:
            "NON_CAMERA classification lacked evidence.",
          row: null
        }
      );
    }

    return {
      status: "REVIEW",
      issues: [],
      value: null,
      decision
    };
  }

  if (decision.row === null) {
    return reviewResult(
      "CAMERA_ROW_REQUIRED",
      "CAMERA_PRODUCT requires a row.",
      {
        ...decision,
        classification: "REVIEW",
        reviewReason:
          "CAMERA_PRODUCT decision lacked a row."
      }
    );
  }

  for (const field of FIELD_KEYS) {
    if (
      isPopulated(decision.row, field) &&
      decision.evidence[field].length === 0
    ) {
      return reviewResult(
        "SEMANTIC_EVIDENCE_REQUIRED",
        "Populated field " + field +
          " requires screenshot evidence.",
        {
          ...decision,
          classification: "REVIEW",
          reviewReason:
            "Missing evidence for " + field + ".",
          row: null
        }
      );
    }
  }

  return {
    status: "VALIDATED",
    issues: [],
    value: decision.row,
    decision
  };
}
