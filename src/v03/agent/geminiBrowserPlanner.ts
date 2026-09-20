import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  BrowserAgentAction,
  BrowserAgentActionType,
  BrowserAgentField,
  BrowserAgentObservation,
  BrowserAgentPlan,
  BrowserPlannerResult,
  BrowserPlannerUsage
} from "./browserAgentTypes.js";

/*
 * SELECT stays in the shared type for future compatibility, but is
 * deliberately NOT available to the V3 planner yet. V1 must preserve the
 * site's default product state.
 */
const PLANNER_ACTIONS: readonly BrowserAgentActionType[] = [
  "SCROLL_TO",
  "CLICK",
  "INSPECT",
  "WAIT",
  "FINISH"
];

const FIELDS: readonly BrowserAgentField[] = [
  "PRODUCT",
  "CURRENT_PRICE",
  "OLD_PRICE",
  "STOCK",
  "CONDITION",
  "VARIANT",
  "SPECS",
  "RATING",
  "REVIEWS"
];

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string"
    },
    actions: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: PLANNER_ACTIONS
          },
          targetId: {
            type: ["string", "null"]
          },
          field: {
            type: ["string", "null"],
            enum: [...FIELDS, null]
          },
          value: {
            type: ["string", "null"]
          },
          reason: {
            type: "string"
          }
        },
        required: [
          "action",
          "targetId",
          "field",
          "value",
          "reason"
        ],
        additionalProperties: false
      }
    },
    unresolvedFields: {
      type: "array",
      items: {
        type: "string",
        enum: FIELDS
      }
    }
  },
  required: [
    "summary",
    "actions",
    "unresolvedFields"
  ],
  additionalProperties: false
} as const;

interface GeminiInteractionBody {
  readonly id?: string;
  readonly status?: string;
  readonly steps?: Array<{
    readonly type?: string;
    readonly content?: Array<{
      readonly type?: string;
      readonly text?: string;
    }>;
  }>;
  readonly usage?: {
    readonly total_input_tokens?: number;
    readonly total_output_tokens?: number;
    readonly total_thought_tokens?: number;
    readonly total_cached_tokens?: number;
    readonly total_tokens?: number;
    readonly total_tool_use_tokens?: number;
  };
}

interface PlannerCallResult {
  readonly body: GeminiInteractionBody;
  readonly usage: BrowserPlannerUsage;
}

function outputText(body: GeminiInteractionBody): string {
  return (body.steps ?? [])
    .filter(step => step.type === "model_output")
    .flatMap(step => step.content ?? [])
    .filter(content => content.type === "text")
    .map(content => content.text ?? "")
    .join("")
    .trim();
}

/*
 * Contract repair here is intentionally LOCAL only:
 * - trim
 * - remove one surrounding ```json ... ``` / ``` ... ``` fence
 *
 * It does NOT try to invent missing braces, extract arbitrary substrings,
 * or call AI.
 */
export function normalizePlannerOutputText(text: string): string {
  const trimmed = text.trim();

  const fenced =
    /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(
      trimmed
    );

  return (fenced?.[1] ?? trimmed).trim();
}

export function parsePlannerOutput(text: string): unknown {
  const normalized =
    normalizePlannerOutputText(text);

  if (!normalized) {
    throw new Error(
      "GEMINI_BROWSER_PLANNER_EMPTY_OUTPUT"
    );
  }

  try {
    return JSON.parse(normalized);
  }
  catch {
    throw new Error(
      "GEMINI_BROWSER_PLANNER_INVALID_JSON"
    );
  }
}

