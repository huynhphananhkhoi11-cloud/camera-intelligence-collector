import ExcelJS from "exceljs";

import {
  existsSync
} from "node:fs";

import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  afterEach,
  describe,
  expect,
  test
} from "vitest";

import {
  exportSemanticBatchWorkbook
} from "../../../src/v03/export/semanticBatchWorkbook.js";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../../../src/v03/ai/semanticContracts.js";

import type {
  SemanticBatchReport
} from "../../../src/v03/bulk/semanticBatchTypes.js";


const validation:
  SemanticValidationResult = {
    status:
      "VALIDATED",
    issues:
      []
  };


function cameraDecision():
  AISemanticDecision {

  return {
    entity: {
      type:
        "CAMERA",
      subtype:
        "CAMERA",
      confidence:
        0.99,
      evidenceIds:
        [
          "ev_entity"
        ]
    },

    productName: {
      value:
        "Canon EOS R50",
      evidenceIds:
        [
          "ev_name"
        ],
      confidence:
        0.99
    },

    currentPrice: {
      value:
        15_990_000,
      currency:
        "VND",
      evidenceIds:
        [
          "ev_price"
        ],
      confidence:
        0.99
    },

    oldPrice:
      null,

    giftValues:
      [],

    savingValues:
      [],

    installmentAmounts:
      [],

    variants:
      [],

    condition:
      null,

    availableConditions:
      [],

    stock:
      null,

    rating:
      null,

    reviewCount:
      null,

    specs:
      [],

    conflicts:
      [],

    pageConfidence:
      0.98
  };
}


function report():
  SemanticBatchReport {

  const decision =
    cameraDecision();

  return {
    items: [
      {
        url:
          "https://example.test/camera",
        disposition:
          "CAMERA",
        path:
          "FAST",
        model:
          "gemini-3.5-flash-lite",
        decision,
        validation,
        reason:
          null,
        haltBatch:
          false,
        inputTokens:
          100,
        outputTokens:
          50,
        latencyMs:
          1_200
      },
      {
        url:
          "https://example.test/lens",
        disposition:
          "NON_CAMERA",
        path:
          "FAST",
        model:
          "gemini-3.5-flash-lite",
        decision:
          null,
        validation,
        reason:
          "validated non-camera",
        haltBatch:
          false,
        inputTokens:
          90,
        outputTokens:
          20,
        latencyMs:
          900
      },
      {
        url:
          "https://example.test/review",
        disposition:
          "REVIEW",
        path:
          "SLOW",
        model:
          "gemini-3.5-flash-lite",
        decision:
          null,
        validation: {
          status:
            "NEEDS_REVIEW",
          issues:
            []
        },
        reason:
          "LOW_GROUNDING_CONFIDENCE",
        haltBatch:
          false,
        inputTokens:
          110,
        outputTokens:
          40,
        latencyMs:
          2_000
      },
      {
        url:
          "https://example.test/pending",
        disposition:
          "AI_PENDING",
        path:
          "NONE",
        model:
          null,
        decision:
          null,
        validation:
          null,
        reason:
          "SKIPPED_AFTER_QUOTA_STOP",
        haltBatch:
          true,
        inputTokens:
          null,
        outputTokens:
          null,
        latencyMs:
          null
      },
      {
        url:
          "https://example.test/error",
        disposition:
          "ERROR",
        path:
          "NONE",
        model:
          null,
        decision:
          null,
        validation:
          null,
        reason:
          "CONTRACT_MISMATCH",
        haltBatch:
          false,
        inputTokens:
          null,
        outputTokens:
          null,
        latencyMs:
          null
      }
    ],

    summary: {
      inputUrls:
        5,
      uniqueUrls:
        5,
      attempted:
        4,
      camera:
        1,
      nonCamera:
        1,
      review:
        1,
      aiPending:
        1,
      errors:
        1,
      halted:
        true
    }
  };
}


let tempDirectories:
  string[] =
    [];


afterEach(
  async () => {

    await Promise.all(
      tempDirectories.map(
        directory =>
          rm(
            directory,
            {
              recursive:
                true,
              force:
                true
            }
          )
      )
    );

    tempDirectories =
      [];
  }
);


describe(
  "C9E semantic batch workbook",
  () => {

    test(
      "maps camera/excluded/review/pending/error rows and reopens with matching counts",
      async () => {

        const directory =
          await mkdtemp(
            join(
              tmpdir(),
              "c9e-workbook-"
            )
          );

        tempDirectories.push(
          directory
        );

        const outputPath =
          join(
            directory,
            "CameraIntelligence_Smart.xlsx"
          );


        await exportSemanticBatchWorkbook(
          outputPath,
          report()
        );


        const workbook =
          new ExcelJS.Workbook();

        await workbook.xlsx.readFile(
          outputPath
        );


        expect(
          workbook.getWorksheet(
            "Camera Data"
          )?.actualRowCount
        ).toBe(
          2
        );

        expect(
          workbook.getWorksheet(
            "Excluded"
          )?.actualRowCount
        ).toBe(
          2
        );

        expect(
          workbook.getWorksheet(
            "Review"
          )?.actualRowCount
        ).toBe(
          4
        );


        const reviewSheet =
          workbook.getWorksheet(
            "Review"
          )!;

        const reasons =
          [
            2,
            3,
            4
          ].map(
            row =>
              String(
                reviewSheet.getRow(
                  row
                ).getCell(
                  3
                ).value
              )
          );


        expect(
          reasons
        ).toEqual([
          "LOW_GROUNDING_CONFIDENCE",
          "SKIPPED_AFTER_QUOTA_STOP",
          "CONTRACT_MISMATCH"
        ]);


        expect(
          existsSync(
            outputPath +
            ".partial.xlsx"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "does not serialize processor-only api key, prompt or image payload fields",
      async () => {

        const directory =
          await mkdtemp(
            join(
              tmpdir(),
              "c9e-no-secret-"
            )
          );

        tempDirectories.push(
          directory
        );

        const outputPath =
          join(
            directory,
            "safe.xlsx"
          );

        const unsafe =
          report() as
            SemanticBatchReport & {
              apiKey:
                string;
              prompt:
                string;
              imageBase64:
                string;
            };

        unsafe.apiKey =
          "SECRET_API_KEY_SHOULD_NOT_APPEAR";

        unsafe.prompt =
          "RAW_PROMPT_SHOULD_NOT_APPEAR";

        unsafe.imageBase64 =
          "RAW_IMAGE_BASE64_SHOULD_NOT_APPEAR";


        await exportSemanticBatchWorkbook(
          outputPath,
          unsafe
        );


        const bytes =
          await readFile(
            outputPath
          );

        const raw =
          bytes.toString(
            "latin1"
          );


        expect(
          raw
        ).not.toContain(
          unsafe.apiKey
        );

        expect(
          raw
        ).not.toContain(
          unsafe.prompt
        );

        expect(
          raw
        ).not.toContain(
          unsafe.imageBase64
        );
      }
    );

  }
);
