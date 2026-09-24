import type {
  CameraRouteDecision,
  SiteReconnaissancePacket
} from "../contracts/v15PipelineContracts.js";

export const CAMERA_ROUTE_MODEL =
  "gemini-3.5-flash-lite" as const;

export const CAMERA_ROUTE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    approvedCandidateIds: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },
  required: [
    "approvedCandidateIds"
  ],
  additionalProperties: false
} as const;

export interface CameraRouteTextPart {
  readonly type: "text";
  readonly text: string;
}

export interface CameraRouteImagePart {
  readonly type: "image";
  readonly shotId: string;
  readonly data: string;
  readonly mime_type: "image/png";
}

export type CameraRouteGeminiInputPart =
  | CameraRouteTextPart
  | CameraRouteImagePart;

export interface CameraRouteGeminiRequest {
  readonly model: typeof CAMERA_ROUTE_MODEL;
  readonly input: readonly CameraRouteGeminiInputPart[];
  readonly responseSchema:
    typeof CAMERA_ROUTE_RESPONSE_JSON_SCHEMA;
}

export type CameraRouteGeminiCall = (
  request: CameraRouteGeminiRequest
) => Promise<string>;

export class CameraRouteSelectionContractError
extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "CameraRouteSelectionContractError";
  }
}

function candidateCatalog(
  packet: SiteReconnaissancePacket
): readonly {
  readonly candidateId: string;
  readonly label: string;
  readonly url: string;
}[] {
  return packet.candidates.map(
    candidate => ({
      candidateId: candidate.candidateId,
      label: candidate.label,
      url: candidate.url
    })
  );
}

function shotVisibilityCatalog(
  packet: SiteReconnaissancePacket
): readonly {
  readonly shotId: string;
  readonly role: "landing" | "navigation-reveal";
  readonly visibleCandidateIds: readonly string[];
}[] {
  return packet.shots.map(
    shot => ({
      shotId: shot.shotId,
      role: shot.role,
      visibleCandidateIds:
        shot.visibleCandidateIds
    })
  );
}

export function buildCameraRouteSelectionPrompt(
  packet: SiteReconnaissancePacket
): string {
  return [
    "The supplied screenshots are ordered reconnaissance views of one site. Read them in the exact order provided and return only approved candidate IDs for camera-primary navigation routes.",
    "Use your own visual and language understanding of every supplied navigation screenshot together with the candidate catalog.",
    "Approve only observed candidate IDs whose primary merchandise is cameras, camera bodies, new cameras, used cameras, DSLR, mirrorless, compact cameras, or camera kits where a camera body is the primary product.",
    "Reject routes whose primary merchandise is standalone lenses, batteries, memory cards, bags, tripods, flashes, filters, microphones, grips or cages, vouchers, unrelated services, generic promotional landing pages, or unrelated products.",
    "Accessories or services merely visible near a camera route do not make that route camera-primary; judge the primary merchandise of the route.",
    "Never invent candidate IDs or URLs. Select only candidate IDs from the supplied catalog.",
    "Return one JSON object only with exactly this shape: {\"approvedCandidateIds\":[\"candidate-id\"]}.",
    "If no observed route is appropriate, return {\"approvedCandidateIds\":[]}.",
    "",
    "SITE METADATA:",
    JSON.stringify({
      website: packet.website,
      rootUrl: packet.rootUrl,
      finalUrl: packet.finalUrl
    }),
    "",
    "CANDIDATE CATALOG:",
    JSON.stringify(
      candidateCatalog(packet)
    ),
    "",
    "ORDERED SHOT/CANDIDATE VISIBILITY:",
    JSON.stringify(
      shotVisibilityCatalog(packet)
    )
  ].join("\n");
}

function buildCameraRouteGeminiInput(
  packet: SiteReconnaissancePacket
): readonly CameraRouteGeminiInputPart[] {
  const promptPart: CameraRouteTextPart = {
    type: "text",
    text: buildCameraRouteSelectionPrompt(packet)
  };

  const imageParts = packet.shots.map(
    shot => ({
      type: "image" as const,
      shotId: shot.shotId,
      data: shot.bytes.toString("base64"),
      mime_type: "image/png" as const
    })
  );

  return [
    promptPart,
    ...imageParts
  ];
}

function parseCameraRouteDecision(
  value: unknown
): CameraRouteDecision {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new CameraRouteSelectionContractError(
      "CAMERA_ROUTE_SCHEMA_MISMATCH"
    );
  }

  const record =
    value as Record<string, unknown>;

  const keys = Object.keys(record);
  if (
    keys.length !== 1 ||
    keys[0] !== "approvedCandidateIds"
  ) {
    throw new CameraRouteSelectionContractError(
      "CAMERA_ROUTE_SCHEMA_MISMATCH"
    );
  }

  const ids = record.approvedCandidateIds;
  if (
    !Array.isArray(ids) ||
    !ids.every(
      id => typeof id === "string"
    )
  ) {
    throw new CameraRouteSelectionContractError(
      "CAMERA_ROUTE_SCHEMA_MISMATCH"
    );
  }

  return {
    approvedCandidateIds:
      ids as readonly string[]
  };
}

export async function selectCameraRoutes(
  packet: SiteReconnaissancePacket,
  callGemini: CameraRouteGeminiCall
): Promise<CameraRouteDecision> {
  const outputText = await callGemini({
    model: CAMERA_ROUTE_MODEL,
    input:
      buildCameraRouteGeminiInput(packet),
    responseSchema:
      CAMERA_ROUTE_RESPONSE_JSON_SCHEMA
  });

  let raw: unknown;
  try {
    raw = JSON.parse(outputText);
  }
  catch {
    throw new CameraRouteSelectionContractError(
      "CAMERA_ROUTE_INVALID_JSON"
    );
  }

  return parseCameraRouteDecision(raw);
}
