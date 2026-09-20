import {
  AISemanticDecisionSchema,
  type AISemanticDecision
} from "./semanticContracts.js";


export const GEMINI_VISION_MODEL =
  "gemini-3.5-flash-lite";


export interface GeminiVisionScreenshot {
  readonly mimeType:
    "image/png" |
    "image/jpeg" |
    "image/webp";

  readonly base64:
    string;

  readonly evidenceId?:
    string;
}


export interface GeminiVisionEvidenceInput {
  readonly screenshot:
    GeminiVisionScreenshot;

  readonly compactDomEvidence:
    unknown;

  readonly selectedControls:
    readonly unknown[];

  readonly structuredFacts:
    readonly unknown[];
}


export interface GeminiVisionUsage {
  readonly inputTokens:
    number |
    null;

  readonly outputTokens:
    number |
    null;

  readonly thoughtTokens:
    number |
    null;

  readonly totalTokens:
    number |
    null;
}


export interface GeminiVisionResult {
  readonly decision:
    AISemanticDecision;

  readonly model:
    string;

  readonly attempts:
    number;

  readonly latencyMs:
    number;

  readonly usage:
    GeminiVisionUsage;
}


export interface GeminiVisionProviderOptions {
  readonly apiKey:
    string;

  readonly baseUrl?:
    string;

  readonly timeoutMs?:
    number;

  readonly fetchFn?:
    typeof fetch;
}


export class GeminiVisionQuotaError
extends Error {

  constructor(
    message:
      string
  ) {

    super(
      message
    );

    this.name =
      "GeminiVisionQuotaError";
  }
}


export class GeminiVisionTransportError
extends Error {

  constructor(
    message:
      string
  ) {

    super(
      message
    );

    this.name =
      "GeminiVisionTransportError";
  }
}


export class GeminiVisionContractError
extends Error {

  constructor(
    message:
      string
  ) {

    super(
      message
    );

    this.name =
      "GeminiVisionContractError";
  }
}


/*
 * C9 live hardening v2:
 *
 * Gemini structured outputs support nested schemas, but Google documents that
 * very large or deeply nested schemas may be rejected. AISemanticDecision is
 * intentionally rich and is too large to use as the wire schema for this
 * latency-sensitive one-shot path.
 *
 * Keep the API wire contract compact and shallow, then deterministically map
 * it into the canonical AISemanticDecision and validate that canonical object
 * with AISemanticDecisionSchema + the existing grounding validator.
 */
const EVIDENCE_IDS_SCHEMA = {
  type:
    "array",

  items: {
    type:
      "string"
  },

  maxItems:
    12
} as const;


const CONFIDENCE_SCHEMA = {
  type:
    "number",

  minimum:
    0,

  maximum:
    1
} as const;


const NULLABLE_CONDITION_SCHEMA = {
  anyOf: [
    {
      type:
        "string",

      enum: [
        "NEW",
        "USED",
        "REFURBISHED",
        "UNKNOWN"
      ]
    },

    {
      type:
        "null"
    }
  ]
} as const;


const NULLABLE_STOCK_SCHEMA = {
  anyOf: [
    {
      type:
        "string",

      enum: [
        "IN_STOCK",
        "OUT_OF_STOCK",
        "PREORDER",
        "BACKORDER",
        "LIMITED",
        "UNKNOWN"
      ]
    },

    {
      type:
        "null"
    }
  ]
} as const;


