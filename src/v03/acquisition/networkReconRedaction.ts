const SENSITIVE_KEY =
  /(authorization|auth|token|secret|password|passwd|csrf|xsrf|session|cookie|api[_-]?key|access[_-]?key)/i;


function isSensitiveKey(
  key:
    string
): boolean {
  return SENSITIVE_KEY.test(
    key
  );
}


export function redactUrl(
  rawUrl:
    string
): string {

  try {

    const url =
      new URL(
        rawUrl
      );


    for (
      const key
      of [
        ...url.searchParams.keys()
      ]
    ) {
      if (
        isSensitiveKey(
          key
        )
      ) {
        url.searchParams.set(
          key,
          "[REDACTED]"
        );
      }
    }


    return url.toString();
  }
  catch {
    return rawUrl;
  }
}


function redactJsonValue(
  value:
    unknown
): unknown {

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      item =>
        redactJsonValue(
          item
        )
    );
  }


  if (
    value !==
      null &&
    typeof value ===
      "object"
  ) {

    const output:
      Record<
        string,
        unknown
      > = {};


    for (
      const [
        key,
        nested
      ]
      of Object.entries(
        value as
          Record<
            string,
            unknown
          >
      )
    ) {

      output[key] =
        isSensitiveKey(
          key
        )
          ? "[REDACTED]"
          : redactJsonValue(
              nested
            );
    }


    return output;
  }


  return value;
}


function redactFormEncoded(
  value:
    string
): string {

  const params =
    new URLSearchParams(
      value
    );


  for (
    const key
    of [
      ...params.keys()
    ]
  ) {
    if (
      isSensitiveKey(
        key
      )
    ) {
      params.set(
        key,
        "[REDACTED]"
      );
    }
  }


  return params.toString();
}


function redactGenericPairs(
  value:
    string
): string {

  return value.replace(
    /((?:authorization|auth|token|secret|password|passwd|csrf|xsrf|session|cookie|api[_-]?key|access[_-]?key)\s*[=:]\s*)([^&\s,;]+)/gi,
    "$1[REDACTED]"
  );
}


export function redactRequestBody(
  value:
    string |
    null,
  contentType:
    string |
    null
): string |
  null {

  if (
    value ===
      null
  ) {
    return null;
  }


  const normalizedType =
    contentType
      ?.toLowerCase() ??
    "";


  if (
    normalizedType.includes(
      "application/json"
    )
  ) {

    try {

      const parsed =
        JSON.parse(
          value
        );


      return JSON.stringify(
        redactJsonValue(
          parsed
        )
      );
    }
    catch {
      return redactGenericPairs(
        value
      );
    }
  }


  if (
    normalizedType.includes(
      "application/x-www-form-urlencoded"
    )
  ) {
    return redactFormEncoded(
      value
    );
  }


  return redactGenericPairs(
    value
  );
}
