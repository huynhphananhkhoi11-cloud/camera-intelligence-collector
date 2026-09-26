import {
  buildSimpleSemantic13Prompt
} from "./simpleSemantic13Prompt.js";
import {
  VisualExtractionRequestSchema,
  type VisualExtraction,
  type VisualExtractionRequest,
  type VisualShot
} from "./visualExtractionSchema.js";

import {
  validateSemanticDecision,
  type SemanticDecisionValidationResult,
  type SemanticEvidenceMap,
  type SemanticRow
} from "./semanticDecisionSchema.js";

export const DEFAULT_GEMINI_VISUAL_MODEL =
  "gemini-3.5-flash-lite" as const;

export interface Gemini36VisualExtractorOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly fetchFn?: typeof fetch;
}

export interface Gemini36VisualTelemetry {
  readonly model: string;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly thoughtTokens: number | null;
  readonly totalTokens: number | null;
}

export interface Gemini36VisualExtractionResult {
  readonly decision: SemanticDecisionValidationResult;
  /*
   * Compatibility representation for existing non-durable V3 callers.
   * Production smart-batch:v2 uses `decision` directly.
   * This adapter performs no semantic remapping.
   */
  readonly extraction: VisualExtraction;
  readonly telemetry: Gemini36VisualTelemetry;
}

export class GeminiVisualExtractionHttpError extends Error {
  readonly status: number;
  readonly responseBody: string;
  readonly retryAfter: string | null;

  constructor(
    status: number,
    responseBody: string,
    retryAfter: string | null
  ) {
    super(
      "GEMINI_VISUAL_HTTP_ERROR " +
      status +
      ": " +
      responseBody.slice(0, 500)
    );
    this.name = "GeminiVisualExtractionHttpError";
    this.status = status;
    this.responseBody = responseBody;
    this.retryAfter = retryAfter;
  }
}

export class GeminiVisualExtractionTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      "GEMINI_VISUAL_TIMEOUT after " +
      timeoutMs +
      "ms"
    );
    this.name = "GeminiVisualExtractionTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class GeminiVisualExtractionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiVisualExtractionContractError";
  }
}

const SYSTEM_PROMPT = [
  "You are the semantic decision engine for a camera-commerce workbook.",
  "Inspect all supplied screenshots before finalizing.",
  "Use only visible screenshot evidence plus the supplied URL/domain context.",
  "You own semantic placement: decide which visible facts belong to which workbook field.",
  "Never fabricate, infer unsupported facts, or duplicate one fact into unrelated semantic fields.",
  "Related products, generic policies, warranty copy, VAT copy, and service marketing are not facts about the selected primary product unless the screenshot explicitly makes them part of the selected offer.",
  "Every populated semantic field except authoritative website/url must cite screenshot evidence with shotId and rawText."
].join("\n");

function modelOutputText(body: {
  output_text?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}): string {
  if (
    typeof body.output_text === "string" &&
    body.output_text.trim()
  ) {
    return body.output_text.trim();
  }

  return (body.steps ?? [])
    .filter(step => step.type === "model_output")
    .flatMap(step => step.content ?? [])
    .filter(content => content.type === "text")
    .map(content => content.text ?? "")
    .join("")
    .trim();
}

function plainJsonObjectText(
  outputText: string
): string {
  const trimmed = outputText.trim();

  const fenced =
    /^```(?:json)?\s*([\s\S]*?)\s*```$/iu
      .exec(trimmed);

  return (
    fenced?.[1] ??
    trimmed
  ).trim();
}

function contextHost(url: string): string {
  return new URL(url)
    .hostname
    .toLowerCase()
    .replace(/^www\./u, "");
}

function markerForShot(
  shot: VisualShot,
  index: number
): string {
  const label =
    shot.sectionLabel
      ? " | section=" + shot.sectionLabel
      : "";

  return (
    "SHOT " +
    (index + 1) +
    ": shotId=" +
    shot.shotId +
    label
  );
}

function firstEvidence(
  evidence: SemanticEvidenceMap,
  field: keyof SemanticEvidenceMap
) {
  return evidence[field][0] ?? null;
}

