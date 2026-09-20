export type VisionDisposition =
  | "CAMERA"
  | "NON_CAMERA"
  | "NON_PRODUCT"
  | "UNKNOWN";


export interface EvidenceValue<T> {
  value:
    T;

  rawText:
    string;

  shotId:
    string;
}


export interface MoneyEvidenceValue extends EvidenceValue<number> {
  currency:
    string;
}


export interface VisualExtraction {
  website:
    EvidenceValue<string> |
    null;

  productName:
    EvidenceValue<string> |
    null;

  condition:
    EvidenceValue<string> |
    null;

  specs:
    EvidenceValue<string>[];

  rentalPricePerDay:
    MoneyEvidenceValue |
    null;

  rentalTerms:
    EvidenceValue<string> |
    null;

  accessoriesIncluded:
    EvidenceValue<string[]> |
    null;

  bundleIncluded:
    EvidenceValue<string[]> |
    null;

  rating:
    EvidenceValue<number> |
    null;

  reviewCount:
    EvidenceValue<number> |
    null;

  stock:
    EvidenceValue<string | number> |
    null;

  salePrice:
    MoneyEvidenceValue |
    null;

  url:
    string;
}


export interface VisualExtractionValidationContext {
  expectedUrl:
    string;

  expectedDomain?:
    string;

  shotIds:
    ReadonlySet<string>;

  disposition?:
    VisionDisposition;
}


export interface VisualExtractionValidationIssue {
  code:
    string;

  message:
    string;

  field?:
    string;
}


export interface VisualExtractionValidationResult {
  status:
    "VALIDATED" |
    "REVIEW";

  issues:
    VisualExtractionValidationIssue[];

  value:
    VisualExtraction;
}


const ACCESSORY_POLICY_PATTERN =
  /(?:bảo\s*hành|bao\s*hanh|warranty|vat|thuế\s*vat|chính\s*sách|chinh\s*sach|đổi\s*trả|doi\s*tra|trả\s*góp|tra\s*gop|installment)/iu;


const RELATED_BUNDLE_PATTERN =
  /(?:khách\s*thường\s*mua\s*thêm|khach\s*thuong\s*mua\s*them|sản\s*phẩm\s*liên\s*quan|san\s*pham\s*lien\s*quan|customers?\s+also\s+buy|frequently\s+bought|related\s+products?|gợi\s*ý\s*mua\s*kèm|goi\s*y\s*mua\s*kem)/iu;


function normalizedDomain(
  value:
    string
): string {

  const trimmed =
    value.trim()
      .toLowerCase();

  if (
    trimmed.length ===
      0
  ) {
    return "";
  }


  try {
    return new URL(
      /^[a-z][a-z0-9+.-]*:\/\//iu.test(
        trimmed
      )
        ? trimmed
        : "https://" +
          trimmed
    ).hostname.replace(
      /^www\./u,
      ""
    );
  }
  catch {
    return trimmed.replace(
      /^www\./u,
      ""
    );
  }
}


function canonicalUrl(
  value:
    string
): string |
  null {

  try {
    return new URL(
      value
    ).toString();
  }
  catch {
    return null;
  }
}


function addIssue(
  issues:
    VisualExtractionValidationIssue[],
  code:
    string,
  message:
    string,
  field?:
    string
): void {

  issues.push({
    code,
    message,
    ...(
      field
        ? {
            field
          }
        : {}
    )
  });
}


function validateEvidence<T>(
  field:
    string,
  evidence:
    EvidenceValue<T> |
    null,
  context:
    VisualExtractionValidationContext,
  issues:
    VisualExtractionValidationIssue[]
): void {

  if (
    evidence ===
      null
  ) {
    return;
  }


  if (
    evidence.rawText
      .trim()
      .length ===
      0
  ) {
    addIssue(
      issues,
      "RAW_TEXT_MISSING",
      "Non-null field must include visible rawText evidence.",
      field
    );
  }


  if (
    evidence.shotId
      .trim()
      .length ===
      0
  ) {
    addIssue(
      issues,
      "SHOT_ID_MISSING",
      "Non-null field must include a shotId.",
      field
    );

    return;
  }


  if (
    !context.shotIds.has(
      evidence.shotId
    )
  ) {
    addIssue(
      issues,
      "UNKNOWN_SHOT_ID",
      "Field references a shotId that is not present in the capture manifest.",
      field
    );
  }
}


