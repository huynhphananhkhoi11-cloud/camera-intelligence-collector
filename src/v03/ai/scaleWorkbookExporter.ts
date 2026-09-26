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

  readonly provider:
    string;

  readonly discovered:
    number;

  readonly clearNonCameraSkipped:
    number;

  readonly clearNonProductSkipped:
    number;

  readonly deterministicNonCameraSkipped:
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


function website(
  url:
    string
): string {

  try {
    return new URL(
      url
    ).hostname.replace(
      /^www\./u,
      ""
    );
  }
  catch {
    return "";
  }
}


function cleanProductName(
  value:
    string
): string {

  let output =
    value.trim();


  output =
    output.replace(
      /\s*\|\s*(?:chính\s*hãng|hang\s*moi|hàng\s*mới|hang\s*cu|hàng\s*cũ|used|like\s*new|likenew|refurbished).*$/iu,
      ""
    );


  output =
    output.replace(
      /\s*\((?=[^)]*(?:body|kit|bundle|combo|black|white|hàng|hang|chính\s*hãng|like\s*new|likenew|used|new|lens|kèm|kem))[^)]*\)\s*$/iu,
      ""
    );


  output =
    output.replace(
      /\s*[-–—]\s*(?:like\s*new|likenew|used|hàng\s*cũ|hang\s*cu|hàng\s*mới|hang\s*moi|refurbished).*$/iu,
      ""
    );


  output =
    output.replace(
      /^(?:máy\s*ảnh|may\s*anh|camera)\s+/iu,
      ""
    );


  return output.trim();
}


function conditionLabel(
  value:
    AISemanticDecision["condition"]
): string {

  switch (
    value?.value
  ) {
    case "NEW":
      return "Hàng mới";

    case "USED":
      return "Hàng cũ";

    case "REFURBISHED":
      return "Hàng tân trang";

    default:
      return "";
  }
}


function stockLabel(
  value:
    AISemanticDecision["stock"]
): string {

  if (
    value ===
      null
  ) {
    return "";
  }


  const label =
    {
      IN_STOCK:
        "Còn hàng",
      OUT_OF_STOCK:
        "Hết hàng",
      PREORDER:
        "Đặt trước",
      BACKORDER:
        "Chờ nhập hàng",
      LIMITED:
        "Số lượng hạn chế",
      UNKNOWN:
        ""
    }[
      value.state
    ];


  if (
    value.quantity ===
      null
  ) {
    return label;
  }


  return [
    label,
    String(
      value.quantity
    )
  ]
    .filter(
      Boolean
    )
    .join(
      " | "
    );
}


const BUSINESS_SPEC_KEYS =
  new Set([
    "RENTAL_PRICE_PER_DAY",
    "RENTAL_TERMS",
    "ACCESSORIES_INCLUDED",
    "BUNDLE_INCLUDED"
  ]);


function businessSpec(
  decision:
    AISemanticDecision,
  key:
    string
): string {

  return decision.specs
    .filter(
      spec =>
        spec.key
          .trim()
          .toUpperCase() ===
        key
    )
    .map(
      spec =>
        spec.value.trim()
    )
    .filter(
      (
        value,
        index,
        values
      ) =>
        value.length >
          0 &&
        values.indexOf(
          value
        ) ===
          index
    )
    .join(
      " | "
    );
}


function specSummary(
  decision:
    AISemanticDecision
): string {

  return decision.specs
    .filter(
      spec =>
        !BUSINESS_SPEC_KEYS.has(
          spec.key
            .trim()
            .toUpperCase()
        )
    )
    .map(
      spec =>
        spec.key +
        ": " +
        spec.value
    )
    .join(
      "; "
    );
}


function selectedCombo(
  decision:
    AISemanticDecision
): string {

  const values =
    [
      ...decision.variants
        .filter(
          variant =>
            variant.selected &&
            /(?:kit|bundle|combo|kèm|kem|lens)/iu.test(
              variant.label
            )
        )
        .map(
          variant =>
            variant.label
        ),
      businessSpec(
        decision,
        "BUNDLE_INCLUDED"
      )
    ]
      .map(
        value =>
          value.trim()
      )
      .filter(
        (
          value,
          index,
          all
        ) =>
          value.length >
            0 &&
          all.indexOf(
            value
          ) ===
            index
      );


  return values.join(
    " | "
  );
}


function salePrice(
  decision:
    AISemanticDecision
): string {

  const candidates =
    [
      decision.currentPrice,
      ...decision.variants.map(
        variant =>
          variant.price
      )
    ]
      .filter(
        (
          item
        ): item is
          NonNullable<
            typeof item
          > =>
            item !==
              null
      );


  if (
    candidates.length ===
      0
  ) {
    return "";
  }


  const currencies =
    new Set(
      candidates.map(
        item =>
          item.currency ??
          ""
      )
    );


  if (
    currencies.size >
      1
  ) {
    return candidates
      .map(
        item =>
          money(
            item.value,
            item.currency
          )
      )
      .filter(
        (
          value,
          index,
          values
        ) =>
          values.indexOf(
            value
          ) ===
            index
      )
      .join(
        " | "
      );
  }


  const values =
    [
      ...new Set(
        candidates.map(
          item =>
            item.value
        )
      )
    ].sort(
      (
        left,
        right
      ) =>
        left -
        right
    );


  const currency =
    candidates[0]
      ?.currency ??
    null;


  if (
    values.length ===
      1
  ) {
    return money(
      values[0],
      currency
    );
  }


  return (
    new Intl.NumberFormat(
      "vi-VN",
      {
        maximumFractionDigits:
          0
      }
    ).format(
      values[0]!
    ) +
    " - " +
    new Intl.NumberFormat(
      "vi-VN",
      {
        maximumFractionDigits:
          0
      }
    ).format(
      values[
        values.length -
        1
      ]!
    ) +
    (
      currency
        ? " " +
          currency
        : ""
    )
  );
}


