import {
  parseRentalPrice,
  parseSalePrice
} from "./priceParser.js";

export type OfferKind =
  | "RENTAL"
  | "SALE";

export interface OfferInput {
  title?: string;
  category?: string;

  pageText?: string;

  buttons?: string[];
  visiblePriceTexts?: string[];

  jsonLdBusinessFunctions?: string[];

  networkBusinessFunctions?: string[];

  /*
   * Site mode is ONLY weak context.
   * It must never decide the result alone.
   */
  siteMode?:
    | "RENTAL"
    | "SALE_SECOND_HAND"
    | "SALE_NEW"
    | "SALE_MIXED"
    | "MIXED"
    | "UNKNOWN";
}

export interface OfferEvidence {
  kind: OfferKind;
  source:
    | "JSON_LD"
    | "CTA"
    | "PRICE"
    | "SECTION"
    | "CATEGORY"
    | "NETWORK"
    | "SITE_PRIOR";

  /*
   * text is retained for compatibility with existing
   * diagnostics. raw is the canonical evidence payload.
   */
  text: string;

  raw: string;

  weight: number;

  ruleId: string;

  scope?: string;
}

export interface OfferResult {
  rental: boolean;
  sale: boolean;

  rentalScore: number;
  saleScore: number;

  confidence:
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  evidence: OfferEvidence[];
}

function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function add(
  evidence: OfferEvidence[],
  kind: OfferKind,
  source: OfferEvidence["source"],
  text: string,
  weight: number
): void {
  const scope =
    source === "JSON_LD"
      ? "jsonLd.businessFunction"
      : source === "NETWORK"
        ? "networkFacts.sample.businessFunction"
        : source === "CTA"
          ? "buttons"
          : source === "PRICE"
            ? "visiblePriceTexts"
            : source === "SECTION"
              ? "transaction_sections"
              : source === "CATEGORY"
                ? "title_or_listing_category"
                : "siteMode";

  evidence.push({
    kind,
    source,
    text,
    raw:
      text,
    weight,
    ruleId:
      `offer.${kind.toLowerCase()}.${source.toLowerCase()}`,
    scope
  });
}

