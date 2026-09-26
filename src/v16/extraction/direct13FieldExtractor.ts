import {
  normalizeCondition,
  normalizeMoney,
  normalizeRating,
  normalizeReviewCount,
  normalizeSpecs,
  normalizeStock,
  normalizeStringList,
  normalizeText,
  type MoneyValue,
} from "../normalization/direct13Normalizers.js";

export type { MoneyValue } from "../normalization/direct13Normalizers.js";

export const DIRECT_13_COLUMNS = [
  "website",
  "productName",
  "condition",
  "specs",
  "rentalPricePerDay",
  "rentalTerms",
  "accessoriesIncluded",
  "bundleIncluded",
  "rating",
  "reviewCount",
  "stock",
  "salePrice",
  "url",
] as const;

export type DirectSourceKind =
  | "PRODUCT_JSON"
  | "JSON_LD"
  | "EMBEDDED_STATE"
  | "DOM";

export interface Direct13Row {
  readonly website: string;
  readonly productName: string | null;
  readonly condition: "NEW" | "USED" | null;
  readonly specs: readonly string[];
  readonly rentalPricePerDay: MoneyValue | null;
  readonly rentalTerms: string | null;
  readonly accessoriesIncluded: readonly string[] | null;
  readonly bundleIncluded: readonly string[] | null;
  readonly rating: number | null;
  readonly reviewCount: number | null;
  readonly stock: string | null;
  readonly salePrice: MoneyValue | null;
  readonly url: string;
}

export interface DirectEvidenceAtom {
  readonly sourceKind: DirectSourceKind;
  readonly sourceUrl: string;
  readonly payload: unknown;
  readonly jsonPath?: string;
  readonly locator?: string;
}

export interface Direct13ExtractionInput {
  readonly website: string;
  readonly url: string;
  readonly cameraScopeConflict?: boolean;
  readonly evidence: readonly DirectEvidenceAtom[];
}

export interface FieldProvenance {
  readonly sourceKind: DirectSourceKind;
  readonly sourceUrl: string;
  readonly jsonPath?: string;
  readonly locator?: string;
}

export type DirectDataField = Exclude<
  (typeof DIRECT_13_COLUMNS)[number],
  "website" | "url"
>;

export type DirectFieldProvenance = Partial<
  Record<DirectDataField, FieldProvenance>
>;

export type Direct13ExtractionResult =
  | {
      readonly outcome: "DIRECT_COMPLETE_ENOUGH";
      readonly row: Direct13Row;
      readonly provenance: DirectFieldProvenance;
      readonly reason: null;
    }
  | {
      readonly outcome: "DIRECT_UNUSABLE" | "NON_CAMERA_EVIDENCE_CONFLICT";
      readonly row: null;
      readonly provenance: DirectFieldProvenance;
      readonly reason: string;
    };

type JsonRecord = Record<string, unknown>;

interface ObjectCandidate {
  readonly value: JsonRecord;
  readonly path: string;
  readonly score: number;
  readonly order: number;
}

interface ExtractedField<T> {
  readonly value: T;
  readonly path: string;
}

interface ExtractedFacts {
  readonly productName?: ExtractedField<string>;
  readonly condition?: ExtractedField<"NEW" | "USED">;
  readonly specs?: ExtractedField<readonly string[]>;
  readonly rentalPricePerDay?: ExtractedField<MoneyValue>;
  readonly rentalTerms?: ExtractedField<string>;
  readonly accessoriesIncluded?: ExtractedField<readonly string[]>;
  readonly bundleIncluded?: ExtractedField<readonly string[]>;
  readonly rating?: ExtractedField<number>;
  readonly reviewCount?: ExtractedField<number>;
  readonly stock?: ExtractedField<string>;
  readonly salePrice?: ExtractedField<MoneyValue>;
}

const SOURCE_RANK: Readonly<Record<DirectSourceKind, number>> = {
  PRODUCT_JSON: 0,
  JSON_LD: 1,
  EMBEDDED_STATE: 2,
  DOM: 3,
};

const PRODUCT_NAME_KEYS = ["productname", "name", "title"] as const;
const CONDITION_KEYS = ["itemcondition", "condition"] as const;
const SPECS_KEYS = [
  "specs",
  "specifications",
  "technicalspecifications",
  "attributes",
  "additionalproperty",
] as const;
const RENTAL_PRICE_KEYS = [
  "rentalpriceperday",
  "dailyrentalprice",
  "dailyrate",
  "priceperday",
] as const;
const RENTAL_TERMS_KEYS = ["rentalterms", "rentalconditions"] as const;
const ACCESSORIES_KEYS = ["accessoriesincluded", "includedaccessories"] as const;
const BUNDLE_KEYS = ["bundleincluded", "includedbundle", "bundleitems"] as const;
const RATING_KEYS = ["ratingvalue", "averagerating", "rating"] as const;
const REVIEW_KEYS = ["reviewcount", "reviewscount"] as const;
const STOCK_KEYS = ["availability", "stock", "stockstatus", "inventorystatus"] as const;
const SALE_PRICE_KEYS = ["saleprice", "currentprice", "price"] as const;
const CURRENCY_KEYS = ["pricecurrency", "currency", "currencycode"] as const;

