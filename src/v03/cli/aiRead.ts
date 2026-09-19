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
  exportHumanReadWorkbook
} from "../ai/aiResultExporter.js";

import {
  HumanLikeProductReader
} from "../ai/humanLikeReader.js";


interface Options {
  readonly model:
    string;

  readonly ollama:
    string;

  readonly headed:
    boolean;

  readonly output?:
    string;
}


function safeName(
  url:
    string
): string {

  const parsed =
    new URL(
      url
    );


  return (
    parsed.hostname
      .replace(
        /^www\./iu,
        ""
      )
      .replace(
        /[^a-z0-9]+/giu,
        "-"
      ) +
    "-" +
    Date.now()
  );
}


function publicResult(
  result:
    Awaited<
      ReturnType<
        HumanLikeProductReader["read"]
      >
    >
) {

  return {
    url:
      result.url,

    finalUrl:
      result.finalUrl,

    model:
      result.model,

    doctor:
      result.doctor,

    packet:
      result.packet
        ? {
            ...result.packet,

            evidenceBoard:
              result.packet.evidenceBoard
                ? {
                    imageId:
                      result.packet.evidenceBoard.imageId,

                    kind:
                      result.packet.evidenceBoard.kind,

                    mimeType:
                      result.packet.evidenceBoard.mimeType,

                    width:
                      result.packet.evidenceBoard.width,

                    height:
                      result.packet.evidenceBoard.height,

                    base64:
                      "<saved separately>"
                  }
                : undefined
          }
        : null,

    decision:
      result.decision,

    validation:
      result.validation,

    runtime:
      result.runtime,

    error:
      result.error
  };
}


const program =
  new Command();


program
  .name(
    "camintel-ai-read"
  )
  .description(
    "Read one product page visually like a human shopper and ground the result in evidence"
  )
  .argument(
    "<url>",
    "Product detail URL"
  )
  .option(
    "--model <name>",
    "Installed Ollama model name or auto",
    "auto"
  )
  .option(
    "--ollama <url>",
    "Ollama base URL",
    process.env.OLLAMA_HOST ??
    "http://127.0.0.1:11434"
  )
  .option(
    "--headed",
    "Show Chromium while reading the product page",
    false
  )
  .option(
    "--output <prefix>",
    "Output prefix without extension"
  )
  .action(
    async (
      url:
        string,
      options:
        Options
    ) => {

      const reader =
        new HumanLikeProductReader({
          model:
            options.model,

          ollamaBaseUrl:
            options.ollama,

          headless:
            !options.headed
        });


      const result =
        await reader.read(
          url
        );


      const prefix =
        resolve(
          options.output ??
          (
            "artifacts/ai-read/" +
            safeName(
              url
            )
          )
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


      if (
        result.packet
          ?.evidenceBoard
      ) {
        await writeFile(
          prefix +
          ".png",
          Buffer.from(
            result.packet.evidenceBoard.base64,
            "base64"
          )
        );
      }


      await writeFile(
        prefix +
        ".json",
        JSON.stringify(
          publicResult(
            result
          ),
          null,
          2
        ),
        "utf8"
      );


      await exportHumanReadWorkbook(
        prefix +
        ".xlsx",
        result
      );


      const decision =
        result.decision;


      process.stdout.write(
        [
          "",
          "=== HUMAN-LIKE AI READ ===",
          "URL: " +
            (
              result.finalUrl ??
              result.url
            ),
          "Model: " +
            (
              result.model ??
              "-"
            ),
          "Product: " +
            (
              decision
                ?.productName.value ??
              "-"
            ),
          "Entity: " +
            (
              decision
                ?.entity.type ??
              "-"
            ) +
            " / " +
            (
              decision
                ?.entity.subtype ??
              "-"
            ),
          "Condition: " +
            (
              decision
                ?.condition?.value ??
              "-"
            ),
          "Current price: " +
            (
              decision
                ?.currentPrice
                ? String(
                    decision.currentPrice.value
                  ) +
                  " " +
                  (
                    decision.currentPrice.currency ??
                    ""
                  )
                : "-"
            ),
          "Old price: " +
            (
              decision
                ?.oldPrice
                ? String(
                    decision.oldPrice.value
                  ) +
                  " " +
                  (
                    decision.oldPrice.currency ??
                    ""
                  )
                : "-"
            ),
          "Stock: " +
            (
              decision
                ?.stock
                ? decision.stock.state +
                  (
                    decision.stock.quantity ===
                      null
                      ? ""
                      : " qty=" +
                        decision.stock.quantity
                  )
                : "-"
            ),
          "Validation: " +
            result.validation.status,
          "Issues: " +
            (
              result.validation.issues.length ===
                0
                ? "0"
                : result.validation.issues
                    .map(
                      issue =>
                        issue.code
                    )
                    .join(
                      ", "
                    )
            ),
          "JSON: " +
            prefix +
            ".json",
          "Excel: " +
            prefix +
            ".xlsx",
          "Screenshot: " +
            prefix +
            ".png",
          ""
        ].join(
          "\n"
        )
      );


      if (
        result.validation.status !==
          "VALIDATED"
      ) {
        process.exitCode =
          2;
      }
    }
  );


await program.parseAsync(
  process.argv
);
