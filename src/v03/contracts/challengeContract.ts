export type ChallengeMode =
  | "off"
  | "manual"
  | "auto";

export type ChallengeState =
  | "NONE"
  | "RATE_LIMIT"
  | "FORBIDDEN"
  | "CHALLENGE_CONFIRMED";

export interface ChallengeDetectionInput {
  status: number;
  bodyText?: string | null;
  url?: string | null;
}

export interface ChallengeDetection {
  state: ChallengeState;
  markers: string[];
}

const challengeMarkers =
  [
    "g-recaptcha",
    "recaptcha",
    "hcaptcha",
    "h-captcha",
    "cf-turnstile",
    "turnstile",
    "awswafcaptcha",
    "verify you are human",
    "are you a robot",
    "human verification"
  ] as const;

export function detectChallenge(
  input:
    ChallengeDetectionInput
): ChallengeDetection {
  const haystack =
    [
      input.url ?? "",
      input.bodyText ?? ""
    ]
      .join("\n")
      .toLowerCase();

  const markers =
    challengeMarkers.filter(
      marker =>
        haystack.includes(
          marker
        )
    );

  if (
    markers.length > 0
  ) {
    return {
      state:
        "CHALLENGE_CONFIRMED",
      markers:
        [...markers]
    };
  }

  if (
    input.status === 429
  ) {
    return {
      state:
        "RATE_LIMIT",
      markers: []
    };
  }

  if (
    input.status === 403
  ) {
    return {
      state:
        "FORBIDDEN",
      markers: []
    };
  }

  return {
    state: "NONE",
    markers: []
  };
}

export function shouldInvokeCaptchaProvider(
  mode:
    ChallengeMode,
  detection:
    ChallengeDetection
): boolean {
  return (
    mode === "auto" &&
    detection.state ===
      "CHALLENGE_CONFIRMED"
  );
}
