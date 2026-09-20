import type {
  EvidenceItem,
  EvidencePacket
} from "./evidenceTypes.js";

import type {
  AISemanticDecision,
  MoneyDecision,
  SemanticValidationResult,
  ValidationIssue
} from "./semanticContracts.js";


export function extractNumericValues(
  raw:
    string
): number[] {

  const matches =
    raw.match(
      /\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?/g
    ) ??
    [];


  const output:
    number[] =
      [];


  for (
    const match
    of matches
  ) {

    let value:
      number;


    if (
      /^\d{1,3}(?:[.,]\d{3})+$/u.test(
        match
      )
    ) {
      value =
        Number(
          match.replace(
            /[.,]/g,
            ""
          )
        );
    }
    else {
      value =
        Number(
          match.replace(
            ",",
            "."
          )
        );
    }


    if (
      Number.isFinite(
        value
      )
    ) {
      output.push(
        value
      );
    }
  }


  return [
    ...new Set(
      output
    )
  ];
}


function evidenceMap(
  packet:
    EvidencePacket
): Map<
  string,
  EvidenceItem
> {

  return new Map(
    packet.allEvidence.map(
      item => [
        item.id,
        item
      ]
    )
  );
}


function citedEvidence(
  packet:
    EvidencePacket,
  evidenceIds:
    readonly string[]
): EvidenceItem[] {

  const map =
    evidenceMap(
      packet
    );


  return evidenceIds
    .map(
      id =>
        map.get(
          id
        )
    )
    .filter(
      (
        item
      ): item is
        EvidenceItem =>
          item !==
            undefined
    );
}


function numericSupported(
  packet:
    EvidencePacket,
  value:
    number,
  evidenceIds:
    readonly string[]
): boolean {

  return citedEvidence(
    packet,
    evidenceIds
  ).some(
    item => {

      if (
        typeof item.normalizedValue ===
          "number" &&
        Math.abs(
          item.normalizedValue -
          value
        ) <
          0.001
      ) {
        return true;
      }


      return extractNumericValues(
        item.rawValue
      ).some(
        candidate =>
          Math.abs(
            candidate -
            value
          ) <
            0.001
      );
    }
  );
}


function validateEvidenceIds(
  packet:
    EvidencePacket,
  field:
    string,
  evidenceIds:
    readonly string[],
  issues:
    ValidationIssue[]
): void {

  const map =
    evidenceMap(
      packet
    );


  for (
    const id
    of evidenceIds
  ) {

    if (
      !map.has(
        id
      )
    ) {
      issues.push({
        code:
          "UNKNOWN_EVIDENCE_ID",

        field,

        message:
          field +
          " cites unknown evidence id " +
          id
      });
    }
  }
}


function validateMoney(
  packet:
    EvidencePacket,
  field:
    string,
  decision:
    MoneyDecision |
    null,
  issues:
    ValidationIssue[]
): void {

  if (
    decision ===
      null
  ) {
    return;
  }


  validateEvidenceIds(
    packet,
    field,
    decision.evidenceIds,
    issues
  );


  if (
    !numericSupported(
      packet,
      decision.value,
      decision.evidenceIds
    )
  ) {
    issues.push({
      code:
        "UNSUPPORTED_NUMERIC_VALUE",

      field,

      message:
        field +
        "=" +
        decision.value +
        " is not present in its cited evidence."
    });
  }
}


function isStrongPrimaryPriceEvidence(
  item:
    EvidenceItem
): boolean {

  if (
    item.ownershipHint !==
      "PRIMARY_PRODUCT"
  ) {
    return false;
  }


  if (
    item.fieldHint !==
      "PRICE"
  ) {
    return false;
  }


  const sourceKind =
    String(
      item.sourceKind
    );


  return [
    "VISIBLE_TEXT",
    "JSON_LD",
    "MICRODATA",
    "XHR",
    "API",
    "ATTRIBUTE"
  ].includes(
    sourceKind
  );
}


function isStrongPrimaryStockEvidence(
  item:
    EvidenceItem
): boolean {

  if (
    item.ownershipHint !==
      "PRIMARY_PRODUCT"
  ) {
    return false;
  }


  if (
    item.fieldHint !==
      "AVAILABILITY" &&
    item.fieldHint !==
      "INVENTORY_LEVEL"
  ) {
    return false;
  }


  const sourceKind =
    String(
      item.sourceKind
    );


  return [
    "VISIBLE_TEXT",
    "JSON_LD",
    "MICRODATA",
    "XHR",
    "API",
    "ATTRIBUTE"
  ].includes(
    sourceKind
  );
}


function controlSearchText(
  item:
    EvidenceItem
): string {

  return [
    item.fieldHint,
    item.rawValue,
    item.locator,
    item.context
  ]
    .filter(
      (
        value
      ): value is
        string =>
          typeof value ===
            "string" &&
          value.length >
            0
    )
    .join(
      " "
    )
    .toLowerCase();
}


