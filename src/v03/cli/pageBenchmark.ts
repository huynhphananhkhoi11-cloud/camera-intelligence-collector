#!/usr/bin/env node

import {
  Command
} from "commander";

import {
  mkdir,
  writeFile
} from "node:fs/promises";

import {
  dirname,
  resolve
} from "node:path";

import {
  collectProductObservationsFromHtml
} from "../observations/observationCollector.js";

import {
  buildEvidencePacket,
  serializeEvidencePacketForPrompt
} from "../ai/evidencePacket.js";

import {
  compactEvidencePacketForPrompt
} from "../ai/evidenceCompactor.js";

import {
  GeminiSemanticProvider
} from "../ai/geminiSemanticProvider.js";

import {
  validateSemanticDecision
} from "../ai/groundingValidator.js";

import {
  VisualEvidenceCapture
} from "../ai/visualEvidenceCapture.js";

import {
  buildFullEvidencePayload,
  buildFullPagePayload,
  pageBenchmarkStats
} from "../benchmark/pageBenchmarkPayload.js";

import type {
  PageBenchmarkMode
} from "../benchmark/pageBenchmarkTypes.js";


interface Options {
  readonly model:
    string;

  readonly headed:
    boolean;

  readonly output:
    string;

  readonly timeoutSeconds:
    number;
}


function money(
  value:
    number |
    undefined,

  currency:
    string |
    null |
    undefined
): string {

  if (
    value ===
      undefined
  ) {
    return "-";
  }


  return (
    new Intl.NumberFormat(
      "vi-VN",
      {
        maximumFractionDigits:
          0
      }
    ).format(
      value
    ) +
    (
      currency
        ? " " +
          currency
        : ""
    )
  );
}


const program =
  new Command();


