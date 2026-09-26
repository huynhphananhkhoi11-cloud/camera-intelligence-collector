import {
  classifyEntity,
  type EntityResult,
  type EntityType
} from "../../v02/entityClassifier.js";

import type {
  ProductObservation
} from "../observations/observationTypes.js";


export type EntityRoute =
  | "CAMERA"
  | "NON_CAMERA"
  | "UNCERTAIN";


export interface EntityRoutingResult {
  readonly route:
    EntityRoute;

  readonly subtype:
    EntityType;

  readonly classifier:
    EntityResult;

  readonly input:
    {
      readonly title:
        string;

      readonly category:
        string;

      readonly specs:
        string;

      readonly description:
        string;
    };
}


function valuesFor(
  observations:
    readonly ProductObservation[],
  field:
    ProductObservation["field"]
): string[] {

  return [
    ...new Set(
      observations
        .filter(
          observation =>
            observation.field ===
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


function joined(
  observations:
    readonly ProductObservation[],
  fields:
    readonly ProductObservation["field"][]
): string {

  return [
    ...new Set(
      fields.flatMap(
        field =>
          valuesFor(
            observations,
            field
          )
      )
    )
  ].join(
    " | "
  );
}


export function routeEntityFromObservations(
  observations:
    readonly ProductObservation[]
): EntityRoutingResult {

  /*
   * Entity routing is the one intentional classification step in V3.
   *
   * It consumes every relevant unique observation without choosing
   * which observation is the authoritative field value.
   */
  const input = {
    title:
      joined(
        observations,
        [
          "PRODUCT_NAME"
        ]
      ),

    category:
      joined(
        observations,
        [
          "CATEGORY",
          "BREADCRUMB"
        ]
      ),

    specs:
      joined(
        observations,
        [
          "SPECS"
        ]
      ),

    description:
      joined(
        observations,
        [
          "DESCRIPTION"
        ]
      )
  };


  const classifier =
    classifyEntity(
      input
    );


  const route:
    EntityRoute =
      classifier.type ===
        "CAMERA"
        ? "CAMERA"
        : classifier.type ===
            "UNCERTAIN"
          ? "UNCERTAIN"
          : "NON_CAMERA";


  return {
    route,
    subtype:
      classifier.type,
    classifier,
    input
  };
}
