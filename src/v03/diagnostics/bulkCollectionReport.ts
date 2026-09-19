import type {
  BulkCollectionResult
} from "../bulk/bulkTypes.js";


function subtypeCounts(
  result:
    BulkCollectionResult
): Array<
  readonly [
    string,
    number
  ]
> {

  const counts =
    new Map<
      string,
      number
    >();


  for (
    const product
    of result.products
  ) {
    counts.set(
      product.entity.subtype,
      (
        counts.get(
          product.entity.subtype
        ) ??
        0
      ) +
      1
    );
  }


  return Array.from(
    counts.entries()
  )
    .sort(
      (
        left,
        right
      ) =>
        (
          right[1] -
          left[1]
        ) ||
        left[0].localeCompare(
          right[0]
        )
    );
}


export function formatBulkCollectionReport(
  result:
    BulkCollectionResult
): string {

  const lines =
    [
      "CAMINTEL V3 BULK COLLECTION",
      "",
      "Site: " +
        result.rootUrl,
      "Discovered candidate URLs: " +
        result.candidateUrls.length,
      "Sources: static=" +
        result.discovery.channelCounts.STATIC_HTML +
        " sitemap=" +
        result.discovery.channelCounts.SITEMAP +
        " endpoint=" +
        result.discovery.channelCounts.ENDPOINT_REPLAY +
        " rendered=" +
        result.discovery.channelCounts.RENDERED_DOM,
      "Attempted detail URLs: " +
        result.attemptedUrls.length,
      "Identity clusters: " +
        result.identityResolution.clusters.length,
      "CAMERA: " +
        result.cameras.length,
      "NON_CAMERA: " +
        result.nonCameras.length,
      "UNCERTAIN: " +
        result.uncertain.length,
      "ERROR: " +
        result.errors.length,
      "",
      "Subtype counts:"
    ];


  for (
    const [
      subtype,
      count
    ]
    of subtypeCounts(
      result
    )
  ) {
    lines.push(
      " - " +
        subtype +
        ": " +
        count
    );
  }


  const cameraPreview =
    result.cameras.slice(
      0,
      20
    );


  if (
    cameraPreview.length >
      0
  ) {

    lines.push(
      "",
      "Camera preview:"
    );


    for (
      const product
      of cameraPreview
    ) {
      lines.push(
        " - " +
          product.identity.identityId +
          " | members=" +
          product.identity.memberUrls.length +
          " | observations=" +
          product.observations.length
      );
    }
  }


  if (
    result.errors.length >
      0
  ) {

    lines.push(
      "",
      "Errors:"
    );


    for (
      const error
      of result.errors.slice(
        0,
        20
      )
    ) {
      lines.push(
        " - " +
          error.url +
          " | " +
          error.message
      );
    }
  }


  return lines.join(
    "\n"
  );
}