function normalizeCondition(
  condition:
    EvidenceValue<string> |
    null,
  issues:
    VisualExtractionValidationIssue[]
): EvidenceValue<string> |
  null {

  if (
    condition ===
      null
  ) {
    return null;
  }


  const source =
    (
      condition.value +
      " " +
      condition.rawText
    )
      .normalize(
        "NFC"
      )
      .trim();


  let value:
    "NEW" |
    "USED" |
    null = null;


  if (
    /(?:^|\b)(?:like\s*new|likenew|used)(?:\b|$)|hàng\s*cũ|hang\s*cu|đã\s*qua\s*sử\s*dụng|da\s*qua\s*su\s*dung/iu.test(
      source
    )
  ) {
    value =
      "USED";
  }
  else if (
    /(?:^|\b)new(?:\b|$)|hàng\s*mới|hang\s*moi|mới\s*100\s*%|moi\s*100\s*%|chính\s*hãng|chinh\s*hang/iu.test(
      source
    )
  ) {
    value =
      "NEW";
  }


  if (
    value ===
      null
  ) {
    addIssue(
      issues,
      "CONDITION_UNSUPPORTED",
      "Condition must normalize to NEW, USED, or null.",
      "condition"
    );

    return null;
  }


  return {
    ...condition,
    value
  };
}


function normalizeAccessories(
  evidence:
    EvidenceValue<string[]> |
    null,
  issues:
    VisualExtractionValidationIssue[]
): EvidenceValue<string[]> |
  null {

  if (
    evidence ===
      null
  ) {
    return null;
  }


  const clean =
    evidence.value
      .map(
        value =>
          value.trim()
      )
      .filter(
        value =>
          value.length >
            0
      );


  const kept =
    clean.filter(
      value =>
        !ACCESSORY_POLICY_PATTERN.test(
          value
        )
    );


  if (
    kept.length !==
      clean.length ||
    (
      clean.length <=
        1 &&
      ACCESSORY_POLICY_PATTERN.test(
        evidence.rawText
      )
    )
  ) {
    addIssue(
      issues,
      "ACCESSORY_POLICY_CONTAMINATION",
      "Warranty/VAT/purchase policy text must not be exported as an included accessory.",
      "accessoriesIncluded"
    );
  }


  if (
    kept.length ===
      0
  ) {
    return null;
  }


  return {
    ...evidence,
    value:
      kept
  };
}


function normalizeBundle(
  evidence:
    EvidenceValue<string[]> |
    null,
  issues:
    VisualExtractionValidationIssue[]
): EvidenceValue<string[]> |
  null {

  if (
    evidence ===
      null
  ) {
    return null;
  }


  if (
    RELATED_BUNDLE_PATTERN.test(
      evidence.rawText
    )
  ) {
    addIssue(
      issues,
      "RELATED_PRODUCT_AS_BUNDLE",
      "Related/customers-also-buy content must not be exported as an included bundle.",
      "bundleIncluded"
    );

    return null;
  }


  const values =
    evidence.value
      .map(
        value =>
          value.trim()
      )
      .filter(
        value =>
          value.length >
            0
      );


  return values.length >
    0
    ? {
        ...evidence,
        value:
          values
      }
    : null;
}


function cloneExtraction(
  extraction:
    VisualExtraction
): VisualExtraction {

  return {
    ...extraction,

    website:
      extraction.website
        ? {
            ...extraction.website
          }
        : null,

    productName:
      extraction.productName
        ? {
            ...extraction.productName
          }
        : null,

    condition:
      extraction.condition
        ? {
            ...extraction.condition
          }
        : null,

    specs:
      extraction.specs.map(
        item => ({
          ...item
        })
      ),

    rentalPricePerDay:
      extraction.rentalPricePerDay
        ? {
            ...extraction.rentalPricePerDay
          }
        : null,

    rentalTerms:
      extraction.rentalTerms
        ? {
            ...extraction.rentalTerms
          }
        : null,

    accessoriesIncluded:
      extraction.accessoriesIncluded
        ? {
            ...extraction.accessoriesIncluded,
            value:
              [
                ...extraction.accessoriesIncluded.value
              ]
          }
        : null,

    bundleIncluded:
      extraction.bundleIncluded
        ? {
            ...extraction.bundleIncluded,
            value:
              [
                ...extraction.bundleIncluded.value
              ]
          }
        : null,

    rating:
      extraction.rating
        ? {
            ...extraction.rating
          }
        : null,

    reviewCount:
      extraction.reviewCount
        ? {
            ...extraction.reviewCount
          }
        : null,

    stock:
      extraction.stock
        ? {
            ...extraction.stock
          }
        : null,

    salePrice:
      extraction.salePrice
        ? {
            ...extraction.salePrice
          }
        : null
  };
}


