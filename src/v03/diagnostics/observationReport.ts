import type {
  ObservationCollectionResult
} from "../observations/observationTypes.js";


export function formatObservationReport(
  result:
    ObservationCollectionResult
): string {

  const fields =
    new Map<
      string,
      typeof result.observations
    >();


  for (
    const observation
    of result.observations
  ) {

    const existing =
      fields.get(
        observation.field
      ) ??
      [];


    fields.set(
      observation.field,
      [
        ...existing,
        observation
      ]
    );
  }


  const lines =
    [
      "CAMINTEL V3 OBSERVATIONS",
      "",
      "Identity: " +
        result.identityId,
      "Observations: " +
        result.observations.length,
      "Fields: " +
        fields.size,
      ""
    ];


  for (
    const [
      field,
      observations
    ]
    of Array.from(
      fields.entries()
    )
      .sort(
        (
          left,
          right
        ) =>
          left[0].localeCompare(
            right[0]
          )
      )
  ) {

    lines.push(
      field
    );


    for (
      const observation
      of observations
    ) {

      lines.push(
        "   - [" +
        observation.sourceKind +
        "] " +
        observation.rawValue
      );


      lines.push(
        "     locator: " +
        (
          observation.locator ??
          ""
        )
      );
    }
  }


  if (
    result.warnings.length >
      0
  ) {

    lines.push(
      "",
      "Warnings:"
    );


    for (
      const warning
      of result.warnings
    ) {
      lines.push(
        " - " +
        warning
      );
    }
  }


  return lines.join(
    "\n"
  );
}
