import type {
  NetworkJsonValue
} from "../evidence/networkEvidence.js";


const TELEMETRY_SEGMENTS =
  new Set([
    "analytics",
    "telemetry",
    "metrics",
    "beacon",
    "tracking",
    "tracker",
    "ads",
    "advertising",
    "adservice",
    "logging",
    "logs"
  ]);


function normalizedSecretName(
  name:
    string
): string {
  return name
    .toLowerCase()
    .replace(
      /[^a-z0-9]/gu,
      ""
    );
}


export function isSensitiveName(
  name:
    string
): boolean {
  const normalized =
    normalizedSecretName(
      name
    );


  return (
    normalized ===
      "authorization" ||
    normalized ===
      "auth" ||
    normalized ===
      "authentication" ||
    normalized ===
      "secret" ||
    normalized ===
      "bearer" ||
    normalized ===
      "cookie" ||
    normalized ===
      "setcookie" ||
    normalized ===
      "key" ||
    normalized.includes(
      "token"
    ) ||
    normalized.includes(
      "apikey"
    ) ||
    normalized.includes(
      "accesskey"
    ) ||
    normalized.includes(
      "secretkey"
    ) ||
    normalized.includes(
      "clientsecret"
    ) ||
    normalized.includes(
      "csrf"
    ) ||
    normalized.includes(
      "sessionid"
    ) ||
    normalized.includes(
      "sessionsecret"
    ) ||
    normalized.includes(
      "signature"
    ) ||
    normalized.includes(
      "credential"
    ) ||
    normalized.includes(
      "password"
    ) ||
    normalized.includes(
      "passwd"
    )
  );
}


export function sanitizeEvidenceUrl(
  rawUrl:
    string
): string {
  try {
    const parsed =
      new URL(
        rawUrl
      );


    parsed.username =
      "";
    parsed.password =
      "";
    parsed.hash =
      "";


    for (
      const key
      of Array.from(
        parsed.searchParams.keys()
      )
    ) {
      if (
        isSensitiveName(
          key
        )
      ) {
        parsed.searchParams.delete(
          key
        );
      }
    }


    return parsed.toString();
  }
  catch {
    return sanitizeEvidenceText(
      rawUrl
    );
  }
}


export function sanitizeEvidenceText(
  input:
    string
): string {
  return input
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+\-/=]+/giu,
      "[REDACTED]"
    )
    .replace(
      /\b(?:authorization|auth|cookie|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|session[_ -]?(?:id|token|secret)|csrf[_ -]?(?:token|secret)|client[_ -]?secret|token|secret|password|passwd|credential|signature)\b\s*[:=]\s*[^\s&;<>"']+/giu,
      "[REDACTED]"
    );
}


interface SanitizeState {
  nodes:
    number;
  readonly maxNodes:
    number;
  readonly maxDepth:
    number;
}


function sanitizeJsonNode(
  value:
    unknown,
  depth:
    number,
  state:
    SanitizeState
): NetworkJsonValue {
  state.nodes +=
    1;


  if (
    state.nodes >
      state.maxNodes ||
    depth >
      state.maxDepth
  ) {
    return "[TRUNCATED]";
  }


  if (
    value ===
      null ||
    typeof value ===
      "boolean"
  ) {
    return value;
  }


  if (
    typeof value ===
      "number"
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : null;
  }


  if (
    typeof value ===
      "string"
  ) {
    return sanitizeEvidenceText(
      value
    );
  }


  if (
    Array.isArray(
      value
    )
  ) {
    const output:
      NetworkJsonValue[] =
        [];


    for (
      const item
      of value
    ) {
      if (
        state.nodes >=
          state.maxNodes
      ) {
        output.push(
          "[TRUNCATED]"
        );
        break;
      }


      output.push(
        sanitizeJsonNode(
          item,
          depth +
            1,
          state
        )
      );
    }


    return output;
  }


  if (
    typeof value ===
      "object"
  ) {
    const output:
      Record<
        string,
        NetworkJsonValue
      > =
        {};


    for (
      const [
        key,
        item
      ]
      of Object.entries(
        value as
          Record<
            string,
            unknown
          >
      )
    ) {
      if (
        isSensitiveName(
          key
        )
      ) {
        continue;
      }


      if (
        state.nodes >=
          state.maxNodes
      ) {
        output.__truncated =
          "[TRUNCATED]";
        break;
      }


      output[
        key
      ] =
        sanitizeJsonNode(
          item,
          depth +
            1,
          state
        );
    }


    return output;
  }


  return null;
}


export function sanitizeJsonForEvidence(
  value:
    unknown
): NetworkJsonValue {
  return sanitizeJsonNode(
    value,
    0,
    {
      nodes:
        0,
      maxNodes:
        10_000,
      maxDepth:
        32
    }
  );
}


export function stableEvidenceStringify(
  value:
    NetworkJsonValue
): string {
  if (
    value ===
      null ||
    typeof value !==
      "object"
  ) {
    return JSON.stringify(
      value
    );
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return (
      "[" +
      value
        .map(
          stableEvidenceStringify
        )
        .join(
          ","
        ) +
      "]"
    );
  }


  const objectValue =
    value as
      Readonly<
        Record<
          string,
          NetworkJsonValue
        >
      >;


  return (
    "{" +
    Object.keys(
      objectValue
    )
      .sort()
      .map(
        key =>
          JSON.stringify(
            key
          ) +
          ":" +
          stableEvidenceStringify(
            objectValue[
              key
            ] ??
              null
          )
      )
      .join(
        ","
      ) +
    "}"
  );
}


export function isLikelyTelemetryUrl(
  rawUrl:
    string
): boolean {
  try {
    const parsed =
      new URL(
        rawUrl
      );


    const tokens =
      (
        parsed.hostname +
        "/" +
        parsed.pathname
      )
        .toLowerCase()
        .split(
          /[^a-z0-9]+/u
        )
        .filter(
          Boolean
        );


    return tokens.some(
      token =>
        TELEMETRY_SEGMENTS.has(
          token
        )
    );
  }
  catch {
    return false;
  }
}
