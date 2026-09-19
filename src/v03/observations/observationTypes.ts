import type {
  FieldObservation
} from "../contracts/observationContract.js";

import type {
  ProductIdentityRecord
} from "../identity/productIdentityTypes.js";


export type ObservationField =
  | "PRODUCT_NAME"
  | "CATEGORY"
  | "PRICE"
  | "PRICE_CURRENCY"
  | "CONDITION"
  | "AVAILABILITY"
  | "RATING"
  | "REVIEW_COUNT"
  | "SPECS"
  | "ACCESSORIES"
  | "COMBO"
  | "RENTAL_CONDITIONS"
  | "RENTAL_TIME"
  | "PAYMENT"
  | "DOCUMENTS"
  | "DELIVERY"
  | "CTA"
  | "SKU"
  | "PRODUCT_ID"
  | "BRAND"
  | "DESCRIPTION"
  | "OFFER_URL"
  | "BUSINESS_FUNCTION"
  | "OTHER";


export interface ProductObservation
extends FieldObservation {
  readonly field:
    ObservationField;
}


export interface ObservationCollectionResult {
  readonly identity:
    ProductIdentityRecord;

  readonly identityId:
    string;

  readonly observations:
    readonly ProductObservation[];

  readonly warnings:
    readonly string[];
}
