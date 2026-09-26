import type {
  JsonApiCandidate
} from "./jsonResponseClassifier.js";


export interface ApiCandidateObservation {
  responseUrl: string;

  method: string;

  status: number;

  contentType: string;

  candidate:
    JsonApiCandidate;
}


export interface StoredApiCandidate {
  responseUrl: string;

  method: string;

  status: number;

  contentType: string;

  path: string;

  itemCount: number;

  score: number;

  commonKeys: string[];

  signalKeys: string[];

  sample:
    Record<string, unknown>[];

  seenCount: number;
}


function uniqueSorted(
  values:
    readonly string[]
): string[] {

  return Array.from(
    new Set(
      values
    )
  ).sort();
}


/**
 * In-memory collection of observed API candidates.
 *
 * It deduplicates by response URL + JSON path.
 * Persistence belongs to a later run-ledger phase.
 */
export class ApiCandidateStore {

  private readonly items =
    new Map<
      string,
      StoredApiCandidate
    >();


  add(
    observation:
      ApiCandidateObservation
  ): StoredApiCandidate {

    const key =
      `${observation.responseUrl}\n${
        observation.candidate.path
      }`;


    const existing =
      this.items.get(
        key
      );


    if (existing) {

      existing.seenCount +=
        1;

      existing.score =
        Math.max(
          existing.score,
          observation.candidate
            .score
        );

      existing.itemCount =
        Math.max(
          existing.itemCount,
          observation.candidate
            .itemCount
        );

      existing.commonKeys =
        uniqueSorted([
          ...existing.commonKeys,
          ...observation.candidate
            .commonKeys
        ]);

      existing.signalKeys =
        uniqueSorted([
          ...existing.signalKeys,
          ...observation.candidate
            .signalKeys
        ]);


      if (
        observation.candidate
          .sample.length >
        existing.sample.length
      ) {

        existing.sample =
          observation.candidate
            .sample;
      }


      return existing;
    }


    const stored:
      StoredApiCandidate = {

      responseUrl:
        observation.responseUrl,

      method:
        observation.method,

      status:
        observation.status,

      contentType:
        observation.contentType,

      path:
        observation.candidate
          .path,

      itemCount:
        observation.candidate
          .itemCount,

      score:
        observation.candidate
          .score,

      commonKeys:
        [...observation.candidate
          .commonKeys],

      signalKeys:
        [...observation.candidate
          .signalKeys],

      sample:
        observation.candidate
          .sample,

      seenCount:
        1
    };


    this.items.set(
      key,
      stored
    );


    return stored;
  }


  get size(): number {

    return this.items.size;
  }


  values():
    StoredApiCandidate[] {

    return Array.from(
      this.items.values()
    )
      .sort(
        (a, b) => {

          const scoreDifference =
            b.score -
            a.score;

          if (
            scoreDifference !==
            0
          ) {
            return scoreDifference;
          }

          return (
            b.itemCount -
            a.itemCount
          );
        }
      );
  }


  clear(): void {

    this.items.clear();
  }
}