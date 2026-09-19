import {
  buildIdentityTokens
} from "./identityTokens.js";

import type {
  DetailIdentitySignals,
  ProductIdentityCluster,
  ProductIdentityRecord,
  ProductIdentityResolution,
  ProductIdentityToken,
  ProductIdentityTokenKind
} from "./productIdentityTypes.js";


const TOKEN_PRIORITY:
  Readonly<
    Record<
      ProductIdentityTokenKind,
      number
    >
  > = {
    CANONICAL:
      0,

    STRUCTURED_URL:
      1,

    STRUCTURED_ID:
      2,

    SKU:
      3,

    PRODUCT_ID:
      4,

    REQUESTED_URL:
      5
  };


function uniqueTokens(
  records:
    readonly ProductIdentityRecord[]
): ProductIdentityToken[] {

  const byToken =
    new Map<
      string,
      ProductIdentityToken
    >();


  for (
    const record
    of records
  ) {

    for (
      const token
      of record.tokens
    ) {

      if (
        !byToken.has(
          token.token
        )
      ) {
        byToken.set(
          token.token,
          token
        );
      }
    }
  }


  return Array.from(
    byToken.values()
  )
    .sort(
      (
        left,
        right
      ) =>
        (
          TOKEN_PRIORITY[
            left.kind
          ] -
          TOKEN_PRIORITY[
            right.kind
          ]
        ) ||
        left.token.localeCompare(
          right.token
        )
    );
}


function preferredIdentityId(
  tokens:
    readonly ProductIdentityToken[]
): string {

  const preferred =
    tokens[0];


  if (
    preferred ===
      undefined
  ) {
    throw new Error(
      "Identity cluster has no tokens."
    );
  }


  return preferred.token;
}


class UnionFind {
  private readonly parent:
    number[];


  private readonly rank:
    number[];


  constructor(
    size:
      number
  ) {

    this.parent =
      Array.from(
        {
          length:
            size
        },
        (
          _,
          index
        ) =>
          index
      );


    this.rank =
      Array.from(
        {
          length:
            size
        },
        () =>
          0
      );
  }


  find(
    index:
      number
  ): number {

    const parent =
      this.parent[
        index
      ];


    if (
      parent ===
        undefined
    ) {
      throw new Error(
        "UnionFind index out of range."
      );
    }


    if (
      parent !==
        index
    ) {

      this.parent[
        index
      ] =
        this.find(
          parent
        );
    }


    return this.parent[
      index
    ]!;
  }


  union(
    left:
      number,
    right:
      number
  ): void {

    const leftRoot =
      this.find(
        left
      );


    const rightRoot =
      this.find(
        right
      );


    if (
      leftRoot ===
        rightRoot
    ) {
      return;
    }


    const leftRank =
      this.rank[
        leftRoot
      ] ??
      0;


    const rightRank =
      this.rank[
        rightRoot
      ] ??
      0;


    if (
      leftRank <
        rightRank
    ) {
      this.parent[
        leftRoot
      ] =
        rightRoot;

      return;
    }


    if (
      leftRank >
        rightRank
    ) {
      this.parent[
        rightRoot
      ] =
        leftRoot;

      return;
    }


    this.parent[
      rightRoot
    ] =
      leftRoot;


    this.rank[
      leftRoot
    ] =
      leftRank +
      1;
  }
}


export function createProductIdentityRecord(
  signals:
    DetailIdentitySignals
): ProductIdentityRecord {

  return {
    requestedUrl:
      signals.requestedUrl,

    signals,

    tokens:
      buildIdentityTokens(
        signals
      )
  };
}


export function resolveProductIdentities(
  records:
    readonly ProductIdentityRecord[]
): ProductIdentityResolution {

  const unionFind =
    new UnionFind(
      records.length
    );


  const tokenOwner =
    new Map<
      string,
      number
    >();


  records.forEach(
    (
      record,
      index
    ) => {

      for (
        const token
        of record.tokens
      ) {

        const owner =
          tokenOwner.get(
            token.token
          );


        if (
          owner ===
            undefined
        ) {
          tokenOwner.set(
            token.token,
            index
          );

          continue;
        }


        unionFind.union(
          owner,
          index
        );
      }
    }
  );


  const groups =
    new Map<
      number,
      ProductIdentityRecord[]
    >();


  records.forEach(
    (
      record,
      index
    ) => {

      const root =
        unionFind.find(
          index
        );


      const group =
        groups.get(
          root
        ) ??
        [];


      group.push(
        record
      );


      groups.set(
        root,
        group
      );
    }
  );


  const clusters:
    ProductIdentityCluster[] =
      Array.from(
        groups.values()
      )
        .map(
          group => {

            const sortedRecords =
              [
                ...group
              ]
                .sort(
                  (
                    left,
                    right
                  ) =>
                    left.requestedUrl.localeCompare(
                      right.requestedUrl
                    )
                );


            const tokens =
              uniqueTokens(
                sortedRecords
              );


            return {
              identityId:
                preferredIdentityId(
                  tokens
                ),

              memberUrls:
                sortedRecords.map(
                  record =>
                    record.requestedUrl
                ),

              tokens,

              records:
                sortedRecords
            };
          }
        )
        .sort(
          (
            left,
            right
          ) =>
            left.identityId.localeCompare(
              right.identityId
            )
        );


  const byRequestedUrl:
    Record<
      string,
      string
    > = {};


  for (
    const cluster
    of clusters
  ) {

    for (
      const url
      of cluster.memberUrls
    ) {
      byRequestedUrl[
        url
      ] =
        cluster.identityId;
    }
  }


  return {
    clusters,
    byRequestedUrl
  };
}
