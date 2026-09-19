import ExcelJS from "exceljs";

import {
  mkdir
} from "node:fs/promises";

import {
  dirname
} from "node:path";

import type {
  BulkCollectionResult,
  BulkProductRecord
} from "../bulk/bulkTypes.js";

import type {
  ObservationField,
  ProductObservation
} from "../observations/observationTypes.js";


const MAIN_FIELDS:
  readonly ObservationField[] = [
    "PRODUCT_NAME",
    "CATEGORY",
    "BRAND",
    "CONDITION",
    "PRICE",
    "PRICE_CURRENCY",
    "AVAILABILITY",
    "RATING",
    "REVIEW_COUNT",
    "SKU",
    "PRODUCT_ID",
    "SPECS",
    "DESCRIPTION",
    "BREADCRUMB",
    "ACTION_TEXT"
  ];


const FIELD_LABEL:
  Readonly<
    Partial<
      Record<
        ObservationField,
        string
      >
    >
  > = {
    PRODUCT_NAME:
      "Tên sản phẩm (observed)",
    CATEGORY:
      "Danh mục (observed)",
    BRAND:
      "Thương hiệu (observed)",
    CONDITION:
      "Tình trạng (observed)",
    PRICE:
      "Giá (observed)",
    PRICE_CURRENCY:
      "Tiền tệ",
    AVAILABILITY:
      "Tồn kho (observed)",
    RATING:
      "Rating (observed)",
    REVIEW_COUNT:
      "Review count (observed)",
    SKU:
      "SKU",
    PRODUCT_ID:
      "Product ID",
    SPECS:
      "Thông số (observed)",
    DESCRIPTION:
      "Mô tả (observed)",
    BREADCRUMB:
      "Breadcrumb",
    ACTION_TEXT:
      "Action text"
  };


