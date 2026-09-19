import type {
  BulkProductRecord
} from "../bulk/bulkTypes.js";

import type {
  ObservationField,
  ProductObservation
} from "../observations/observationTypes.js";


export interface MainPresentationRow {
  readonly website:
    string;

  readonly productName:
    string;

  readonly form:
    string;

  readonly specs:
    string;

  readonly rentalPrice:
    string;

  readonly rentalConditions:
    string;

  readonly accessories:
    string;

  readonly combo:
    string;

  readonly rating:
    string;

  readonly reviewCount:
    string;

  readonly stock:
    string;

  readonly salePrice:
    string;

  readonly url:
    string;
}


function observationsFor(
  observations:
    readonly ProductObservation[],
  field:
    ObservationField
): ProductObservation[] {

  return observations.filter(
    observation =>
      observation.field ===
        field
  );
}


function uniqueValues(
  observations:
    readonly ProductObservation[],
  field:
    ObservationField
): string[] {

  return [
    ...new Set(
      observationsFor(
        observations,
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


function firstPreferredValue(
  observations:
    readonly ProductObservation[],
  field:
    ObservationField
): string {

  const candidates =
    observationsFor(
      observations,
      field
    );


  const preferred =
    candidates.find(
      observation =>
        observation.sourceKind ===
          "VISIBLE_TEXT" &&
        observation.locator
          ?.startsWith(
            "h1"
          )
    ) ??
    candidates.find(
      observation =>
        observation.sourceKind ===
          "VISIBLE_TEXT"
    ) ??
    candidates.find(
      observation =>
        observation.sourceKind ===
          "META"
    ) ??
    candidates.find(
      observation =>
        observation.sourceKind ===
          "JSON_LD"
    ) ??
    candidates[0];


  return preferred
    ?.rawValue
    .trim() ??
    "";
}


function joinValues(
  observations:
    readonly ProductObservation[],
  field:
    ObservationField
): string {

  return uniqueValues(
    observations,
    field
  ).join(
    "\n"
  );
}


function schemaTail(
  value:
    string
): string {

  const trimmed =
    value.trim();


  const hash =
    trimmed.lastIndexOf(
      "#"
    );


  const slash =
    trimmed.lastIndexOf(
      "/"
    );


  const index =
    Math.max(
      hash,
      slash
    );


  return index >=
    0
    ? trimmed.slice(
        index +
        1
      )
    : trimmed;
}


const CONDITION_CLASS:
  Readonly<
    Record<
      string,
      "Hàng mới" |
      "Hàng cũ"
    >
  > = {
    NewCondition:
      "Hàng mới",

    UsedCondition:
      "Hàng cũ",

    RefurbishedCondition:
      "Hàng cũ",

    DamagedCondition:
      "Hàng cũ"
  };


const AVAILABILITY_LABELS:
  Readonly<
    Record<
      string,
      string
    >
  > = {
    InStock:
      "Còn hàng",

    OutOfStock:
      "Hết hàng",

    SoldOut:
      "Hết hàng",

    PreOrder:
      "Đặt trước",

    PreSale:
      "Mở bán trước",

    BackOrder:
      "Chờ nhập hàng",

    LimitedAvailability:
      "Số lượng có hạn",

    Discontinued:
      "Ngừng kinh doanh",

    InStoreOnly:
      "Chỉ có tại cửa hàng",

    OnlineOnly:
      "Chỉ bán online",

    MadeToOrder:
      "Sản xuất theo đơn",

    Reserved:
      "Đã giữ chỗ"
  };


function productNameDisplay(
  observations:
    readonly ProductObservation[]
): string {

  const raw =
    firstPreferredValue(
      observations,
      "PRODUCT_NAME"
    );


  return raw
    .replace(
      /\s*\((?=[^)]*(?:new|used|mới|cũ|qua\s+sử\s+dụng|qua\s+su\s+dung|9\d%|100%))[^)]*\)\s*/giu,
      " "
    )
    .replace(
      /\s*[-–—]?\s*(?:hàng\s*)?(?:đã\s*)?qua\s+sử\s+dụng(?![\p{L}\p{N}_]).*$/iu,
      ""
    )
    .replace(
      /\s*[-–—]?\s*(?:hàng\s*)?cũ(?![\p{L}\p{N}_]).*$/iu,
      ""
    )
    .replace(
      /\s*[-–—]?\s*(?:hàng\s*)?mới(?![\p{L}\p{N}_]).*$/iu,
      ""
    )
    .replace(
      /\s*[-–—]?\s*(?:used|second[\s-]?hand)\b.*$/iu,
      ""
    )
    .replace(
      /\s*[-–—]?\s*new(?:\s*100%)?\s*$/iu,
      ""
    )
    .replace(
      /\s{2,}/g,
      " "
    )
    .replace(
      /\s*[-–—]\s*$/u,
      ""
    )
    .trim();
}


function oldNewFromText(
  value:
    string
): "Hàng mới" |
  "Hàng cũ" |
  null {

  const tail =
    schemaTail(
      value
    );


  const structured =
    CONDITION_CLASS[
      tail
    ];


  if (
    structured
  ) {
    return structured;
  }


  const normalized =
    value.toLocaleLowerCase(
      "vi"
    );


  if (
    /\bnew\b/iu.test(
      value
    ) ||
    /\bhàng\s*mới(?![\p{L}\p{N}_])/iu.test(
      value
    ) ||
    /\bmới\s*100%/iu.test(
      value
    )
  ) {
    return "Hàng mới";
  }


  if (
    /\bused\b/iu.test(
      value
    ) ||
    /\bsecond[\s-]?hand\b/iu.test(
      value
    ) ||
    /\bhàng\s*cũ(?![\p{L}\p{N}_])/iu.test(
      value
    ) ||
    /\bcũ(?![\p{L}\p{N}_])/iu.test(
      value
    ) ||
    normalized.includes(
      "đã qua sử dụng"
    ) ||
    normalized.includes(
      "qua sử dụng"
    )
  ) {
    return "Hàng cũ";
  }


  return null;
}


function conditionLabels(
  observations:
    readonly ProductObservation[]
): string[] {

  return [
    ...new Set(
      observations
        .map(
          observation =>
            oldNewFromText(
              observation.rawValue
            )
        )
        .filter(
          (
            value
          ): value is
            "Hàng mới" |
            "Hàng cũ" =>
              value !==
                null
        )
    )
  ];
}


function oldNewDisplay(
  observations:
    readonly ProductObservation[]
): string {

  const conditions =
    observationsFor(
      observations,
      "CONDITION"
    )
      .filter(
        observation =>
          observation.ownership !==
            "RELATED" &&
          observation.ownership !==
            "PAGE_CHROME"
      );


  const selectedControls =
    conditions.filter(
      observation =>
        observation.sourceKind ===
          "VISIBLE_TEXT" &&
        (
          observation.locator
            ?.startsWith(
              "condition-select["
            ) ||
          observation.locator
            ?.startsWith(
              "condition-radio["
            )
        ) &&
        /(?:selected|checked)=true/iu.test(
          observation.context ??
          ""
        )
    );


  const selectedLabels =
    conditionLabels(
      selectedControls
    );


  if (
    selectedLabels.length >
      0
  ) {
    return selectedLabels.join(
      " | "
    );
  }


  const controlConditions =
    conditions.filter(
      observation =>
        observation.sourceKind ===
          "VISIBLE_TEXT" &&
        (
          observation.locator
            ?.startsWith(
              "condition-select["
            ) ||
          observation.locator
            ?.startsWith(
              "condition-radio["
            )
        )
    );


  const controlLabels =
    conditionLabels(
      controlConditions
    );


  if (
    controlLabels.length >
      1
  ) {
    return controlLabels.join(
      " | "
    );
  }


  const titleConditions =
    conditions.filter(
      observation =>
        observation.sourceKind ===
          "VISIBLE_TEXT" &&
        observation.locator
          ?.startsWith(
            "h1"
          )
    );


  const titleLabels =
    conditionLabels(
      titleConditions
    );


  if (
    titleLabels.length >
      0
  ) {
    return titleLabels.join(
      " | "
    );
  }


  if (
    controlLabels.length >
      0
  ) {
    return controlLabels.join(
      " | "
    );
  }


  const visibleLabels =
    conditionLabels(
      conditions.filter(
        observation =>
          observation.sourceKind ===
            "VISIBLE_TEXT"
      )
    );


  if (
    visibleLabels.length >
      0
  ) {
    return visibleLabels.join(
      " | "
    );
  }


  const structuredLabels =
    conditionLabels(
      conditions.filter(
        observation =>
          observation.sourceKind ===
            "JSON_LD"
      )
    );


  if (
    structuredLabels.length >
      0
  ) {
    return structuredLabels.join(
      " | "
    );
  }


  const titleFallback =
    [
      ...new Set(
        [
          ...uniqueValues(
            observations,
            "PRODUCT_NAME"
          )
        ]
          .map(
            oldNewFromText
          )
          .filter(
            (
              value
            ): value is
              "Hàng mới" |
              "Hàng cũ" =>
                value !==
                  null
          )
      )
    ];


  if (
    titleFallback.length >
      0
  ) {
    return titleFallback.join(
      " | "
    );
  }


  return [
    ...new Set(
      [
        ...uniqueValues(
          observations,
          "CATEGORY"
        ),
        ...uniqueValues(
          observations,
          "BREADCRUMB"
        )
      ]
        .map(
          oldNewFromText
        )
        .filter(
          (
            value
          ): value is
            "Hàng mới" |
            "Hàng cũ" =>
              value !==
                null
        )
    )
  ].join(
    " | "
  );
}


function extractMoneyNumbers(
  value:
    string
): number[] {

  const matches =
    value.match(
      /\d[\d.,\s]*\d|\d+/g
    ) ??
    [];


  const output:
    number[] =
      [];


  for (
    const match
    of matches
  ) {

    const digits =
      match.replace(
        /\D/g,
        ""
      );


    if (
      digits.length ===
        0
    ) {
      continue;
    }


    const parsed =
      Number.parseInt(
        digits,
        10
      );


    if (
      Number.isFinite(
        parsed
      ) &&
      parsed >
        0
    ) {
      output.push(
        parsed
      );
    }
  }


  return output;
}


function currencyLabel(
  observations:
    readonly ProductObservation[]
): string {

  const currencies =
    uniqueValues(
      observations,
      "PRICE_CURRENCY"
    )
      .map(
        value =>
          schemaTail(
            value
          )
            .toUpperCase()
      );


  if (
    currencies.includes(
      "VND"
    ) ||
    uniqueValues(
      observations,
      "PRICE"
    ).some(
      value =>
        /(?:đ|₫|vnd)/iu.test(
          value
        )
    )
  ) {
    return "VND";
  }


  return currencies.length ===
    1
    ? currencies[0]!
    : "";
}


function formatMoney(
  value:
    number,
  currency:
    string
): string {

  const amount =
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
    ? amount +
      " " +
      currency
    : amount;
}


function semanticPriceObservations(
  observations:
    readonly ProductObservation[]
): ProductObservation[] {

  const prices =
    observationsFor(
      observations,
      "PRICE"
    );


  const hasSemanticMetadata =
    prices.some(
      observation =>
        observation.semanticRole !==
          undefined &&
        observation.semanticRole !==
          null
    );


  if (
    !hasSemanticMetadata
  ) {
    return prices;
  }


  return prices.filter(
    observation =>
      (
        observation.semanticRole ===
          "CURRENT_PRODUCT_PRICE" ||
        observation.semanticRole ===
          "VARIANT_PRICE"
      ) &&
      (
        observation.ownership ===
          "PRIMARY_PRODUCT" ||
        observation.ownership ===
          "UNKNOWN" ||
        observation.ownership ===
          undefined ||
        observation.ownership ===
          null
      ) &&
      (
        observation.contextKind ===
          "SALE" ||
        observation.contextKind ===
          undefined ||
        observation.contextKind ===
          null
      )
  );
}


function priceDisplay(
  observations:
    readonly ProductObservation[]
): string {

  const rawValues =
    [
      ...new Set(
        semanticPriceObservations(
          observations
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


  const values =
    [
      ...new Set(
        rawValues.flatMap(
          value =>
            extractMoneyNumbers(
              value
            )
        )
      )
    ]
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );


  if (
    values.length ===
      0
  ) {
    return rawValues.join(
      " | "
    );
  }


  const currency =
    currencyLabel(
      observations
    );


  if (
    values.length ===
      1
  ) {
    return formatMoney(
      values[0]!,
      currency
    );
  }


  return (
    formatMoney(
      values[0]!,
      currency
    ) +
    " - " +
    formatMoney(
      values[
        values.length -
        1
      ]!,
      currency
    )
  );
}


function primaryOwnedInventoryObservations(
  observations:
    readonly ProductObservation[]
): ProductObservation[] {

  const candidates =
    observations.filter(
      observation =>
        observation.field ===
          "AVAILABILITY" ||
        observation.field ===
          "INVENTORY_LEVEL"
    );


  const hasOwnership =
    candidates.some(
      observation =>
        observation.ownership !==
          undefined &&
        observation.ownership !==
          null
    );


  if (
    !hasOwnership
  ) {
    return candidates;
  }


  const primary =
    candidates.filter(
      observation =>
        observation.ownership ===
          "PRIMARY_PRODUCT"
    );


  if (
    primary.length >
      0
  ) {
    return primary;
  }


  return candidates.filter(
    observation =>
      observation.ownership ===
        "UNKNOWN" ||
      observation.ownership ===
        undefined ||
      observation.ownership ===
        null
  );
}


function visibleInventoryQuantities(
  observations:
    readonly ProductObservation[]
): number[] {

  const values:
    number[] =
      [];


  for (
    const observation
    of observations
  ) {

    if (
      observation.field !==
        "AVAILABILITY"
    ) {
      continue;
    }


    const match =
      observation.rawValue.match(
        /(?:tồn\s*kho|còn(?:\s*lại)?|stock|remaining)[^0-9]{0,20}(\d+)/iu
      );


    if (
      !match?.[1]
    ) {
      continue;
    }


    const parsed =
      Number.parseInt(
        match[1],
        10
      );


    if (
      Number.isFinite(
        parsed
      )
    ) {
      values.push(
        parsed
      );
    }
  }


  return [
    ...new Set(
      values
    )
  ];
}


function inventoryDisplay(
  observations:
    readonly ProductObservation[]
): string {

  const owned =
    primaryOwnedInventoryObservations(
      observations
    );


  const structured =
    owned
      .filter(
        observation =>
          observation.field ===
            "INVENTORY_LEVEL"
      )
      .flatMap(
        observation =>
          observation.rawValue.match(
            /\d+(?:[.,]\d+)?/g
          ) ??
          []
      )
      .map(
        value =>
          Number(
            value.replace(
              ",",
              "."
            )
          )
      )
      .filter(
        value =>
          Number.isFinite(
            value
          )
      );


  const numeric =
    [
      ...new Set([
        ...structured,
        ...visibleInventoryQuantities(
          owned
        )
      ])
    ]
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );


  if (
    numeric.length ===
      1
  ) {
    return String(
      numeric[0]
    );
  }


  if (
    numeric.length >
      1
  ) {
    return (
      String(
        numeric[0]
      ) +
      " - " +
      String(
        numeric[
          numeric.length -
          1
        ]
      )
    );
  }


  const states =
    owned
      .filter(
        observation =>
          observation.field ===
            "AVAILABILITY"
      )
      .map(
        observation => {

          const value =
            observation.rawValue;


          const tail =
            schemaTail(
              value
            );


          return (
            AVAILABILITY_LABELS[
              tail
            ] ??
            value
              .replace(
                /^https?:\/\/schema\.org\//i,
                ""
              )
              .trim()
          );
        }
      )
      .filter(
        Boolean
      );


  return [
    ...new Set(
      states
    )
  ].join(
    " | "
  );
}


function numericDisplay(
  observations:
    readonly ProductObservation[],
  field:
    ObservationField
): string {

  const candidates =
    observationsFor(
      observations,
      field
    );


  const primary =
    candidates.filter(
      observation =>
        observation.ownership ===
          "PRIMARY_PRODUCT"
    );


  const scoped =
    primary.length >
      0
      ? primary
      : candidates.filter(
          observation =>
            observation.ownership !==
              "RELATED" &&
            observation.ownership !==
              "PAGE_CHROME"
        );


  const values =
    [
      ...new Set(
        scoped
          .map(
            observation =>
              observation.rawValue.trim()
          )
          .filter(
            Boolean
          )
      )
    ];


  const normalized =
    [
      ...new Set(
        values.map(
          value => {

            const numeric =
              Number(
                value
                  .replace(
                    ",",
                    "."
                  )
                  .replace(
                    /[^0-9.]/g,
                    ""
                  )
              );


            return Number.isFinite(
              numeric
            )
              ? String(
                  numeric
                )
              : value;
          }
        )
      )
    ];


  return normalized.join(
    " | "
  );
}


function hasRentalEvidence(
  observations:
    readonly ProductObservation[]
): boolean {

  if (
    uniqueValues(
      observations,
      "RENTAL_CONDITIONS"
    ).length >
      0 ||
    uniqueValues(
      observations,
      "RENTAL_TIME"
    ).length >
      0
  ) {
    return true;
  }


  const business =
    uniqueValues(
      observations,
      "BUSINESS_FUNCTION"
    ).join(
      " "
    );


  if (
    /(?:lease|rent)/i.test(
      business
    )
  ) {
    return true;
  }


  const visible =
    [
      ...uniqueValues(
        observations,
        "PRODUCT_NAME"
      ),
      ...uniqueValues(
        observations,
        "CATEGORY"
      ),
      ...uniqueValues(
        observations,
        "ACTION_TEXT"
      )
    ].join(
      " "
    );


  return /\bthuê(?![\p{L}\p{N}_])/iu.test(
    visible
  );
}


function representativeUrl(
  product:
    BulkProductRecord
): string {

  const canonical =
    product.identity.tokens.find(
      token =>
        token.kind ===
          "CANONICAL"
    );


  if (
    canonical
  ) {
    return canonical.value;
  }


  const structuredUrl =
    product.identity.tokens.find(
      token =>
        token.kind ===
          "STRUCTURED_URL"
    );


  return (
    structuredUrl?.value ??
    product.identity.memberUrls[0] ??
    ""
  );
}


export function buildMainPresentationRow(
  product:
    BulkProductRecord,
  rootUrl:
    string
): MainPresentationRow {

  const price =
    priceDisplay(
      product.observations
    );


  const rental =
    hasRentalEvidence(
      product.observations
    );


  return {
    website:
      new URL(
        rootUrl
      ).host,

    productName:
      productNameDisplay(
        product.observations
      ),

    form:
      oldNewDisplay(
        product.observations
      ),

    specs:
      joinValues(
        product.observations,
        "SPECS"
      ),

    rentalPrice:
      rental
        ? price
        : "",

    rentalConditions:
      joinValues(
        product.observations,
        "RENTAL_CONDITIONS"
      ),

    accessories:
      joinValues(
        product.observations,
        "ACCESSORIES"
      ),

    combo:
      joinValues(
        product.observations,
        "COMBO"
      ),

    rating:
      numericDisplay(
        product.observations,
        "RATING"
      ),

    reviewCount:
      numericDisplay(
        product.observations,
        "REVIEW_COUNT"
      ),

    stock:
      inventoryDisplay(
        product.observations
      ),

    salePrice:
      rental
        ? ""
        : price,

    url:
      representativeUrl(
        product
      )
  };
}
