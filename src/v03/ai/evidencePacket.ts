import {
  createHash
} from "node:crypto";

import type {
  ProductObservation
} from "../observations/observationTypes.js";

import type {
  ControlSnapshot,
  EvidenceItem,
  EvidencePacket,
  VisualEvidence
} from "./evidenceTypes.js";


export interface EvidencePacketInput {
  readonly pageUrl:
    string;

  readonly finalUrl:
    string;

  readonly observations:
    readonly ProductObservation[];

  readonly primaryRegionText:
    string;

  readonly controls:
    readonly ControlSnapshot[];

  readonly evidenceBoard?:
    VisualEvidence;
}


function clip(
  value:
    string,
  maxChars:
    number
): string {

  const clean =
    value
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  return clean.length <=
    maxChars
    ? clean
    : clean.slice(
        0,
        maxChars
      );
}


function evidenceId(
  prefix:
    string,
  index:
    number
): string {

  return (
    prefix +
    "_" +
    String(
      index +
      1
    ).padStart(
      4,
      "0"
    )
  );
}


function observationEvidence(
  observation:
    ProductObservation,
  index:
    number
): EvidenceItem {

  return {
    id:
      evidenceId(
        "ev",
        index
      ),

    fieldHint:
      observation.field,

    rawValue:
      clip(
        observation.rawValue,
        300
      ),

    normalizedValue:
      observation.normalizedValue,

    sourceKind:
      observation.sourceKind,

    sourceUrl:
      observation.sourceUrl,

    locator:
      observation.locator,

    context:
      observation.context
        ? clip(
            observation.context,
            220
          )
        : null,

    ownershipHint:
      observation.ownership
  };
}


function controlEvidence(
  control:
    ControlSnapshot,
  index:
    number,
  sourceUrl:
    string
): EvidenceItem {

  return {
    id:
      evidenceId(
        "ctrl",
        index
      ),

    fieldHint:
      "CONTROL",

    rawValue:
      clip(
        [
          control.label,
          control.value
        ]
          .filter(
            Boolean
          )
          .join(
            " | "
          ),
        240
      ),

    sourceKind:
      "DOM",

    sourceUrl,

    locator:
      control.kind,

    context:
      "selected=" +
      String(
        control.selected
      ),

    ownershipHint:
      "UNKNOWN"
  };
}


function uniqueById(
  values:
    readonly EvidenceItem[]
): EvidenceItem[] {

  const seen =
    new Set<
      string
    >();


  return values.filter(
    value => {

      if (
        seen.has(
          value.id
        )
      ) {
        return false;
      }


      seen.add(
        value.id
      );


      return true;
    }
  );
}


function packetIdFor(
  finalUrl:
    string,
  evidence:
    readonly EvidenceItem[]
): string {

  const hash =
    createHash(
      "sha256"
    );


  hash.update(
    finalUrl
  );


  for (
    const item
    of evidence
  ) {
    hash.update(
      item.id +
      "\0" +
      item.fieldHint +
      "\0" +
      item.rawValue
    );
  }


  return (
    "packet_" +
    hash.digest(
      "hex"
    ).slice(
      0,
      16
    )
  );
}


export function buildEvidencePacket(
  input:
    EvidencePacketInput
): EvidencePacket {

  const observed =
    input.observations.map(
      observationEvidence
    );


  const controls =
    input.controls.map(
      (
        control,
        index
      ) =>
        controlEvidence(
          control,
          index,
          input.finalUrl
        )
    );


  const allEvidence =
    uniqueById([
      ...observed,
      ...controls
    ]);


  const byField =
    (
      fields:
        readonly string[]
    ) =>
      observed.filter(
        item =>
          fields.includes(
            item.fieldHint
          )
      );


  const selectedControls =
    controls.filter(
      item =>
        item.context ===
          "selected=true"
    );


  const structuredFacts =
    observed.filter(
      item =>
        [
          "JSON_LD",
          "MICRODATA",
          "XHR",
          "API",
          "META",
          "ATTRIBUTE"
        ].includes(
          item.sourceKind
        )
    );


  const variantCandidates =
    uniqueById([
      ...controls,

      ...observed.filter(
        item =>
          /(?:variant|condition|option|style|color|colour|kit|lens)/iu
            .test(
              [
                item.locator,
                item.context
              ]
                .filter(
                  Boolean
                )
                .join(
                  " "
                )
            )
      )
    ]);


  return {
    packetId:
      packetIdFor(
        input.finalUrl,
        allEvidence
      ),

    pageUrl:
      input.pageUrl,

    finalUrl:
      input.finalUrl,

    productIdentity:
      input.observations[0]
        ?.productIdentity ??
      input.finalUrl,

    primaryRegionText:
      clip(
        input.primaryRegionText,
        3_500
      ),

    allEvidence,

    titleCandidates:
      byField([
        "PRODUCT_NAME"
      ]),

    breadcrumbs:
      byField([
        "BREADCRUMB",
        "CATEGORY"
      ]),

    moneyCandidates:
      byField([
        "PRICE",
        "PRICE_CURRENCY",
        "RENTAL_TIME",
        "RENTAL_CONDITIONS"
      ]),

    conditionCandidates:
      byField([
        "CONDITION"
      ]),

    stockCandidates:
      byField([
        "AVAILABILITY",
        "INVENTORY_LEVEL"
      ]),

    ratingCandidates:
      byField([
        "RATING"
      ]),

    reviewCandidates:
      byField([
        "REVIEW_COUNT",
        "RATING_REVIEW_TEXT"
      ]),

    specCandidates:
      byField([
        "SPECS",
        "DESCRIPTION"
      ]),

    variantCandidates,

    selectedControls,

    structuredFacts,

    evidenceBoard:
      input.evidenceBoard
  };
}


function promptEvidence(
  packet:
    EvidencePacket
): EvidenceItem[] {

  const priority =
    uniqueById([
      ...packet.selectedControls,
      ...packet.titleCandidates,
      ...packet.moneyCandidates,
      ...packet.conditionCandidates,
      ...packet.stockCandidates,
      ...packet.variantCandidates,
      ...packet.ratingCandidates,
      ...packet.reviewCandidates,
      ...packet.specCandidates,
      ...packet.breadcrumbs,
      ...packet.structuredFacts
    ]);


  return priority.slice(
    0,
    24
  );
}


export function serializeEvidencePacketForPrompt(
  packet:
    EvidencePacket
): string {

  const evidence =
    promptEvidence(
      packet
    ).map(
      item => ({
        id:
          item.id,

        fieldHint:
          item.fieldHint,

        rawValue:
          clip(
            item.rawValue,
            120
          ),

        sourceKind:
          item.sourceKind,

        locator:
          item.locator
            ? clip(
                item.locator,
                80
              )
            : null,

        context:
          item.context
            ? clip(
                item.context,
                70
              )
            : null,

        ownershipHint:
          item.ownershipHint ??
          null
      })
    );


  return JSON.stringify(
    {
      packetId:
        packet.packetId,

      pageUrl:
        packet.pageUrl,

      finalUrl:
        packet.finalUrl,

      productIdentity:
        packet.productIdentity,

      primaryRegionText:
        clip(
          packet.primaryRegionText,
          1_200
        ),

      evidence
    },
    null,
    2
  );
}
