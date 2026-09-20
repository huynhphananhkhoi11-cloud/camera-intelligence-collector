import type {
  EvidenceItem,
  EvidencePacket
} from "./evidenceTypes.js";


const STRUCTURED_SOURCE_KINDS:
  ReadonlySet<string> =
    new Set([
      "JSON_LD",
      "MICRODATA",
      "XHR",
      "API",
      "META",
      "ATTRIBUTE"
    ]);


function normalizeText(
  value: string
): string {

  return value
    .normalize("NFKD")
    .replace(
      /\p{M}+/gu,
      ""
    )
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function normalizedValueKey(
  item: EvidenceItem
): string {

  if (
    item.normalizedValue !==
      undefined &&
    item.normalizedValue !==
      null
  ) {

    return normalizeText(
      String(
        item.normalizedValue
      )
    );
  }


  return normalizeText(
    item.rawValue
  )
    .replace(
      /^https?:\/\/schema\.org\//u,
      ""
    );
}


function sourceFamily(
  item: EvidenceItem
): string {

  const sourceKind =
    String(
      item.sourceKind
    );


  if (
    STRUCTURED_SOURCE_KINDS.has(
      sourceKind
    )
  ) {
    return "STRUCTURED";
  }


  if (
    sourceKind ===
      "VISIBLE_TEXT"
  ) {
    return "VISIBLE";
  }


  if (
    sourceKind ===
      "DOM"
  ) {
    return "DOM";
  }


  return sourceKind;
}


function semanticRole(
  item: EvidenceItem
): string {

  const field =
    normalizeText(
      item.fieldHint
    );

  const context =
    normalizeText(
      [
        item.locator ??
          "",
        item.context ??
          ""
      ].join(
        " "
      )
    );


  if (
    field ===
      "availability" ||
    field ===
      "inventory_level"
  ) {
    return "STOCK";
  }


  if (
    field ===
      "condition"
  ) {
    return "CONDITION";
  }


  if (
    field ===
      "product_name"
  ) {
    return "TITLE";
  }


  if (
    field ===
      "control"
  ) {
    return "CONTROL";
  }


  if (
    /old|list|strike|original|was|gia cu/u.test(
      context
    )
  ) {
    return "OLD_PRICE";
  }


  if (
    /saving|discount|reduction|tiet kiem/u.test(
      context
    )
  ) {
    return "SAVING";
  }


  if (
    /gift|bonus|qua tang/u.test(
      context
    )
  ) {
    return "GIFT";
  }


  if (
    /installment|tra gop/u.test(
      context
    )
  ) {
    return "INSTALLMENT";
  }


  if (
    /rental|rent|thue/u.test(
      context
    )
  ) {
    return "RENTAL";
  }


  if (
    /variant|option|style|color|colour|kit|lens|body/u.test(
      context
    )
  ) {
    return "VARIANT";
  }


  return field.toUpperCase();
}


function evidenceRank(
  item: EvidenceItem
): number {

  let score =
    0;


  if (
    item.ownershipHint ===
      "PRIMARY_PRODUCT"
  ) {
    score +=
      100;
  }


  const context =
    normalizeText(
      item.context ??
        ""
    );


  if (
    context.includes(
      "primary"
    )
  ) {
    score +=
      40;
  }


  if (
    context.includes(
      "selected=true"
    )
  ) {
    score +=
      80;
  }


  const family =
    sourceFamily(
      item
    );


  if (
    family ===
      "STRUCTURED"
  ) {
    score +=
      35;
  }
  else if (
    family ===
      "VISIBLE"
  ) {
    score +=
      30;
  }
  else if (
    family ===
      "DOM"
  ) {
    score +=
      20;
  }


  /*
   * For ratings/review counts, a bounded visible product-page label is
   * preferred over stale or cross-product structured metadata.
   */
  if (
    family ===
      "VISIBLE" &&
    (
      item.fieldHint ===
        "RATING" ||
      item.fieldHint ===
        "REVIEW_COUNT"
    )
  ) {
    score +=
      25;
  }


  if (
    typeof item.confidence ===
      "number"
  ) {
    score +=
      item.confidence *
      10;
  }


  return score;
}


function semanticDedupeKey(
  item: EvidenceItem
): string {

  return [
    normalizeText(
      item.fieldHint
    ),
    semanticRole(
      item
    ),
    sourceFamily(
      item
    ),
    normalizedValueKey(
      item
    )
  ].join(
    "\0"
  );
}


function uniqueById(
  values:
    readonly EvidenceItem[]
): EvidenceItem[] {

  const seen =
    new Set<string>();


  return values.filter(
    item => {

      if (
        seen.has(
          item.id
        )
      ) {
        return false;
      }


      seen.add(
        item.id
      );


      return true;
    }
  );
}


function compactGroup(
  values:
    readonly EvidenceItem[],
  limit:
    number
): EvidenceItem[] {

  const ranked =
    [...values]
      .sort(
        (
          left,
          right
        ) =>
          evidenceRank(
            right
          ) -
          evidenceRank(
            left
          )
      );


  const seen =
    new Set<string>();

  const output:
    EvidenceItem[] =
      [];


  for (
    const item
    of ranked
  ) {

    const key =
      semanticDedupeKey(
        item
      );


    if (
      seen.has(
        key
      )
    ) {
      continue;
    }


    seen.add(
      key
    );

    output.push(
      item
    );


    if (
      output.length >=
        limit
    ) {
      break;
    }
  }


  return output;
}


export function compactEvidencePacketForPrompt(
  packet:
    EvidencePacket
): EvidencePacket {

  /*
   * Selected controls are semantic state, not noise.
   * Preserve every selected control exactly as captured.
   */
  const selectedControls =
    uniqueById(
      packet.selectedControls
    );


  const titleCandidates =
    compactGroup(
      packet.titleCandidates,
      3
    );


  const moneyCandidates =
    compactGroup(
      packet.moneyCandidates,
      10
    );


  const conditionCandidates =
    compactGroup(
      packet.conditionCandidates,
      6
    );


  /*
   * Keep visible and structured stock representations separately.
   * Within each source family, prefer PRIMARY_PRODUCT evidence.
   */
  const stockCandidates =
    compactGroup(
      packet.stockCandidates,
      4
    );


  const variantCandidates =
    uniqueById([
      ...selectedControls,
      ...compactGroup(
        packet.variantCandidates,
        10
      )
    ]);


  return {
    ...packet,

    /*
     * Never shrink allEvidence. GroundingValidator must still be able to
     * resolve every original evidenceId after AI inference.
     */
    allEvidence:
      packet.allEvidence,

    selectedControls,

    titleCandidates,

    moneyCandidates,

    conditionCandidates,

    stockCandidates,

    variantCandidates,

    ratingCandidates:
      compactGroup(
        packet.ratingCandidates,
        2
      ),

    reviewCandidates:
      compactGroup(
        packet.reviewCandidates,
        2
      ),

    specCandidates:
      compactGroup(
        packet.specCandidates,
        4
      ),

    breadcrumbs:
      compactGroup(
        packet.breadcrumbs,
        3
      ),

    structuredFacts:
      compactGroup(
        packet.structuredFacts,
        8
      )
  };
}