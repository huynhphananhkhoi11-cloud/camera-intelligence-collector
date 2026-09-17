import ExcelJS from "exceljs";

import * as fs
  from "node:fs";

import * as path
  from "node:path";

import type {
  CameraDetailRecord,
  DetailCrawlResult
} from "../extraction/detailCrawler.js";

import type {
  CatalogSeed,
  CatalogCrawlResult
} from "../discovery/catalogCrawler.js";

function addMainSheet(
  workbook:
    ExcelJS.Workbook,
  rows:
    CameraDetailRecord[]
) {

  const sheet =
    workbook.addWorksheet(
      "Dữ liệu đối thủ"
    );

  sheet.columns = [
    {
      header: "Website",
      key: "website",
      width: 25
    },
    {
      header: "Tên sản phẩm",
      key: "productName",
      width: 46
    },
    {
      header: "Hình thức",
      key: "businessMode",
      width: 18
    },
    {
      header: "Thông số mô tả",
      key: "specs",
      width: 70
    },
    {
      header: "Giá thuê/ngày",
      key: "rentalPricePerDay",
      width: 18
    },
    {
      header: "Điều kiện thuê riêng",
      key: "rentalConditions",
      width: 42
    },
    {
      header: "Phụ kiện đi kèm",
      key: "includedAccessories",
      width: 42
    },
    {
      header: "Combo/gói đi kèm",
      key: "bundle",
      width: 35
    },
    {
      header: "Điểm đánh giá",
      key: "rating",
      width: 16
    },
    {
      header: "Số lượt đánh giá/review",
      key: "reviewCount",
      width: 25
    },
    {
      header: "Tồn kho",
      key: "stock",
      width: 20
    },
    {
      header: "Giá bán",
      key: "salePrice",
      width: 18
    },
    {
      header: "URL",
      key: "url",
      width: 75
    }
  ];

  for (
    const row of rows
  ) {
    sheet.addRow(row);
  }

  sheet.views = [
    {
      state: "frozen",
      ySplit: 1
    }
  ];

  sheet.autoFilter = {
    from: "A1",
    to: "M1"
  };

  sheet.getRow(1).font = {
    bold: true
  };

  sheet.getColumn(
    "rentalPricePerDay"
  ).numFmt =
    '#,##0';

  sheet.getColumn(
    "salePrice"
  ).numFmt =
    '#,##0';

  return sheet;
}

function addDispositionSheet(
  workbook:
    ExcelJS.Workbook,
  name: string,
  rows:
    CameraDetailRecord[]
) {

  const sheet =
    workbook.addWorksheet(
      name
    );

  sheet.columns = [
    {
      header: "Website",
      key: "website",
      width: 25
    },
    {
      header: "Tên sản phẩm",
      key: "productName",
      width: 50
    },
    {
      header: "Hình thức",
      key: "businessMode",
      width: 18
    },
    {
      header: "Lý do",
      key: "reason",
      width: 55
    },
    {
      header: "URL",
      key: "url",
      width: 80
    }
  ];

  rows.forEach(
    row =>
      sheet.addRow(row)
  );

  sheet.getRow(1).font = {
    bold: true
  };

  sheet.views = [
    {
      state: "frozen",
      ySplit: 1
    }
  ];

  sheet.autoFilter = {
    from: "A1",
    to: "E1"
  };
}

