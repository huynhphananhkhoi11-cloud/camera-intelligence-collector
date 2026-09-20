export interface AgentTokenUsage {
  readonly inputTokens:
    number;

  readonly outputTokens:
    number;

  readonly thoughtTokens:
    number;

  readonly cachedTokens:
    number;

  readonly totalTokens:
    number;
}


export interface AgentTokenBudgetLimits {
  readonly softInputTokens:
    number;

  readonly warningInputTokens:
    number;

  readonly hardInputTokens:
    number;
}


export type AgentBudgetLevel =
  | "OK"
  | "SOFT"
  | "WARNING"
  | "HARD";


export const DEFAULT_AGENT_TOKEN_BUDGET:
  AgentTokenBudgetLimits = {
    softInputTokens:
      10_000,

    warningInputTokens:
      15_000,

    hardInputTokens:
      20_000
  };


export class AgentTokenBudget {
  private inputTokens =
    0;

  private outputTokens =
    0;

  private thoughtTokens =
    0;

  private cachedTokens =
    0;

  private totalTokens =
    0;


  constructor(
    readonly limits:
      AgentTokenBudgetLimits =
        DEFAULT_AGENT_TOKEN_BUDGET
  ) {}


  estimateInput(
    textChars:
      number,

    imageResolution:
      "none" |
      "low" |
      "medium" |
      "high" =
        "none"
  ): number {

    const approximateTextTokens =
      Math.ceil(
        Math.max(
          0,
          textChars
        ) /
        4
      );


    const imageTokens =
      imageResolution ===
        "low"
        ? 280
        : imageResolution ===
            "medium"
          ? 560
          : imageResolution ===
              "high"
            ? 1_120
            : 0;


    /*
     * Small allowance for system instruction,
     * JSON schema and request framing.
     */
    return (
      approximateTextTokens +
      imageTokens +
      500
    );
  }


  canStartRequest(
    estimatedInputTokens:
      number
  ): boolean {

    return (
      this.inputTokens +
      estimatedInputTokens
    ) <=
      this.limits
        .hardInputTokens;
  }


  record(
    usage:
      Partial<
        AgentTokenUsage
      >
  ): void {

    const input =
      usage.inputTokens ??
      0;

    const output =
      usage.outputTokens ??
      0;

    const thought =
      usage.thoughtTokens ??
      0;

    const cached =
      usage.cachedTokens ??
      0;


    this.inputTokens +=
      input;

    this.outputTokens +=
      output;

    this.thoughtTokens +=
      thought;

    this.cachedTokens +=
      cached;

    this.totalTokens +=
      usage.totalTokens ??
      (
        input +
        output +
        thought
      );
  }


  level():
    AgentBudgetLevel {

    if (
      this.inputTokens >=
        this.limits
          .hardInputTokens
    ) {
      return "HARD";
    }


    if (
      this.inputTokens >=
        this.limits
          .warningInputTokens
    ) {
      return "WARNING";
    }


    if (
      this.inputTokens >=
        this.limits
          .softInputTokens
    ) {
      return "SOFT";
    }


    return "OK";
  }


  remainingInputTokens():
    number {

    return Math.max(
      0,
      this.limits
        .hardInputTokens -
      this.inputTokens
    );
  }


  snapshot():
    AgentTokenUsage & {
      readonly level:
        AgentBudgetLevel;

      readonly remainingInputTokens:
        number;
    } {

    return {
      inputTokens:
        this.inputTokens,

      outputTokens:
        this.outputTokens,

      thoughtTokens:
        this.thoughtTokens,

      cachedTokens:
        this.cachedTokens,

      totalTokens:
        this.totalTokens,

      level:
        this.level(),

      remainingInputTokens:
        this.remainingInputTokens()
    };
  }
}