function evidenceAt(
  evidence: SemanticEvidenceMap,
  field: keyof SemanticEvidenceMap,
  index: number
) {
  return (
    evidence[field][index] ??
    evidence[field][0] ??
    null
  );
}

function emptyCompatibilityExtraction(
  website: string,
  url: string
): VisualExtraction {
  return {
    website,
    productName: null,
    condition: null,
    specs: [],
    rentalPricePerDay: null,
    rentalTerms: null,
    accessoriesIncluded: null,
    bundleIncluded: null,
    rating: null,
    reviewCount: null,
    stock: null,
    salePrice: null,
    url
  };
}

function compatibilityExtraction(
  validation: SemanticDecisionValidationResult,
  website: string,
  url: string
): VisualExtraction {
  const row = validation.value;

  if (
    validation.status !== "VALIDATED" ||
    row === null
  ) {
    return emptyCompatibilityExtraction(
      website,
      url
    );
  }

  const evidence =
    validation.decision.evidence;

  const productEvidence =
    firstEvidence(
      evidence,
      "productName"
    );

  const conditionEvidence =
    firstEvidence(
      evidence,
      "condition"
    );

  const rentalEvidence =
    firstEvidence(
      evidence,
      "rentalPricePerDay"
    );

  const rentalTermsEvidence =
    firstEvidence(
      evidence,
      "rentalTerms"
    );

  const ratingEvidence =
    firstEvidence(
      evidence,
      "rating"
    );

  const reviewEvidence =
    firstEvidence(
      evidence,
      "reviewCount"
    );

  const stockEvidence =
    firstEvidence(
      evidence,
      "stock"
    );

  const saleEvidence =
    firstEvidence(
      evidence,
      "salePrice"
    );

  return {
    website,
    productName:
      row.productName && productEvidence
        ? {
            value: row.productName,
            rawText: productEvidence.rawText,
            shotId: productEvidence.shotId
          }
        : null,

    condition:
      row.condition && conditionEvidence
        ? {
            value: row.condition,
            rawText: conditionEvidence.rawText,
            shotId: conditionEvidence.shotId
          }
        : null,

    specs:
      row.specs.map(
        (value, index) => {
          const item =
            evidenceAt(
              evidence,
              "specs",
              index
            );

          return {
            value,
            rawText:
              item?.rawText ??
              value,
            shotId:
              item?.shotId ??
              ""
          };
        }
      ),

    rentalPricePerDay:
      row.rentalPricePerDay && rentalEvidence
        ? {
            value:
              row.rentalPricePerDay.value,
            currency:
              row.rentalPricePerDay.currency,
            rawText:
              rentalEvidence.rawText,
            shotId:
              rentalEvidence.shotId
          }
        : null,

    rentalTerms:
      row.rentalTerms && rentalTermsEvidence
        ? {
            value: row.rentalTerms,
            rawText:
              rentalTermsEvidence.rawText,
            shotId:
              rentalTermsEvidence.shotId
          }
        : null,

    accessoriesIncluded:
      row.accessoriesIncluded
        ? row.accessoriesIncluded.map(
            (value, index) => {
              const item =
                evidenceAt(
                  evidence,
                  "accessoriesIncluded",
                  index
                );

              return {
                value,
                rawText:
                  item?.rawText ??
                  value,
                shotId:
                  item?.shotId ??
                  ""
              };
            }
          )
        : null,

    bundleIncluded:
      row.bundleIncluded
        ? row.bundleIncluded.map(
            (value, index) => {
              const item =
                evidenceAt(
                  evidence,
                  "bundleIncluded",
                  index
                );

              return {
                value,
                rawText:
                  item?.rawText ??
                  value,
                shotId:
                  item?.shotId ??
                  ""
              };
            }
          )
        : null,

    rating:
      row.rating !== null && ratingEvidence
        ? {
            value: row.rating,
            rawText:
              ratingEvidence.rawText,
            shotId:
              ratingEvidence.shotId
          }
        : null,

    reviewCount:
      row.reviewCount !== null && reviewEvidence
        ? {
            value: row.reviewCount,
            rawText:
              reviewEvidence.rawText,
            shotId:
              reviewEvidence.shotId
          }
        : null,

    stock:
      row.stock && stockEvidence
        ? {
            value: row.stock,
            rawText:
              stockEvidence.rawText,
            shotId:
              stockEvidence.shotId
          }
        : null,

    salePrice:
      row.salePrice && saleEvidence
        ? {
            value:
              row.salePrice.value,
            currency:
              row.salePrice.currency,
            rawText:
              saleEvidence.rawText,
            shotId:
              saleEvidence.shotId
          }
        : null,

    url
  };
}