const VISION_RESPONSE_SCHEMA = {
  type:
    "object",

  properties: {
    entity_type: {
      type:
        "string",

      enum: [
        "CAMERA",
        "NON_CAMERA",
        "UNCERTAIN"
      ]
    },

    entity_subtype: {
      type:
        "string"
    },

    entity_confidence:
      CONFIDENCE_SCHEMA,

    entity_evidence_ids: {
      ...EVIDENCE_IDS_SCHEMA,

      minItems:
        1
    },

    product_name: {
      type:
        "string"
    },

    product_name_confidence:
      CONFIDENCE_SCHEMA,

    product_name_evidence_ids: {
      ...EVIDENCE_IDS_SCHEMA,

      minItems:
        1
    },

    current_price_value: {
      type: [
        "number",
        "null"
      ]
    },

    current_price_currency: {
      type: [
        "string",
        "null"
      ]
    },

    current_price_confidence:
      CONFIDENCE_SCHEMA,

    current_price_evidence_ids:
      EVIDENCE_IDS_SCHEMA,

    condition_value:
      NULLABLE_CONDITION_SCHEMA,

    condition_confidence:
      CONFIDENCE_SCHEMA,

    condition_evidence_ids:
      EVIDENCE_IDS_SCHEMA,

    stock_state:
      NULLABLE_STOCK_SCHEMA,

    stock_quantity: {
      type: [
        "integer",
        "null"
      ]
    },

    stock_confidence:
      CONFIDENCE_SCHEMA,

    stock_evidence_ids:
      EVIDENCE_IDS_SCHEMA,

    selected_variant_label: {
      type: [
        "string",
        "null"
      ]
    },

    selected_variant_condition:
      NULLABLE_CONDITION_SCHEMA,

    selected_variant_confidence:
      CONFIDENCE_SCHEMA,

    selected_variant_evidence_ids:
      EVIDENCE_IDS_SCHEMA,

    specs: {
      type:
        "array",

      maxItems:
        12,

      items: {
        type:
          "object",

        properties: {
          key: {
            type:
              "string"
          },

          value: {
            type:
              "string"
          },

          confidence:
            CONFIDENCE_SCHEMA,

          evidence_ids:
            EVIDENCE_IDS_SCHEMA
        },

        required: [
          "key",
          "value",
          "confidence",
          "evidence_ids"
        ],

        additionalProperties:
          false
      }
    },

    conflicts: {
      type:
        "array",

      maxItems:
        8,

      items: {
        type:
          "string"
      }
    },

    page_confidence:
      CONFIDENCE_SCHEMA
  },

  required: [
    "entity_type",
    "entity_subtype",
    "entity_confidence",
    "entity_evidence_ids",
    "product_name",
    "product_name_confidence",
    "product_name_evidence_ids",
    "current_price_value",
    "current_price_currency",
    "current_price_confidence",
    "current_price_evidence_ids",
    "condition_value",
    "condition_confidence",
    "condition_evidence_ids",
    "stock_state",
    "stock_quantity",
    "stock_confidence",
    "stock_evidence_ids",
    "selected_variant_label",
    "selected_variant_condition",
    "selected_variant_confidence",
    "selected_variant_evidence_ids",
    "specs",
    "conflicts",
    "page_confidence"
  ],

  additionalProperties:
    false
} as const;


function stringArray(
  value:
    unknown
): string[] {

  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }


  return value
    .filter(
      (
        item
      ): item is
        string =>
          typeof item ===
            "string" &&
          item.trim()
            .length >
            0
    )
    .map(
      item =>
        item.trim()
    )
    .slice(
      0,
      32
    );
}


function nullableMoney(
  value:
    unknown,
  currency:
    unknown,
  evidenceIds:
    unknown,
  confidence:
    unknown
) {

  const ids =
    stringArray(
      evidenceIds
    );


  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value
    ) ||
    value <
      0 ||
    ids.length ===
      0 ||
    typeof confidence !==
      "number"
  ) {
    return null;
  }


  return {
    value,

    currency:
      typeof currency ===
        "string"
        ? currency
        : null,

    evidenceIds:
      ids,

    confidence
  };
}


