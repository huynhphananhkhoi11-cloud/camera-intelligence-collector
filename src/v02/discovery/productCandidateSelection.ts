import type {
  ProductUrlCandidate
} from "./productUrlDiscovery.js";


export function selectProductCandidates(
  candidates:
    readonly ProductUrlCandidate[],
  limit:
    number
): ProductUrlCandidate[] {

  if (
    !Number.isInteger(
      limit
    ) ||
    limit <=
      0
  ) {
    throw new Error(
      `Product candidate limit must be a positive integer: ${limit}`
    );
  }


  const byUrl =
    new Map<
      string,
      ProductUrlCandidate
    >();


  for (
    const candidate
    of candidates
  ) {

    const existing =
      byUrl.get(
        candidate.url
      );


    if (!existing) {

      byUrl.set(
        candidate.url,
        {
          url:
            candidate.url,

          score:
            candidate.score,

          reasons:
            Array.from(
              new Set(
                candidate.reasons
              )
            )
        }
      );

      continue;
    }


    existing.score =
      Math.max(
        existing.score,
        candidate.score
      );


    existing.reasons =
      Array.from(
        new Set([
          ...existing.reasons,
          ...candidate.reasons
        ])
      );
  }


  return Array.from(
    byUrl.values()
  )
    .sort(
      (a, b) =>
        (
          b.score -
          a.score
        ) ||
        a.url.localeCompare(
          b.url
        )
    )
    .slice(
      0,
      limit
    )
    .map(
      candidate => ({
        url:
          candidate.url,

        score:
          candidate.score,

        reasons:
          [
            ...candidate.reasons
          ]
      })
    );
}