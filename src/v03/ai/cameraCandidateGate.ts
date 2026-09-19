import type {
  UrlDiscoveryEvidence
} from "../discovery/multiSourceDiscoveryTypes.js";


export type CameraCandidateRoute =
  | "CAMERA_CANDIDATE"
  | "CLEAR_NON_CAMERA"
  | "UNKNOWN";


export interface CameraCandidateDecision {
  readonly route:
    CameraCandidateRoute;

  readonly reasons:
    readonly string[];

  readonly cameraScore:
    number;

  readonly nonCameraScore:
    number;
}


const CAMERA_TERMS =
  [
    "camera",
    "may anh",
    "may-anh",
    "mirrorless",
    "dslr",
    "body only",
    "body-only",
    "canon eos",
    "nikon z",
    "nikon d",
    "sony alpha",
    "sony a7",
    "sony a6",
    "fujifilm x-",
    "fujifilm gfx",
    "lumix s",
    "lumix g",
    "panasonic s",
    "olympus om-",
    "om system",
    "leica q",
    "leica m",
    "pentax k",
    "ricoh gr",
    "instax",
    "gopro",
    "action camera"
  ] as const;


const HARD_NON_CAMERA_TERMS =
  [
    "ong kinh",
    "ong-kinh",
    "lens",
    "battery",
    "pin may anh",
    "charger",
    "sac pin",
    "tripod",
    "chan may",
    "gimbal",
    "filter",
    "memory card",
    "the nho",
    "camera bag",
    "tui may anh",
    "flash",
    "den led",
    "lighting",
    "microphone",
    "may in",
    "printer",
    "camera an ninh",
    "camera giam sat",
    "surveillance",
    "cctv",
    "webcam",
    "mount",
    "adapter",
    "cap",
    "hood",
    "strap"
  ] as const;


const MIXED_OR_CAMERA_KIT_TERMS =
  [
    "kit",
    "+ lens",
    "kem lens",
    "with lens",
    "body +",
    "camera +"
  ] as const;


function normalize(
  value:
    string
): string {

  return value
    .toLocaleLowerCase(
      "vi"
    )
    .normalize(
      "NFD"
    )
    .replace(
      /\p{Diacritic}/gu,
      ""
    )
    .replace(
      /[_/]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function matchedTerms(
  text:
    string,
  terms:
    readonly string[]
): string[] {

  return terms.filter(
    term =>
      text.includes(
        normalize(
          term
        )
      )
  );
}


export function decideCameraCandidate(
  url:
    string,
  evidence:
    readonly UrlDiscoveryEvidence[]
): CameraCandidateDecision {

  const normalizedUrl =
    normalize(
      url
    );


  const anchorText =
    normalize(
      evidence
        .map(
          item =>
            item.anchorText ??
            ""
        )
        .join(
          " "
        )
    );


  const parentText =
    normalize(
      evidence
        .map(
          item =>
            item.parentUrl ??
            ""
        )
        .join(
          " "
        )
    );


  const text =
    [
      normalizedUrl,
      anchorText,
      parentText
    ].join(
      " "
    );


  const cameraMatches =
    matchedTerms(
      text,
      CAMERA_TERMS
    );


  const nonCameraMatches =
    matchedTerms(
      text,
      HARD_NON_CAMERA_TERMS
    );


  const mixedMatches =
    matchedTerms(
      text,
      MIXED_OR_CAMERA_KIT_TERMS
    );


  let cameraScore =
    cameraMatches.length *
    3;


  let nonCameraScore =
    nonCameraMatches.length *
    2;


  const anchorCameraMatches =
    matchedTerms(
      anchorText,
      CAMERA_TERMS
    );


  const anchorNonCameraMatches =
    matchedTerms(
      anchorText,
      HARD_NON_CAMERA_TERMS
    );


  cameraScore +=
    anchorCameraMatches.length *
    2;


  nonCameraScore +=
    anchorNonCameraMatches.length *
    2;


  const reasons:
    string[] =
      [];


  if (
    cameraMatches.length >
      0
  ) {
    reasons.push(
      "camera cues: " +
      cameraMatches
        .slice(
          0,
          4
        )
        .join(
          ", "
        )
    );
  }


  if (
    nonCameraMatches.length >
      0
  ) {
    reasons.push(
      "non-camera cues: " +
      nonCameraMatches
        .slice(
          0,
          4
        )
        .join(
          ", "
        )
    );
  }


  /*
   * Negative certainty only:
   * skip only when non-camera evidence is strong and there is no
   * meaningful camera cue or camera-kit cue. UNKNOWN is deliberately
   * allowed through to AI to protect recall.
   */
  if (
    nonCameraScore >=
      6 &&
    cameraScore ===
      0 &&
    mixedMatches.length ===
      0
  ) {
    return {
      route:
        "CLEAR_NON_CAMERA",

      reasons:
        reasons.length >
          0
          ? reasons
          : [
              "strong non-camera evidence"
            ],

      cameraScore,
      nonCameraScore
    };
  }


  if (
    cameraScore >=
      3
  ) {
    return {
      route:
        "CAMERA_CANDIDATE",

      reasons:
        reasons.length >
          0
          ? reasons
          : [
              "camera evidence"
            ],

      cameraScore,
      nonCameraScore
    };
  }


  return {
    route:
      "UNKNOWN",

    reasons:
      reasons.length >
        0
        ? reasons
        : [
            "insufficient routing evidence"
          ],

    cameraScore,
    nonCameraScore
  };
}
