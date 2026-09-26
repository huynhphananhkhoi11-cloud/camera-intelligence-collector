import {
  classifyProviderError,
  type ProviderErrorClass
} from "./errorClassifier.js";

export interface ProviderHealthCheckResult {
  readonly ok: boolean;
  readonly status: number | null;
  readonly errorClass: ProviderErrorClass | null;
}

export async function healthCheckGeminiAuthKey(
  authKey: string,
  timeoutMs = 8_000
): Promise<ProviderHealthCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        method: "GET",
        headers: {
          "x-goog-api-key": authKey
        },
        signal: controller.signal
      }
    );

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        errorClass: null
      };
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const classification = classifyProviderError({
      response: {
        status: response.status,
        data
      }
    });

    return {
      ok: false,
      status: response.status,
      errorClass: classification.errorClass
    };
  } catch (error) {
    const classification = classifyProviderError(error);
    return {
      ok: false,
      status: classification.httpStatus,
      errorClass: classification.errorClass
    };
  } finally {
    clearTimeout(timeout);
  }
}