export function classifyOffers(
  input: OfferInput
): OfferResult {

  const evidence: OfferEvidence[] = [];

  const title =
    norm(input.title);

  const category =
    norm(input.category);

  const pageText =
    norm(input.pageText);

  const buttons =
    (input.buttons ?? [])
      .map(norm)
      .filter(Boolean);

  const prices =
    (input.visiblePriceTexts ?? [])
      .map(norm)
      .filter(Boolean);

  const businessFunctions =
    (input.jsonLdBusinessFunctions ?? [])
      .map(norm)
      .filter(Boolean);

  const networkBusinessFunctions =
    (
      input.networkBusinessFunctions ??
      []
    )
      .map(norm)
      .filter(Boolean);

  let rentalScore = 0;
  let saleScore = 0;

  /*
   * ====================================================
   * 1. STRUCTURED EVIDENCE — STRONGEST
   * ====================================================
   */

  for (
    const value
    of businessFunctions
  ) {

    if (
      /leaseout|lease|rental|rent/
        .test(value)
    ) {

      rentalScore += 100;

      add(
        evidence,
        "RENTAL",
        "JSON_LD",
        value,
        100
      );
    }

    if (
      /#sell\b|\/sell\b|businessfunction.*sell/
        .test(value)
    ) {

      saleScore += 100;

      add(
        evidence,
        "SALE",
        "JSON_LD",
        value,
        100
      );
    }
  }

  /*
   * Correlated network structured evidence.
   *
   * Network values reach this classifier only after
   * product-level correlation in evidenceEngine.
   */
  for (
    const value
    of networkBusinessFunctions
  ) {
    if (
      /leaseout|lease|rental|rent/
        .test(value)
    ) {
      rentalScore += 100;

      add(
        evidence,
        "RENTAL",
        "NETWORK",
        value,
        100
      );
    }

    if (
      /#sell\b|\/sell\b|businessfunction.*sell/
        .test(value)
    ) {
      saleScore += 100;

      add(
        evidence,
        "SALE",
        "NETWORK",
        value,
        100
      );
    }
  }

  /*
   * ====================================================
   * 2. CTA BUTTONS
   * ====================================================
   */

  for (
    const button
    of buttons
  ) {

    if (
      /thue ngay|dat thue|thue may|thue san pham|lien he thue|dat lich thue|rent now|book rental/
        .test(button)
    ) {

      rentalScore += 80;

      add(
        evidence,
        "RENTAL",
        "CTA",
        button,
        80
      );
    }

    if (
      /mua ngay|them vao gio hang|dat mua|buy now|add to cart|checkout/
        .test(button)
    ) {

      saleScore += 80;

      add(
        evidence,
        "SALE",
        "CTA",
        button,
        80
      );
    }
  }

  /*
   * ====================================================
   * 3. PRICE FORMAT
   * ====================================================
   */

  for (
    const price
    of prices
  ) {

    /*
     * Explicit rental unit.
     */
    if (
      /(?:\/|\bper\b)\s*(?:ngay|day|24h|gio|hour)\b/
        .test(price) ||
      /gia thue/
        .test(price)
    ) {

      rentalScore += 90;

      add(
        evidence,
        "RENTAL",
        "PRICE",
        price,
        90
      );

      continue;
    }

    /*
     * Plain currency alone is only supporting
     * SALE evidence, never sufficient by itself.
     */
    if (
      /\d[\d.,\s]*\s*(?:d|₫|vnd)/
        .test(price)
    ) {

      saleScore += 20;

      add(
        evidence,
        "SALE",
        "PRICE",
        price,
        20
      );
    }
  }

  /*
   * Explicit rental price inside a bounded product-description
   * section is strong transaction evidence. Some rental stores are
   * implemented on ecommerce platforms and therefore expose generic
   * "add to cart" controls even though the product is rental-only.
   */
  const scopedRentalPrice =
    pageText.match(
      /gia thue\s*[:：-]?\s*\d[\d.,\s]*\s*(?:d|₫|vnd)(?:\s*\/\s*(?:\d+\s*)?(?:ngay|day|24h))?/i
    );

  if (
    scopedRentalPrice
  ) {
    rentalScore += 90;

    add(
      evidence,
      "RENTAL",
      "SECTION",
      scopedRentalPrice[0],
      90
    );
  }


  /*
   * ====================================================
   * 4. PAGE SECTIONS / VISIBLE TEXT
   * ====================================================
   */

  const rentalSections = [
    /thoi gian thue/,
    /ngay nhan/,
    /ngay tra/,
    /tien coc|dat coc/,
    /giay to can thiet/,
    /dieu kien thue/,
    /phi tre/,
    /chinh sach thue/
  ];

  let rentalSectionHits = 0;

  for (
    const pattern
    of rentalSections
  ) {

    if (
      pattern.test(pageText)
    ) {
      rentalSectionHits++;
    }
  }

  if (
    rentalSectionHits >= 2
  ) {

    rentalScore += 55;

    add(
      evidence,
      "RENTAL",
      "SECTION",
      `rental sections=${rentalSectionHits}`,
      55
    );
  }
  else if (
    rentalSectionHits === 1
  ) {

    rentalScore += 20;

    add(
      evidence,
      "RENTAL",
      "SECTION",
      "single rental section",
      20
    );
  }

  const saleSections = [
    /mua ngay/,
    /them vao gio hang/,
    /gio hang/,
    /chinh sach mua hang/,
    /thanh toan khi mua/,
    /dat mua/
  ];

  let saleSectionHits = 0;

  for (
    const pattern
    of saleSections
  ) {

    if (
      pattern.test(pageText)
    ) {
      saleSectionHits++;
    }
  }

  if (
    saleSectionHits >= 2
  ) {

    saleScore += 55;

    add(
      evidence,
      "SALE",
      "SECTION",
      `sale sections=${saleSectionHits}`,
      55
    );
  }
  else if (
    saleSectionHits === 1
  ) {

    saleScore += 20;

    add(
      evidence,
      "SALE",
      "SECTION",
      "single sale section",
      20
    );
  }

  /*
   * An explicit rental product title is strong transaction evidence.
   * It describes the offer itself, unlike siteMode/category priors.
   */
  if (
    /\b(?:cho thue|thue)\b/
      .test(
        title
      )
  ) {
    rentalScore += 80;

    add(
      evidence,
      "RENTAL",
      "CATEGORY",
      title,
      80
    );
  }


  /*
   * ====================================================
   * 5. CATEGORY — SUPPORTING ONLY
   * ====================================================
   */

  if (
    /thue may anh|thue camera|camera rental/
      .test(category)
  ) {

    rentalScore += 25;

    add(
      evidence,
      "RENTAL",
      "CATEGORY",
      category,
      25
    );
  }

  if (
    /may anh cu|hang cu|second hand|used camera/
      .test(category)
  ) {

    saleScore += 25;

    add(
      evidence,
      "SALE",
      "CATEGORY",
      category,
      25
    );
  }

  if (
    /may anh chinh hang|may anh moi|new camera/
      .test(category)
  ) {

    saleScore += 25;

    add(
      evidence,
      "SALE",
      "CATEGORY",
      category,
      25
    );
  }

  /*
   * Title can support transaction evidence,
   * but cannot decide it alone.
   */
  if (
    /hang cu|da qua su dung|second hand/
      .test(title)
  ) {

    saleScore += 20;

    add(
      evidence,
      "SALE",
      "CATEGORY",
      title,
      20
    );
  }

  if (
    /new 100%|hang moi|chinh hang/
      .test(title)
  ) {

    saleScore += 20;

    add(
      evidence,
      "SALE",
      "CATEGORY",
      title,
      20
    );
  }

  /*
   * ====================================================
   * 6. SITE MODE — VERY WEAK PRIOR
   * ====================================================
   */

  if (
    input.siteMode ===
    "RENTAL"
  ) {

    /*
     * Diagnostic prior only.
     *
     * Product truth must not depend on siteMode.
     */
    add(
      evidence,
      "RENTAL",
      "SITE_PRIOR",
      "site mode RENTAL",
      0
    );
  }

  if (
    input.siteMode ===
      "SALE_SECOND_HAND" ||
    input.siteMode ===
      "SALE_NEW" ||
    input.siteMode ===
      "SALE_MIXED"
  ) {

    /*
     * Diagnostic prior only.
     *
     * Product truth must not depend on siteMode.
     */
    add(
      evidence,
      "SALE",
      "SITE_PRIOR",
      String(
        input.siteMode
      ),
      0
    );
  }

  /*
   * ====================================================
   * 7. DECISION
   * ====================================================
   *
   * 60 means at least one genuinely strong signal
   * or several mutually reinforcing weaker signals.
   *
   * Site mode alone (5) or category alone (25)
   * can never decide.
   */

  const rental =
    rentalScore >= 60;


  /*
   * Generic ecommerce affordances are ambiguous on rental pages.
   * When rental truth is explicit, "add to cart" + a plain currency
   * amount must not manufacture a SALE offer by themselves.
   *
   * Real mixed rental/sale pages remain mixed when they also carry
   * sale-specific evidence such as Sell structured data, a purchase
   * CTA, or sale category/title evidence.
   */
  const rentalAmounts =
    [
      parseRentalPrice(
        input.pageText ?? ""
      ),
      ...(
        input.visiblePriceTexts ??
        []
      ).map(
        value =>
          parseRentalPrice(
            value
          )
      )
    ]
      .filter(
        (
          value
        ): value is number =>
          value !==
            null
      );


  const saleAmounts =
    (
      input.visiblePriceTexts ??
      []
    )
      .map(
        value =>
          parseSalePrice(
            value
          )
      )
      .filter(
        (
          value
        ): value is number =>
          value !==
            null
      );


  const hasIndependentSalePrice =
    rentalAmounts.length >
      0 &&
    saleAmounts.some(
      amount =>
        !rentalAmounts.includes(
          amount
        )
    );


  const hasIndependentSaleEvidence =
    evidence.some(
      item =>
        item.kind ===
          "SALE" &&
        (
          item.source ===
            "JSON_LD" ||
          item.source ===
            "NETWORK" ||
          item.source ===
            "CATEGORY"
        )
    ) ||
    hasIndependentSalePrice;


  const sale =
    saleScore >= 60 &&
    !(
      rentalScore >= 90 &&
      !hasIndependentSaleEvidence
    );

  let confidence:
    OfferResult["confidence"] =
    "LOW";

  const strongest =
    Math.max(
      rentalScore,
      saleScore
    );

  if (
    strongest >= 90
  ) {
    confidence = "HIGH";
  }
  else if (
    strongest >= 60
  ) {
    confidence = "MEDIUM";
  }

  return {
    rental,
    sale,
    rentalScore,
    saleScore,
    confidence,
    evidence
  };
}