program
  .name(
    "camintel-page-benchmark"
  )
  .description(
    "Capture one product page once, then compare COMPACT vs FULL_EVIDENCE vs FULL_PAGE with Gemini."
  )
  .argument(
    "<url>",
    "Product detail URL"
  )
  .option(
    "--model <name>",
    "Gemini model",
    "gemini-3.6-flash"
  )
  .option(
    "--headed",
    "Show Chromium while capturing",
    false
  )
  .option(
    "--output <path>",
    "Output prefix",
    "./artifacts/page-benchmark/product"
  )
  .option(
    "--timeout-seconds <n>",
    "Timeout for each Gemini request",
    value =>
      Number.parseInt(
        value,
        10
      ),
    120
  )
  .action(
    async (
      url:
        string,

      options:
        Options
    ) => {

      const apiKey =
        process.env.GEMINI_API_KEY
          ?.trim();


      if (
        !apiKey
      ) {
        throw new Error(
          "GEMINI_API_KEY is not set."
        );
      }


      const prefix =
        resolve(
          options.output
        );


      await mkdir(
        dirname(
          prefix
        ),
        {
          recursive:
            true
        }
      );


      console.log("");
      console.log(
        "=== CAMERA INTELLIGENCE PAGE BENCHMARK ==="
      );
      console.log("");
      console.log(
        "[1/6] Opening page..."
      );


      const capture =
        new VisualEvidenceCapture({
          headless:
            !options.headed
        });


      /*
       * Capture exactly once.
       *
       * All three AI modes below receive the same rendered page,
       * screenshot and evidence packet.
       */
      const captured =
        await capture.capture(
          url
        );


      console.log(
        "[2/6] Building one shared EvidencePacket..."
      );


      const observations =
        collectProductObservationsFromHtml(
          captured.renderedHtml,
          url,
          captured.finalUrl
        );


      const packet =
        buildEvidencePacket({
          pageUrl:
            url,

          finalUrl:
            captured.finalUrl,

          observations:
            observations.observations,

          primaryRegionText:
            captured.primaryRegionText,

          controls:
            captured.controls,

          evidenceBoard:
            captured.evidenceBoard
        });


      /*
       * Build all payloads before any AI call.
       */
      const compactPacket =
        compactEvidencePacketForPrompt(
          packet
        );


      const compactPayload =
        serializeEvidencePacketForPrompt(
          compactPacket
        );


      const fullEvidencePayload =
        buildFullEvidencePayload(
          packet
        );


      const fullPagePayload =
        buildFullPagePayload({
          packet,
          renderedHtml:
            captured.renderedHtml
        });


      const stats =
        pageBenchmarkStats({
          packet,
          renderedHtml:
            captured.renderedHtml
        });


      console.log("");
      console.log(
        "Captured page:"
      );
      console.log(
        "  HTML bytes:       " +
        stats.renderedHtmlBytes
      );
      console.log(
        "  HTML chars:       " +
        stats.renderedHtmlChars
      );
      console.log(
        "  Sanitized chars:  " +
        stats.sanitizedHtmlChars
      );
      console.log(
        "  Evidence items:   " +
        stats.evidenceCount
      );
      console.log(
        "  Selected controls:" +
        " " +
        stats.selectedControlCount
      );

      console.log("");
      console.log(
        "Payload chars before Gemini:"
      );
      console.log(
        "  COMPACT:       " +
        compactPayload.length
      );
      console.log(
        "  FULL_EVIDENCE: " +
        fullEvidencePayload.length
      );
      console.log(
        "  FULL_PAGE:     " +
        fullPagePayload.length
      );


      const provider =
        new GeminiSemanticProvider({
          apiKey,

          timeoutMs:
            options.timeoutSeconds *
            1000,

          maxOutputTokens:
            4_096
        });


      const definitions:
        Array<{
          readonly mode:
            PageBenchmarkMode;

          readonly payload:
            string;

          readonly useOverride:
            boolean;
        }> = [
          {
            mode:
              "COMPACT",

            payload:
              compactPayload,

            useOverride:
              false
          },
          {
            mode:
              "FULL_EVIDENCE",

            payload:
              fullEvidencePayload,

            useOverride:
              true
          },
          {
            mode:
              "FULL_PAGE",

            payload:
              fullPagePayload,

            useOverride:
              true
          }
        ];


      const runs:
        Array<Record<
          string,
          unknown
        >> =
          [];


      console.log("");
      console.log(
        "[3/6] Running Gemini LOW benchmark..."
      );


      for (
        const definition
        of definitions
      ) {

        console.log("");
        console.log(
          ">>> " +
          definition.mode
        );


        console.log(
          "[AI] Gemini 3.6 Flash / LOW"
        );

        console.log(
          "[AI] Payload: " +
          definition.payload.length.toLocaleString() +
          " chars"
        );

        console.log(
          "[AI] Request sent..."
        );


        const aiStartedAt =
          Date.now();


        const heartbeat =
          setInterval(
            () => {

              const elapsedSeconds =
                Math.floor(
                  (
                    Date.now() -
                    aiStartedAt
                  ) /
                  1000
                );


              console.log(
                "[AI] Waiting... " +
                elapsedSeconds +
                "s"
              );
            },
            2_000
          );


        let analyzed;


        try {

          analyzed =
            await provider.analyze(
              packet,
              options.model,
              options.timeoutSeconds *
                1000,
              "low",
              definition.useOverride
                ? definition.payload
                : undefined
            );
        }
        finally {

          clearInterval(
            heartbeat
          );
        }


        console.log(
          "[AI] Response received after " +
          (
            (
              Date.now() -
              aiStartedAt
            ) /
            1000
          ).toFixed(
            1
          ) +
          "s"
        );

        console.log(
          "[AI] Validating response..."
        );


        const validation =
          validateSemanticDecision(
            packet,
            analyzed.decision
          );


        const run = {
          mode:
            definition.mode,

          payloadChars:
            definition.payload.length,

          provider:
            "gemini",

          model:
            analyzed.model,

          reasoning:
            "LOW",

          inputTokens:
            analyzed.promptEvalCount,

          outputTokens:
            analyzed.evalCount,

          latencyMs:
            analyzed.totalDurationMs,

          validation,

          summary: {
            product:
              analyzed.decision
                .productName.value,

            entity:
              analyzed.decision
                .entity.type,

            currentPrice:
              analyzed.decision.currentPrice
                ?.value ??
              null,

            oldPrice:
              analyzed.decision.oldPrice
                ?.value ??
              null,

            condition:
              analyzed.decision.condition
                ?.value ??
              null,

            stock:
              analyzed.decision.stock
                ?.state ??
              null,

            selectedVariants:
              analyzed.decision.variants
                .filter(
                  variant =>
                    variant.selected
                )
                .map(
                  variant =>
                    variant.label
                ),

            variantCount:
              analyzed.decision
                .variants.length,

            specCount:
              analyzed.decision
                .specs.length,

            rating:
              analyzed.decision.rating
                ?.value ??
              null,

            reviewCount:
              analyzed.decision.reviewCount
                ?.value ??
              null
          },

          decision:
            analyzed.decision
        };


        runs.push(
          run
        );


        console.log(
          "Input tokens:  " +
          String(
            analyzed.promptEvalCount
          )
        );

        console.log(
          "Output tokens: " +
          String(
            analyzed.evalCount
          )
        );

        console.log(
          "Latency:       " +
          String(
            analyzed.totalDurationMs
          ) +
          " ms"
        );

        console.log(
          "Validation:    " +
          validation.status
        );

        console.log(
          "Product:       " +
          analyzed.decision
            .productName.value
        );

        console.log(
          "Price:         " +
          (
            analyzed.decision.currentPrice
              ? money(
                  analyzed.decision
                    .currentPrice.value,

                  analyzed.decision
                    .currentPrice.currency
                )
              : "-"
          )
        );

        console.log(
          "Stock:         " +
          (
            analyzed.decision.stock
              ?.state ??
            "-"
          )
        );

        console.log(
          "Variants:      " +
          analyzed.decision
            .variants.length
        );

        console.log(
          "Specs:         " +
          analyzed.decision
            .specs.length
        );
      }


      console.log("");
      console.log(
        "[4/6] Saving screenshot..."
      );


      const screenshotPath =
        prefix +
        (
          captured.evidenceBoard.mimeType ===
            "image/webp"
            ? ".webp"
            : captured.evidenceBoard.mimeType ===
                "image/jpeg"
              ? ".jpg"
              : ".png"
        );


      await writeFile(
        screenshotPath,
        Buffer.from(
          captured.evidenceBoard.base64,
          "base64"
        )
      );


      console.log(
        "[5/6] Saving benchmark JSON..."
      );


      const jsonPath =
        prefix +
        ".json";


      await writeFile(
        jsonPath,
        JSON.stringify(
          {
            url,

            finalUrl:
              captured.finalUrl,

            capturedAt:
              new Date()
                .toISOString(),

            page:
              stats,

            payloads: {
              compactChars:
                compactPayload.length,

              fullEvidenceChars:
                fullEvidencePayload.length,

              fullPageChars:
                fullPagePayload.length
            },

            runs
          },
          null,
          2
        ),
        "utf8"
      );


      console.log(
        "[6/6] Benchmark complete."
      );


      console.log("");
      console.log(
        "=== COMPARISON ==="
      );


      console.table(
        runs.map(
          run => {

            const summary =
              run.summary as
                Record<
                  string,
                  unknown
                >;


            const validation =
              run.validation as
                {
                  status:
                    string;
                };


            return {
              mode:
                run.mode,

              inputTokens:
                run.inputTokens,

              outputTokens:
                run.outputTokens,

              latencyMs:
                run.latencyMs,

              validation:
                validation.status,

              price:
                summary.currentPrice,

              stock:
                summary.stock,

              variants:
                summary.variantCount,

              specs:
                summary.specCount
            };
          }
        )
      );


      console.log("");
      console.log(
        "JSON: " +
        jsonPath
      );

      console.log(
        "Screenshot: " +
        screenshotPath
      );
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