function normalizeWireDecision(
  value:
    unknown
): unknown {

  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return value;
  }


  const input =
    value as Record<
      string,
      unknown
    >;


  /*
   * Backward compatibility for deterministic unit fixtures that already
   * provide a canonical AISemanticDecision object.
   */
  if (
    "entity" in
      input &&
    "productName" in
      input
  ) {
    return value;
  }


  const entityIds =
    stringArray(
      input.entity_evidence_ids
    );

  const productNameIds =
    stringArray(
      input.product_name_evidence_ids
    );

  const conditionIds =
    stringArray(
      input.condition_evidence_ids
    );

  const stockIds =
    stringArray(
      input.stock_evidence_ids
    );

  const variantIds =
    stringArray(
      input.selected_variant_evidence_ids
    );


  const condition =
    typeof input.condition_value ===
      "string" &&
    conditionIds.length >
      0 &&
    typeof input.condition_confidence ===
      "number"
      ? {
          value:
            input.condition_value,

          evidenceIds:
            conditionIds,

          confidence:
            input.condition_confidence
        }
      : null;


  const stock =
    typeof input.stock_state ===
      "string" &&
    stockIds.length >
      0 &&
    typeof input.stock_confidence ===
      "number"
      ? {
          state:
            input.stock_state,

          quantity:
            typeof input.stock_quantity ===
              "number"
              ? input.stock_quantity
              : null,

          evidenceIds:
            stockIds,

          confidence:
            input.stock_confidence
        }
      : null;


  const variants =
    typeof input.selected_variant_label ===
      "string" &&
    input.selected_variant_label
      .trim()
      .length >
      0 &&
    variantIds.length >
      0 &&
    typeof input.selected_variant_confidence ===
      "number"
      ? [
          {
            label:
              input.selected_variant_label
                .trim(),

            selected:
              true,

            condition:
              typeof input.selected_variant_condition ===
                "string"
                ? input.selected_variant_condition
                : null,

            price:
              null,

            priceDelta:
              null,

            evidenceIds:
              variantIds,

            confidence:
              input.selected_variant_confidence
          }
        ]
      : [];


  const specs =
    Array.isArray(
      input.specs
    )
      ? input.specs
          .map(
            item => {

              if (
                item ===
                  null ||
                typeof item !==
                  "object" ||
                Array.isArray(
                  item
                )
              ) {
                return null;
              }


              const spec =
                item as Record<
                  string,
                  unknown
                >;

              const evidenceIds =
                stringArray(
                  spec.evidence_ids
                );


              if (
                typeof spec.key !==
                  "string" ||
                !spec.key.trim() ||
                typeof spec.value !==
                  "string" ||
                !spec.value.trim() ||
                typeof spec.confidence !==
                  "number" ||
                evidenceIds.length ===
                  0
              ) {
                return null;
              }


              return {
                key:
                  spec.key.trim(),

                value:
                  spec.value.trim(),

                evidenceIds,

                confidence:
                  spec.confidence
              };
            }
          )
          .filter(
            (
              item
            ): item is
              NonNullable<
                typeof item
              > =>
                item !==
                  null
          )
      : [];


  return {
    entity: {
      type:
        input.entity_type,

      subtype:
        input.entity_subtype,

      confidence:
        input.entity_confidence,

      evidenceIds:
        entityIds
    },

    productName: {
      value:
        input.product_name,

      evidenceIds:
        productNameIds,

      confidence:
        input.product_name_confidence
    },

    currentPrice:
      nullableMoney(
        input.current_price_value,
        input.current_price_currency,
        input.current_price_evidence_ids,
        input.current_price_confidence
      ),

    oldPrice:
      null,

    giftValues:
      [],

    savingValues:
      [],

    installmentAmounts:
      [],

    variants,

    condition,

    availableConditions:
      condition
        ? [
            condition
          ]
        : [],

    stock,

    rating:
      null,

    reviewCount:
      null,

    specs,

    conflicts:
      Array.isArray(
        input.conflicts
      )
        ? input.conflicts
            .filter(
              (
                item
              ): item is
                string =>
                  typeof item ===
                    "string"
            )
        : [],

    pageConfidence:
      input.page_confidence
  };
}


function modelOutputText(
  body:
    {
      steps?:
        Array<{
          type?:
            string;

          content?:
            Array<{
              type?:
                string;

              text?:
                string;
            }>;
        }>;
    }
):
  string {

  return (
    body.steps ??
    []
  )
    .filter(
      step =>
        step.type ===
          "model_output"
    )
    .flatMap(
      step =>
        step.content ??
        []
    )
    .filter(
      content =>
        content.type ===
          "text"
    )
    .map(
      content =>
        content.text ??
        ""
    )
    .join(
      ""
    )
    .trim();
}


