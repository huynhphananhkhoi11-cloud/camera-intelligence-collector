import {
  z
} from "zod";


const ConfidenceSchema =
  z.number()
    .min(
      0
    )
    .max(
      1
    );


const EvidenceIdsSchema =
  z.array(
    z.string()
      .min(
        1
      )
  )
    .min(
      1
    )
    .max(
      32
    );


export const MoneyDecisionSchema =
  z.object({
    value:
      z.number()
        .nonnegative(),

    currency:
      z.string()
        .max(
          12
        )
        .nullable(),

    evidenceIds:
      EvidenceIdsSchema,

    confidence:
      ConfidenceSchema
  });


export const ConditionDecisionSchema =
  z.object({
    value:
      z.enum([
        "NEW",
        "USED",
        "REFURBISHED",
        "UNKNOWN"
      ]),

    evidenceIds:
      EvidenceIdsSchema,

    confidence:
      ConfidenceSchema
  });


export const StockDecisionSchema =
  z.object({
    state:
      z.enum([
        "IN_STOCK",
        "OUT_OF_STOCK",
        "PREORDER",
        "BACKORDER",
        "LIMITED",
        "UNKNOWN"
      ]),

    quantity:
      z.number()
        .int()
        .nonnegative()
        .nullable(),

    evidenceIds:
      EvidenceIdsSchema,

    confidence:
      ConfidenceSchema
  });


export const NumericDecisionSchema =
  z.object({
    value:
      z.number()
        .nonnegative(),

    evidenceIds:
      EvidenceIdsSchema,

    confidence:
      ConfidenceSchema
  });


export const VariantDecisionSchema =
  z.object({
    label:
      z.string()
        .min(
          1
        ),

    selected:
      z.boolean(),

    condition:
      z.enum([
        "NEW",
        "USED",
        "REFURBISHED",
        "UNKNOWN"
      ])
        .nullable(),

    price:
      MoneyDecisionSchema
        .nullable(),

    priceDelta:
      MoneyDecisionSchema
        .nullable(),

    evidenceIds:
      EvidenceIdsSchema,

    confidence:
      ConfidenceSchema
  });


export const SpecDecisionSchema =
  z.object({
    key:
      z.string()
        .min(
          1
        ),

    value:
      z.string()
        .min(
          1
        ),

    evidenceIds:
      EvidenceIdsSchema,

    confidence:
      ConfidenceSchema
  });


export const AISemanticDecisionSchema =
  z.object({
    entity:
      z.object({
        type:
          z.enum([
            "CAMERA",
            "NON_CAMERA",
            "UNCERTAIN"
          ]),

        subtype:
          z.string()
            .min(
              1
            ),

        confidence:
          ConfidenceSchema,

        evidenceIds:
          EvidenceIdsSchema
      }),

    productName:
      z.object({
        value:
          z.string()
            .min(
              1
            ),

        evidenceIds:
          EvidenceIdsSchema,

        confidence:
          ConfidenceSchema
      }),

    currentPrice:
      MoneyDecisionSchema
        .nullable(),

    oldPrice:
      MoneyDecisionSchema
        .nullable(),

    giftValues:
      z.array(
        MoneyDecisionSchema
      ),

    savingValues:
      z.array(
        MoneyDecisionSchema
      ),

    installmentAmounts:
      z.array(
        MoneyDecisionSchema
      ),

    variants:
      z.array(
        VariantDecisionSchema
      ),

    condition:
      ConditionDecisionSchema
        .nullable(),

    availableConditions:
      z.array(
        ConditionDecisionSchema
      ),

    stock:
      StockDecisionSchema
        .nullable(),

    rating:
      NumericDecisionSchema
        .nullable(),

    reviewCount:
      NumericDecisionSchema
        .nullable(),

    specs:
      z.array(
        SpecDecisionSchema
      ),

    conflicts:
      z.array(
        z.string()
      ),

    pageConfidence:
      ConfidenceSchema
  });


export type AISemanticDecision =
  z.infer<
    typeof AISemanticDecisionSchema
  >;


export type MoneyDecision =
  z.infer<
    typeof MoneyDecisionSchema
  >;


export type ValidationStatus =
  | "VALIDATED"
  | "NEEDS_REVIEW"
  | "AI_UNRESOLVED"
  | "UNSUPPORTED_AI_VALUE";


export interface ValidationIssue {
  readonly code:
    string;

  readonly message:
    string;

  readonly field?:
    string;
}


export interface SemanticValidationResult {
  readonly status:
    ValidationStatus;

  readonly issues:
    readonly ValidationIssue[];
}


export const AI_SEMANTIC_JSON_SCHEMA =
  z.toJSONSchema(
    AISemanticDecisionSchema
  );