function isSelectedVariantControlEvidence(
  item:
    EvidenceItem
): boolean {

  if (
    item.fieldHint !==
      "CONTROL"
  ) {
    return false;
  }


  return /(?:variant|kit|body|bundle|lens|color|colour|phiên\s*bản|màu|lựa\s*chọn)/iu.test(
    controlSearchText(
      item
    )
  );
}


function isStrongPrimaryConditionEvidence(
  item:
    EvidenceItem
): boolean {

  if (
    item.ownershipHint !==
      "PRIMARY_PRODUCT" ||
    item.fieldHint !==
      "CONDITION"
  ) {
    return false;
  }


  const sourceKind =
    String(
      item.sourceKind
    );


  return [
    "VISIBLE_TEXT",
    "JSON_LD",
    "MICRODATA",
    "XHR",
    "API",
    "ATTRIBUTE"
  ].includes(
    sourceKind
  );
}


function isSelectedConditionControlEvidence(
  item:
    EvidenceItem
): boolean {

  if (
    item.fieldHint !==
      "CONTROL"
  ) {
    return false;
  }


  return /(?:condition|like\s*new|refurbished|used|brand\s*new|new|tình\s*trạng|đã\s*qua\s*sử\s*dụng|hàng\s*cũ|hàng\s*mới)/iu.test(
    controlSearchText(
      item
    )
  );
}


function isStrongPrimarySpecEvidence(
  item:
    EvidenceItem
): boolean {

  if (
    item.ownershipHint !==
      "PRIMARY_PRODUCT" ||
    item.fieldHint !==
      "SPECS"
  ) {
    return false;
  }


  const sourceKind =
    String(
      item.sourceKind
    );


  return [
    "VISIBLE_TEXT",
    "JSON_LD",
    "MICRODATA",
    "XHR",
    "API",
    "ATTRIBUTE"
  ].includes(
    sourceKind
  );
}


function primaryStockPolarity(
  item:
    EvidenceItem
):
  | "IN_STOCK"
  | "OUT_OF_STOCK"
  | null {

  if (
    !isStrongPrimaryStockEvidence(
      item
    )
  ) {
    return null;
  }


  const value =
    [
      item.rawValue,
      typeof item.normalizedValue ===
        "string"
          ? item.normalizedValue
          : ""
    ]
      .join(
        " "
      )
      .toLowerCase();


  if (
    /(?:out\s*of\s*stock|outofstock|sold\s*out|hết\s*hàng|tạm\s*hết)/iu.test(
      value
    )
  ) {
    return "OUT_OF_STOCK";
  }


  if (
    /(?:^|[^a-z])in\s*stock(?:[^a-z]|$)|instock|còn\s*hàng|sẵn\s*hàng/iu.test(
      value
    )
  ) {
    return "IN_STOCK";
  }


  return null;
}


function hasConflictingPrimaryStockEvidence(
  packet:
    EvidencePacket
): boolean {

  const states =
    new Set(
      packet.stockCandidates
        .map(
          primaryStockPolarity
        )
        .filter(
          (
            state
          ): state is
            "IN_STOCK" |
            "OUT_OF_STOCK" =>
              state !==
                null
        )
    );


  return (
    states.has(
      "IN_STOCK"
    ) &&
    states.has(
      "OUT_OF_STOCK"
    )
  );
}


