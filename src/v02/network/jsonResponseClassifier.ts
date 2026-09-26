export interface JsonApiCandidate {
  path: string;

  itemCount: number;

  score: number;

  commonKeys: string[];

  signalKeys: string[];

  sample:
    Record<string, unknown>[];
}


export interface JsonResponseClassification {
  candidates:
    JsonApiCandidate[];

  arraysVisited:
    number;
}


export interface JsonResponseClassifierOptions {
  maxDepth?: number;

  maxArrays?: number;

  maxItemsPerArray?: number;

  minimumRepeatedItems?: number;
}


const IDENTITY_KEYS =
  new Set([
    "id",
    "productid",
    "product_id",
    "sku",
    "name",
    "title",
    "productname",
    "product_name"
  ]);


const PRICE_KEYS =
  new Set([
    "price",
    "amount",
    "saleprice",
    "sale_price",
    "regularprice",
    "regular_price",
    "rentalprice",
    "rental_price",
    "dailyprice",
    "daily_price"
  ]);


const URL_KEYS =
  new Set([
    "url",
    "href",
    "link",
    "slug",
    "handle",
    "permalink"
  ]);


const CATEGORY_KEYS =
  new Set([
    "category",
    "categoryid",
    "category_id",
    "categories",
    "type",
    "producttype",
    "product_type"
  ]);


const AVAILABILITY_KEYS =
  new Set([
    "availability",
    "available",
    "stock",
    "inventory",
    "quantity",
    "qty",
    "instock",
    "in_stock"
  ]);


function isRecord(
  value: unknown
): value is Record<string, unknown> {

  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value
    )
  );
}


function normalizeKey(
  raw: string
): string {

  return raw
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9_]/g,
      ""
    );
}


function hasAny(
  keys: readonly string[],
  set: ReadonlySet<string>
): boolean {

  return keys.some(
    key =>
      set.has(
        key
      )
  );
}


function childPath(
  parent: string,
  key: string
): string {

  if (
    /^[A-Za-z_$][A-Za-z0-9_$]*$/
      .test(
        key
      )
  ) {
    return `${parent}.${key}`;
  }

  return (
    `${parent}[${JSON.stringify(
      key
    )}]`
  );
}


function compactRecord(
  record: Record<string, unknown>
): Record<string, unknown> {

  const result:
    Record<string, unknown> = {};


  for (
    const [
      key,
      value
    ]
    of Object.entries(
      record
    ).slice(
      0,
      20
    )
  ) {

    if (
      value === null ||
      typeof value ===
        "number" ||
      typeof value ===
        "boolean"
    ) {

      result[key] =
        value;

      continue;
    }


    if (
      typeof value ===
      "string"
    ) {

      result[key] =
        value.slice(
          0,
          250
        );

      continue;
    }


    if (
      Array.isArray(
        value
      )
    ) {

      result[key] =
        `[array:${value.length}]`;

      continue;
    }


    if (
      isRecord(
        value
      )
    ) {

      result[key] =
        "[object]";
    }
  }


  return result;
}


