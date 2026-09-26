export interface MoneyValue {
  readonly value: number;
  readonly currency: string;
}

export type NormalizedCondition = "NEW" | "USED" | null;

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/\s+/gu, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function primitiveText(value: unknown): string | null {
  if (typeof value === "string") {
    return cleanString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function normalizeText(value: unknown): string | null {
  return primitiveText(value);
}

function parseNumberishString(text: string): number | null {
  const compact = text.replace(/\s+/gu, "").replace(/[^0-9,.-]/gu, "");
  if (!compact || !/[0-9]/u.test(compact)) {
    return null;
  }

  const negative = compact.startsWith("-");
  const unsigned = compact.replace(/-/gu, "");
  const dotCount = (unsigned.match(/\./gu) ?? []).length;
  const commaCount = (unsigned.match(/,/gu) ?? []).length;

  let normalized = unsigned;

  if (dotCount > 0 && commaCount > 0) {
    const lastDot = unsigned.lastIndexOf(".");
    const lastComma = unsigned.lastIndexOf(",");
    const decimalIndex = Math.max(lastDot, lastComma);
    const decimalDigits = unsigned.length - decimalIndex - 1;

    if (decimalDigits >= 1 && decimalDigits <= 2) {
      const integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/gu, "");
      const fractionPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/gu, "");
      normalized = `${integerPart}.${fractionPart}`;
    } else {
      normalized = unsigned.replace(/[.,]/gu, "");
    }
  } else if (dotCount > 0 || commaCount > 0) {
    const separator = dotCount > 0 ? "." : ",";
    const parts = unsigned.split(separator);

    if (parts.length > 2 && parts.slice(1).every((part) => part.length === 3)) {
      normalized = parts.join("");
    } else if (parts.length === 2) {
      const [head, tail] = parts;
      if (tail.length === 3 && head.length >= 1) {
        normalized = `${head}${tail}`;
      } else if (tail.length >= 1 && tail.length <= 2) {
        normalized = `${head}.${tail}`;
      } else {
        normalized = parts.join("");
      }
    } else {
      normalized = parts.join("");
    }
  }

  if (negative) {
    normalized = `-${normalized}`;
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function detectCurrency(text: string): string | null {
  const explicitCode = text.match(/(?:^|[^A-Za-z])([A-Z]{3})(?:$|[^A-Za-z])/u);
  if (explicitCode) {
    return explicitCode[1];
  }

  if (text.includes("₫") || /(?:^|[\d\s.,])đ(?:\s|$)/iu.test(text)) {
    return "VND";
  }
  if (text.includes("€")) {
    return "EUR";
  }
  if (text.includes("£")) {
    return "GBP";
  }
  if (text.includes("$")) {
    return "$";
  }
  if (text.includes("¥")) {
    return "¥";
  }

  return null;
}

export function normalizeMoney(
  raw: unknown,
  currencyHint?: unknown,
): MoneyValue | null {
  const explicitCurrency = cleanString(currencyHint);

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return null;
    }
    return explicitCurrency
      ? { value: raw, currency: explicitCurrency.toUpperCase() }
      : null;
  }

  if (typeof raw === "string") {
    const value = parseNumberishString(raw);
    const currency = explicitCurrency?.toUpperCase() ?? detectCurrency(raw);
    if (value === null || !currency) {
      return null;
    }
    return { value, currency };
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const amount =
      record.value ??
      record.amount ??
      record.price ??
      record.salePrice ??
      record.currentPrice;
    const currency =
      record.currency ??
      record.currencyCode ??
      record.priceCurrency ??
      explicitCurrency;
    return normalizeMoney(amount, currency);
  }

  return null;
}

export function normalizeCondition(raw: unknown): NormalizedCondition {
  const text = cleanString(raw);
  if (!text) {
    return null;
  }

  const tail = text.split(/[\/#]/u).filter(Boolean).at(-1)?.toLowerCase() ?? "";
  if (tail === "newcondition" || tail === "new") {
    return "NEW";
  }
  if (tail === "usedcondition" || tail === "used") {
    return "USED";
  }
  return null;
}

export function normalizeRating(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 && raw <= 5 ? raw : null;
  }
  const text = cleanString(raw);
  if (!text) {
    return null;
  }
  const match = text.match(/-?\d+(?:[.,]\d+)?/u);
  if (!match) {
    return null;
  }
  const value = Number(match[0].replace(",", "."));
  return Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
}

export function normalizeReviewCount(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 0 ? raw : null;
  }
  const text = cleanString(raw);
  if (!text) {
    return null;
  }
  const match = text.match(/\d[\d\s.,]*/u);
  if (!match) {
    return null;
  }
  const suffix = text.slice((match.index ?? 0) + match[0].length).trimStart();
  if (/^[kmb](?:\b|$)/iu.test(suffix)) {
    return null;
  }
  const digits = match[0].replace(/[^0-9]/gu, "");
  if (!digits) {
    return null;
  }
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

export function normalizeStock(raw: unknown): string | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw) : null;
  }
  const text = cleanString(raw);
  if (!text) {
    return null;
  }
  if (/^https?:\/\//iu.test(text)) {
    const tail = text.split(/[\/#]/u).filter(Boolean).at(-1);
    return tail ? decodeURIComponent(tail) : text;
  }
  return text;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanString(value);
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export function normalizeStringList(raw: unknown): readonly string[] | null {
  if (Array.isArray(raw)) {
    const values: string[] = [];
    for (const item of raw) {
      const text = primitiveText(item);
      if (text) {
        values.push(text);
      }
    }
    const normalized = uniqueStrings(values);
    return normalized.length > 0 ? normalized : null;
  }

  const single = primitiveText(raw);
  return single ? [single] : null;
}

function propertyFact(record: Record<string, unknown>): string | null {
  const name = primitiveText(record.name ?? record.label ?? record.key);
  const value = primitiveText(record.value ?? record.text ?? record.content);
  if (name && value) {
    return `${name}: ${value}`;
  }
  return null;
}

export function normalizeSpecs(raw: unknown): readonly string[] {
  if (Array.isArray(raw)) {
    const facts: string[] = [];
    for (const item of raw) {
      if (typeof item === "string") {
        facts.push(item);
      } else if (item && typeof item === "object" && !Array.isArray(item)) {
        const fact = propertyFact(item as Record<string, unknown>);
        if (fact) {
          facts.push(fact);
        }
      }
    }
    return uniqueStrings(facts);
  }

  if (raw && typeof raw === "object") {
    const facts: string[] = [];
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const text = primitiveText(value);
      if (text) {
        facts.push(`${key}: ${text}`);
      }
    }
    return uniqueStrings(facts);
  }

  const single = primitiveText(raw);
  return single ? [single] : [];
}