function styleSheet(
  sheet:
    ExcelJS.Worksheet
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
    sheet.getRow(
      1
    );


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
    30;


  sheet.eachRow(
    (
      row,
      rowNumber
    ) => {

      if (
        rowNumber ===
          1
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


  if (
    sheet.columnCount >
      0
  ) {
    sheet.autoFilter = {
      from: {
        row:
          1,
        column:
          1
      },
      to: {
        row:
          1,
        column:
          sheet.columnCount
      }
    };
  }
}


function observedValues(
  observations:
    readonly ProductObservation[],
  field:
    ObservationField
): string[] {

  return [
    ...new Set(
      observations
        .filter(
          observation =>
            observation.field ===
              field
        )
        .map(
          observation =>
            observation.rawValue.trim()
        )
        .filter(
          Boolean
        )
    )
  ];
}


function joinObservedValues(
  observations:
    readonly ProductObservation[],
  field:
    ObservationField
): string {

  return observedValues(
    observations,
    field
  ).join(
    " || "
  );
}


function mainColumns(
  includeDecision:
    boolean
): Partial<
  ExcelJS.Column
>[] {

  const columns:
    Partial<
      ExcelJS.Column
    >[] = [
      {
        header:
          "Identity ID",
        key:
          "identityId",
        width:
          52
      },
      {
        header:
          "Website",
        key:
          "website",
        width:
          26
      },
      {
        header:
          "Member URLs",
        key:
          "memberUrls",
        width:
          65
      },
      {
        header:
          "URL count",
        key:
          "memberCount",
        width:
          12
      }
    ];


  for (
    const field
    of MAIN_FIELDS
  ) {
    columns.push({
      header:
        FIELD_LABEL[
          field
        ] ??
        field,
      key:
        field,
      width:
        field ===
          "DESCRIPTION" ||
        field ===
          "SPECS" ||
        field ===
          "BREADCRUMB"
          ? 55
          : 30
    });
  }


  if (
    includeDecision
  ) {
    columns.push(
      {
        header:
          "Entity subtype",
        key:
          "entitySubtype",
        width:
          18
      },
      {
        header:
          "Confidence",
        key:
          "confidence",
        width:
          14
      },
      {
        header:
          "Entity evidence",
        key:
          "entityEvidence",
        width:
          55
      }
    );
  }


  return columns;
}


function mainRow(
  product:
    BulkProductRecord,
  rootUrl:
    string,
  includeDecision:
    boolean
): Record<
  string,
  unknown
> {

  const website =
    new URL(
      rootUrl
    ).host;


  const row:
    Record<
      string,
      unknown
    > = {
    identityId:
      product.identity.identityId,
    website,
    memberUrls:
      product.identity.memberUrls.join(
        " || "
      ),
    memberCount:
      product.identity.memberUrls.length
  };


  for (
    const field
    of MAIN_FIELDS
  ) {
    row[
      field
    ] =
      joinObservedValues(
        product.observations,
        field
      );
  }


  if (
    includeDecision
  ) {
    row.entitySubtype =
      product.entity.subtype;

    row.confidence =
      product.entity.classifier.confidence;

    row.entityEvidence =
      product.entity.classifier.evidence
        .map(
          evidence =>
            [
              evidence.ruleId,
              evidence.raw
            ].join(
              ": "
            )
        )
        .join(
          " || "
        );
  }


  return row;
}


function addProductSheet(
  workbook:
    ExcelJS.Workbook,
  name:
    string,
  products:
    readonly BulkProductRecord[],
  rootUrl:
    string,
  includeDecision:
    boolean
): void {

  const sheet =
    workbook.addWorksheet(
      name
    );


  sheet.columns =
    mainColumns(
      includeDecision
    );


  for (
    const product
    of products
  ) {
    sheet.addRow(
      mainRow(
        product,
        rootUrl,
        includeDecision
      )
    );
  }


  styleSheet(
    sheet
  );
}


function addObservationsSheet(
  workbook:
    ExcelJS.Workbook,
  result:
    BulkCollectionResult
): void {

  const sheet =
    workbook.addWorksheet(
      "Observations"
    );


  sheet.columns = [
    {
      header:
        "Identity ID",
      key:
        "identityId",
      width:
        52
    },
    {
      header:
        "Route",
      key:
        "route",
      width:
        14
    },
    {
      header:
        "Entity subtype",
      key:
        "subtype",
      width:
        18
    },
    {
      header:
        "Field",
      key:
        "field",
      width:
        24
    },
    {
      header:
        "Raw value",
      key:
        "rawValue",
      width:
        65
    },
    {
      header:
        "Source kind",
      key:
        "sourceKind",
      width:
        18
    },
    {
      header:
        "Source URL",
      key:
        "sourceUrl",
      width:
        65
    },
    {
      header:
        "Locator",
      key:
        "locator",
      width:
        45
    },
    {
      header:
        "Context",
      key:
        "context",
      width:
        50
    }
  ];


  for (
    const product
    of result.products
  ) {

    for (
      const observation
      of product.observations
    ) {
      sheet.addRow({
        identityId:
          product.identity.identityId,
        route:
          product.entity.route,
        subtype:
          product.entity.subtype,
        field:
          observation.field,
        rawValue:
          observation.rawValue,
        sourceKind:
          observation.sourceKind,
        sourceUrl:
          observation.sourceUrl,
        locator:
          observation.locator ??
          "",
        context:
          observation.context ??
          ""
      });
    }
  }


  styleSheet(
    sheet
  );
}


function addIdentitySheet(
  workbook:
    ExcelJS.Workbook,
  result:
    BulkCollectionResult
): void {

  const sheet =
    workbook.addWorksheet(
      "Identity"
    );


  sheet.columns = [
    {
      header:
        "Identity ID",
      key:
        "identityId",
      width:
        52
    },
    {
      header:
        "Member URL",
      key:
        "memberUrl",
      width:
        65
    },
    {
      header:
        "Token kind",
      key:
        "tokenKind",
      width:
        18
    },
    {
      header:
        "Token value",
      key:
        "tokenValue",
      width:
        65
    }
  ];


  for (
    const cluster
    of result.identityResolution.clusters
  ) {

    const tokens =
      cluster.tokens.length >
        0
        ? cluster.tokens
        : [
            null
          ];


    for (
      const memberUrl
      of cluster.memberUrls
    ) {

      for (
        const token
        of tokens
      ) {
        sheet.addRow({
          identityId:
            cluster.identityId,
          memberUrl,
          tokenKind:
            token?.kind ??
            "",
          tokenValue:
            token?.value ??
            ""
        });
      }
    }
  }


  styleSheet(
    sheet
  );
}


function addErrorsSheet(
  workbook:
    ExcelJS.Workbook,
  result:
    BulkCollectionResult
): void {

  const sheet =
    workbook.addWorksheet(
      "Errors"
    );


  sheet.columns = [
    {
      header:
        "URL",
      key:
        "url",
      width:
        65
    },
    {
      header:
        "Message",
      key:
        "message",
      width:
        70
    }
  ];


  for (
    const error
    of result.errors
  ) {
    sheet.addRow(
      error
    );
  }


  styleSheet(
    sheet
  );
}


function addCoverageSheet(
  workbook:
    ExcelJS.Workbook,
  result:
    BulkCollectionResult
): void {

  const sheet =
    workbook.addWorksheet(
      "Coverage"
    );


  sheet.columns = [
    {
      header:
        "Metric",
      key:
        "metric",
      width:
        38
    },
    {
      header:
        "Value",
      key:
        "value",
      width:
        18
    }
  ];


  const successfulDetails =
    result.attemptedUrls.length -
    result.errors.length;


  const collapsedRepresentations =
    Math.max(
      0,
      successfulDetails -
      result.identityResolution.clusters.length
    );


  const rows:
    Array<
      readonly [
        string,
        string |
        number
      ]
    > = [
      [
        "Discovered candidate URLs",
        result.candidateUrls.length
      ],
      [
        "Attempted detail URLs",
        result.attemptedUrls.length
      ],
      [
        "Successful detail URLs",
        successfulDetails
      ],
      [
        "Identity clusters",
        result.identityResolution.clusters.length
      ],
      [
        "Duplicate URL representations collapsed",
        collapsedRepresentations
      ],
      [
        "CAMERA",
        result.cameras.length
      ],
      [
        "NON_CAMERA",
        result.nonCameras.length
      ],
      [
        "UNCERTAIN",
        result.uncertain.length
      ],
      [
        "ERROR",
        result.errors.length
      ],
      [
        "Qualified endpoint requests",
        result.discovery.qualification.qualified.length
      ],
      [
        "Replayed endpoint requests",
        result.discovery.replay.replayedCandidateCount
      ]
    ];


  for (
    const [
      metric,
      value
    ]
    of rows
  ) {
    sheet.addRow({
      metric,
      value
    });
  }


  styleSheet(
    sheet
  );
}


function addAuditSheet(
  workbook:
    ExcelJS.Workbook,
  result:
    BulkCollectionResult
): void {

  const sheet =
    workbook.addWorksheet(
      "Audit"
    );


  sheet.columns = [
    {
      header:
        "Stage",
      key:
        "stage",
      width:
        24
    },
    {
      header:
        "Item",
      key:
        "item",
      width:
        65
    },
    {
      header:
        "Detail",
      key:
        "detail",
      width:
        70
    }
  ];


  sheet.addRow({
    stage:
      "ROOT",
    item:
      result.rootUrl,
    detail:
      "Bulk collection root"
  });


  for (
    const candidate
    of result.discovery.qualification.candidates
  ) {
    sheet.addRow({
      stage:
        candidate.score >=
          45 &&
        candidate.replayable
          ? "ENDPOINT_QUALIFIED"
          : "ENDPOINT_SKIPPED",
      item:
        candidate.url,
      detail:
        [
          "score=" +
          candidate.score,
          "method=" +
          candidate.method,
          "reasons=" +
          candidate.reasons.join(
            ","
          ),
          candidate.requestBody
            ? "payload=" +
              candidate.requestBody
            : ""
        ]
          .filter(
            Boolean
          )
          .join(
            " | "
          )
    });
  }


  for (
    const warning
    of result.discovery.replay.warnings
  ) {
    sheet.addRow({
      stage:
        "REPLAY_WARNING",
      item:
        result.rootUrl,
      detail:
        warning
    });
  }


  styleSheet(
    sheet
  );
}


export async function exportBulkWorkbook(
  outputPath:
    string,
  result:
    BulkCollectionResult
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
    "camera-intelligence-collector-v3";


  workbook.created =
    new Date();


  addProductSheet(
    workbook,
    "Camera Data",
    result.cameras,
    result.rootUrl,
    false
  );


  addProductSheet(
    workbook,
    "Review",
    result.uncertain,
    result.rootUrl,
    true
  );


  addProductSheet(
    workbook,
    "Excluded",
    result.nonCameras,
    result.rootUrl,
    true
  );


  addObservationsSheet(
    workbook,
    result
  );


  addIdentitySheet(
    workbook,
    result
  );


  addErrorsSheet(
    workbook,
    result
  );


  addCoverageSheet(
    workbook,
    result
  );


  addAuditSheet(
    workbook,
    result
  );


  await workbook.xlsx.writeFile(
    outputPath
  );
}
