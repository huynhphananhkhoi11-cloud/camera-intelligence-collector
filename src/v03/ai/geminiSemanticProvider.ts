import {
  AISemanticDecisionSchema,
  AI_SEMANTIC_JSON_SCHEMA,
  type AISemanticDecision
} from "./semanticContracts.js";

import {
  serializeEvidencePacketForPrompt
} from "./evidencePacket.js";

import {
  compactEvidencePacketForPrompt
} from "./evidenceCompactor.js";

import type {
  EvidencePacket
} from "./evidenceTypes.js";

import {
  HUMAN_READER_SYSTEM_PROMPT
} from "./ollamaSemanticProvider.js";


/*
 * Gemini structured-output accepts a JSON-Schema subset and may reject
 * very large/deep schemas. Keep the wire schema deliberately compact:
 * it enforces the top-level semantic contract while the canonical Zod
 * schema below remains the final, strict validator.
 */
const GEMINI_COMPACT_RESPONSE_SCHEMA = {
  type:
    "object",

  properties: {
    entity: {
      type:
        "object",
      additionalProperties:
        true
    },

    productName: {
      type:
        "object",
      additionalProperties:
        true
    },

    currentPrice: {
      type: [
        "object",
        "null"
      ],
      additionalProperties:
        true
    },

    oldPrice: {
      type: [
        "object",
        "null"
      ],
      additionalProperties:
        true
    },

    giftValues: {
      type:
        "array",
      items: {
        type:
          "object",
        additionalProperties:
          true
      }
    },

    savingValues: {
      type:
        "array",
      items: {
        type:
          "object",
        additionalProperties:
          true
      }
    },

    installmentAmounts: {
      type:
        "array",
      items: {
        type:
          "object",
        additionalProperties:
          true
      }
    },

    variants: {
      type:
        "array",
      items: {
        type:
          "object",
        additionalProperties:
          true
      }
    },

    condition: {
      type: [
        "object",
        "null"
      ],
      additionalProperties:
        true
    },

    availableConditions: {
      type:
        "array",
      items: {
        type:
          "object",
        additionalProperties:
          true
      }
    },

    stock: {
      type: [
        "object",
        "null"
      ],
      additionalProperties:
        true
    },

    rating: {
      type: [
        "object",
        "null"
      ],
      additionalProperties:
        true
    },

    reviewCount: {
      type: [
        "object",
        "null"
      ],
      additionalProperties:
        true
    },

    specs: {
      type:
        "array",
      items: {
        type:
          "object",
        additionalProperties:
          true
      }
    },

    conflicts: {
      type:
        "array",
      items: {
        type:
          "object",
        additionalProperties:
          true
      }
    },

    pageConfidence: {
      type:
        "number",
      minimum:
        0,
      maximum:
        1
    }
  },

  required: [
    "entity",
    "productName",
    "currentPrice",
    "oldPrice",
    "giftValues",
    "savingValues",
    "installmentAmounts",
    "variants",
    "condition",
    "availableConditions",
    "stock",
    "rating",
    "reviewCount",
    "specs",
    "conflicts",
    "pageConfidence"
  ],

  additionalProperties:
    false
} as const;


export class GeminiInferenceTimeoutError
extends Error {

  readonly timeoutMs:
    number;


  constructor(
    timeoutMs:
      number
  ) {

    super(
      "GEMINI_TIMEOUT after " +
      timeoutMs +
      "ms"
    );


    this.name =
      "GeminiInferenceTimeoutError";


    this.timeoutMs =
      timeoutMs;
  }
}


export class GeminiRateLimitError
extends Error {

  constructor(
    message:
      string
  ) {

    super(
      message
    );


    this.name =
      "GeminiRateLimitError";
  }
}


export interface GeminiSemanticProviderOptions {
  readonly apiKey:
    string;

  readonly baseUrl?:
    string;

  readonly timeoutMs?:
    number;

  readonly maxRetries?:
    number;

  readonly thinkingLevel?:
    "minimal" |
    "low" |
    "medium" |
    "high";

  readonly maxOutputTokens?:
    number;

  readonly fetchFn?:
    typeof fetch;
}


export interface GeminiAnalyzeResult {
  readonly decision:
    AISemanticDecision;

  readonly model:
    string;

  readonly totalDurationMs:
    number |
    null;

  readonly loadDurationMs:
    number |
    null;

  readonly promptEvalCount:
    number |
    null;

  readonly evalCount:
    number |
    null;
}