function keyToken(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function appendPath(base: string, segment: string): string {
  if (!base || base === "$") {
    return `$${segment.startsWith("[") ? "" : "."}${segment}`;
  }
  return `${base}${segment.startsWith("[") ? "" : "."}${segment}`;
}

function basePath(atom: DirectEvidenceAtom): string {
  const explicit = atom.jsonPath?.trim();
  return explicit && explicit.length > 0 ? explicit : "$";
}

function entryByAliases(
  object: JsonRecord,
  aliases: readonly string[],
): { key: string; value: unknown } | null {
  for (const [key, value] of Object.entries(object)) {
    if (aliases.includes(keyToken(key))) {
      return { key, value };
    }
  }
  return null;
}

function schemaTypeIncludesProduct(value: unknown): boolean {
  if (typeof value === "string") {
    return value.toLowerCase().split(/[\/#:]/u).includes("product");
  }
  if (Array.isArray(value)) {
    return value.some(schemaTypeIncludesProduct);
  }
  return false;
}

function hasStrongProductContext(object: JsonRecord): boolean {
  return Boolean(
    schemaTypeIncludesProduct(object["@type"]) ||
    entryByAliases(object, SALE_PRICE_KEYS) ||
    offersObject(object) ||
    entryByAliases(object, CONDITION_KEYS) ||
    entryByAliases(object, SPECS_KEYS) ||
    entryByAliases(object, STOCK_KEYS) ||
    aggregateRatingObject(object) ||
    entryByAliases(object, RENTAL_PRICE_KEYS),
  );
}

function productNameField(
  atom: DirectEvidenceAtom,
  object: JsonRecord,
  path: string,
): ExtractedField<string> | undefined {
  const canonical = entryByAliases(object, ["productname"]);
  if (canonical) {
    const value = normalizeText(canonical.value);
    return value ? { value, path: appendPath(path, canonical.key) } : undefined;
  }

  const general = entryByAliases(object, ["name", "title"]);
  if (!general) {
    return undefined;
  }

  const safeGeneralName =
    atom.sourceKind === "PRODUCT_JSON" ||
    (atom.sourceKind === "JSON_LD" && schemaTypeIncludesProduct(object["@type"])) ||
    (atom.sourceKind === "EMBEDDED_STATE" &&
      (/product/iu.test(path) || hasStrongProductContext(object)));

  if (!safeGeneralName) {
    return undefined;
  }

  const value = normalizeText(general.value);
  return value ? { value, path: appendPath(path, general.key) } : undefined;
}

function scoreProductObject(object: JsonRecord): number {
  let score = 0;
  if (schemaTypeIncludesProduct(object["@type"])) {
    score += 20;
  }
  if (entryByAliases(object, PRODUCT_NAME_KEYS)) {
    score += 8;
  }
  if (entryByAliases(object, SALE_PRICE_KEYS) || isRecord(object.offers)) {
    score += 4;
  }
  if (isRecord(object.aggregateRating) || entryByAliases(object, RATING_KEYS)) {
    score += 2;
  }
  if (entryByAliases(object, SPECS_KEYS)) {
    score += 1;
  }
  if (entryByAliases(object, STOCK_KEYS)) {
    score += 1;
  }
  return score;
}

function collectObjectCandidates(payload: unknown, rootPath: string): ObjectCandidate[] {
  const out: ObjectCandidate[] = [];
  const seen = new Set<unknown>();
  let order = 0;

  const visit = (value: unknown, path: string, depth: number): void => {
    if (depth > 8 || !value || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        visit(value[index], appendPath(path, `[${index}]`), depth + 1);
      }
      return;
    }

    const object = value as JsonRecord;
    out.push({ value: object, path, score: scoreProductObject(object), order: order++ });
    for (const [key, child] of Object.entries(object)) {
      visit(child, appendPath(path, key), depth + 1);
    }
  };

  visit(payload, rootPath, 0);
  return out;
}

function selectProductObject(atom: DirectEvidenceAtom): ObjectCandidate | null {
  const candidates = collectObjectCandidates(atom.payload, basePath(atom));
  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  const identityCandidate = candidates.find((candidate) =>
    Boolean(productNameField(atom, candidate.value, candidate.path)),
  );
  return identityCandidate ?? candidates[0] ?? null;
}

function stringField(
  object: JsonRecord,
  path: string,
  aliases: readonly string[],
): ExtractedField<string> | undefined {
  const hit = entryByAliases(object, aliases);
  if (!hit) {
    return undefined;
  }
  const value = normalizeText(hit.value);
  return value ? { value, path: appendPath(path, hit.key) } : undefined;
}

function conditionField(object: JsonRecord, path: string): ExtractedField<"NEW" | "USED"> | undefined {
  const hit = entryByAliases(object, CONDITION_KEYS);
  if (!hit) {
    return undefined;
  }
  const value = normalizeCondition(hit.value);
  return value ? { value, path: appendPath(path, hit.key) } : undefined;
}

function specsField(object: JsonRecord, path: string): ExtractedField<readonly string[]> | undefined {
  const hit = entryByAliases(object, SPECS_KEYS);
  if (!hit) {
    return undefined;
  }
  const value = normalizeSpecs(hit.value);
  return value.length > 0 ? { value, path: appendPath(path, hit.key) } : undefined;
}

function listField(
  object: JsonRecord,
  path: string,
  aliases: readonly string[],
): ExtractedField<readonly string[]> | undefined {
  const hit = entryByAliases(object, aliases);
  if (!hit) {
    return undefined;
  }
  const value = normalizeStringList(hit.value);
  return value ? { value, path: appendPath(path, hit.key) } : undefined;
}

function rentalPriceField(object: JsonRecord, path: string): ExtractedField<MoneyValue> | undefined {
  const hit = entryByAliases(object, RENTAL_PRICE_KEYS);
  if (!hit) {
    return undefined;
  }
  const currency = entryByAliases(object, CURRENCY_KEYS)?.value;
  const value = normalizeMoney(hit.value, currency);
  return value ? { value, path: appendPath(path, hit.key) } : undefined;
}

function offersObject(object: JsonRecord): { value: JsonRecord; key: string } | null {
  const direct = Object.entries(object).find(([key]) => keyToken(key) === "offers");
  if (!direct) {
    return null;
  }
  const raw = direct[1];
  if (isRecord(raw)) {
    return { value: raw, key: direct[0] };
  }
  if (Array.isArray(raw)) {
    const first = raw.find(isRecord);
    return first ? { value: first, key: direct[0] } : null;
  }
  return null;
}

function aggregateRatingObject(object: JsonRecord): { value: JsonRecord; key: string } | null {
  const direct = Object.entries(object).find(([key]) => keyToken(key) === "aggregaterating");
  if (!direct || !isRecord(direct[1])) {
    return null;
  }
  return { value: direct[1], key: direct[0] };
}

function salePriceField(object: JsonRecord, path: string): ExtractedField<MoneyValue> | undefined {
  const offers = offersObject(object);
  if (offers) {
    const offerPrice = entryByAliases(offers.value, ["price"]);
    if (offerPrice) {
      const currency = entryByAliases(offers.value, CURRENCY_KEYS)?.value;
      const value = normalizeMoney(offerPrice.value, currency);
      if (value) {
        return {
          value,
          path: appendPath(appendPath(path, offers.key), offerPrice.key),
        };
      }
    }
  }

  const hit = entryByAliases(object, SALE_PRICE_KEYS);
  if (!hit) {
    return undefined;
  }
  const currency = entryByAliases(object, CURRENCY_KEYS)?.value;
  const value = normalizeMoney(hit.value, currency);
  return value ? { value, path: appendPath(path, hit.key) } : undefined;
}

function stockField(object: JsonRecord, path: string): ExtractedField<string> | undefined {
  const offers = offersObject(object);
  if (offers) {
    const availability = entryByAliases(offers.value, ["availability"]);
    if (availability) {
      const value = normalizeStock(availability.value);
      if (value) {
        return {
          value,
          path: appendPath(appendPath(path, offers.key), availability.key),
        };
      }
    }
  }

  const hit = entryByAliases(object, STOCK_KEYS);
  if (!hit) {
    return undefined;
  }
  const value = normalizeStock(hit.value);
  return value ? { value, path: appendPath(path, hit.key) } : undefined;
}

function ratingField(object: JsonRecord, path: string): ExtractedField<number> | undefined {
  const aggregate = aggregateRatingObject(object);
  if (aggregate) {
    const hit = entryByAliases(aggregate.value, RATING_KEYS);
    if (hit) {
      const value = normalizeRating(hit.value);
      if (value !== null) {
        return {
          value,
          path: appendPath(appendPath(path, aggregate.key), hit.key),
        };
      }
    }
  }

  const hit = entryByAliases(object, RATING_KEYS);
  if (!hit) {
    return undefined;
  }
  const value = normalizeRating(hit.value);
  return value !== null ? { value, path: appendPath(path, hit.key) } : undefined;
}

function reviewCountField(object: JsonRecord, path: string): ExtractedField<number> | undefined {
  const aggregate = aggregateRatingObject(object);
  if (aggregate) {
    const hit = entryByAliases(aggregate.value, REVIEW_KEYS);
    if (hit) {
      const value = normalizeReviewCount(hit.value);
      if (value !== null) {
        return {
          value,
          path: appendPath(appendPath(path, aggregate.key), hit.key),
        };
      }
    }
  }

  const hit = entryByAliases(object, REVIEW_KEYS);
  if (!hit) {
    return undefined;
  }
  const value = normalizeReviewCount(hit.value);
  return value !== null ? { value, path: appendPath(path, hit.key) } : undefined;
}

function extractFacts(atom: DirectEvidenceAtom): ExtractedFacts {
  const selected = selectProductObject(atom);
  if (!selected) {
    return {};
  }
  const object = selected.value;
  const path = selected.path;

  return {
    productName: productNameField(atom, object, path),
    condition: conditionField(object, path),
    specs: specsField(object, path),
    rentalPricePerDay: rentalPriceField(object, path),
    rentalTerms: stringField(object, path, RENTAL_TERMS_KEYS),
    accessoriesIncluded: listField(object, path, ACCESSORIES_KEYS),
    bundleIncluded: listField(object, path, BUNDLE_KEYS),
    rating: ratingField(object, path),
    reviewCount: reviewCountField(object, path),
    stock: stockField(object, path),
    salePrice: salePriceField(object, path),
  };
}

function provenanceFor(atom: DirectEvidenceAtom, field: ExtractedField<unknown>): FieldProvenance {
  return {
    sourceKind: atom.sourceKind,
    sourceUrl: atom.sourceUrl,
    jsonPath: field.path,
    locator: atom.locator,
  };
}

function deriveWebsite(website: string, url: string): string {
  const explicit = website.trim();
  if (explicit) {
    return explicit;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function extractDirect13Fields(
  input: Direct13ExtractionInput,
): Direct13ExtractionResult {
  const provenance: DirectFieldProvenance = {};

  if (input.cameraScopeConflict === true) {
    return {
      outcome: "NON_CAMERA_EVIDENCE_CONFLICT",
      row: null,
      provenance,
      reason: "Upstream proven camera scope conflicts with direct product evidence.",
    };
  }

  const orderedEvidence = input.evidence
    .map((atom, index) => ({ atom, index }))
    .sort((a, b) => SOURCE_RANK[a.atom.sourceKind] - SOURCE_RANK[b.atom.sourceKind] || a.index - b.index);

  const values: Partial<Record<DirectDataField, unknown>> = {};

  for (const { atom } of orderedEvidence) {
    const facts = extractFacts(atom);
    for (const field of [
      "productName",
      "condition",
      "specs",
      "rentalPricePerDay",
      "rentalTerms",
      "accessoriesIncluded",
      "bundleIncluded",
      "rating",
      "reviewCount",
      "stock",
      "salePrice",
    ] as const) {
      if (values[field] !== undefined) {
        continue;
      }
      const extracted = facts[field];
      if (!extracted) {
        continue;
      }
      values[field] = extracted.value;
      provenance[field] = provenanceFor(atom, extracted);
    }
  }

  const productName = (values.productName as string | undefined) ?? null;
  const website = deriveWebsite(input.website, input.url);
  const url = input.url.trim();

  if (!productName || !website || !url) {
    return {
      outcome: "DIRECT_UNUSABLE",
      row: null,
      provenance,
      reason: "Direct evidence did not establish a safe product identity with website and URL context.",
    };
  }

  const row: Direct13Row = {
    website,
    productName,
    condition: (values.condition as "NEW" | "USED" | undefined) ?? null,
    specs: (values.specs as readonly string[] | undefined) ?? [],
    rentalPricePerDay: (values.rentalPricePerDay as MoneyValue | undefined) ?? null,
    rentalTerms: (values.rentalTerms as string | undefined) ?? null,
    accessoriesIncluded: (values.accessoriesIncluded as readonly string[] | undefined) ?? null,
    bundleIncluded: (values.bundleIncluded as readonly string[] | undefined) ?? null,
    rating: (values.rating as number | undefined) ?? null,
    reviewCount: (values.reviewCount as number | undefined) ?? null,
    stock: (values.stock as string | undefined) ?? null,
    salePrice: (values.salePrice as MoneyValue | undefined) ?? null,
    url,
  };

  return {
    outcome: "DIRECT_COMPLETE_ENOUGH",
    row,
    provenance,
    reason: null,
  };
}
