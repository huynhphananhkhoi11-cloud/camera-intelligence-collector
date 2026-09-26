import ExcelJS from "exceljs";

import {
  mkdir
} from "node:fs/promises";

import {
  dirname
} from "node:path";

import type {
  PipelineResult
} from "../pipeline/productPipeline.js";

import type {
  CoverageReport
} from "../coverage/coverageEngine.js";

import type {
  RunErrorRow,
  RunReconciliationReport
} from "../coverage/runReconciliation.js";

import {
  buildAllEvidenceRows
} from "../evidence/evidenceStore.js";

import {
  detectAllConflicts
} from "../conflicts/conflictEngine.js";


export interface AuditRow {
  timestamp: string;
  url: string;

  stage: string;

  status:
    | "OK"
    | "ERROR"
    | "INFO";

  message: string;
}


export interface ExportBundle {
  runId:
    string;

  results:
    PipelineResult[];

  coverage:
    CoverageReport;

  reconciliation:
    RunReconciliationReport;

  errors:
    RunErrorRow[];

  audit:
    AuditRow[];
}


const MAIN_HEADERS = [
  "Website",
  "T\u00ean s\u1ea3n ph\u1ea9m",
  "H\u00ecnh th\u1ee9c",
  "Th\u00f4ng s\u1ed1 m\u00f4 t\u1ea3",
  "Gi\u00e1 thu\u00ea/ng\u00e0y",
  "\u0110i\u1ec1u ki\u1ec7n thu\u00ea ri\u00eang",
  "Ph\u1ee5 ki\u1ec7n \u0111i k\u00e8m",
  "Combo/g\u00f3i \u0111i k\u00e8m",
  "\u0110i\u1ec3m \u0111\u00e1nh gi\u00e1",
  "S\u1ed1 l\u01b0\u1ee3t \u0111\u00e1nh gi\u00e1/review",
  "T\u1ed3n kho",
  "Gi\u00e1 b\u00e1n",
  "URL"
] as const;


function setMainColumns(
  sheet: ExcelJS.Worksheet
): void {

  const widths = [
    24,
    42,
    20,
    55,
    18,
    55,
    42,
    42,
    16,
    23,
    18,
    18,
    55
  ];

  MAIN_HEADERS.forEach(
    (header, index) => {

      const column =
        sheet.getColumn(
          index + 1
        );

      column.header =
        header;

      column.width =
        widths[index];
    }
  );
}


function styleSheet(
  sheet: ExcelJS.Worksheet
): void {

  sheet.views = [
    {
      state:
        "frozen",

      ySplit:
        1
    }
  ];

  const header =
    sheet.getRow(1);

  header.font = {
    bold:
      true,

    color: {
      argb:
        "FFFFFFFF"
    }
  };

  header.fill = {
    type:
      "pattern",

    pattern:
      "solid",

    fgColor: {
      argb:
        "FF1F4E78"
    }
  };

  header.alignment = {
    vertical:
      "middle",

    horizontal:
      "center",

    wrapText:
      true
  };

  header.height =
    28;

  sheet.eachRow(
    (
      row,
      rowNumber
    ) => {

      if (
        rowNumber === 1
      ) {
        return;
      }

      row.alignment = {
        vertical:
          "top",

        wrapText:
          true
      };
    }
  );

  sheet.autoFilter = {
    from: {
      row: 1,
      column: 1
    },

    to: {
      row: 1,
      column:
        sheet.columnCount
    }
  };
}


function mainRow(
  result: PipelineResult
): unknown[] {

  const row =
    result.row;

  return [
    row.website,
    row.productName,
    row.form,
    row.specs,
    row.rentalPrice,
    row.rentalConditions,
    row.accessories,
    row.combo,
    row.rating,
    row.reviewCount,
    row.stock,
    row.salePrice,
    row.url
  ];
}


function addResultSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  results: PipelineResult[],
  includeReasons:
    boolean
): ExcelJS.Worksheet {

  const sheet =
    workbook.addWorksheet(
      name
    );

  setMainColumns(
    sheet
  );

  if (
    includeReasons
  ) {

    sheet.getColumn(14).header =
      "Decision";

    sheet.getColumn(14).width =
      14;

    sheet.getColumn(15).header =
      "Reasons";

    sheet.getColumn(15).width =
      55;
  }


  for (
    const result
    of results
  ) {

    const values =
      mainRow(result);

    if (
      includeReasons
    ) {

      values.push(
        result.validation.decision,
        result.validation.reasons.join(
          " | "
        )
      );
    }

    sheet.addRow(
      values
    );
  }

  styleSheet(
    sheet
  );

  sheet.getColumn(5).numFmt =
    "#,##0";

  sheet.getColumn(9).numFmt =
    "0.0";

  sheet.getColumn(10).numFmt =
    "#,##0";

  sheet.getColumn(12).numFmt =
    "#,##0";

  return sheet;
}


export async function exportWorkbookV2(
  outputPath: string,
  bundle: ExportBundle
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
    "camera-intelligence-collector";

  workbook.created =
    new Date();


  const accepted =
    bundle.results.filter(
      result =>
        result.validation.decision ===
        "ACCEPT"
    );

  const review =
    bundle.results.filter(
      result =>
        result.validation.decision ===
        "REVIEW"
    );

  const excluded =
    bundle.results.filter(
      result =>
        result.validation.decision ===
        "EXCLUDE"
    );


  addResultSheet(
    workbook,
    "D\u1eef li\u1ec7u \u0111\u1ed1i th\u1ee7",
    accepted,
    false
  );

  addResultSheet(
    workbook,
    "C\u1ea7n ki\u1ec3m tra",
    review,
    true
  );

  addResultSheet(
    workbook,
    "Kh\u00f4ng li\u00ean quan",
    excluded,
    true
  );


  const evidenceSheet =
    workbook.addWorksheet(
      "Evidence"
    );

  evidenceSheet.columns = [
    {
      header: "Run ID",
      key: "runId",
      width: 28
    },
    {
      header: "URL",
      key: "url",
      width: 55
    },
    {
      header: "T\u00ean s\u1ea3n ph\u1ea9m",
      key: "productName",
      width: 42
    },
    {
      header: "Decision",
      key: "decision",
      width: 14
    },
    {
      header: "Field",
      key: "field",
      width: 24
    },
    {
      header: "Selected value",
      key: "selectedValue",
      width: 30
    },
    {
      header: "Source",
      key: "source",
      width: 20
    },
    {
      header: "Raw evidence",
      key: "raw",
      width: 65
    },
    {
      header: "Weight",
      key: "weight",
      width: 12
    },
    {
      header: "Confidence",
      key: "confidence",
      width: 14
    },
    {
      header: "Rule ID",
      key: "ruleId",
      width: 32
    }
  ];

  for (
    const row
    of buildAllEvidenceRows(
      bundle.results,
      bundle.runId
    )
  ) {
    evidenceSheet.addRow(
      row
    );
  }

  styleSheet(
    evidenceSheet
  );


  const conflictSheet =
    workbook.addWorksheet(
      "Conflicts"
    );

  conflictSheet.columns = [
    {
      header: "URL",
      key: "url",
      width: 55
    },
    {
      header: "T\u00ean s\u1ea3n ph\u1ea9m",
      key: "productName",
      width: 42
    },
    {
      header: "Field",
      key: "field",
      width: 22
    },
    {
      header: "Severity",
      key: "severity",
      width: 14
    },
    {
      header: "Values",
      key: "values",
      width: 55
    },
    {
      header: "Explanation",
      key: "explanation",
      width: 55
    }
  ];

  for (
    const row
    of detectAllConflicts(
      bundle.results
    )
  ) {
    conflictSheet.addRow(
      row
    );
  }

  styleSheet(
    conflictSheet
  );


  const coverageSheet =
    workbook.addWorksheet(
      "Coverage"
    );

  coverageSheet.columns = [
    {
      header: "Metric",
      key: "label",
      width: 28
    },
    {
      header: "Numerator",
      key: "numerator",
      width: 14
    },
    {
      header: "Denominator",
      key: "denominator",
      width: 14
    },
    {
      header: "Coverage",
      key: "ratio",
      width: 14
    },
    {
      header: "Status",
      key: "status",
      width: 12
    }
  ];

  for (
    const metric
    of bundle.coverage.metrics
  ) {

    coverageSheet.addRow({
      label:
        metric.label,

      numerator:
        metric.numerator,

      denominator:
        metric.denominator,

      ratio:
        metric.ratio,

      status:
        metric.status
    });
  }

  coverageSheet.addRow([]);

  coverageSheet.addRow([
    "Accepted",
    bundle.coverage.accepted
  ]);

  coverageSheet.addRow([
    "Review",
    bundle.coverage.review
  ]);

  coverageSheet.addRow([
    "Excluded",
    bundle.coverage.excluded
  ]);


  coverageSheet.addRow([]);

  coverageSheet.addRow([
    "Reconciliation",
    bundle.reconciliation.complete
      ? "PASS"
      : "FAIL"
  ]);

  coverageSheet.addRow([
    "Discovered URLs",
    bundle.reconciliation.discovered
  ]);

  coverageSheet.addRow([
    "Terminal ACCEPT",
    bundle.reconciliation.accepted
  ]);

  coverageSheet.addRow([
    "Terminal REVIEW",
    bundle.reconciliation.review
  ]);

  coverageSheet.addRow([
    "Terminal EXCLUDE",
    bundle.reconciliation.excluded
  ]);

  coverageSheet.addRow([
    "Terminal ERROR",
    bundle.reconciliation.error
  ]);

  coverageSheet.addRow([
    "In progress",
    bundle.reconciliation.inProgress
  ]);

  coverageSheet.addRow([
    "Accounted",
    bundle.reconciliation.accounted
  ]);

  coverageSheet.addRow([
    "Balanced",
    bundle.reconciliation.balanced
      ? "YES"
      : "NO"
  ]);

  coverageSheet.addRow([
    "Run complete",
    bundle.reconciliation.complete
      ? "YES"
      : "NO"
  ]);

  coverageSheet.getColumn(4).numFmt =
    "0.0%";

  styleSheet(
    coverageSheet
  );


  const errorsSheet =
    workbook.addWorksheet(
      "Errors"
    );

  errorsSheet.columns = [
    {
      header: "Run ID",
      key: "runId",
      width: 28
    },
    {
      header: "URL",
      key: "url",
      width: 55
    },
    {
      header: "Stage",
      key: "stage",
      width: 18
    },
    {
      header: "Error class",
      key: "errorClass",
      width: 24
    },
    {
      header: "Message",
      key: "message",
      width: 65
    },
    {
      header: "Attempts",
      key: "attempts",
      width: 12
    },
    {
      header: "Last status",
      key: "lastStatus",
      width: 14
    },
    {
      header: "Retriable",
      key: "retriable",
      width: 12
    },
    {
      header: "Diagnostic path",
      key: "diagnosticPath",
      width: 50
    }
  ];

  for (
    const error
    of bundle.errors
  ) {
    errorsSheet.addRow(
      error
    );
  }

  styleSheet(
    errorsSheet
  );


  const auditSheet =
    workbook.addWorksheet(
      "Audit"
    );

  auditSheet.columns = [
    {
      header: "Timestamp",
      key: "timestamp",
      width: 24
    },
    {
      header: "URL",
      key: "url",
      width: 55
    },
    {
      header: "Stage",
      key: "stage",
      width: 22
    },
    {
      header: "Status",
      key: "status",
      width: 14
    },
    {
      header: "Message",
      key: "message",
      width: 65
    }
  ];

  for (
    const row
    of bundle.audit
  ) {
    auditSheet.addRow(
      row
    );
  }

  styleSheet(
    auditSheet
  );


  await workbook.xlsx.writeFile(
    outputPath
  );
}