function normalizePlan(
  raw: unknown,
  observation: BrowserAgentObservation
): BrowserAgentPlan {
  const input =
    raw !== null &&
    typeof raw === "object"
      ? raw as Record<string, unknown>
      : {};

  const validIds =
    new Set(
      observation.candidates.map(
        candidate => candidate.id
      )
    );

  const rawActions =
    Array.isArray(input.actions)
      ? input.actions
      : [];

  const actions: BrowserAgentAction[] = [];

  for (const item of rawActions.slice(0, 4)) {
    if (
      item === null ||
      typeof item !== "object"
    ) {
      continue;
    }

    const record =
      item as Record<string, unknown>;

    if (
      typeof record.action !== "string" ||
      !PLANNER_ACTIONS.includes(
        record.action as BrowserAgentActionType
      )
    ) {
      continue;
    }

    const action =
      record.action as BrowserAgentActionType;

    const targetId =
      typeof record.targetId === "string" &&
      validIds.has(record.targetId)
        ? record.targetId
        : null;

    if (
      !["WAIT", "FINISH"].includes(action) &&
      targetId === null
    ) {
      continue;
    }

    const field =
      typeof record.field === "string" &&
      FIELDS.includes(
        record.field as BrowserAgentField
      )
        ? record.field as BrowserAgentField
        : null;

    actions.push({
      action,
      targetId,
      field,
      value:
        typeof record.value === "string"
          ? record.value.slice(0, 120)
          : null,
      reason:
        typeof record.reason === "string"
          ? record.reason
              .replace(/\s+/gu, " ")
              .trim()
              .slice(0, 100)
          : "Inspect product page."
    });
  }

  const unresolvedFields =
    Array.isArray(input.unresolvedFields)
      ? input.unresolvedFields.filter(
          (
            value
          ): value is BrowserAgentField =>
            typeof value === "string" &&
            FIELDS.includes(
              value as BrowserAgentField
            )
        )
      : [];

  return {
    summary:
      typeof input.summary === "string"
        ? input.summary
            .replace(/\s+/gu, " ")
            .trim()
            .slice(0, 160)
        : "",
    actions,
    unresolvedFields
  };
}

function usageFromBody(
  body: GeminiInteractionBody,
  latencyMs: number
): BrowserPlannerUsage {
  return {
    inputTokens:
      body.usage?.total_input_tokens ?? 0,
    outputTokens:
      body.usage?.total_output_tokens ?? 0,
    thoughtTokens:
      body.usage?.total_thought_tokens ?? 0,
    cachedTokens:
      body.usage?.total_cached_tokens ?? 0,
    totalTokens:
      body.usage?.total_tokens ?? 0,
    toolUseTokens:
      body.usage?.total_tool_use_tokens ?? 0,
    latencyMs
  };
}

function addUsage(
  left: BrowserPlannerUsage,
  right: BrowserPlannerUsage
): BrowserPlannerUsage {
  return {
    inputTokens:
      left.inputTokens + right.inputTokens,
    outputTokens:
      left.outputTokens + right.outputTokens,
    thoughtTokens:
      left.thoughtTokens + right.thoughtTokens,
    cachedTokens:
      left.cachedTokens + right.cachedTokens,
    totalTokens:
      left.totalTokens + right.totalTokens,
    toolUseTokens:
      left.toolUseTokens + right.toolUseTokens,
    latencyMs:
      left.latencyMs + right.latencyMs
  };
}

export interface GeminiBrowserPlannerOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly fetchFn?: typeof fetch;

  /*
   * null disables artifact writes (useful in unit tests).
   * Default is intentionally git-ignored runtime output.
   */
  readonly debugArtifactDir?: string | null;
}

export interface BrowserPlanOptions {
  readonly screenshotBase64?: string;
  readonly previousInteractionId?: string | null;

  /*
   * C1 supports one tiny repair turn only.
   * BrowserAgentSession can disable it when its remaining budget is too low.
   */
  readonly allowRepair?: boolean;
}

export class GeminiBrowserPlanner {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly debugArtifactDir: string | null;

