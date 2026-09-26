import ExcelJS from "exceljs";

import {
  mkdir
} from "node:fs/promises";

import {
  dirname
} from "node:path";

import type {
  HumanReadResult
} from "./humanLikeReader.js";


function formatMoney(
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


  const formatted =
    new Intl.NumberFormat(
      "vi-VN",
      {
        maximumFractionDigits:
          0
      }
    ).format(
      value
    );


  return currency
    ? formatted +
      " " +
      currency
    : formatted;
}


export async function exportHumanReadWorkbook(
  outputPath:
    string,
  result:
    HumanReadResult
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


  const workbook =
    new ExcelJS.Workbook();


  workbook.creator =
    "camera-intelligence-human-reader";


  const main =
    workbook.addWorksheet(
      "AI Product"
    );


  main.columns = [
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
        "Subtype",
      key:
        "subtype",
      width:
        22
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
        "Validation",
      key:
        "validation",
      width:
        24
    },
    {
      header:
        "AI model",
      key:
        "model",
      width:
        32
    }
  ];


  const decision =
    result.decision;


  main.addRow({
    url:
      result.finalUrl ??
      result.url,

    productName:
      decision?.productName.value ??
      "",

    entity:
      decision?.entity.type ??
      "",

    subtype:
      decision?.entity.subtype ??
      "",

    condition:
      decision?.condition?.value ??
      "",

    currentPrice:
      decision?.currentPrice
        ? formatMoney(
            decision.currentPrice.value,
            decision.currentPrice.currency
          )
        : "",

    oldPrice:
      decision?.oldPrice
        ? formatMoney(
            decision.oldPrice.value,
            decision.oldPrice.currency
          )
        : "",

    stock:
      decision?.stock
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
      decision?.rating?.value ??
      "",

    reviewCount:
      decision?.reviewCount?.value ??
      "",

    confidence:
      decision?.pageConfidence ??
      "",

    validation:
      result.validation.status,

    model:
      result.model ??
      ""
  });


  const evidence =
    workbook.addWorksheet(
      "Evidence"
    );


  evidence.columns = [
    {
      header:
        "Evidence ID",
      key:
        "id",
      width:
        16
    },
    {
      header:
        "Field hint",
      key:
        "fieldHint",
      width:
        22
    },
    {
      header:
        "Raw value",
      key:
        "rawValue",
      width:
        70
    },
    {
      header:
        "Source kind",
      key:
        "sourceKind",
      width:
        16
    },
    {
      header:
        "Locator",
      key:
        "locator",
      width:
        44
    },
    {
      header:
        "Context",
      key:
        "context",
      width:
        48
    },
    {
      header:
        "Ownership hint",
      key:
        "ownershipHint",
      width:
        20
    }
  ];


  for (
    const item
    of result.packet
      ?.allEvidence ??
      []
  ) {
    evidence.addRow({
      id:
        item.id,

      fieldHint:
        item.fieldHint,

      rawValue:
        item.rawValue,

      sourceKind:
        item.sourceKind,

      locator:
        item.locator ??
        "",

      context:
        item.context ??
        "",

      ownershipHint:
        item.ownershipHint ??
        ""
    });
  }


  const audit =
    workbook.addWorksheet(
      "AI Audit"
    );


  audit.columns = [
    {
      header:
        "Item",
      key:
        "item",
      width:
        30
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


  audit.addRow({
    item:
      "Validation status",
    value:
      result.validation.status
  });


  audit.addRow({
    item:
      "Validation issues",
    value:
      result.validation.issues
        .map(
          issue =>
            issue.code +
            ": " +
            issue.message
        )
        .join(
          " | "
        )
  });


  audit.addRow({
    item:
      "Conflicts",
    value:
      decision?.conflicts.join(
        " | "
      ) ??
      ""
  });


  audit.addRow({
    item:
      "Primary region text",
    value:
      result.packet
        ?.primaryRegionText ??
      ""
  });


  audit.addRow({
    item:
      "Runtime total ms",
    value:
      result.runtime
        ?.totalDurationMs ??
      ""
  });


  audit.addRow({
    item:
      "Free RAM before",
    value:
      result.runtime
        ?.freeRamBeforeBytes ??
      ""
  });


  audit.addRow({
    item:
      "Free RAM after",
    value:
      result.runtime
        ?.freeRamAfterBytes ??
      ""
  });


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
    outputPath
  );
}
