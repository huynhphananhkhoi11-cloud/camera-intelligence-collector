import ExcelJS from "exceljs";

import {
  mkdir,
  rename,
  rm
} from "node:fs/promises";

import {
  dirname
} from "node:path";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "./semanticContracts.js";


export interface ScaleCameraRow {
  readonly url:
    string;

  readonly model:
    string;

  readonly decision:
    AISemanticDecision;

  readonly validation:
    SemanticValidationResult;
}


export interface ScaleReviewRow {
  readonly url:
    string;

  readonly model:
    string |
    null;

  readonly status:
    string;

  readonly reason:
    string;
}


export interface ScaleExcludedRow {
  readonly url:
    string;

  readonly reason:
    string;
}


export interface ScaleRunSummary {
  readonly rootUrl:
    string;

  readonly discovered:
    number;

  readonly clearNonCameraSkipped:
    number;

  readonly attemptedDetail:
    number;

  readonly qualifiedProductPages:
    number;

  readonly validatedCameras:
    number;

  readonly validatedNonCameras:
    number;

  readonly review:
    number;

  readonly errors:
    number;

  readonly model:
    string;
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
    return "";
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


export async function exportScaleWorkbookAtomic(
  outputPath:
    string,
  cameras:
    readonly ScaleCameraRow[],
  reviews:
    readonly ScaleReviewRow[],
  excluded:
    readonly ScaleExcludedRow[],
  summary:
    ScaleRunSummary
): Promise<void> {

  await mkdir(
    dirname(
      outputPath
    ),
    {
      recursive:
        true
    }
  );


  const partial =
    outputPath +
    ".partial.xlsx";


  await rm(
    partial,
    {
      force:
        true
    }
  );


  const workbook =
    new ExcelJS.Workbook();


  workbook.creator =
    "camera-intelligence-ai-scale";


  const cameraSheet =
    workbook.addWorksheet(
      "Camera Data"
    );


  cameraSheet.columns = [
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
        "productName",
      width:
        42
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
        "Rating",
      key:
        "rating",
      width:
        12
    },
    {
      header:
        "Review count",
      key:
        "reviewCount",
      width:
        16
    },
    {
      header:
        "AI confidence",
      key:
        "confidence",
      width:
        16
    },
    {
      header:
        "Evidence IDs",
      key:
        "evidenceIds",
      width:
        55
    },
    {
      header:
        "Model",
      key:
        "model",
      width:
        32
    }
  ];


  for (
    const row
    of cameras
  ) {

    const decision =
      row.decision;


    const evidenceIds =
      new Set<
        string
      >([
        ...decision.entity.evidenceIds,
        ...decision.productName.evidenceIds,
        ...(
          decision.currentPrice
            ?.evidenceIds ??
          []
        ),
        ...(
          decision.condition
            ?.evidenceIds ??
          []
        ),
        ...(
          decision.stock
            ?.evidenceIds ??
          []
        )
      ]);


    cameraSheet.addRow({
      url:
        row.url,

      productName:
        decision.productName.value,

      condition:
        decision.condition
          ?.value ??
        "",

      currentPrice:
        decision.currentPrice
          ? money(
              decision.currentPrice.value,
              decision.currentPrice.currency
            )
          : "",

      oldPrice:
        decision.oldPrice
          ? money(
              decision.oldPrice.value,
              decision.oldPrice.currency
            )
          : "",

      stock:
        decision.stock
          ? [
              decision.stock.state,
              decision.stock.quantity ===
                null
                ? ""
                : String(
                    decision.stock.quantity
                  )
            ]
              .filter(
                Boolean
              )
              .join(
                " | "
              )
          : "",

      rating:
        decision.rating?.value ??
        "",

      reviewCount:
        decision.reviewCount?.value ??
        "",

      confidence:
        decision.pageConfidence,

      evidenceIds:
        [
          ...evidenceIds
        ].join(
          " | "
        ),

      model:
        row.model
    });
  }


  const reviewSheet =
    workbook.addWorksheet(
      "Review"
    );


  reviewSheet.columns = [
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
        "Status",
      key:
        "status",
      width:
        24
    },
    {
      header:
        "Reason",
      key:
        "reason",
      width:
        90
    },
    {
      header:
        "Model",
      key:
        "model",
      width:
        32
    }
  ];


  for (
    const row
    of reviews
  ) {
    reviewSheet.addRow(
      row
    );
  }


  const excludedSheet =
    workbook.addWorksheet(
      "Excluded"
    );


  excludedSheet.columns = [
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
        "Reason",
      key:
        "reason",
      width:
        90
    }
  ];


  for (
    const row
    of excluded
  ) {
    excludedSheet.addRow(
      row
    );
  }


  const auditSheet =
    workbook.addWorksheet(
      "Run Audit"
    );


  auditSheet.columns = [
    {
      header:
        "Metric",
      key:
        "metric",
      width:
        36
    },
    {
      header:
        "Value",
      key:
        "value",
      width:
        90
    }
  ];


  for (
    const [
      metric,
      value
    ]
    of Object.entries(
      summary
    )
  ) {
    auditSheet.addRow({
      metric,
      value:
        String(
          value
        )
    });
  }


  for (
    const sheet
    of workbook.worksheets
  ) {
    sheet.getRow(
      1
    ).font = {
      bold:
        true
    };


    sheet.views = [
      {
        state:
          "frozen",
        ySplit:
          1
      }
    ];
  }


  await workbook.xlsx.writeFile(
    partial
  );


  /*
   * Verification before finalization.
   * Re-open the workbook and make sure the durable result is readable
   * and row counts match the in-memory final records.
   */
  const verification =
    new ExcelJS.Workbook();


  await verification.xlsx.readFile(
    partial
  );


  const verifiedCameraRows =
    Math.max(
      0,
      (
        verification.getWorksheet(
          "Camera Data"
        )
          ?.actualRowCount ??
        1
      ) -
      1
    );


  const verifiedReviewRows =
    Math.max(
      0,
      (
        verification.getWorksheet(
          "Review"
        )
          ?.actualRowCount ??
        1
      ) -
      1
    );


  if (
    verifiedCameraRows !==
      cameras.length ||
    verifiedReviewRows !==
      reviews.length
  ) {
    throw new Error(
      "Final workbook verification failed before cleanup."
    );
  }


  await rm(
    outputPath,
    {
      force:
        true
    }
  );


  await rename(
    partial,
    outputPath
  );
}
