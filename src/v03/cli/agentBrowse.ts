#!/usr/bin/env node

import {
  Command
} from "commander";

import {
  BrowserAgentSession
} from "../agent/browserAgentSession.js";

import {
  analyzeFinalEvidenceLow
} from "../agent/semanticFinalizer.js";

import {
  GeminiRateLimitError,
  GeminiSemanticProvider
} from "../ai/geminiSemanticProvider.js";

import type {
  BrowserAgentEvent
} from "../agent/browserAgentTypes.js";


function logEvent(
  event:
    BrowserAgentEvent
): void {

  const time =
    new Date()
      .toLocaleTimeString(
        "en-GB"
      );


  if (
    event.type ===
      "SESSION_STARTED"
  ) {
    console.log(
      `[${time}] BROWSER OPEN  ${event.url}`
    );
    return;
  }


  if (
    event.type ===
      "PLANNER_STARTED"
  ) {
    console.log(
      `[${time}] AI PLAN #${event.turn}  est=${event.estimatedInputTokens} tokens`
    );
    return;
  }


  if (
    event.type ===
      "PLANNER_WAITING"
  ) {
    console.log(
      `[${time}] AI WAITING  ${(event.elapsedMs / 1000).toFixed(0)}s`
    );
    return;
  }


  if (
    event.type ===
      "PLANNER_COMPLETED"
  ) {
    console.log(
      `[${time}] AI READY  input=${event.usage.inputTokens}` +
      ` cached=${event.usage.cachedTokens}` +
      ` thought=${event.usage.thoughtTokens}` +
      ` output=${event.usage.outputTokens}` +
      ` latency=${event.usage.latencyMs}ms`
    );
    return;
  }


  if (
    event.type ===
      "ACTION_STARTED"
  ) {
    console.log(
      `[${time}] AI ACTION  ${event.action.action}` +
      ` ${event.action.field ?? ""}` +
      ` ${event.action.targetId ?? ""}` +
      ` â€” ${event.action.reason}`
    );
    return;
  }


  if (
    event.type ===
      "ACTION_COMPLETED"
  ) {
    console.log(
      `[${time}] BROWSER     ${event.detail}`
    );
    return;
  }


  if (
    event.type ===
      "BUDGET_UPDATED"
  ) {
    console.log(
      `[${time}] TOKEN       input=${event.inputTokens}` +
      ` remaining=${event.remainingInputTokens}` +
      ` level=${event.level}`
    );
    return;
  }


  if (
    event.type ===
      "SESSION_COMPLETED"
  ) {
    console.log(
      `[${time}] BROWSER DONE ${event.url}`
    );
  }
}


const program =
  new Command();


