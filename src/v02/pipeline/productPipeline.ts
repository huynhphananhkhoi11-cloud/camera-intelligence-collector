import type {
  Page
} from "playwright";

import {
  extractRawProductFacts,
  extractRawProductFactsFromHtml,
  type RawProductFacts
} from "../rawProductExtractor.js";

import {
  analyzeRawProduct,
  type ProductAnalysis
} from "../evidenceEngine.js";

import {
  resolveProductFields,
  type ResolvedProductFields
} from "../resolvers/fieldResolvers.js";

import {
  detectConflicts
} from "../conflicts/conflictEngine.js";

import {
  validateProductRecord,
  type ValidationResult
} from "../validation/recordValidator.js";

import type {
  OfferInput
} from "../offerClassifier.js";


export interface ListingContext {
  listingCategory?: string;
  listingPriceText?: string;
}


export interface CompetitorRow {

  website:
    string;

  productName:
    string;

  form:
    string;

  specs:
    string;

  rentalPrice:
    number | null;

  rentalConditions:
    string;

  accessories:
    string;

  combo:
    string;

  rating:
    number | null;

  reviewCount:
    number | null;

  stock:
    string;

  salePrice:
    number | null;

  url:
    string;
}


export interface PipelineResult {

  facts:
    RawProductFacts;

  analysis:
    ProductAnalysis;

  fields:
    ResolvedProductFields;

  validation:
    ValidationResult;

  row:
    CompetitorRow;
}


function websiteFromUrl(
  url: string
): string {

  try {
    return new URL(url)
      .hostname;
  }
  catch {
    return "";
  }
}


function applyListingContext(
  facts:
    RawProductFacts,
  context?:
    ListingContext
): RawProductFacts {

  if (!context) {
    return facts;
  }

  return {
    ...facts,

    listingCategory:
      context.listingCategory ??
      facts.listingCategory,

    listingPriceText:
      context.listingPriceText ??
      facts.listingPriceText
  };
}


function formText(
  analysis:
    ProductAnalysis
): string {

  return analysis.forms
    .join(" + ");
}


function runPipeline(
  initialFacts:
    RawProductFacts,

  siteMode:
    OfferInput["siteMode"],

  listingContext?:
    ListingContext
): PipelineResult {

  const facts =
    applyListingContext(
      initialFacts,
      listingContext
    );

  const analysis =
    analyzeRawProduct(
      facts,
      siteMode
    );

  const fields =
    resolveProductFields(
      facts,
      analysis
    );

  const conflicts =
    detectConflicts({
      facts,
      analysis,
      fields
    });

  const validation =
    validateProductRecord(
      facts,
      analysis,
      fields,
      conflicts
    );


  const row:
    CompetitorRow = {

      website:
        websiteFromUrl(
          facts.url
        ),

      productName:
        facts.title,

      form:
        formText(
          analysis
        ),

      specs:
        fields.specs.value,

      rentalPrice:
        fields.rentalPrice.amount,

      rentalConditions:
        fields.rentalConditions.value,

      accessories:
        fields.accessories.value,

      combo:
        fields.combo.value,

      rating:
        fields.rating.value,

      reviewCount:
        fields.reviewCount.value,

      stock:
        fields.stock.value,

      salePrice:
        fields.salePrice.amount,

      url:
        facts.url
    };


  return {
    facts,
    analysis,
    fields,
    validation,
    row
  };
}


export function processProductHtml(
  html: string,

  url: string,

  siteMode:
    OfferInput["siteMode"] =
      "UNKNOWN",

  listingContext?:
    ListingContext
): PipelineResult {

  const facts =
    extractRawProductFactsFromHtml(
      html,
      url
    );

  return runPipeline(
    facts,
    siteMode,
    listingContext
  );
}


export async function processProductPage(
  page: Page,

  siteMode:
    OfferInput["siteMode"] =
      "UNKNOWN",

  listingContext?:
    ListingContext
): Promise<PipelineResult> {

  const facts =
    await extractRawProductFacts(
      page
    );

  return runPipeline(
    facts,
    siteMode,
    listingContext
  );
}