function promptText(
  pageUrl: string,
  finalUrl: string,
  website: string,
  shots: readonly VisualShot[]
): string {
  return buildSimpleSemantic13Prompt({
    pageUrl,
    finalUrl,
    website,
    shots
  });
}


function isSemanticRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

const BEST_EFFORT_EVIDENCE_KEYS = [
  "classification",
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

const BEST_EFFORT_NULLABLE_ROW_KEYS = [
  "condition",
  "rentalPricePerDay",
  "rentalTerms",
  "accessoriesIncluded",
  "bundleIncluded",
  "rating",
  "reviewCount",
  "stock",
  "salePrice"
] as const;

function normalizeEvidenceArray(
  value: unknown
): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    isSemanticRecord(value) &&
    typeof value.shotId === "string" &&
    typeof value.rawText === "string"
  ) {
    return [value];
  }

  return [];
}

function normalizeStringArrayOrNull(
  value: unknown
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return [value];
  }

  return null;
}

function normalizeBestEffortSemanticDecisionCandidate(
  raw: unknown
): unknown {
  if (!isSemanticRecord(raw)) {
    return raw;
  }

  const normalized:
    Record<string, unknown> = {
      ...raw
    };

  if (
    normalized.reviewReason ===
    undefined
  ) {
    normalized.reviewReason = null;
  }

  if (
    normalized.classification ===
      "CAMERA_PRODUCT" &&
    isSemanticRecord(
      normalized.row
    )
  ) {
    const row:
      Record<string, unknown> = {
        ...normalized.row
      };

    for (
      const key of
      BEST_EFFORT_NULLABLE_ROW_KEYS
    ) {
      if (row[key] === undefined) {
        row[key] = null;
      }
    }

    if (
      row.specs === null ||
      row.specs === undefined
    ) {
      row.specs = [];
    }
    else if (
      typeof row.specs === "string"
    ) {
      row.specs =
        row.specs.trim()
          ? [row.specs]
          : [];
    }
    else if (
      !Array.isArray(
        row.specs
      )
    ) {
      row.specs = [];
    }

    row.accessoriesIncluded =
      normalizeStringArrayOrNull(
        row.accessoriesIncluded
      );

    row.bundleIncluded =
      normalizeStringArrayOrNull(
        row.bundleIncluded
      );

    normalized.row =
      row;
  }

  const evidence:
    Record<string, unknown> =
    isSemanticRecord(
      normalized.evidence
    )
      ? {
          ...normalized.evidence
        }
      : {};

  for (
    const key of
    BEST_EFFORT_EVIDENCE_KEYS
  ) {
    evidence[key] =
      normalizeEvidenceArray(
        evidence[key]
      );
  }

  normalized.evidence =
    evidence;

  return normalized;
}

export class Gemini36VisualExtractor {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly fetchFn: typeof fetch;