export function validateVisualExtraction(
  extraction:
    VisualExtraction,
  context:
    VisualExtractionValidationContext
): VisualExtractionValidationResult {

  const issues:
    VisualExtractionValidationIssue[] = [];

  const value =
    cloneExtraction(
      extraction
    );


  value.condition =
    normalizeCondition(
      value.condition,
      issues
    );

  value.accessoriesIncluded =
    normalizeAccessories(
      value.accessoriesIncluded,
      issues
    );

  value.bundleIncluded =
    normalizeBundle(
      value.bundleIncluded,
      issues
    );


  validateEvidence(
    "website",
    value.website,
    context,
    issues
  );

  validateEvidence(
    "productName",
    value.productName,
    context,
    issues
  );

  validateEvidence(
    "condition",
    value.condition,
    context,
    issues
  );

  for (
    const [
      index,
      spec
    ]
    of value.specs.entries()
  ) {
    validateEvidence(
      "specs[" +
      index +
      "]",
      spec,
      context,
      issues
    );
  }

  validateEvidence(
    "rentalPricePerDay",
    value.rentalPricePerDay,
    context,
    issues
  );

  validateEvidence(
    "rentalTerms",
    value.rentalTerms,
    context,
    issues
  );

  validateEvidence(
    "accessoriesIncluded",
    value.accessoriesIncluded,
    context,
    issues
  );

  validateEvidence(
    "bundleIncluded",
    value.bundleIncluded,
    context,
    issues
  );

  validateEvidence(
    "rating",
    value.rating,
    context,
    issues
  );

  validateEvidence(
    "reviewCount",
    value.reviewCount,
    context,
    issues
  );

  validateEvidence(
    "stock",
    value.stock,
    context,
    issues
  );

  validateEvidence(
    "salePrice",
    value.salePrice,
    context,
    issues
  );


  if (
    (
      context.disposition ??
      "CAMERA"
    ) ===
      "CAMERA"
  ) {
    if (
      value.website ===
        null ||
      value.website.value
        .trim()
        .length ===
        0
    ) {
      addIssue(
        issues,
        "WEBSITE_MISSING",
        "Camera rows require a website host.",
        "website"
      );
    }


    if (
      value.productName ===
        null ||
      value.productName.value
        .trim()
        .length ===
        0
    ) {
      addIssue(
        issues,
        "PRODUCT_NAME_MISSING",
        "Camera rows require a non-empty productName.",
        "productName"
      );
    }
  }


  const expectedDomain =
    normalizedDomain(
      context.expectedDomain ??
      context.expectedUrl
    );

  const actualDomain =
    value.website
      ? normalizedDomain(
          value.website.value
        )
      : "";


  if (
    actualDomain.length >
      0 &&
    expectedDomain.length >
      0 &&
    actualDomain !==
      expectedDomain
  ) {
    addIssue(
      issues,
      "WEBSITE_DOMAIN_MISMATCH",
      "Extracted website does not match the run context domain.",
      "website"
    );
  }


  const expectedUrl =
    canonicalUrl(
      context.expectedUrl
    );

  const actualUrl =
    canonicalUrl(
      value.url
    );


  if (
    actualUrl ===
      null
  ) {
    addIssue(
      issues,
      "URL_INVALID",
      "Extraction URL is not a valid absolute URL.",
      "url"
    );
  }
  else if (
    expectedUrl !==
      null &&
    actualUrl !==
      expectedUrl
  ) {
    addIssue(
      issues,
      "URL_CONTEXT_MISMATCH",
      "Extraction URL does not match the final URL in run context.",
      "url"
    );
  }


  if (
    value.rating !==
      null &&
    (
      !Number.isFinite(
        value.rating.value
      ) ||
      value.rating.value <
        0 ||
      value.rating.value >
        5
    )
  ) {
    addIssue(
      issues,
      "RATING_OUT_OF_RANGE",
      "Rating must be between 0 and 5.",
      "rating"
    );
  }


  if (
    value.reviewCount !==
      null &&
    (
      !Number.isInteger(
        value.reviewCount.value
      ) ||
      value.reviewCount.value <
        0
    )
  ) {
    addIssue(
      issues,
      "REVIEW_COUNT_NOT_INTEGER",
      "Review count must be an integer greater than or equal to zero.",
      "reviewCount"
    );
  }


  if (
    value.rentalPricePerDay !==
      null &&
    (
      !Number.isFinite(
        value.rentalPricePerDay.value
      ) ||
      value.rentalPricePerDay.value <=
        0
    )
  ) {
    addIssue(
      issues,
      "RENTAL_PRICE_NOT_POSITIVE",
      "Rental price per day must be a positive numeric value.",
      "rentalPricePerDay"
    );
  }


  if (
    value.salePrice !==
      null
  ) {
    if (
      !Number.isFinite(
        value.salePrice.value
      ) ||
      value.salePrice.value <=
        0
    ) {
      addIssue(
        issues,
        "SALE_PRICE_NOT_POSITIVE",
        "Sale price must be a positive numeric value.",
        "salePrice"
      );
    }


    if (
      value.salePrice.currency
        .trim()
        .length ===
        0
    ) {
      addIssue(
        issues,
        "SALE_PRICE_CURRENCY_MISSING",
        "Sale price must include currency.",
        "salePrice"
      );
    }
  }


  return {
    status:
      issues.length ===
        0
        ? "VALIDATED"
        : "REVIEW",

    issues,

    value
  };
}