function numericUsage(
  value:
    unknown
):
  number |
  null {

  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}


function compactEvidenceJson(
  input:
    GeminiVisionEvidenceInput
):
  string {

  return JSON.stringify({
    screenshot: {
      evidenceId:
        input.screenshot.evidenceId ??
        null,

      mimeType:
        input.screenshot.mimeType
    },

    compactDomEvidence:
      input.compactDomEvidence,

    selectedControls:
      input.selectedControls,

    structuredFacts:
      input.structuredFacts
  });
}


export class GeminiVisionProvider {

  private readonly apiKey:
    string;

  private readonly baseUrl:
    string;

  private readonly timeoutMs:
    number;

  private readonly fetchFn:
    typeof fetch;


  constructor(
    options:
      GeminiVisionProviderOptions
  ) {

    this.apiKey =
      options.apiKey.trim();


    if (
      !this.apiKey
    ) {
      throw new Error(
        "GEMINI_API_KEY is empty."
      );
    }


    this.baseUrl =
      (
        options.baseUrl ??
        "https://generativelanguage.googleapis.com/v1beta"
      ).replace(
        /\/+$/u,
        ""
      );


    this.timeoutMs =
      options.timeoutMs ??
      60_000;


    this.fetchFn =
      options.fetchFn ??
      fetch;
  }