  constructor(
    options: GeminiBrowserPlannerOptions
  ) {
    this.apiKey =
      options.apiKey.trim();

    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY is empty."
      );
    }

    this.model =
      options.model ??
      "gemini-3.6-flash";

    this.timeoutMs =
      options.timeoutMs ??
      30_000;

    this.fetchFn =
      options.fetchFn ??
      fetch;

    this.debugArtifactDir =
      options.debugArtifactDir === undefined
        ? join(
            "artifacts",
            "agent-debug"
          )
        : options.debugArtifactDir;
  }

  private async callGemini(
    input: Array<Record<string, unknown>>,
    previousInteractionId:
      string | null | undefined,
    maxOutputTokens: number
  ): Promise<PlannerCallResult> {
    const requestBody:
      Record<string, unknown> = {
        model: this.model,
        input,
        system_instruction:
          "You are a conservative browser observation planner for an e-commerce data collector.",
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: PLAN_SCHEMA
        },
        generation_config: {
          thinking_level: "minimal",
          temperature: 0.1,
          max_output_tokens: maxOutputTokens
        },
        /*
         * Required for previous_interaction_id stateful continuation.
         */
        store: true
      };

    if (previousInteractionId) {
      requestBody.previous_interaction_id =
        previousInteractionId;
    }

    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () => controller.abort(),
        this.timeoutMs
      );

    const startedAt =
      Date.now();

    try {
      const response =
        await this.fetchFn(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
              "x-goog-api-key":
                this.apiKey
            },
            signal: controller.signal,
            body:
              JSON.stringify(
                requestBody
              )
          }
        );

      if (!response.ok) {
        const text =
          await response.text();

        throw new Error(
          "GEMINI_BROWSER_PLANNER_HTTP_" +
          response.status +
          ": " +
          text.slice(0, 600)
        );
      }

      const body =
        await response.json() as
          GeminiInteractionBody;

      return {
        body,
        usage:
          usageFromBody(
            body,
            Date.now() - startedAt
          )
      };
    }
    finally {
      clearTimeout(timer);
    }
  }

  private async writeDebugArtifact(
    body: GeminiInteractionBody,
    rawText: string,
    failureCode: string
  ): Promise<string | null> {
    if (this.debugArtifactDir === null) {
      return null;
    }

    try {
      await mkdir(
        this.debugArtifactDir,
        {
          recursive: true
        }
      );

      const safeId =
        (body.id ?? "no-id")
          .replace(
            /[^a-zA-Z0-9_-]/gu,
            "_"
          )
          .slice(0, 80);

      const path =
        join(
          this.debugArtifactDir,
          `${Date.now()}-${safeId}.json`
        );

      const artifact = {
        failureCode,
        interactionId:
          body.id ?? null,
        status:
          body.status ?? null,
        model:
          this.model,
        outputChars:
          rawText.length,
        outputPreview:
          rawText.slice(0, 2_000),
        usage: {
          inputTokens:
            body.usage
              ?.total_input_tokens ?? 0,
          outputTokens:
            body.usage
              ?.total_output_tokens ?? 0,
          thoughtTokens:
            body.usage
              ?.total_thought_tokens ?? 0,
          cachedTokens:
            body.usage
              ?.total_cached_tokens ?? 0,
          totalTokens:
            body.usage
              ?.total_tokens ?? 0,
          toolUseTokens:
            body.usage
              ?.total_tool_use_tokens ?? 0
        }
      };

      await writeFile(
        path,
        JSON.stringify(
          artifact,
          null,
          2
        ),
        "utf8"
      );

      return path;
    }
    catch {
      /*
       * Observability must never hide the real planner failure.
       */
      return null;
    }
  }

  private async parseOrDescribeFailure(
    call: PlannerCallResult
  ): Promise<
    | {
        readonly ok: true;
        readonly parsed: unknown;
      }
    | {
        readonly ok: false;
        readonly code: string;
        readonly rawText: string;
        readonly debugArtifactPath:
          string | null;
      }
  > {
    const status =
      call.body.status ??
      "unknown";

    const rawText =
      outputText(
        call.body
      );

    if (status === "incomplete") {
      const code =
        "GEMINI_BROWSER_PLANNER_CONTRACT_INCOMPLETE";

      return {
        ok: false,
        code,
        rawText,
        debugArtifactPath:
          await this.writeDebugArtifact(
            call.body,
            rawText,
            code
          )
      };
    }

    if (status !== "completed") {
      const code =
        "GEMINI_BROWSER_PLANNER_STATUS_" +
        status
          .toUpperCase()
          .replace(
            /[^A-Z0-9_]/gu,
            "_"
          );

      return {
        ok: false,
        code,
        rawText,
        debugArtifactPath:
          await this.writeDebugArtifact(
            call.body,
            rawText,
            code
          )
      };
    }

    try {
      return {
        ok: true,
        parsed:
          parsePlannerOutput(
            rawText
          )
      };
    }
    catch (error) {
      const code =
        error instanceof Error
          ? error.message
          : "GEMINI_BROWSER_PLANNER_INVALID_JSON";

      return {
        ok: false,
        code,
        rawText,
        debugArtifactPath:
          await this.writeDebugArtifact(
            call.body,
            rawText,
            code
          )
      };
    }
  }

  async plan(
    observation: BrowserAgentObservation,
    options: BrowserPlanOptions = {}
  ): Promise<BrowserPlannerResult> {
    const prompt =
      [
        "You control a READ-ONLY browser used to collect product facts.",
        "",
        "Plan at most 4 observable browser actions.",
        "Use only candidate target IDs supplied below.",
        "",
        "Primary fields:",
        "PRODUCT, CURRENT_PRICE, OLD_PRICE, STOCK, CONDITION, VARIANT, SPECS, RATING, REVIEWS.",
        "",
        "Prefer one useful multi-action plan over repeated tiny planning calls.",
        "SCROLL_TO and INSPECT are cheap.",
        "CLICK only tabs, accordions, summaries, or controls that reveal product information.",
        "Do NOT buy, add to cart, checkout, login, submit forms, send messages, or navigate away.",
        "Do NOT change the default product variant.",
        "SELECT is disabled in this version.",
        "Use FINISH when enough useful areas have been inspected.",
        "Keep summary and reason short and observable. Do not expose hidden reasoning.",
        "",
        "CURRENT PAGE OBSERVATION:",
        JSON.stringify(
          observation
        )
      ].join("\n");

    const input:
      Array<Record<string, unknown>> = [
        {
          type: "text",
          text: prompt
        }
      ];

    if (options.screenshotBase64) {
      input.push({
        type: "image",
        data:
          options.screenshotBase64,
        mime_type: "image/webp",
        resolution: "low"
      });
    }

    const first =
      await this.callGemini(
        input,
        options.previousInteractionId,
        640
      );

    const firstOutcome =
      await this.parseOrDescribeFailure(
        first
      );

    if (firstOutcome.ok) {
      return {
        interactionId:
          first.body.id ?? null,
        plan:
          normalizePlan(
            firstOutcome.parsed,
            observation
          ),
        usage:
          first.usage
      };
    }

    const repairAllowed =
      options.allowRepair !== false &&
      Boolean(first.body.id) &&
      (
        firstOutcome.code ===
          "GEMINI_BROWSER_PLANNER_CONTRACT_INCOMPLETE" ||
        firstOutcome.code ===
          "GEMINI_BROWSER_PLANNER_INVALID_JSON" ||
        firstOutcome.code ===
          "GEMINI_BROWSER_PLANNER_EMPTY_OUTPUT"
      );

    if (!repairAllowed) {
      throw new Error(
        firstOutcome.code +
        (
          firstOutcome.debugArtifactPath
            ? ` debug=${firstOutcome.debugArtifactPath}`
            : ""
        )
      );
    }

    /*
     * Exactly ONE small repair turn.
     * No screenshot and no repeated page observation are sent.
     */
    const repairInput:
      Array<Record<string, unknown>> = [
        {
          type: "text",
          text:
            "Your previous browser plan was incomplete or invalid. Return exactly one complete JSON object matching the required response schema. Use at most 4 actions. No commentary."
        }
      ];

    const repaired =
      await this.callGemini(
        repairInput,
        first.body.id,
        512
      );

    const repairedOutcome =
      await this.parseOrDescribeFailure(
        repaired
      );

    const combinedUsage =
      addUsage(
        first.usage,
        repaired.usage
      );

    if (!repairedOutcome.ok) {
      throw new Error(
        repairedOutcome.code +
        (
          repairedOutcome.debugArtifactPath
            ? ` debug=${repairedOutcome.debugArtifactPath}`
            : ""
        )
      );
    }

    return {
      interactionId:
        repaired.body.id ??
        first.body.id ??
        null,
      plan:
        normalizePlan(
          repairedOutcome.parsed,
          observation
        ),
      usage:
        combinedUsage
    };
  }
}

