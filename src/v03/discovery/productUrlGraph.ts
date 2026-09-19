import type {
  ProductUrlEvidence,
  ProductUrlGraphNode,
  ProductUrlGraphSnapshot
} from "./productUrlGraphTypes.js";


function normalizeObservedUrl(
  value:
    string
): string {

  const url =
    new URL(
      value
    );


  url.hash = "";


  return url.toString();
}


function evidenceFingerprint(
  evidence:
    ProductUrlEvidence
): string {

  return JSON.stringify([
    normalizeObservedUrl(
      evidence.url
    ),
    evidence.parentUrl,
    evidence.sourceKind,
    evidence.ownerKind,
    evidence.relation,
    evidence.sourceRef ??
      null,
    evidence.metadata ??
      null
  ]);
}


export class ProductUrlGraph {
  private readonly nodes =
    new Map<
      string,
      {
        readonly url:
          string;

        readonly evidence:
          ProductUrlEvidence[];

        readonly fingerprints:
          Set<string>;
      }
    >();


  add(
    evidence:
      ProductUrlEvidence
  ): void {

    const url =
      normalizeObservedUrl(
        evidence.url
      );


    const normalizedEvidence:
      ProductUrlEvidence = {
        ...evidence,
        url
      };


    const fingerprint =
      evidenceFingerprint(
        normalizedEvidence
      );


    const existing =
      this.nodes.get(
        url
      );


    if (
      existing
    ) {

      if (
        !existing.fingerprints.has(
          fingerprint
        )
      ) {
        existing.fingerprints.add(
          fingerprint
        );

        existing.evidence.push(
          normalizedEvidence
        );
      }


      return;
    }


    this.nodes.set(
      url,
      {
        url,

        evidence:
          [
            normalizedEvidence
          ],

        fingerprints:
          new Set([
            fingerprint
          ])
      }
    );
  }


  addMany(
    evidence:
      readonly ProductUrlEvidence[]
  ): void {

    for (
      const item
      of evidence
    ) {
      this.add(
        item
      );
    }
  }


  has(
    url:
      string
  ): boolean {

    return this.nodes.has(
      normalizeObservedUrl(
        url
      )
    );
  }


  get(
    url:
      string
  ): ProductUrlGraphNode |
    null {

    const node =
      this.nodes.get(
        normalizeObservedUrl(
          url
        )
      );


    if (
      !node
    ) {
      return null;
    }


    return {
      url:
        node.url,

      evidence:
        node.evidence.map(
          item => ({
            ...item,
            metadata:
              item.metadata
                ? {
                    ...item.metadata
                  }
                : undefined
          })
        )
    };
  }


  snapshot():
    ProductUrlGraphSnapshot {

    const nodes =
      Array.from(
        this.nodes.values()
      )
        .sort(
          (
            left,
            right
          ) =>
            left.url.localeCompare(
              right.url
            )
        )
        .map(
          node => ({
            url:
              node.url,

            evidence:
              node.evidence.map(
                item => ({
                  ...item,
                  metadata:
                    item.metadata
                      ? {
                          ...item.metadata
                        }
                      : undefined
                })
              )
          }));


    return {
      nodes
    };
  }
}
