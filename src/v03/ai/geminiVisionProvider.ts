import {
  AISemanticDecisionSchema,
  AI_SEMANTIC_JSON_SCHEMA,
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
 * C9 live hardening:
 *
 * The response schema must constrain nested semantic fields, not only the
 * top-level object names. A shallow schema such as { entity: { type: "object" } }
 * allows the model to legally emit shapes like { entity: {} } or alternate
 * keys, which then fail the canonical Zod contract after a successful API call.
 *
 * Gemini structured outputs support nested object properties, required fields,
 * enums, arrays, nullable types and numeric bounds. Reuse the canonical
 * AISemanticDecision JSON schema so generation is constrained before parsing.
 *
 * Zod emits a few JSON-Schema annotation/validation keywords that are not
 * needed by Gemini's supported subset. Strip only those non-essential keys;
 * the canonical AISemanticDecisionSchema remains the final strict validator.
 */
function geminiWireSchema(
  value:
    unknown
): unknown {

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      geminiWireSchema
    );
  }


  if (
    value ===
      null ||
    typeof value !==
      "object"
  ) {
    return value;
  }


  const output:
    Record<
      string,
      unknown
    > =
      {};


  for (
    const [
      key,
      child
    ]
    of Object.entries(
      value
    )
  ) {

    if (
      key ===
        "$schema" ||
      key ===
        "minLength" ||
      key ===
        "maxLength"
    ) {
      continue;
    }


    output[
      key
    ] =
      geminiWireSchema(
        child
      );
  }


  return output;
}


const VISION_RESPONSE_SCHEMA =
  geminiWireSchema(
    AI_SEMANTIC_JSON_SCHEMA
  ) as Record<
    string,
    unknown
  >;


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


    const canonicalSchema =
      JSON.stringify(
        AI_SEMANTIC_JSON_SCHEMA
      );


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
              "Every grounded semantic claim must use evidence IDs supplied by the evidence packet.",
              "Return every canonical field, including explicit null values and empty arrays.",
              "Use exact enum spellings and exact canonical keys.",
              "",
              "CANONICAL AISemanticDecision SCHEMA:",
              canonicalSchema,
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


        const canonical =
          AISemanticDecisionSchema.safeParse(
            parsed
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