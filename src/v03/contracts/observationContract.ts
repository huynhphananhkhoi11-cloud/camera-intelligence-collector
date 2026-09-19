export type ObservationSemanticRole =
  | "CURRENT_PRODUCT_PRICE"
  | "VARIANT_PRICE"
  | "OLD_PRICE"
  | "DISCOUNT_VALUE"
  | "SAVING_VALUE"
  | "GIFT_VALUE"
  | "ACCESSORY_PRICE"
  | "INSTALLMENT_AMOUNT";


export type EntityClassification =
  | "CAMERA"
  | "NON_CAMERA"
  | "UNCERTAIN";


export type ObservationSourceKind =
  | "VISIBLE_TEXT"
  | "JSON_LD"
  | "MICRODATA"
  | "XHR"
  | "API"
  | "DOM"
  | "META"
  | "ATTRIBUTE"
  | "OTHER";


export interface FieldObservation {
  productIdentity: string;
  field: string;
  rawValue: string;
  normalizedValue?: string | number | boolean | null;
  semanticRole?: ObservationSemanticRole | null;
  sourceKind: ObservationSourceKind;
  sourceUrl: string;
  locator?: string | null;
  context?: string | null;
}


function fingerprint(
  observation:
    FieldObservation
): string {

  return JSON.stringify([
    observation.productIdentity,
    observation.field,
    observation.rawValue,
    observation.semanticRole ?? null,
    observation.sourceKind,
    observation.sourceUrl,
    observation.locator ?? null
  ]);
}


export function preserveUniqueObservations(
  observations:
    readonly FieldObservation[]
): FieldObservation[] {

  const seen =
    new Set<string>();


  const result:
    FieldObservation[] = [];


  for (
    const observation
    of observations
  ) {

    const key =
      fingerprint(
        observation
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


    result.push({
      ...observation
    });
  }


  return result;
}


export function isMainExportEligible(
  entity:
    EntityClassification
): boolean {

  return entity ===
    "CAMERA";
}