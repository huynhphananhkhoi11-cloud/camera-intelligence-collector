export type GeminiCredentialStatus =
  "READY" |
  "MISCONFIGURED";

export type GeminiCredentialPresence =
  "FOUND" |
  "MISSING";


export interface GeminiCredentialInspection {
  readonly provider:
    "Gemini";

  readonly credential:
    GeminiCredentialPresence;

  readonly profile:
    string;

  readonly maskedKey:
    string |
    null;

  readonly status:
    GeminiCredentialStatus;

  readonly message:
    string |
    null;
}


export function readGeminiApiKey(
  env:
    NodeJS.ProcessEnv =
      process.env
):
  string |
  null {

  const raw =
    env.GEMINI_API_KEY;


  if (
    raw ===
      undefined
  ) {
    return null;
  }


  const trimmed =
    raw.trim();


  return trimmed.length >
    0
      ? trimmed
      : null;
}


export function readGeminiProfile(
  env:
    NodeJS.ProcessEnv =
      process.env
):
  string {

  const profile =
    env.CAMINTEL_GEMINI_PROFILE
      ?.trim();


  return (
    profile &&
    profile.length >
      0
  )
    ? profile
    : "default";
}


export function maskGeminiApiKey(
  apiKey:
    string
):
  string {

  const trimmed =
    apiKey.trim();


  if (
    trimmed.length <=
      4
  ) {
    return "****";
  }


  return (
    "****" +
    trimmed.slice(
      -4
    )
  );
}


export function inspectGeminiCredentials(
  env:
    NodeJS.ProcessEnv =
      process.env
):
  GeminiCredentialInspection {

  const apiKey =
    readGeminiApiKey(
      env
    );

  const profile =
    readGeminiProfile(
      env
    );


  if (
    !apiKey
  ) {
    return {
      provider:
        "Gemini",

      credential:
        "MISSING",

      profile,

      maskedKey:
        null,

      status:
        "MISCONFIGURED",

      message:
        "Set GEMINI_API_KEY before running AI commands."
    };
  }


  /*
   * Do not validate a vendor-specific key prefix here:
   * Gemini credential formats may evolve.
   *
   * Embedded whitespace is treated as malformed because
   * it cannot be a valid HTTP API-key credential value.
   */
  if (
    /\s/u.test(
      apiKey
    )
  ) {
    return {
      provider:
        "Gemini",

      credential:
        "FOUND",

      profile,

      maskedKey:
        maskGeminiApiKey(
          apiKey
        ),

      status:
        "MISCONFIGURED",

      message:
        "GEMINI_API_KEY contains whitespace and appears malformed."
    };
  }


  return {
    provider:
      "Gemini",

    credential:
      "FOUND",

    profile,

    maskedKey:
      maskGeminiApiKey(
        apiKey
      ),

    status:
      "READY",

    message:
      null
  };
}
