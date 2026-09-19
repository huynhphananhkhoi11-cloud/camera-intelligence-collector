function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a numeric amount that is already known to be a price source,
 * such as JSON-LD Offer.price.
 *
 * Important:
 * "180000.00" => 180000, NOT 18000000.
 */
export function parseStructuredPrice(
  value: unknown
): number | null {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0
      ? value
      : null;
  }

  let raw = cleanText(value)
    .replace(/[₫đ]/gi, "")
    .replace(/\bVND\b/gi, "")
    .replace(/\s+/g, "");

  if (!raw) {
    return null;
  }

  // Plain integer: 180000
  if (/^\d+$/.test(raw)) {
    const result = Number(raw);
    return Number.isFinite(result) && result > 0
      ? result
      : null;
  }

  /**
   * Thousand grouped:
   * 14.500.000
   * 14,500,000
   * 288.000
   * 288,000
   */
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) {
    const result = Number(
      raw.replace(/[.,]/g, "")
    );

    return Number.isFinite(result) && result > 0
      ? result
      : null;
  }

  /**
   * Decimal price:
   * 180000.00
   * 180000,00
   */
  if (/^\d+[.,]\d{1,2}$/.test(raw)) {
    const result = Number(
      raw.replace(",", ".")
    );

    return Number.isFinite(result) && result > 0
      ? result
      : null;
  }

  /**
   * Mixed thousands + decimal:
   * 180,000.00
   * 180.000,00
   */
  const mixed = raw.match(
    /^(\d{1,3}(?:[.,]\d{3})+)([.,]\d{1,2})$/
  );

  if (mixed) {
    const decimalSeparator =
      mixed[2][0];

    const decimalPart =
      mixed[2].slice(1);

    const integerPart =
      mixed[1].replace(/[.,]/g, "");

    const normalized =
      `${integerPart}.${decimalPart}`;

    const result = Number(normalized);

    return Number.isFinite(result) && result > 0
      ? result
      : null;
  }

  return null;
}

/**
 * Extract a RENTAL price only when rental-unit evidence exists.
 *
 * Examples:
 * 288.000đ/ngày
 * 360,000 ₫ / ngày
 *
 * It must NOT read:
 * 651 điểm lấy nét
 */
export function parseRentalPrice(
  value: unknown
): number | null {

  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const patterns = [
    /(\d[\d.,\s]*)\s*(?:đ|₫|vnd)\s*\/\s*(?:ngày|day|24h)\b/i,
    /(\d[\d.,\s]*)\s*(?:đ|₫|vnd)\s*(?:mỗi|per)\s*(?:ngày|day)\b/i,
    /giá\s*thuê\s*[:：-]?\s*(\d[\d.,\s]*)\s*(?:đ|₫|vnd)(?:\s*\/\s*(?:ngày|day|24h))?/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const result =
      parseStructuredPrice(match[1]);

    if (result !== null) {
      return result;
    }
  }

  return null;
}

/**
 * Extract a SALE price.
 *
 * Rental strings are deliberately rejected:
 * "288.000đ/ngày" is NOT a sale price.
 */
export function parseSalePrice(
  value: unknown
): number | null {

  const text = cleanText(value);

  if (!text) {
    return null;
  }

  if (parseRentalPrice(text) !== null) {
    return null;
  }

  const matches = [
    ...text.matchAll(
      /(\d[\d.,\s]*)\s*(?:đ|₫|vnd)(?=$|\s|\/|\d|[+\-]|(?:giảm|giam|giá|gia|save|discount))/giu
    )
  ];

  for (const match of matches) {
    const result =
      parseStructuredPrice(match[1]);

    if (
      result !== null &&
      result >= 1000
    ) {
      return result;
    }
  }

  return null;
}

