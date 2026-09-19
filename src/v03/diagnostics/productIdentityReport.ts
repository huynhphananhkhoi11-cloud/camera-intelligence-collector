import type {
  ProductIdentityResolution
} from "../identity/productIdentityTypes.js";


export function formatProductIdentityReport(
  resolution:
    ProductIdentityResolution
): string {

  const lines =
    [
      "CAMINTEL V3 PRODUCT IDENTITY",
      "",
      "Identity clusters: " +
        resolution.clusters.length,
      ""
    ];


  for (
    const cluster
    of resolution.clusters
  ) {

    lines.push(
      cluster.identityId
    );


    lines.push(
      "   members: " +
        cluster.memberUrls.length
    );


    for (
      const url
      of cluster.memberUrls
    ) {
      lines.push(
        "   - " +
          url
      );
    }


    lines.push(
      "   tokens:"
    );


    for (
      const token
      of cluster.tokens
    ) {
      lines.push(
        "   - " +
          token.kind +
          " | " +
          token.value
      );
    }


    lines.push(
      ""
    );
  }


  return lines.join(
    "\n"
  );
}