export async function exportCameraWorkbook(
  args: {
    filename: string;
    targetUrl: string;

    seeds:
      CatalogSeed[];

    catalog:
      CatalogCrawlResult;

    details:
      DetailCrawlResult;

    elapsedMs:
      number;
  }
): Promise<string> {

  fs.mkdirSync(
    path.dirname(
      args.filename
    ),
    {
      recursive: true
    }
  );

  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "Camera Intelligence Collector";

  workbook.created =
    new Date();

  /*
    ---------- MAIN ----------
  */

  addMainSheet(
    workbook,
    args.details.accepted
  );

  addDispositionSheet(
    workbook,
    "Không liên quan",
    args.details.excluded
  );

  addDispositionSheet(
    workbook,
    "Cần kiểm tra",
    args.details.review
  );

  /*
    ---------- EVIDENCE ----------
  */

  const evidence =
    workbook.addWorksheet(
      "Evidence"
    );

  evidence.columns = [
    {
      header: "URL",
      key: "url",
      width: 75
    },
    {
      header: "Field",
      key: "field",
      width: 25
    },
    {
      header: "Value",
      key: "value",
      width: 35
    },
    {
      header: "Source",
      key: "source",
      width: 15
    },
    {
      header: "Confidence",
      key: "confidence",
      width: 15
    },
    {
      header: "Evidence",
      key: "evidence",
      width: 75
    }
  ];

  for (
    const record of [
      ...args.details.accepted,
      ...args.details.excluded,
      ...args.details.review
    ]
  ) {

    for (
      const item of
      record.evidence
    ) {

      evidence.addRow({
        url:
          record.url,
        field:
          item.field,
        value:
          item.value,
        source:
          item.source,
        confidence:
          item.confidence,
        evidence:
          item.evidence
      });
    }
  }

  evidence.getRow(1).font = {
    bold: true
  };

  evidence.views = [
    {
      state: "frozen",
      ySplit: 1
    }
  ];

  /*
    ---------- VISUAL EVIDENCE ----------

    Reserved for the social/OCR stage.
  */

  const visual =
    workbook.addWorksheet(
      "Visual Evidence"
    );

  visual.columns = [
    {
      header: "URL",
      key: "url",
      width: 70
    },
    {
      header: "Image URL",
      key: "imageUrl",
      width: 70
    },
    {
      header: "Text",
      key: "text",
      width: 45
    },
    {
      header: "BBox",
      key: "bbox",
      width: 30
    },
    {
      header: "Confidence",
      key: "confidence",
      width: 15
    }
  ];

  visual.getRow(1).font = {
    bold: true
  };

  /*
    ---------- CONFLICTS ----------
  */

  const conflicts =
    workbook.addWorksheet(
      "Conflicts"
    );

  conflicts.columns = [
    {
      header: "URL",
      key: "url",
      width: 75
    },
    {
      header: "Field",
      key: "field",
      width: 25
    },
    {
      header: "Listing Value",
      key: "listingValue",
      width: 25
    },
    {
      header: "Detail Value",
      key: "detailValue",
      width: 25
    }
  ];

  args.details.conflicts
    .forEach(
      item =>
        conflicts.addRow(
          item
        )
    );

  conflicts.getRow(1).font = {
    bold: true
  };

  /*
    ---------- COVERAGE ----------
  */

  const coverage =
    workbook.addWorksheet(
      "Coverage"
    );

  coverage.columns = [
    {
      header: "Loại",
      key: "kind",
      width: 20
    },
    {
      header: "Intent",
      key: "intent",
      width: 18
    },
    {
      header: "Nhãn",
      key: "label",
      width: 35
    },
    {
      header: "URL",
      key: "url",
      width: 80
    }
  ];

  const rootUrls =
    new Set(
      args.seeds.map(
        seed =>
          seed.url
      )
    );

  for (
    const seed
    of args.seeds
  ) {

    coverage.addRow({
      kind:
        "ROOT",
      intent:
        seed.intent,
      label:
        seed.label,
      url:
        seed.url
    });
  }

  for (
    const url of
    args.catalog
      .visitedCatalogs
  ) {

    if (
      rootUrls.has(url)
    ) {
      continue;
    }

    coverage.addRow({
      kind:
        "CATALOG_PAGE",
      intent:
        "",
      label:
        "",
      url
    });
  }

  for (
    const url of
    args.catalog
      .failedCatalogs
  ) {

    coverage.addRow({
      kind:
        "FAILED_PAGE",
      intent:
        "",
      label:
        "",
      url
    });
  }

  coverage.getRow(1).font = {
    bold: true
  };

  coverage.views = [
    {
      state: "frozen",
      ySplit: 1
    }
  ];

  /*
    ---------- AUDIT ----------
  */

  const audit =
    workbook.addWorksheet(
      "Audit"
    );

  audit.columns = [
    {
      header: "Metric",
      key: "metric",
      width: 36
    },
    {
      header: "Value",
      key: "value",
      width: 55
    }
  ];

  const catalogComplete =
    args.catalog
      .queueRemaining === 0 &&
    args.catalog
      .skippedBySafetyLimit === 0 &&
    args.catalog
      .failedCatalogs.length === 0;

  const detailComplete =
    args.details.checked ===
    args.catalog.products.length;

  const rows = [
    [
      "Target",
      "CAMERA"
    ],
    [
      "Start URL",
      args.targetUrl
    ],
    [
      "Catalog roots",
      args.seeds.length
    ],
    [
      "Catalog pages visited",
      args.catalog
        .visitedCatalogs
        .length
    ],
    [
      "Catalog queue remaining",
      args.catalog
        .queueRemaining
    ],
    [
      "Catalog URLs skipped by safety limit",
      args.catalog
        .skippedBySafetyLimit
    ],
    [
      "Failed catalog pages",
      args.catalog
        .failedCatalogs
        .length
    ],
    [
      "Product candidates",
      args.catalog
        .products
        .length
    ],
    [
      "Product details checked",
      args.details
        .checked
    ],
    [
      "Accepted",
      args.details
        .accepted
        .length
    ],
    [
      "Excluded",
      args.details
        .excluded
        .length
    ],
    [
      "Review",
      args.details
        .review
        .length
    ],
    [
      "Detail errors",
      args.details
        .errors
    ],
    [
      "Price conflicts",
      args.details
        .conflicts
        .length
    ],
    [
      "Catalog coverage",
      catalogComplete
        ? "PASS"
        : "NOT COMPLETE"
    ],
    [
      "Detail coverage",
      detailComplete
        ? "PASS"
        : "NOT COMPLETE"
    ],
    [
      "Overall completeness",
      catalogComplete &&
      detailComplete
        ? "PASS"
        : "NOT COMPLETE"
    ],
    [
      "Elapsed seconds",
      Math.round(
        args.elapsedMs /
        1000
      )
    ]
  ];

  for (
    const [
      metric,
      value
    ] of rows
  ) {

    audit.addRow({
      metric,
      value
    });
  }

  audit.getRow(1).font = {
    bold: true
  };

  /*
    ---------- LOG ----------
  */

  const log =
    workbook.addWorksheet(
      "Log"
    );

  log.columns = [
    {
      header: "Time",
      key: "time",
      width: 28
    },
    {
      header: "Level",
      key: "level",
      width: 12
    },
    {
      header: "Message",
      key: "message",
      width: 80
    }
  ];

  log.addRow({
    time:
      new Date()
        .toISOString(),
    level:
      "INFO",
    message:
      "Collection completed"
  });

  log.getRow(1).font = {
    bold: true
  };

  await workbook.xlsx
    .writeFile(
      args.filename
    );

  return args.filename;
}
