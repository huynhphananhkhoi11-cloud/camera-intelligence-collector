import {
  GEMINI_36_FLASH_MODEL,
  VISUAL_EXTRACTION_JSON_SCHEMA,
  VisualExtractionRequestSchema,
  VisualExtractionSchema,
  type VisualExtraction,
  type VisualExtractionRequest,
  type VisualShot
} from "./visualExtractionSchema.js";

export interface Gemini36VisualExtractorOptions {
  readonly apiKey: string;
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
  readonly extraction: VisualExtraction;
  readonly telemetry: Gemini36VisualTelemetry;
}

export class GeminiVisualExtractionHttpError extends Error {
  readonly status: number;
  readonly responseBody: string;
  readonly retryAfter: string | null;

  constructor(status: number, responseBody: string, retryAfter: string | null) {
    super("GEMINI_VISUAL_HTTP_ERROR " + status + ": " + responseBody.slice(0, 500));
    this.name = "GeminiVisualExtractionHttpError";
    this.status = status;
    this.responseBody = responseBody;
    this.retryAfter = retryAfter;
  }
}

export class GeminiVisualExtractionTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super("GEMINI_VISUAL_TIMEOUT after " + timeoutMs + "ms");
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
  "You read screenshots of ONE ecommerce product page.",
  "Use only facts visible in the supplied screenshots plus the supplied URL/domain context.",
  "Return null when a fact is not visible or not explicit. Never use outside product knowledge.",
  "Do not treat warranty, VAT, purchase policy, or generic service policy as accessories.",
  "Do not treat customers-also-buy, related products, or recommended products as bundles.",
  "Do not copy prices, ratings, review counts, or stock from related products.",
  "For every non-null semantic fact, preserve the exact visible evidence in rawText and cite its shotId."
].join("\n");

function modelOutputText(body: {
  output_text?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
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

function contextHost(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function markerForShot(shot: VisualShot, index: number): string {
  const label = shot.sectionLabel ? " | section=" + shot.sectionLabel : "";
  return "SHOT " + (index + 1) + ": shotId=" + shot.shotId + label;
}

function collectShotIds(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectShotIds(item, output);
    return output;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "shotId" && typeof item === "string") output.push(item);
      else collectShotIds(item, output);
    }
  }

  return output;
}

function validateEvidenceShotIds(
  extraction: VisualExtraction,
  shots: readonly VisualShot[]
): void {
  const allowed = new Set(shots.map(shot => shot.shotId));
  const invalid = [...new Set(collectShotIds(extraction))]
    .filter(shotId => !allowed.has(shotId));

  if (invalid.length > 0) {
    throw new GeminiVisualExtractionContractError(
      "GEMINI_VISUAL_UNKNOWN_SHOT_ID: " + invalid.join(", ")
    );
  }
}

export class Gemini36VisualExtractor {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: Gemini36VisualExtractorOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is empty.");

    this.baseUrl = (options.baseUrl ??
      "https://generativelanguage.googleapis.com/v1beta")
      .replace(/\/+$/u, "");
    this.timeoutMs = options.timeoutMs ?? 90_000;
    this.maxOutputTokens = options.maxOutputTokens ?? 4_096;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async extract(
    request: VisualExtractionRequest
  ): Promise<Gemini36VisualExtractionResult> {
    const parsedRequest = VisualExtractionRequestSchema.parse(request);
    const finalUrl = parsedRequest.finalUrl ?? parsedRequest.pageUrl;
    const website = contextHost(finalUrl);

    const prompt = [
      "Extract the requested camera commerce facts from these screenshots.",
      "PAGE_URL: " + parsedRequest.pageUrl,
      "FINAL_URL: " + finalUrl,
      "WEBSITE: " + website,
      "ALLOWED_SHOT_IDS: " +
        parsedRequest.shots.map(shot => shot.shotId).join(", "),
      "Copy WEBSITE and FINAL_URL exactly into website and url.",
      "Condition must be NEW, USED, or null. Likenew/used/hang cu => USED; new/chinh hang/new 100% => NEW only when visible.",
      "Rental price must be an explicit per-day rental amount, never installment/payment-plan amounts.",
      "If accessories or bundles are absent, use null. If present, return only items explicitly included with the primary product.",
      "Specs must describe the primary product only and should be concise.",
      "Return JSON matching the provided schema."
    ].join("\n");

    const input: Array<Record<string, unknown>> = [
      { type: "text", text: prompt }
    ];

    parsedRequest.shots.forEach((shot, index) => {
      input.push({ type: "text", text: markerForShot(shot, index) });
      input.push({
        type: "image",
        data: shot.base64,
        mime_type: shot.mimeType,
        resolution: shot.resolution
      });
    });

    const requestBody = {
      model: GEMINI_36_FLASH_MODEL,
      input,
      system_instruction: SYSTEM_PROMPT,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: VISUAL_EXTRACTION_JSON_SCHEMA
      },
      generation_config: {
        thinking_level: "low",
        temperature: 0.1,
        max_output_tokens: this.maxOutputTokens
      },
      store: false
    };

    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchFn(
        this.baseUrl + "/interactions",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey
          },
          signal: controller.signal,
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const responseBody = await response.text();
        throw new GeminiVisualExtractionHttpError(
          response.status,
          responseBody,
          response.headers.get("retry-after")
        );
      }

      const body = await response.json() as {
        status?: string;
        model?: string;
        output_text?: string;
        steps?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
        usage?: {
          total_input_tokens?: number;
          total_output_tokens?: number;
          total_thought_tokens?: number;
          total_tokens?: number;
        };
      };

      if (body.status && body.status !== "completed") {
        throw new GeminiVisualExtractionContractError(
          "GEMINI_VISUAL_INTERACTION_STATUS: " + body.status
        );
      }

      const outputText = modelOutputText(body);
      if (!outputText) {
        throw new GeminiVisualExtractionContractError(
          "GEMINI_VISUAL_EMPTY_OUTPUT"
        );
      }

      let raw: unknown;
      try {
        raw = JSON.parse(outputText);
      } catch {
        throw new GeminiVisualExtractionContractError(
          "GEMINI_VISUAL_INVALID_JSON"
        );
      }

      if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        const object = raw as Record<string, unknown>;
        object.website = website;
        object.url = finalUrl;
      }

      const parsed = VisualExtractionSchema.safeParse(raw);
      if (!parsed.success) {
        const issues = parsed.error.issues.slice(0, 10).map(issue => ({
          path: issue.path,
          code: issue.code,
          message: issue.message
        }));

        throw new GeminiVisualExtractionContractError(
          "GEMINI_VISUAL_SCHEMA_MISMATCH: " + JSON.stringify(issues)
        );
      }

      validateEvidenceShotIds(parsed.data, parsedRequest.shots);

      const numberOrNull = (value: unknown): number | null =>
        typeof value === "number" && Number.isFinite(value)
          ? value
          : null;

      return {
        extraction: parsed.data,
        telemetry: {
          model: body.model ?? GEMINI_36_FLASH_MODEL,
          latencyMs: Date.now() - startedAt,
          inputTokens: numberOrNull(body.usage?.total_input_tokens),
          outputTokens: numberOrNull(body.usage?.total_output_tokens),
          thoughtTokens: numberOrNull(body.usage?.total_thought_tokens),
          totalTokens: numberOrNull(body.usage?.total_tokens)
        }
      };
    } catch (error) {
      if (timedOut) {
        throw new GeminiVisualExtractionTimeoutError(this.timeoutMs);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
