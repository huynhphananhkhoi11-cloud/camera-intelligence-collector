import type {
  EndpointDiscoveryRun
} from "../acquisition/endpointReplayTypes.js";

import type {
  ProductUrlEvidence
} from "./productUrlGraphTypes.js";


export function endpointReplayEvidence(
  run:
    EndpointDiscoveryRun
): ProductUrlEvidence[] {

  const output:
    ProductUrlEvidence[] =
      [];


  for (
    const discovery
    of run.discoveries
  ) {

    for (
      const url
      of discovery.discoveredUrls
    ) {

      output.push({
        url,

        parentUrl:
          discovery.candidate.url,

        sourceKind:
          "ENDPOINT_REPLAY",

        ownerKind:
          "ENDPOINT_RESPONSE",

        relation:
          "PRODUCT_LINK",

        sourceRef:
          discovery.candidate.candidateId,

        metadata: {
          method:
            discovery.candidate.method,

          familyKey:
            discovery.candidate.familyKey,

          score:
            discovery.candidate.score,

          requestBody:
            discovery.candidate.requestBody
        }
      });
    }
  }


  return output;
}