  async analyze(
    input:
      GeminiVisionEvidenceInput
  ):
    Promise<
      GeminiVisionResult
    > {

    if (
      !input.screenshot.base64.trim()
    ) {
      throw new Error(
        "Vision screenshot is empty."
      );
    }


    const requestBody = {
      model:
        GEMINI_VISION_MODEL,

      input: [
        {
          type:
            "text",

          text:
            [
              "Extract one e-commerce product decision from the supplied visual and deterministic evidence.",
              "",
              "Use ONLY the screenshot, compact DOM evidence, selected controls, and structured facts supplied here.",
              "Do not invent missing values.",
              "Visual hierarchy may determine which visible price or control belongs to the primary product.",
              "Every grounded semantic claim must use evidence IDs from compactDomEvidence, selectedControls, or structuredFacts.",
              "Do NOT cite the screenshot imageId as a semantic evidence ID; the screenshot is visual context only.",
              "For a nullable claim with no supported value, return null and an empty evidence-id array.",
              "For any non-null claim, cite only evidence IDs that directly support that claim.",
              "selected_variant_label means the currently selected/default product variant only.",
              "Use exact enum spellings defined by the response schema.",
              "",
              "DETERMINISTIC EVIDENCE:",
              compactEvidenceJson(
                input
              )
            ].join(
              "\n"
            )
        },

        {
          type:
            "image",

          data:
            input.screenshot.base64,

          mime_type:
            input.screenshot.mimeType,

          resolution:
            "low"
        }
      ],

      response_format: {
        type:
          "text",

        mime_type:
          "application/json",

        schema:
          VISION_RESPONSE_SCHEMA
      },

      generation_config: {
        thinking_level:
          "minimal",

        max_output_tokens:
          4_096
      },

      /*
       * C9B is single-shot.
       * No previous_interaction_id and no persisted conversation state.
       */
      store:
        false
    };


    const startedAt =
      Date.now();


    /*
     * C9B contract:
     * normal path = one call;
     * only 502/503/504/network may receive one retry.
     */
    for (
      let attempt =
        1;
      attempt <=
        2;
      attempt +=
        1
    ) {

      const controller =
        new AbortController();


      const timer =
        setTimeout(
          () =>
            controller.abort(),
          this.timeoutMs
        );


      let response:
        Response;


      try {

        try {
          response =
            await this.fetchFn(
              this.baseUrl +
              "/interactions",
              {
                method:
                  "POST",

                headers: {
                  "content-type":
                    "application/json",

                  "x-goog-api-key":
                    this.apiKey
                },

                signal:
                  controller.signal,

                body:
                  JSON.stringify(
                    requestBody
                  )
              }
            );
        }
        catch (
          error
        ) {

          /*
           * Network/timeout is the only non-HTTP retry class.
           * Exactly one retry maximum.
           */
          if (
            attempt ===
              1
          ) {
            continue;
          }


          throw new GeminiVisionTransportError(
            "GEMINI_VISION_NETWORK_ERROR: " +
            (
              error instanceof
                Error
                ? error.message
                : String(
                    error
                  )
            )
          );
        }


        if (
          response.status ===
            429
        ) {

          const detail =
            await response.text();


          /*
           * Quota stop.
           * Never retry and never switch models.
           */
          throw new GeminiVisionQuotaError(
            "GEMINI_VISION_QUOTA_STOP: HTTP 429 " +
            detail.slice(
              0,
              1_000
            )
          );
        }


        if (
          response.status ===
            502 ||
          response.status ===
            503 ||
          response.status ===
            504
        ) {

          const detail =
            await response.text();


          if (
            attempt ===
              1
          ) {
            continue;
          }


          throw new GeminiVisionTransportError(
            "GEMINI_VISION_TRANSIENT_EXHAUSTED: HTTP " +
            response.status +
            " " +
            detail.slice(
              0,
              1_000
            )
          );
        }


        if (
          !response.ok
        ) {

          const detail =
            await response.text();


          throw new Error(
            "GEMINI_VISION_HTTP_ERROR: HTTP " +
            response.status +
            " " +
            detail.slice(
              0,
              1_000
            )
          );
        }


        let body:
          {
            status?:
              string;

            model?:
              string;

            steps?:
              Array<{
                type?:
                  string;

                content?:
                  Array<{
                    type?:
                      string;

                    text?:
                      string;
                  }>;
              }>;

            usage?: {
              total_input_tokens?:
                number;

              total_output_tokens?:
                number;

              total_thought_tokens?:
                number;

              total_tokens?:
                number;
            };
          };


        try {
          body =
            await response.json();
        }
        catch {
          throw new GeminiVisionContractError(
            "GEMINI_VISION_INVALID_RESPONSE_JSON"
          );
        }


        if (
          body.status &&
          body.status !==
            "completed"
        ) {
          throw new GeminiVisionContractError(
            "GEMINI_VISION_INTERACTION_STATUS: " +
            body.status
          );
        }


        const output =
          modelOutputText(
            body
          );


        if (
          !output
        ) {
          throw new GeminiVisionContractError(
            "GEMINI_VISION_EMPTY_OUTPUT"
          );
        }


        let parsed:
          unknown;


        try {
          parsed =
            JSON.parse(
              output
            );
        }
        catch {
          throw new GeminiVisionContractError(
            "GEMINI_VISION_INVALID_MODEL_JSON"
          );
        }


        const normalized =
          normalizeWireDecision(
            parsed
          );


        const canonical =
          AISemanticDecisionSchema.safeParse(
            normalized
          );


        if (
          !canonical.success
        ) {
          throw new GeminiVisionContractError(
            "GEMINI_VISION_CONTRACT_MISMATCH: " +
            JSON.stringify(
              canonical.error.issues
                .slice(
                  0,
                  8
                )
                .map(
                  issue => ({
                    path:
                      issue.path,

                    code:
                      issue.code,

                    message:
                      issue.message
                  })
                )
            )
          );
        }


        return {
          decision:
            canonical.data,

          model:
            body.model ??
            GEMINI_VISION_MODEL,

          attempts:
            attempt,

          latencyMs:
            Date.now() -
            startedAt,

          usage: {
            inputTokens:
              numericUsage(
                body.usage
                  ?.total_input_tokens
              ),

            outputTokens:
              numericUsage(
                body.usage
                  ?.total_output_tokens
              ),

            thoughtTokens:
              numericUsage(
                body.usage
                  ?.total_thought_tokens
              ),

            totalTokens:
              numericUsage(
                body.usage
                  ?.total_tokens
              )
          }
        };
      }
      finally {
        clearTimeout(
          timer
        );
      }
    }


    throw new GeminiVisionTransportError(
      "GEMINI_VISION_RETRY_EXHAUSTED"
    );
  }
}