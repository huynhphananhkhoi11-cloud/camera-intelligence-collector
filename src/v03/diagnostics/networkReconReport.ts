import type {
  NetworkReconSnapshot
} from "../acquisition/networkReconTypes.js";


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


export function formatNetworkReconSnapshot(
  snapshot:
    NetworkReconSnapshot
): string {

  const lines =
    [
      "CAMINTEL V3 NETWORK RECON",
      "",
      "Site: " +
        snapshot.rootUrl,
      "Final page: " +
        snapshot.finalPageUrl,
      "Observation window: " +
        snapshot.observationWindowMs +
        " ms",
      "Captured XHR/fetch: " +
        snapshot.exchanges.length,
      ""
    ];


  if (
    snapshot.exchanges.length ===
      0
  ) {
    lines.push(
      "No same-origin XHR/fetch exchanges captured."
    );


    return lines.join(
      "\n"
    );
  }


  for (
    const exchange
    of snapshot.exchanges
  ) {

    const status =
      exchange.status ===
        null
        ? "ERR"
        : String(
            exchange.status
          );


    lines.push(
      [
        String(
          exchange.sequence
        ).padStart(
          2,
          "0"
        ),
        exchange.method.padEnd(
          5
        ),
        status.padEnd(
          3
        ),
        exchange.resourceType.padEnd(
          5
        ),
        displayPath(
          exchange.url
        )
      ].join(
        " "
      )
    );


    if (
      exchange.requestBodyRedacted !==
        null &&
      exchange.requestBodyRedacted.length >
        0
    ) {
      lines.push(
        "   payload: " +
          exchange.requestBodyRedacted
      );
    }


    if (
      exchange.responseContentType !==
        null
    ) {
      lines.push(
        "   response: " +
          exchange.responseContentType +
          (
            exchange.responseBodyTruncated
              ? " [preview truncated]"
              : ""
          )
      );
    }


    if (
      exchange.failed
    ) {
      lines.push(
        "   failure: " +
          (
            exchange.failureText ??
            "unknown"
          )
      );
    }
  }


  return lines.join(
    "\n"
  );
}
