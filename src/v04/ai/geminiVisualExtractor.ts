import {
  MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA,
  MinimalVisualDecisionSchema,
  type MinimalVisualDecision
} from "../contracts/minimalVisualDecision.js";

import {
  SIMPLE_SEMANTIC_13_PROMPT
} from "./simpleSemantic13Prompt.js";

export const GEMINI_MINIMAL_VISUAL_MODEL =
  "gemini-3.5-flash-lite";

export type GeminiVisualProviderInputPart =
  | {
      readonly type: "text";
      readonly text: string;
    }
  | {
      readonly type: "image";
      readonly data: string;
      readonly mime_type: "image/png";
      readonly resolution?:
        "low" |
        "medium" |
        "high" |
        "ultra_high";
    };

export interface GeminiVisualProviderRequest {
  readonly model: string;
  readonly input: readonly GeminiVisualProviderInputPart[];
  readonly system_instruction: string;
  readonly response_format: {
    readonly type: "text";
    readonly mime_type: "application/json";
    readonly schema: unknown;
  };
  readonly generation_config: {
    readonly thinking_level: "low" | "medium";
    readonly temperature: number;
    readonly max_output_tokens: number;
  };
  readonly store: false;
}

export interface GeminiVisualProviderResponse {
  readonly text: string;
  readonly model?: string;
}

export type GeminiVisualProvider =
  (
    request: GeminiVisualProviderRequest
  ) => Promise<GeminiVisualProviderResponse>;

export interface GeminiVisualExtractorOptions {
  readonly provider: GeminiVisualProvider;
  readonly model?: string;
  readonly maxOutputTokens?: number;
}

export interface GeminiVisualExtractorInput {
  readonly pageUrl: string;
  readonly finalUrl: string;
  readonly website: string;
  readonly screenshots: readonly {
    readonly role: "hero" | "viewport" | "interaction";
    readonly bytes: Buffer;
  }[];
}

export interface GeminiVisualExtractorResult {
  readonly extraction: MinimalVisualDecision;
  readonly telemetry: {
    readonly model: string;
    readonly latencyMs: number;
  };
}

export class GeminiVisualExtractionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiVisualExtractionContractError";
  }
}

function screenshotMarker(
  role: "hero" | "viewport" | "interaction",
  index: number
): string {
  return "SCREENSHOT " + String(index + 1) + " ROLE=" + role;
}

function providerInput(
  input: GeminiVisualExtractorInput
): GeminiVisualProviderInputPart[] {
  const parts: GeminiVisualProviderInputPart[] = [
    {
      type: "text",
      text: [
        "PAGE_URL: " + input.pageUrl,
        "FINAL_URL: " + input.finalUrl,
        "WEBSITE: " + input.website
      ].join("\n")
    }
  ];

  input.screenshots.forEach((screenshot, index) => {
    parts.push({
      type: "text",
      text: screenshotMarker(screenshot.role, index)
    });

    parts.push({
      type: "image",
      data: screenshot.bytes.toString("base64"),
      mime_type: "image/png"
    });
  });

  return parts;
}

export class GeminiVisualExtractor {
  private readonly provider: GeminiVisualProvider;
  private readonly model: string;
  private readonly maxOutputTokens: number;

  constructor(options: GeminiVisualExtractorOptions) {
    this.provider = options.provider;
    this.model = options.model ?? GEMINI_MINIMAL_VISUAL_MODEL;
    this.maxOutputTokens = options.maxOutputTokens ?? 4_096;
  }

  async extract(
    input: GeminiVisualExtractorInput
  ): Promise<GeminiVisualExtractorResult> {
    const request: GeminiVisualProviderRequest = {
      model: this.model,
      input: providerInput(input),
      system_instruction: SIMPLE_SEMANTIC_13_PROMPT,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA
      },
      generation_config: {
        thinking_level: "low",
        temperature: 0.1,
        max_output_tokens: this.maxOutputTokens
      },
      store: false
    };

    const startedAt = Date.now();
    const response = await this.provider(request);

    let raw: unknown;
    try {
      raw = JSON.parse(response.text);
    } catch {
      throw new GeminiVisualExtractionContractError(
        "GEMINI_VISUAL_INVALID_JSON"
      );
    }

    const parsed = MinimalVisualDecisionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new GeminiVisualExtractionContractError(
        "GEMINI_VISUAL_SCHEMA_MISMATCH: " +
        JSON.stringify(parsed.error.issues.slice(0, 10))
      );
    }

    const extraction: MinimalVisualDecision =
      parsed.data.row === null
        ? parsed.data
        : {
            ...parsed.data,
            row: {
              ...parsed.data.row,
              website: input.website,
              url: input.finalUrl
            }
          };

    return {
      extraction,
      telemetry: {
        model: response.model ?? this.model,
        latencyMs: Date.now() - startedAt
      }
    };
  }
}