function analyzeArray(
  records:
    readonly Record<string, unknown>[],
  path: string
): JsonApiCandidate | null {

  if (
    records.length <
    2
  ) {
    return null;
  }


  const counts =
    new Map<
      string,
      number
    >();


  for (
    const record
    of records
  ) {

    const keys =
      new Set(
        Object.keys(
          record
        )
          .map(
            normalizeKey
          )
          .filter(
            Boolean
          )
      );


    for (
      const key
      of keys
    ) {

      counts.set(
        key,
        (
          counts.get(
            key
          ) ??
          0
        ) + 1
      );
    }
  }


  const threshold =
    Math.ceil(
      records.length *
      0.5
    );


  const commonKeys =
    Array.from(
      counts.entries()
    )
      .filter(
        (
          [
            ,
            count
          ]
        ) =>
          count >=
          threshold
      )
      .map(
        (
          [
            key
          ]
        ) =>
          key
      )
      .sort();


  const signalKeys =
    commonKeys.filter(
      key =>
        IDENTITY_KEYS.has(
          key
        ) ||
        PRICE_KEYS.has(
          key
        ) ||
        URL_KEYS.has(
          key
        ) ||
        CATEGORY_KEYS.has(
          key
        ) ||
        AVAILABILITY_KEYS.has(
          key
        )
    );


  const hasIdentity =
    hasAny(
      commonKeys,
      IDENTITY_KEYS
    );

  const hasPrice =
    hasAny(
      commonKeys,
      PRICE_KEYS
    );

  const hasUrl =
    hasAny(
      commonKeys,
      URL_KEYS
    );

  const hasCategory =
    hasAny(
      commonKeys,
      CATEGORY_KEYS
    );

  const hasAvailability =
    hasAny(
      commonKeys,
      AVAILABILITY_KEYS
    );


  /*
   * This is intentionally candidate-level
   * detection only.
   *
   * We require an identity-like field and at
   * least one additional commercial/navigation
   * signal.
   */
  if (
    !hasIdentity ||
    !(
      hasPrice ||
      hasUrl ||
      hasCategory ||
      hasAvailability
    )
  ) {
    return null;
  }


  let score =
    10;


  if (hasIdentity) {
    score +=
      25;
  }

  if (hasPrice) {
    score +=
      25;
  }

  if (hasUrl) {
    score +=
      15;
  }

  if (hasCategory) {
    score +=
      10;
  }

  if (hasAvailability) {
    score +=
      10;
  }


  if (
    records.length >=
    5
  ) {
    score +=
      5;
  }


  score =
    Math.min(
      score,
      100
    );


  return {
    path,

    itemCount:
      records.length,

    score,

    commonKeys,

    signalKeys,

    sample:
      records
        .slice(
          0,
          3
        )
        .map(
          compactRecord
        )
  };
}


/**
 * Search an arbitrary JSON payload for repeated
 * object arrays that resemble commercial/API
 * collections.
 *
 * A candidate is NOT product truth.
 */
export function classifyJsonResponse(
  payload: unknown,
  options:
    JsonResponseClassifierOptions = {}
): JsonResponseClassification {

  const maxDepth =
    options.maxDepth ??
    6;

  const maxArrays =
    options.maxArrays ??
    100;

  const maxItemsPerArray =
    options.maxItemsPerArray ??
    50;

  const minimumRepeatedItems =
    options.minimumRepeatedItems ??
    2;


  const candidates:
    JsonApiCandidate[] = [];

  const candidatePaths =
    new Set<string>();

  let arraysVisited =
    0;


  const visit = (
    value: unknown,
    path: string,
    depth: number
  ): void => {

    if (
      depth >
      maxDepth
    ) {
      return;
    }


    if (
      Array.isArray(
        value
      )
    ) {

      if (
        arraysVisited >=
        maxArrays
      ) {
        return;
      }


      arraysVisited +=
        1;


      const records =
        value
          .filter(
            isRecord
          )
          .slice(
            0,
            maxItemsPerArray
          );


      if (
        records.length >=
          minimumRepeatedItems &&
        records.length >=
          Math.ceil(
            Math.min(
              value.length,
              maxItemsPerArray
            ) *
            0.5
          )
      ) {

        const candidate =
          analyzeArray(
            records,
            path
          );


        if (
          candidate &&
          !candidatePaths.has(
            candidate.path
          )
        ) {

          candidatePaths.add(
            candidate.path
          );

          candidates.push(
            candidate
          );
        }
      }


      for (
        const item
        of value.slice(
          0,
          10
        )
      ) {

        if (
          isRecord(
            item
          )
        ) {

          for (
            const [
              key,
              child
            ]
            of Object.entries(
              item
            )
          ) {

            if (
              Array.isArray(
                child
              ) ||
              isRecord(
                child
              )
            ) {

              visit(
                child,
                `${path}[*].${key}`,
                depth + 1
              );
            }
          }
        }
      }


      return;
    }


    if (
      isRecord(
        value
      )
    ) {

      for (
        const [
          key,
          child
        ]
        of Object.entries(
          value
        )
      ) {

        if (
          Array.isArray(
            child
          ) ||
          isRecord(
            child
          )
        ) {

          visit(
            child,
            childPath(
              path,
              key
            ),
            depth + 1
          );
        }
      }
    }
  };


  visit(
    payload,
    "$",
    0
  );


  candidates.sort(
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


  return {
    candidates,
    arraysVisited
  };
}