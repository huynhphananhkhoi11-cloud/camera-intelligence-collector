import type {
  PageEvidenceBundle
} from "../evidence/pageEvidence.js";

import type {
  NetworkEvidenceBundle
} from "../evidence/networkEvidence.js";

import type {
  CameraScope
} from "../scope/cameraScopeGate.js";

export interface V16IntegrationContext {
  sourceEvidence:
    PageEvidenceBundle | null;

  networkEvidence:
    NetworkEvidenceBundle | null;

  cameraScope:
    CameraScope | null;
}

export function createV16IntegrationContext():
  V16IntegrationContext {
  return {
    sourceEvidence:
      null,

    networkEvidence:
      null,

    cameraScope:
      null
  };
}