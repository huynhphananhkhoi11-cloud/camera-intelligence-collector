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
    packet.moneyCandidates.length >
      0 &&
    decision.currentPrice ===
      null
  ) {
    issues.push({
      code:
        "CURRENT_PRICE_UNRESOLVED",

      field:
        "currentPrice",

      message:
        "The page contains money evidence but AI did not resolve a current camera price."
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
