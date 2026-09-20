#!/usr/bin/env node

import {
  Command
} from "commander";

import {
  GeminiVisionContractError,
  GeminiVisionProvider,
  GeminiVisionQuotaError,
  GeminiVisionTransportError
} from "../ai/geminiVisionProvider.js";

import {
  VisionFastPathSession
} from "../agent/visionFastPathSession.js";


const program =
  new Command();


program
  .name(
    "camintel-vision-fast"
  )
  .description(
    "Run the planner-free C9 vision fast path with one Gemini multimodal call on the normal path."
  )
  .argument(
    "<url>",
    "Product or page URL"
  )
  .option(
    "--headless",
    "Hide Chromium",
    false
  )
  .action(
    async (
      url:
        string,

      options:
        {
          headless:
            boolean;
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
        "=== CAMERA INTELLIGENCE — C9 VISION FAST PATH ==="
      );
      console.log(
        "Mode: READ ONLY"
      );
      console.log(
        "Planner calls: 0"
      );
      console.log(
        "Gemini normal-path calls: 1"
      );
      console.log(
        "Model: gemini-3.5-flash-lite"
      );
      console.log(
        "Thinking: minimal"
      );
      console.log("");


      const provider =
        new GeminiVisionProvider({
          apiKey
        });


      const session =
        new VisionFastPathSession({
          headless:
            options.headless
        });


      try {

        console.log(
          "[" +
          new Date()
            .toLocaleTimeString(
              "en-GB"
            ) +
          "] FAST OPEN    " +
          url
        );


        const result =
          await session.run(
            url,
            provider
          );


        console.log(
          "[" +
          new Date()
            .toLocaleTimeString(
              "en-GB"
            ) +
          "] FAST DONE    validation=" +
          result.validation.status +
          " attempts=" +
          result.providerResult.attempts +
          " latency=" +
          result.providerResult.latencyMs +
          "ms"
        );


        console.log("");
        console.log(
          "=== FAST PATH RESULT ==="
        );


        console.log(
          JSON.stringify(
            {
              status:
                "COMPLETED",

              sourcePacketId:
                result.sourcePacket.packetId,

              visionPacketId:
                result.visionPacket.packetId,

              imageId:
                result.visionPacket
                  .productRegionScreenshot
                  .imageId,

              screenshotFallback:
                result.visionPacket
                  .productRegionScreenshot
                  .fallback,

              selectorUsed:
                result.visionPacket
                  .productRegionScreenshot
                  .selectorUsed,

              model:
                result.providerResult.model,

              attempts:
                result.providerResult.attempts,

              usage:
                result.providerResult.usage,

              validation:
                result.validation,

              decision:
                result.decision
            },
            null,
            2
          )
        );
      }
      catch (
        error
      ) {

        const message =
          error instanceof
            Error
            ? error.message
            : String(
                error
              );


        if (
          error instanceof
            GeminiVisionQuotaError
        ) {

          console.log(
            "[" +
            new Date()
              .toLocaleTimeString(
                "en-GB"
              ) +
            "] FAST AI_PENDING  quota stop"
          );


          console.log(
            JSON.stringify(
              {
                status:
                  "AI_PENDING",

                category:
                  "QUOTA",

                reason:
                  message
              },
              null,
              2
            )
          );

          return;
        }


        if (
          error instanceof
            GeminiVisionTransportError
        ) {

          console.log(
            "[" +
            new Date()
              .toLocaleTimeString(
                "en-GB"
              ) +
            "] FAST AI_PENDING  transient exhausted"
          );


          console.log(
            JSON.stringify(
              {
                status:
                  "AI_PENDING",

                category:
                  "TRANSPORT",

                reason:
                  message
              },
              null,
              2
            )
          );

          return;
        }


        if (
          error instanceof
            GeminiVisionContractError
        ) {
          throw new Error(
            "VISION_CONTRACT_FAILURE: " +
            message
          );
        }


        throw error;
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
