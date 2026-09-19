import type {
  ProductUrlGraphSnapshot
} from "../discovery/productUrlGraphTypes.js";


export function formatProductUrlGraphReport(
  snapshot:
    ProductUrlGraphSnapshot
): string {

  const evidenceCount =
    snapshot.nodes.reduce(
      (
        total,
        node
      ) =>
        total +
        node.evidence.length,
      0
    );


  const lines =
    [
      "CAMINTEL V3 PRODUCT URL GRAPH",
      "",
      "Unique URL nodes: " +
        snapshot.nodes.length,
      "Evidence edges: " +
        evidenceCount,
      ""
    ];


  const preview =
    snapshot.nodes.slice(
      0,
      30
    );


  for (
    const node
    of preview
  ) {

    lines.push(
      node.url
    );


    lines.push(
      "   evidence: " +
        node.evidence.length
    );


    for (
      const evidence
      of node.evidence.slice(
        0,
        3
      )
    ) {

      lines.push(
        "   - " +
        evidence.sourceKind +
        " | " +
        evidence.ownerKind +
        " | " +
        evidence.relation +
        (
          evidence.sourceRef
            ? " | " +
              evidence.sourceRef
            : ""
        )
      );
    }
  }


  if (
    snapshot.nodes.length >
      preview.length
  ) {
    lines.push(
      "",
      "... +" +
        (
          snapshot.nodes.length -
          preview.length
        ) +
        " more URL nodes"
    );
  }


  return lines.join(
    "\n"
  );
}