function sleep(
  ms:
    number
):
  Promise<void> {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function sanitizeJsonSchema(
  value:
    unknown
): unknown {

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      sanitizeJsonSchema
    );
  }


  if (
    value !==
      null &&
    typeof value ===
      "object"
  ) {

    const output:
      Record<
        string,
        unknown
      > = {};


    for (
      const [
        key,
        item
      ]
      of Object.entries(
        value as
          Record<
            string,
            unknown
          >
      )
    ) {

      if (
        key ===
          "$schema"
      ) {
        continue;
      }


      output[
        key
      ] =
        sanitizeJsonSchema(
          item
        );
    }


    return output;
  }


  return value;
}


function parseRetryAfterMs(
  response:
    Response
): number |
  null {

  const raw =
    response.headers.get(
      "retry-after"
    );


  if (
    !raw
  ) {
    return null;
  }


  const seconds =
    Number(
      raw
    );


  if (
    Number.isFinite(
      seconds
    ) &&
    seconds >=
      0
  ) {
    return Math.round(
      seconds *
      1000
    );
  }


  const date =
    Date.parse(
      raw
    );


  if (
    Number.isFinite(
      date
    )
  ) {
    return Math.max(
      0,
      date -
      Date.now()
    );
  }


  return null;
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
): string {

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


export class GeminiSemanticProvider {
  private readonly apiKey:
    string;


  private readonly baseUrl:
    string;


  private readonly timeoutMs:
    number;


  private readonly maxRetries:
    number;


  private readonly thinkingLevel:
    "minimal" |
    "low" |
    "medium" |
    "high";


  private readonly maxOutputTokens:
    number;


  private readonly fetchFn:
    typeof fetch;


  constructor(
    options:
      GeminiSemanticProviderOptions
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
      90_000;


    this.maxRetries =
      options.maxRetries ??
      3;


    /*
     * Accuracy-first profile.
     * Gemini 3.6 Flash defaults to medium thinking;
     * set it explicitly so production behavior is stable.
     */
    this.thinkingLevel =
      options.thinkingLevel ??
      "medium";


    this.maxOutputTokens =
      options.maxOutputTokens ??
      4_096;


    this.fetchFn =
      options.fetchFn ??
      fetch;
  }


  async analyze(
    packet:
      EvidencePacket,
    model:
      string,
    timeoutMsOverride?:
      number
  ):
    Promise<
      GeminiAnalyzeResult
    > {

    const effectiveTimeoutMs =
      timeoutMsOverride ??
      this.timeoutMs;


    const compactPacket =
      compactEvidencePacketForPrompt(
        packet
      );


    const compactEvidence =
      serializeEvidencePacketForPrompt(
        compactPacket
      );


    /*
     * The Interactions API rejected the full canonical schema when it was
     * used as response_format. Keep response_format compact for API
     * compatibility, but show Gemini the full canonical schema as ordinary
     * prompt text so it knows the exact nested keys/enums required by Zod.
     */
    const canonicalSchemaText =
      JSON.stringify(
        sanitizeJsonSchema(
          AI_SEMANTIC_JSON_SCHEMA
        )
      );


    const input:
      Array<
        Record<
          string,
          unknown
        >
      > = [
        {
          type:
            "text",

          text:
            [
              "Read this single product page as a human shopper.",
              "",
              "Use the image to understand visual hierarchy, selected/default controls, and which price belongs to the primary product.",
              "Use the evidence JSON to ground every extracted field in the supplied evidence IDs.",
              "Return every field required by the semantic contract, including explicit null/empty-array fields.",
              "Use EXACT key names and EXACT enum spellings from the canonical schema.",
              "Every grounded claim must include evidenceIds and confidence when the schema requires them.",
              "Do not replace canonical objects with simplified {value: ...} objects.",
              "Do not invent values.",
              "",
              "CANONICAL OUTPUT SCHEMA (FOLLOW EXACTLY):",
              canonicalSchemaText,
              "",
              "EVIDENCE PACKET:",
              compactEvidence
            ].join(
              "\n"
            )
        }
      ];


    if (
      packet.evidenceBoard
    ) {
      input.push({
        type:
          "image",

        data:
          packet.evidenceBoard.base64,

        mime_type:
          packet.evidenceBoard.mimeType
      });
    }


    const requestBody = {
      model,

      input,

      system_instruction:
        HUMAN_READER_SYSTEM_PROMPT,

      response_format: {
        type:
          "text",

        mime_type:
          "application/json",

        schema:
          GEMINI_COMPACT_RESPONSE_SCHEMA
      },

      generation_config: {
        thinking_level:
          this.thinkingLevel,

        max_output_tokens:
          this.maxOutputTokens
      },

      /*
       * Each product is an independent extraction task.
       * No need to persist interaction history server-side.
       */
      store:
        false
    };


    const startedAt =
      Date.now();


    let lastError:
      Error |
      null =
        null;


    for (
      let attempt =
        0;
      attempt <=
        this.maxRetries;
      attempt +=
        1
    ) {

      const controller =
        new AbortController();


      let timedOut =
        false;


      const timer =
        setTimeout(
          () => {

            timedOut =
              true;


            controller.abort();
          },
          effectiveTimeoutMs
        );


      try {

        const response =
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


        if (
          !response.ok
        ) {

          const body =
            await response.text();


          const retryable =
            response.status ===
              429 ||
            response.status ===
              500 ||
            response.status ===
              502 ||
            response.status ===
              503 ||
            response.status ===
              504;


          const message =
            "Gemini Interactions request failed: HTTP " +
            response.status +
            " " +
            body.slice(
              0,
              1_000
            );


          if (
            response.status ===
              401 ||
            response.status ===
              403
          ) {
            throw new Error(
              "GEMINI_AUTH_ERROR: " +
              message
            );
          }


          if (
            retryable &&
            attempt <
              this.maxRetries
          ) {

            const retryAfterMs =
              parseRetryAfterMs(
                response
              );


            const backoffMs =
              retryAfterMs ??
              Math.min(
                15_000,
                1_500 *
                2 **
                attempt
              );


            await sleep(
              backoffMs
            );


            continue;
          }


          if (
            response.status ===
              429
          ) {
            throw new GeminiRateLimitError(
              "GEMINI_RATE_LIMIT: " +
              message
            );
          }


          throw new Error(
            message
          );
        }


        const body =
          await response.json() as {
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


        if (
          body.status &&
          body.status !==
            "completed"
        ) {
          throw new Error(
            "Gemini interaction status is " +
            body.status +
            "."
          );
        }


        const content =
          modelOutputText(
            body
          );


        if (
          !content
        ) {
          throw new Error(
            "Gemini returned no model_output text."
          );
        }


        let parsed:
          unknown;


        try {
          parsed =
            JSON.parse(
              content
            );
        }
        catch {
          throw new Error(
            "Gemini returned invalid JSON despite response_format schema."
          );
        }


        const canonical =
          AISemanticDecisionSchema.safeParse(
            parsed
          );


        if (
          !canonical.success
        ) {

          const firstIssues =
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
              );


          throw new Error(
            "GEMINI_CONTRACT_MISMATCH: " +
            JSON.stringify(
              firstIssues
            ) +
            " RAW=" +
            content.slice(
              0,
              4_000
            )
          );
        }


        const decision =
          canonical.data;


        return {
          decision,

          model:
            body.model ??
            model,

          totalDurationMs:
            Date.now() -
            startedAt,

          loadDurationMs:
            null,

          promptEvalCount:
            Number.isFinite(
              Number(
                body.usage
                  ?.total_input_tokens
              )
            )
              ? Number(
                  body.usage
                    ?.total_input_tokens
                )
              : null,

          evalCount:
            Number.isFinite(
              Number(
                body.usage
                  ?.total_output_tokens
              )
            )
              ? Number(
                  body.usage
                    ?.total_output_tokens
                )
              : null
        };
      }
      catch (
        error
      ) {

        if (
          timedOut
        ) {
          throw new GeminiInferenceTimeoutError(
            effectiveTimeoutMs
          );
        }


        lastError =
          error instanceof
            Error
            ? error
            : new Error(
                String(
                  error
                )
              );


        if (
          attempt >=
            this.maxRetries
        ) {
          throw lastError;
        }


        const message =
          lastError.message;


        if (
          message.startsWith(
            "GEMINI_AUTH_ERROR"
          ) ||
          message.includes(
            "invalid JSON despite"
          ) ||
          message.includes(
            "Zod"
          ) ||
          message.includes(
            "HTTP 400"
          ) ||
          message.includes(
            "HTTP 404"
          ) ||
          message.startsWith(
            "GEMINI_CONTRACT_MISMATCH"
          )
        ) {
          throw lastError;
        }


        await sleep(
          Math.min(
            15_000,
            1_500 *
            2 **
            attempt
          )
        );
      }
      finally {
        clearTimeout(
          timer
        );
      }
    }


    throw (
      lastError ??
      new Error(
        "Gemini interaction failed."
      )
    );
  }


  async unload(
    _model:
      string
  ):
    Promise<void> {

    /*
     * Cloud provider: no local model is resident in system RAM.
     */
  }
}
