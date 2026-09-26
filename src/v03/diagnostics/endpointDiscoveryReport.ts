import type {
  AdaptiveEndpointDiscoveryResult
} from "../acquisition/endpointReplayTypes.js";


function displayPath(
  value:
    string
): string {

  try {

    const url =
      new URL(
        value
      );


    return (
      url.pathname +
      url.search
    );
  }
  catch {
    return value;
  }
}


function truncate(
  value:
    string,
  maxLength:
    number
): string {

  if (
    value.length <=
      maxLength
  ) {
    return value;
  }


  return (
    value.slice(
      0,
      maxLength
    ) +
    "..."
  );
}


export function formatEndpointDiscoveryReport(
  result:
    AdaptiveEndpointDiscoveryResult
): string {

  const lines =
    [
      "CAMINTEL V3 ENDPOINT DISCOVERY",
      "",
      "Site: " +
        result.recon.rootUrl,
      "Captured XHR/fetch: " +
        result.recon.exchanges.length,
      "Qualified endpoint requests: " +
        result.qualification.qualified.length,
      ""
    ];


  const qualifiedIds =
    new Set(
      result.qualification.qualified.map(
        candidate =>
          candidate.candidateId
      )
    );


  for (
    const candidate
    of result.qualification.candidates
  ) {

    const marker =
      qualifiedIds.has(
        candidate.candidateId
      )
        ? "QUALIFIED"
        : "SKIP";


    lines.push(
      [
        marker.padEnd(
          9
        ),
        String(
          candidate.score
        ).padStart(
          3
        ),
        candidate.method.padEnd(
          5
        ),
        displayPath(
          candidate.url
        )
      ].join(
        " "
      )
    );


    if (
      candidate.requestBody !==
        null &&
      candidate.requestBody.length >
        0
    ) {
      lines.push(
        "   payload: " +
          truncate(
            candidate.requestBody,
            220
          )
      );
    }


    lines.push(
      "   reasons: " +
        candidate.reasons.join(
          ", "
        )
    );
  }


  lines.push(
    "",
    "Replayed candidate requests: " +
      result.replay.replayedCandidateCount,
    "Discovered same-origin URLs: " +
      result.replay.discoveredUrls.length
  );


  const preview =
    result.replay.discoveredUrls.slice(
      0,
      25
    );


  if (
    preview.length >
      0
  ) {

    lines.push(
      "",
      "URL preview:"
    );


    for (
      const url
      of preview
    ) {
      lines.push(
        " - " +
          url
      );
    }


    if (
      result.replay.discoveredUrls.length >
        preview.length
    ) {
      lines.push(
        " - ... +" +
          (
            result.replay.discoveredUrls.length -
            preview.length
          ) +
          " more"
      );
    }
  }


  if (
    result.replay.warnings.length >
      0
  ) {

    lines.push(
      "",
      "Warnings:"
    );


    for (
      const warning
      of result.replay.warnings
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
