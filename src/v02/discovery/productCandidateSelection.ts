import type {
  ProductUrlCandidate
} from "./productUrlDiscovery.js";


export interface ProductCandidateSelectionOptions {
  readonly pinnedUrl?:
    string;
}


export function selectProductCandidates(
  candidates:
    readonly ProductUrlCandidate[],
  limit:
    number,
  options:
    ProductCandidateSelectionOptions = {}
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


  const ranked =
    Array.from(
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
      );


  const pinnedUrl =
    options.pinnedUrl;


  const pinned =
    pinnedUrl
      ? byUrl.get(
          pinnedUrl
        )
      : undefined;


  const selected =
    pinned
      ? [
          pinned,
          ...ranked.filter(
            candidate =>
              candidate.url !==
                pinned.url
          )
        ]
      : ranked;


  return selected
    .slice(
      0,
      limit
    )
    .map(
      candidate => ({
        url:
          candidate.url,

        /*
         * Ranking may legitimately use a score above 100 when
         * several strong discovery signals accumulate. SQLite
         * persistence, however, constrains discovery_score to
         * [0, 100]. Preserve ranking order above, then normalize
         * only the emitted/persisted candidate score here.
         */
        score:
          Math.max(
            0,
            Math.min(
              100,
              candidate.score
            )
          ),

        reasons:
          [
            ...candidate.reasons
          ]
      })
    );
}