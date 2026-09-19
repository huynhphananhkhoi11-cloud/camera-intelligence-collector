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

import ExcelJS from "exceljs";

import {
  collectProductObservationsFromHtml
} from "../observations/observationCollector.js";

import {
  buildEvidencePacket
} from "../ai/evidencePacket.js";

import {
  GeminiSemanticProvider
} from "../ai/geminiSemanticProvider.js";

import {
  validateSemanticDecision
} from "../ai/groundingValidator.js";

import {
  VisualEvidenceCapture
} from "../ai/visualEvidenceCapture.js";


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
    "camintel-gemini-read"
  )
  .description(
    "Read one product page with Gemini 3.6 Flash vision + grounded DOM evidence"
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
    "Show Chromium",
    false
  )
  .option(
    "--output <path>",
    "Output prefix",
    "./artifacts/gemini-read/product"
  )
  .option(
    "--timeout-seconds <n>",
    "Gemini request timeout",
    value =>
      Number.parseInt(
        value,
        10
      ),
    90
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
          "GEMINI_API_KEY is not set. Set it in PowerShell for this session before running."
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


      console.log(
        "[1/5] Opening page and capturing evidence..."
      );


      const capture =
        new VisualEvidenceCapture({
          headless:
            !options.headed
        });


      const captured =
        await capture.capture(
          url
        );


      console.log(
        "[2/5] Building evidence packet..."
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


      console.log(
        "[3/5] Gemini 3.6 Flash vision inference..."
      );


      const provider =
        new GeminiSemanticProvider({
          apiKey,

          timeoutMs:
            options.timeoutSeconds *
            1000
        });


      const analyzed =
        await provider.analyze(
          packet,
          options.model
        );


      console.log(
        "[4/5] Grounding validation..."
      );


      const validation =
        validateSemanticDecision(
          packet,
          analyzed.decision
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

            provider:
              "gemini",

            model:
              analyzed.model,

            packet: {
              ...packet,
              evidenceBoard: {
                ...packet.evidenceBoard,
                base64:
                  "<saved separately>"
              }
            },

            decision:
              analyzed.decision,

            validation,

            runtime: {
              totalDurationMs:
                analyzed.totalDurationMs,

              promptTokens:
                analyzed.promptEvalCount,

              outputTokens:
                analyzed.evalCount
            }
          },
          null,
          2
        ),
        "utf8"
      );


      const workbook =
        new ExcelJS.Workbook();


      const sheet =
        workbook.addWorksheet(
          "AI Product"
        );


      sheet.columns = [
        {
          header:
            "URL",
          key:
            "url",
          width:
            62
        },
        {
          header:
            "Tên sản phẩm",
          key:
            "product",
          width:
            44
        },
        {
          header:
            "Entity",
          key:
            "entity",
          width:
            18
        },
        {
          header:
            "Condition",
          key:
            "condition",
          width:
            18
        },
        {
          header:
            "Giá hiện tại",
          key:
            "currentPrice",
          width:
            24
        },
        {
          header:
            "Giá cũ",
          key:
            "oldPrice",
          width:
            24
        },
        {
          header:
            "Stock",
          key:
            "stock",
          width:
            22
        },
        {
          header:
            "Validation",
          key:
            "validation",
          width:
            24
        },
        {
          header:
            "Model",
          key:
            "model",
          width:
            32
        },
        {
          header:
            "Latency ms",
          key:
            "latency",
          width:
            16
        }
      ];


      sheet.addRow({
        url:
          captured.finalUrl,

        product:
          analyzed.decision.productName.value,

        entity:
          analyzed.decision.entity.type,

        condition:
          analyzed.decision.condition
            ?.value ??
          "",

        currentPrice:
          analyzed.decision.currentPrice
            ? money(
                analyzed.decision.currentPrice.value,
                analyzed.decision.currentPrice.currency
              )
            : "",

        oldPrice:
          analyzed.decision.oldPrice
            ? money(
                analyzed.decision.oldPrice.value,
                analyzed.decision.oldPrice.currency
              )
            : "",

        stock:
          analyzed.decision.stock
            ?.state ??
          "",

        validation:
          validation.status,

        model:
          analyzed.model,

        latency:
          analyzed.totalDurationMs ??
          ""
      });


      sheet.getRow(
        1
      ).font = {
        bold:
          true
      };


      const excelPath =
        prefix +
        ".xlsx";


      await workbook.xlsx.writeFile(
        excelPath
      );


      console.log(
        "[5/5] Export complete."
      );


      console.log("");
      console.log(
        "=== GEMINI HUMAN-LIKE READ ==="
      );
      console.log(
        "URL: " +
        captured.finalUrl
      );
      console.log(
        "Model: " +
        analyzed.model
      );
      console.log(
        "Product: " +
        analyzed.decision.productName.value
      );
      console.log(
        "Entity: " +
        analyzed.decision.entity.type +
        " / " +
        analyzed.decision.entity.subtype
      );
      console.log(
        "Condition: " +
        (
          analyzed.decision.condition
            ?.value ??
          "-"
        )
      );
      console.log(
        "Current price: " +
        (
          analyzed.decision.currentPrice
            ? money(
                analyzed.decision.currentPrice.value,
                analyzed.decision.currentPrice.currency
              )
            : "-"
        )
      );
      console.log(
        "Old price: " +
        (
          analyzed.decision.oldPrice
            ? money(
                analyzed.decision.oldPrice.value,
                analyzed.decision.oldPrice.currency
              )
            : "-"
        )
      );
      console.log(
        "Stock: " +
        (
          analyzed.decision.stock
            ?.state ??
          "-"
        )
      );
      console.log(
        "Validation: " +
        validation.status
      );
      console.log(
        "Latency: " +
        String(
          analyzed.totalDurationMs
        ) +
        " ms"
      );
      console.log(
        "Prompt tokens: " +
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
        "JSON: " +
        jsonPath
      );
      console.log(
        "Excel: " +
        excelPath
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
