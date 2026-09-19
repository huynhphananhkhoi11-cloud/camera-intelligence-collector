import type {
  DiscoveryTraversalDecision,
  ProductUrlEvidence
} from "./productUrlGraphTypes.js";


export function decideDiscoveryTraversal(
  evidence:
    ProductUrlEvidence
): DiscoveryTraversalDecision {

  if (
    evidence.relation ===
      "CANDIDATE_LINK" ||
    evidence.relation ===
      "PRODUCT_LINK" ||
    evidence.relation ===
      "RELATED_PRODUCT"
  ) {
    return "DETAIL_CANDIDATE";
  }


  if (
    evidence.relation ===
      "PAGINATION"
  ) {

    if (
      evidence.ownerKind ===
        "LISTING"
    ) {
      return "FOLLOW_LISTING_PAGINATION";
    }


    /*
     * Pagination owned by a product-detail region must not be promoted
     * to catalog traversal. This is the ownership rule that prevents
     * related-product widgets such as ?p=2 from becoming fake products.
     */
    return "DO_NOT_TRAVERSE";
  }


  return "DO_NOT_TRAVERSE";
}