export function validateSemanticDecision(
  packet:
    EvidencePacket,
  decision:
    AISemanticDecision
): SemanticValidationResult {

  const issues:
    ValidationIssue[] =
      [];


  validateEvidenceIds(
    packet,
    "entity",
    decision.entity.evidenceIds,
    issues
  );


  validateEvidenceIds(
    packet,
    "productName",
    decision.productName.evidenceIds,
    issues
  );


  validateMoney(
    packet,
    "currentPrice",
    decision.currentPrice,
    issues
  );


  validateMoney(
    packet,
    "oldPrice",
    decision.oldPrice,
    issues
  );


  for (
    const [
      index,
      item
    ]
    of decision.giftValues.entries()
  ) {
    validateMoney(
      packet,
      "giftValues[" +
      index +
      "]",
      item,
      issues
    );
  }


  for (
    const [
      index,
      item
    ]
    of decision.savingValues.entries()
  ) {
    validateMoney(
      packet,
      "savingValues[" +
      index +
      "]",
      item,
      issues
    );
  }


  for (
    const [
      index,
      item
    ]
    of decision.installmentAmounts.entries()
  ) {
    validateMoney(
      packet,
      "installmentAmounts[" +
      index +
      "]",
      item,
      issues
    );
  }


  for (
    const [
      index,
      variant
    ]
    of decision.variants.entries()
  ) {

    validateEvidenceIds(
      packet,
      "variants[" +
      index +
      "]",
      variant.evidenceIds,
      issues
    );


    validateMoney(
      packet,
      "variants[" +
      index +
      "].price",
      variant.price,
      issues
    );


    validateMoney(
      packet,
      "variants[" +
      index +
      "].priceDelta",
      variant.priceDelta,
      issues
    );
  }


  if (
    decision.condition
  ) {
    validateEvidenceIds(
      packet,
      "condition",
      decision.condition.evidenceIds,
      issues
    );
  }


  for (
    const [
      index,
      condition
    ]
    of decision.availableConditions.entries()
  ) {
    validateEvidenceIds(
      packet,
      "availableConditions[" +
      index +
      "]",
      condition.evidenceIds,
      issues
    );
  }


  if (
    decision.stock
  ) {

    validateEvidenceIds(
      packet,
      "stock",
      decision.stock.evidenceIds,
      issues
    );


    if (
      decision.stock.quantity !==
        null &&
      !numericSupported(
        packet,
        decision.stock.quantity,
        decision.stock.evidenceIds
      )
    ) {
      issues.push({
        code:
          "UNSUPPORTED_NUMERIC_VALUE",

        field:
          "stock.quantity",

        message:
          "Stock quantity is not present in its cited evidence."
      });
    }
  }


  for (
    const [
      field,
      item
    ]
    of [
      [
        "rating",
        decision.rating
      ],
      [
        "reviewCount",
        decision.reviewCount
      ]
    ] as const
  ) {

    if (
      item ===
        null
    ) {
      continue;
    }


    validateEvidenceIds(
      packet,
      field,
      item.evidenceIds,
      issues
    );


    if (
      !numericSupported(
        packet,
        item.value,
        item.evidenceIds
      )
    ) {
      issues.push({
        code:
          "UNSUPPORTED_NUMERIC_VALUE",

        field,

        message:
          field +
          " is not present in its cited evidence."
      });
    }
  }


  for (
    const [
      index,
      spec
    ]
    of decision.specs.entries()
  ) {
    validateEvidenceIds(
      packet,
      "specs[" +
      index +
      "]",
      spec.evidenceIds,
      issues
    );
  }


  if (
    decision.entity.type ===
      "CAMERA" &&
    packet.moneyCandidates.some(
      isStrongPrimaryPriceEvidence
    ) &&
    decision.currentPrice ===
      null
  ) {
    issues.push({
      code:
        "CURRENT_PRICE_UNRESOLVED",

      field:
        "currentPrice",

      message:
        "Strong primary-product price evidence exists but AI did not resolve a current camera price."
    });
  }


  if (
    decision.entity.type ===
      "CAMERA" &&
    decision.stock ===
      null &&
    packet.stockCandidates.some(
      isStrongPrimaryStockEvidence
    )
  ) {
    issues.push({
      code:
        "STOCK_UNRESOLVED",

      field:
        "stock",

      message:
        "Strong primary-product stock evidence exists but AI did not resolve stock."
    });
  }



  if (
    decision.entity.type ===
      "CAMERA" &&
    packet.selectedControls.some(
      isSelectedVariantControlEvidence
    ) &&
    !decision.variants.some(
      variant =>
        variant.selected
    )
  ) {
    issues.push({
      code:
        "SELECTED_VARIANT_UNRESOLVED",

      field:
        "variants",

      message:
        "A selected product-variant control exists but AI did not resolve any selected variant."
    });
  }


  if (
    decision.entity.type ===
      "CAMERA" &&
    decision.condition ===
      null &&
    (
      packet.conditionCandidates.some(
        isStrongPrimaryConditionEvidence
      ) ||
      packet.selectedControls.some(
        isSelectedConditionControlEvidence
      )
    )
  ) {
    issues.push({
      code:
        "CONDITION_UNRESOLVED",

      field:
        "condition",

      message:
        "Strong primary-product condition evidence exists but AI did not resolve condition."
    });
  }



  if (
    decision.entity.type ===
      "CAMERA" &&
    decision.specs.length ===
      0 &&
    packet.specCandidates.some(
      isStrongPrimarySpecEvidence
    )
  ) {
    issues.push({
      code:
        "SPECS_UNRESOLVED",

      field:
        "specs",

      message:
        "Strong primary-product specification evidence exists but AI did not resolve any specs."
    });
  }


  if (
    decision.entity.type ===
      "CAMERA" &&
    hasConflictingPrimaryStockEvidence(
      packet
    )
  ) {
    issues.push({
      code:
        "CONFLICTING_PRIMARY_EVIDENCE",

      field:
        "stock",

      message:
        "Primary-product stock evidence contains both in-stock and out-of-stock signals."
    });
  }


  if (
    decision.pageConfidence <
      0.55
  ) {
    issues.push({
      code:
        "LOW_PAGE_CONFIDENCE",

      message:
        "AI page confidence is below the review threshold."
    });
  }


  if (
    issues.some(
      issue =>
        issue.code ===
          "UNSUPPORTED_NUMERIC_VALUE"
    )
  ) {
    return {
      status:
        "UNSUPPORTED_AI_VALUE",

      issues
    };
  }


  if (
    issues.length >
      0 ||
    decision.entity.type ===
      "UNCERTAIN"
  ) {
    return {
      status:
        "NEEDS_REVIEW",

      issues
    };
  }


  return {
    status:
      "VALIDATED",

    issues
  };
}
