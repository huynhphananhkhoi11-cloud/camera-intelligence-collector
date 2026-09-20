export type ProviderErrorClass =
  | "AUTH_INVALID"
  | "TRANSIENT_PROVIDER"
  | "RATE_LIMIT"
  | "DAILY_QUOTA"
  | "SCHEMA_FORMAT"
  | "UNKNOWN";

export interface ProviderErrorClassification {
  readonly errorClass: ProviderErrorClass;
  readonly httpStatus: number | null;
  readonly providerCode: string | null;
  readonly retryAfterMs: number | null;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object"
    ? value as UnknownRecord
    : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function flattenErrorText(error: unknown): string {
  const root = asRecord(error);
  const response = asRecord(root?.response);
  const data = response?.data ?? root?.data;

  const parts = [
    root?.code,
    root?.name,
    root?.message,
    response?.statusText
  ];

  if (typeof data === "string") {
    parts.push(data);
  } else if (data !== undefined) {
    try {
      parts.push(JSON.stringify(data));
    } catch {
      // Ignore unserializable provider payloads.
    }
  }

  return parts
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function retryAfterMs(error: unknown): number | null {
  const root = asRecord(error);
  const response = asRecord(root?.response);
  const headers = asRecord(response?.headers);
  const raw = firstString(
    headers?.["retry-after"],
    headers?.["Retry-After"],
    root?.retryAfter
  );

  if (!raw) {
    return null;
  }

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    return Math.max(0, when - Date.now());
  }

  return null;
}

export function classifyProviderError(
  error: unknown
): ProviderErrorClassification {
  const root = asRecord(error);
  const response = asRecord(root?.response);
  const data = asRecord(response?.data ?? root?.data);
  const nestedError = asRecord(data?.error);

  const httpStatus = firstNumber(
    root?.status,
    root?.statusCode,
    response?.status,
    nestedError?.code
  );

  const providerCode = firstString(
    root?.code,
    root?.reason,
    data?.code,
    data?.reason,
    nestedError?.status,
    nestedError?.reason
  );

  const text = flattenErrorText(error);

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    /invalid[_ -]?api[_ -]?key|invalid[_ -]?auth|permission[_ -]?denied|unauthenticated/.test(text)
  ) {
    return {
      errorClass: "AUTH_INVALID",
      httpStatus,
      providerCode,
      retryAfterMs: null
    };
  }

  if (
    httpStatus === 429 &&
    /quota[_ -]?exceeded|daily quota|requests per day|rpd/.test(text)
  ) {
    return {
      errorClass: "DAILY_QUOTA",
      httpStatus,
      providerCode,
      retryAfterMs: retryAfterMs(error)
    };
  }

  if (
    httpStatus === 429 ||
    /rate[_ -]?limit[_ -]?exceeded|too[_ -]?many[_ -]?requests|resource_exhausted/.test(text)
  ) {
    return {
      errorClass: "RATE_LIMIT",
      httpStatus,
      providerCode,
      retryAfterMs: retryAfterMs(error)
    };
  }

  if (
    httpStatus === 502 ||
    httpStatus === 503 ||
    httpStatus === 504 ||
    /service[_ -]?unavailable|network|econnreset|etimedout|fetch failed/.test(text)
  ) {
    return {
      errorClass: "TRANSIENT_PROVIDER",
      httpStatus,
      providerCode,
      retryAfterMs: retryAfterMs(error)
    };
  }

  if (
    /schema|json parse|unexpected token|invalid json|structured output/.test(text)
  ) {
    return {
      errorClass: "SCHEMA_FORMAT",
      httpStatus,
      providerCode,
      retryAfterMs: null
    };
  }

  return {
    errorClass: "UNKNOWN",
    httpStatus,
    providerCode,
    retryAfterMs: retryAfterMs(error)
  };
}
