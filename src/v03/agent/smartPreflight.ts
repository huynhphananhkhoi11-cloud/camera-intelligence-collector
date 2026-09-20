import {
  decideCameraCandidate
} from "../ai/cameraCandidateGate.js";

import type {
  SmartRouteResult
} from "./fastSlowRouter.js";


export function deterministicSmartPreflight(
  url:
    string
): SmartRouteResult |
  null {

  const gate =
    decideCameraCandidate(
      url,
      []
    );


  if (
    gate.route !==
      "CLEAR_NON_CAMERA" &&
    gate.route !==
      "CLEAR_NON_PRODUCT_CONTENT"
  ) {
    return null;
  }


  return {
    url,

    path:
      "NONE",

    disposition:
      "NON_CAMERA",

    decision:
      null,

    validation:
      null,

    model:
      null,

    attempts:
      0,

    latencyMs:
      0,

    inputTokens:
      0,

    outputTokens:
      0,

    reason:
      gate.route ===
        "CLEAR_NON_PRODUCT_CONTENT"
        ? "DETERMINISTIC_CLEAR_NON_PRODUCT_CONTENT"
        : "DETERMINISTIC_CLEAR_NON_CAMERA",

    haltBatch:
      false
  };
}
