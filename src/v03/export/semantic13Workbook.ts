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
  SemanticDecisionValidationResult,
  SemanticMoney
} from "../ai/semanticDecisionSchema.js";

export interface SemanticWorkbookOptions {
  readonly runId?: string;
}

function money(
  value:
    | SemanticMoney
    | null
): string {
  if (value === null) {
    return "";
  }

  return (
    new Intl.NumberFormat(
      "vi-VN",
      {
        maximumFractionDigits: 0
      }
    ).format(
      value.value
    ) +
    " " +
    value.currency
  );
}

function condition(
  value:
    "NEW" |
    "USED" |
    null
): string {
  if (value === "NEW") {
    return "Hàng mới";
  }

  if (value === "USED") {
    return "Hàng cũ";
  }

  return "";
}

function joined(
  value:
    readonly string[] |
    null,
  separator:
    string =
      " | "
): string {
  return value
    ? value.join(
        separator
      )
    : "";
}

export async function exportSemantic13WorkbookAtomic(
  outputPath:
    string,
  validations:
    readonly SemanticDecisionValidationResult[],
  options:
    SemanticWorkbookOptions =
      {}
): Promise<void> {
  await mkdir(
    dirname(
      outputPath
    ),
    {
      recursive: true
    }
  );

  const partial =
    outputPath +
    ".partial.xlsx";

  await rm(
    partial,
    {
      force: true
    }
  );

  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "camera-intelligence-ai-semantics";

  const cameraSheet =
    workbook.addWorksheet(
      "Camera Data"
    );

  cameraSheet.columns = [
    {
      header: "Website",
      key: "website",
      width: 24
    },
    {
      header: "Tên sản phẩm",
      key: "productName",
      width: 38
    },
    {
      header: "Hàng cũ/Hàng mới",
      key: "condition",
      width: 20
    },
    {
      header: "Thông số mô tả",
      key: "specs",
      width: 54
    },
    {
      header: "Giá thuê/ngày",
      key: "rentalPrice",
      width: 22
    },
    {
      header: "Điều kiện thuê riêng",
      key: "rentalTerms",
      width: 34
    },
    {
      header: "Phụ kiện đi kèm",
      key: "accessories",
      width: 34
    },
    {
      header: "Combo/gói đi kèm",
      key: "bundle",
      width: 34
    },
    {
      header: "Điểm đánh giá",
      key: "rating",
      width: 16
    },
    {
      header:
        "Số lượt đánh giá/review",
      key: "reviewCount",
      width: 24
    },
    {
      header: "Tồn kho",
      key: "stock",
      width: 22
    },
    {
      header: "Giá bán",
      key: "salePrice",
      width: 28
    },
    {
      header: "URL",
      key: "url",
      width: 62
    }
  ];

  for (
    const validation
    of validations
  ) {
    if (
      validation.status !==
        "VALIDATED" ||
      validation.value ===
        null
    ) {
      continue;
    }

    const row =
      validation.value;

    cameraSheet.addRow({
      website:
        row.website,
      productName:
        row.productName ?? "",
      condition:
        condition(
          row.condition
        ),
      specs:
        joined(
          row.specs,
          "; "
        ),
      rentalPrice:
        money(
          row.rentalPricePerDay
        ),
      rentalTerms:
        row.rentalTerms ?? "",
      accessories:
        joined(
          row.accessoriesIncluded
        ),
      bundle:
        joined(
          row.bundleIncluded
        ),
      rating:
        row.rating ?? "",
      reviewCount:
        row.reviewCount ?? "",
      stock:
        row.stock ?? "",
      salePrice:
        money(
          row.salePrice
        ),
      url:
        row.url
    });
  }

  const decisionSheet =
    workbook.addWorksheet(
      "Decision Audit"
    );

  decisionSheet.columns = [
    {
      header: "Classification",
      key: "classification",
      width: 22
    },
    {
      header: "Status",
      key: "status",
      width: 18
    },
    {
      header: "URL",
      key: "url",
      width: 62
    },
    {
      header: "Review reason",
      key: "reason",
      width: 72
    },
    {
      header: "Issues",
      key: "issues",
      width: 72
    },
    {
      header: "Evidence JSON",
      key: "evidence",
      width: 100
    }
  ];

  for (
    const validation
    of validations
  ) {
    decisionSheet.addRow({
      classification:
        validation
          .decision
          .classification,
      status:
        validation.status,
      url:
        validation.value?.url ??
        "",
      reason:
        validation
          .decision
          .reviewReason ??
        "",
      issues:
        validation.issues
          .map(
            issue =>
              issue.code +
              ": " +
              issue.message
          )
          .join(
            " | "
          ),
      evidence:
        JSON.stringify(
          validation
            .decision
            .evidence
        )
    });
  }

  const reviewSheet =
    workbook.addWorksheet(
      "Review"
    );

  reviewSheet.columns = [
    {
      header: "Classification",
      key: "classification",
      width: 22
    },
    {
      header: "Reason",
      key: "reason",
      width: 90
    }
  ];

  for (
    const validation
    of validations
  ) {
    if (
      validation.status ===
        "REVIEW" &&
      validation
        .decision
        .classification !==
        "NON_CAMERA"
    ) {
      reviewSheet.addRow({
        classification:
          validation
            .decision
            .classification,
        reason:
          validation
            .decision
            .reviewReason ??
          validation.issues
            .map(
              issue =>
                issue.message
            )
            .join(
              " | "
            )
      });
    }
  }

  const auditSheet =
    workbook.addWorksheet(
      "Run Audit"
    );

  auditSheet.columns = [
    {
      header: "Metric",
      key: "metric",
      width: 36
    },
    {
      header: "Value",
      key: "value",
      width: 90
    }
  ];

  auditSheet.addRow({
    metric: "runId",
    value:
      options.runId ??
      ""
  });

  auditSheet.addRow({
    metric: "semanticDecisions",
    value:
      String(
        validations.length
      )
  });

  for (
    const sheet
    of workbook.worksheets
  ) {
    sheet.getRow(1).font = {
      bold: true
    };

    sheet.views = [
      {
        state: "frozen",
        ySplit: 1
      }
    ];
  }

  await workbook.xlsx.writeFile(
    partial
  );

  const verification =
    new ExcelJS.Workbook();

  await verification.xlsx.readFile(
    partial
  );

  const expectedCameraRows =
    validations.filter(
      validation =>
        validation.status ===
          "VALIDATED" &&
        validation.value !==
          null
    ).length;

  const actualCameraRows =
    Math.max(
      0,
      (
        verification
          .getWorksheet(
            "Camera Data"
          )
          ?.actualRowCount ??
        1
      ) -
      1
    );

  if (
    actualCameraRows !==
      expectedCameraRows
  ) {
    throw new Error(
      "Semantic workbook verification failed before finalization."
    );
  }

  await rm(
    outputPath,
    {
      force: true
    }
  );

  await rename(
    partial,
    outputPath
  );
}