program
  .name(
    "camintel-agent-browse"
  )
  .description(
    "Watch Gemini plan and Playwright visibly inspect a product page under a strict token budget."
  )
  .argument(
    "<url>",
    "Product page URL"
  )
  .option(
    "--model <name>",
    "Gemini model",
    "gemini-3.6-flash"
  )
  .option(
    "--headless",
    "Hide Chromium",
    false
  )
  .option(
    "--planner-turns <n>",
    "Maximum Gemini planner turns",
    value =>
      Number.parseInt(
        value,
        10
      ),
    2
  )
  .action(
    async (
      url:
        string,

      options:
        {
          model:
            string;

          headless:
            boolean;

          plannerTurns:
            number;
        }
    ) => {

      const apiKey =
        process.env
          .GEMINI_API_KEY
          ?.trim();


      if (
        !apiKey
      ) {
        throw new Error(
          "GEMINI_API_KEY is not set."
        );
      }


      console.log("");
      console.log(
        "=== CAMERA INTELLIGENCE â€” LIVE AI BROWSER ==="
      );
      console.log(
        "Mode: READ ONLY"
      );
      console.log(
        "Planner: Gemini MINIMAL"
      );
      console.log(
        "Image: LOW resolution"
      );
      console.log(
        "Input hard budget: 20,000 tokens / URL"
      );
      console.log("");


      const session =
        new BrowserAgentSession({
          apiKey,

          model:
            options.model,

          headless:
            options.headless,

          maxPlannerTurns:
            options.plannerTurns,

          onEvent:
            logEvent
        });


      const semanticProvider =
        new GeminiSemanticProvider({
          apiKey,

          timeoutMs:
            60_000,

          maxRetries:
            0
        });


      let semanticStatus:
        "NOT_RUN" |
        "COMPLETED" |
        "AI_PENDING" =
          "NOT_RUN";


      let semanticSummary:
        unknown =
          null;


      const result =
        await session.run(
          url,

          async packet => {

            console.log(
              "[" +
              new Date()
                .toLocaleTimeString(
                  "en-GB"
                ) +
              "] SEMANTIC LOW START  evidence=" +
              packet.allEvidence.length
            );


            try {

              const semantic =
                await analyzeFinalEvidenceLow({
                  packet,

                  provider:
                    semanticProvider,

                  model:
                    options.model,

                  timeoutMs:
                    60_000
                });


              semanticStatus =
                "COMPLETED";


              semanticSummary = {
                reasoningProfile:
                  semantic.reasoningProfile,

                validation:
                  semantic.validation,

                decision:
                  semantic.decision,

                usage: {
                  inputTokens:
                    semantic.providerResult
                      .promptEvalCount,

                  outputTokens:
                    semantic.providerResult
                      .evalCount,

                  totalDurationMs:
                    semantic.providerResult
                      .totalDurationMs
                }
              };


              console.log(
                "[" +
                new Date()
                  .toLocaleTimeString(
                    "en-GB"
                  ) +
                "] SEMANTIC DONE  profile=" +
                semantic.reasoningProfile +
                " validation=" +
                semantic.validation.status +
                " input=" +
                (
                  semantic.providerResult
                    .promptEvalCount ??
                  0
                ) +
                " output=" +
                (
                  semantic.providerResult
                    .evalCount ??
                  0
                )
              );
            }
            catch (
              error
            ) {

              const message =
                error instanceof Error
                  ? error.message
                  : String(
                      error
                    );


              if (
                error instanceof
                  GeminiRateLimitError ||
                message.includes(
                  "429"
                ) ||
                message
                  .toLowerCase()
                  .includes(
                    "rate limit"
                  )
              ) {

                semanticStatus =
                  "AI_PENDING";


                semanticSummary = {
                  reason:
                    message
                };


                console.log(
                  "[" +
                  new Date()
                    .toLocaleTimeString(
                      "en-GB"
                    ) +
                  "] SEMANTIC AI_PENDING  provider quota/rate limit"
                );

                return;
              }


              throw error;
            }
          }
        );


      console.log("");
      console.log(
        "=== SESSION SUMMARY ==="
      );
      console.log(
        "URL: " +
        result.finalUrl
      );
      console.log(
        "Planner turns: " +
        result.turns
      );
      console.log(
        "Input tokens: " +
        result.budget
          .inputTokens
      );
      console.log(
        "Cached tokens: " +
        result.budget
          .cachedTokens
      );
      console.log(
        "Thought tokens: " +
        result.budget
          .thoughtTokens
      );
      console.log(
        "Output tokens: " +
        result.budget
          .outputTokens
      );
      console.log(
        "Remaining input budget: " +
        result.budget
          .remainingInputTokens
      );
      console.log(
        "Budget level: " +
        result.budget.level
      );

      console.log(
        "Evidence items: " +
        result.packet
          .allEvidence
          .length
      );

      console.log(
        "Semantic status: " +
        semanticStatus
      );

      if (
        semanticSummary
      ) {

        console.log("");
        console.log(
          "=== SEMANTIC RESULT ==="
        );

        console.log(
          JSON.stringify(
            semanticSummary,
            null,
            2
          )
        );
      }
    }
  );


try {

  await program.parseAsync(
    process.argv
  );
}
catch (
  error
) {

  console.error(
    "ERROR: " +
    (
      error instanceof
        Error
        ? error.message
        : String(
            error
          )
    )
  );


  process.exitCode =
    1;
}