  constructor(
    options: Gemini36VisualExtractorOptions
  ) {
    this.apiKey = options.apiKey.trim();

    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY is empty."
      );
    }

    this.model =
      options.model?.trim() ||
      DEFAULT_GEMINI_VISUAL_MODEL;

    this.baseUrl =
      (
        options.baseUrl ??
        "https://generativelanguage.googleapis.com/v1beta"
      ).replace(/\/+$/u, "");

    this.timeoutMs =
      options.timeoutMs ??
      90_000;

    this.maxOutputTokens =
      options.maxOutputTokens ??
      4_096;

    this.fetchFn =
      options.fetchFn ??
      fetch;
  }

  async extract(
    request: VisualExtractionRequest
  ): Promise<Gemini36VisualExtractionResult> {
    const parsedRequest =
      VisualExtractionRequestSchema.parse(
        request
      );

    const finalUrl =
      parsedRequest.finalUrl ??
      parsedRequest.pageUrl;

    const website =
      contextHost(finalUrl);

    const input:
      Array<Record<string, unknown>> = [
        {
          type: "text",
          text: promptText(
            parsedRequest.pageUrl,
            finalUrl,
            website,
            parsedRequest.shots
          )
        }
      ];

    parsedRequest.shots.forEach(
      (shot, index) => {
        input.push({
          type: "text",
          text:
            markerForShot(
              shot,
              index
            )
        });

        input.push({
          type: "image",
          data: shot.base64,
          mime_type: shot.mimeType,
          resolution: shot.resolution
        });
      }
    );

    const requestBody = {
      model: this.model,
      input,
      system_instruction: SYSTEM_PROMPT,
      generation_config: {
        thinking_level: "low",
        temperature: 0.1,
        max_output_tokens:
          this.maxOutputTokens
      },
      store: false
    };

    const startedAt =
      Date.now();

    const controller =
      new AbortController();

    let timedOut =
      false;

    const timer =
      setTimeout(
        () => {
          timedOut = true;
          controller.abort();
        },
        this.timeoutMs
      );

    try {
      const response =
        await this.fetchFn(
          this.baseUrl +
          "/interactions",
          {
            method: "POST",
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

      if (!response.ok) {
        const responseBody =
          await response.text();

        throw new GeminiVisualExtractionHttpError(
          response.status,
          responseBody,
          response.headers.get(
            "retry-after"
          )
        );
      }

      const body =
        await response.json() as {
          status?: string;
          errors?: Array<{
            code?: string;
            message?: string;
          }>;
          model?: string;
          output_text?: string;
          steps?: Array<{
            type?: string;
            content?: Array<{
              type?: string;
              text?: string;
            }>;
          }>;
          usage?: {
            total_input_tokens?: number;
            total_output_tokens?: number;
            total_thought_tokens?: number;
            total_tokens?: number;
          };
        };

      if (
        body.status &&
        body.status !== "completed"
      ) {
        throw new GeminiVisualExtractionContractError(
          "GEMINI_VISUAL_INTERACTION_DIAGNOSTIC: " +
          JSON.stringify({
            status:
              body.status,
            errors:
              body.errors ?? [],
            usage:
              body.usage ?? null
          })
        );
      }

      const outputText =
        modelOutputText(body);

      let raw:
        unknown;

      if (!outputText) {
        raw = {
          classification: "REVIEW",
          reviewReason:
            "GEMINI_VISUAL_EMPTY_OUTPUT",
          row: null,
          evidence: {}
        };
      }
      else {
        try {
          raw =
            JSON.parse(
              plainJsonObjectText(
                outputText
              )
            );
        }
        catch {
          raw = {
            classification: "REVIEW",
            reviewReason:
              "GEMINI_VISUAL_INVALID_JSON",
            row: null,
            evidence: {}
          };
        }
      }

      const decision =
        validateSemanticDecision(
          normalizeBestEffortSemanticDecisionCandidate(raw),
          {
            website,
            url: finalUrl,
            shotIds:
              new Set(
                parsedRequest.shots.map(
                  shot =>
                    shot.shotId
                )
              )
          }
        );

      const numberOrNull =
        (
          value:
            unknown
        ): number | null =>
          typeof value === "number" &&
          Number.isFinite(value)
            ? value
            : null;

      return {
        decision,
        extraction:
          compatibilityExtraction(
            decision,
            website,
            finalUrl
          ),
        telemetry: {
          model:
            body.model ??
            this.model,
          latencyMs:
            Date.now() -
            startedAt,
          inputTokens:
            numberOrNull(
              body.usage
                ?.total_input_tokens
            ),
          outputTokens:
            numberOrNull(
              body.usage
                ?.total_output_tokens
            ),
          thoughtTokens:
            numberOrNull(
              body.usage
                ?.total_thought_tokens
            ),
          totalTokens:
            numberOrNull(
              body.usage
                ?.total_tokens
            )
        }
      };
    }
    catch (error) {
      if (timedOut) {
        throw new GeminiVisualExtractionTimeoutError(
          this.timeoutMs
        );
      }

      throw error;
    }
    finally {
      clearTimeout(timer);
    }
  }
}