function decisionEvidenceIds(
  decision:
    AISemanticDecision
): string {

  const ids =
    new Set<string>([
      ...decision.entity.evidenceIds,
      ...decision.productName.evidenceIds,
      ...(
        decision.currentPrice
          ?.evidenceIds ??
        []
      ),
      ...(
        decision.oldPrice
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
      ),
      ...(
        decision.rating
          ?.evidenceIds ??
        []
      ),
      ...(
        decision.reviewCount
          ?.evidenceIds ??
        []
      ),
      ...decision.variants.flatMap(
        variant =>
          [
            ...variant.evidenceIds,
            ...(
              variant.price
                ?.evidenceIds ??
              []
            ),
            ...(
              variant.priceDelta
                ?.evidenceIds ??
              []
            )
          ]
      ),
      ...decision.specs.flatMap(
        spec =>
          spec.evidenceIds
      )
    ]);


  return [
    ...ids
  ].join(
    " | "
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


  /*
   * Human-facing main sheet: keep exactly the business columns requested by
   * the user. Technical model/evidence metadata belongs in Decision Audit.
   *
   * Unsupported fields are intentionally blank rather than inferred.
   */
  cameraSheet.columns = [
    {
      header:
        "Website",
      key:
        "website",
      width:
        24
    },
    {
      header:
        "Tên sản phẩm",
      key:
        "productName",
      width:
        38
    },
    {
      header:
        "Hàng cũ/Hàng mới",
      key:
        "condition",
      width:
        20
    },
    {
      header:
        "Thông số mô tả",
      key:
        "specs",
      width:
        54
    },
    {
      header:
        "Giá thuê/ngày",
      key:
        "rentalPrice",
      width:
        22
    },
    {
      header:
        "Điều kiện thuê riêng",
      key:
        "rentalTerms",
      width:
        34
    },
    {
      header:
        "Phụ kiện đi kèm",
      key:
        "accessories",
      width:
        34
    },
    {
      header:
        "Combo/gói đi kèm",
      key:
        "combo",
      width:
        34
    },
    {
      header:
        "Điểm đánh giá",
      key:
        "rating",
      width:
        16
    },
    {
      header:
        "Số lượt đánh giá/review",
      key:
        "reviewCount",
      width:
        24
    },
    {
      header:
        "Tồn kho",
      key:
        "stock",
      width:
        22
    },
    {
      header:
        "Giá bán",
      key:
        "salePrice",
      width:
        28
    },
    {
      header:
        "URL",
      key:
        "url",
      width:
        62
    }
  ];


  for (
    const row
    of cameras
  ) {

    const decision =
      row.decision;


    cameraSheet.addRow({
      website:
        website(
          row.url
        ),

      productName:
        cleanProductName(
          decision.productName.value
        ),

      condition:
        conditionLabel(
          decision.condition
        ),

      specs:
        specSummary(
          decision
        ),

      /*
       * FAST/SLOW may encode directly grounded business facts using reserved
       * spec keys. Missing evidence stays blank; nothing is inferred.
       */
      rentalPrice:
        businessSpec(
          decision,
          "RENTAL_PRICE_PER_DAY"
        ),

      rentalTerms:
        businessSpec(
          decision,
          "RENTAL_TERMS"
        ),

      accessories:
        businessSpec(
          decision,
          "ACCESSORIES_INCLUDED"
        ),

      combo:
        selectedCombo(
          decision
        ),

      rating:
        decision.rating
          ?.value ??
        "",

      reviewCount:
        decision.reviewCount
          ?.value ??
        "",

      stock:
        stockLabel(
          decision.stock
        ),

      salePrice:
        salePrice(
          decision
        ),

      url:
        row.url
    });
  }


  const decisionAuditSheet =
    workbook.addWorksheet(
      "Decision Audit"
    );


  decisionAuditSheet.columns = [
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
        "Model",
      key:
        "model",
      width:
        32
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
        "Validation status",
      key:
        "validationStatus",
      width:
        22
    },
    {
      header:
        "Validation issues",
      key:
        "validationIssues",
      width:
        72
    },
    {
      header:
        "Evidence IDs",
      key:
        "evidenceIds",
      width:
        72
    }
  ];


  for (
    const row
    of cameras
  ) {
    decisionAuditSheet.addRow({
      url:
        row.url,

      model:
        row.model,

      confidence:
        row.decision.pageConfidence,

      validationStatus:
        row.validation.status,

      validationIssues:
        row.validation.issues
          .map(
            issue =>
              issue.code +
              (
                issue.field
                  ? " [" +
                    issue.field +
                    "]"
                  : ""
              ) +
              ": " +
              issue.message
          )
          .join(
            " | "
          ),

      evidenceIds:
        decisionEvidenceIds(
          row.decision
        )
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
   * and row counts match every output bucket.
   */
  const verification =
    new ExcelJS.Workbook();


  await verification.xlsx.readFile(
    partial
  );


  function dataRows(
    sheetName:
      string
  ): number {

    return Math.max(
      0,
      (
        verification.getWorksheet(
          sheetName
        )
          ?.actualRowCount ??
        1
      ) -
      1
    );
  }


  if (
    dataRows(
      "Camera Data"
    ) !==
      cameras.length ||
    dataRows(
      "Decision Audit"
    ) !==
      cameras.length ||
    dataRows(
      "Review"
    ) !==
      reviews.length ||
    dataRows(
      "Excluded"
    ) !==
      excluded.length
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
