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


const CONDITION_LABELS:
  Readonly<
    Record<
      string,
      string
    >
  > = {
    NewCondition:
      "Mới",

    UsedCondition:
      "Đã qua sử dụng",

    RefurbishedCondition:
      "Tân trang",

    DamagedCondition:
      "Hư hỏng"
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


function compactVisibleCondition(
  value:
    string
): string {

  const parenthetical =
    value.match(
      /\(([^)]*(?:new|used|mới|cũ|99%|100%|qua sử dụng)[^)]*)\)/iu
    );


  if (
    parenthetical?.[1]
  ) {
    return parenthetical[1]
      .trim();
  }


  const lower =
    value.toLocaleLowerCase(
      "vi"
    );


  if (
    /\bnew\s*100%\b/i.test(
      value
    )
  ) {
    return "NEW 100%";
  }


  if (
    lower.includes(
      "đã qua sử dụng"
    ) ||
    lower.includes(
      "qua sử dụng"
    )
  ) {
    return "Đã qua sử dụng";
  }


  if (
    /\bhàng\s*cũ\b/iu.test(
      value
    ) ||
    /\bcũ\b/iu.test(
      value
    )
  ) {
    return "Cũ";
  }


  return value.trim();
}


function conditionDisplay(
  observations:
    readonly ProductObservation[]
): string {

  const values =
    observationsFor(
      observations,
      "CONDITION"
    )
      .map(
        observation => {

          if (
            observation.sourceKind ===
              "JSON_LD" ||
            /^https?:\/\//i.test(
              observation.rawValue
            )
          ) {
            const tail =
              schemaTail(
                observation.rawValue
              );


            return (
              CONDITION_LABELS[
                tail
              ] ??
              tail
            );
          }


          return compactVisibleCondition(
            observation.rawValue
          );
        }
      )
      .filter(
        Boolean
      );


  return [
    ...new Set(
      values
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


function priceDisplay(
  observations:
    readonly ProductObservation[]
): string {

  const rawValues =
    uniqueValues(
      observations,
      "PRICE"
    );


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


function visibleInventoryQuantities(
  observations:
    readonly ProductObservation[]
): number[] {

  const values:
    number[] =
      [];


  for (
    const raw
    of uniqueValues(
      observations,
      "AVAILABILITY"
    )
  ) {

    const match =
      raw.match(
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

  const structured =
    uniqueValues(
      observations,
      "INVENTORY_LEVEL"
    )
      .flatMap(
        value =>
          value.match(
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
          observations
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
    uniqueValues(
      observations,
      "AVAILABILITY"
    )
      .map(
        value => {

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

  const values =
    uniqueValues(
      observations,
      field
    );


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


  return /\bthuê\b/iu.test(
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
      firstPreferredValue(
        product.observations,
        "PRODUCT_NAME"
      ),

    form:
      conditionDisplay(
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
