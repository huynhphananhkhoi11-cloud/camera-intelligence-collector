const SECRET_ASSIGNMENT =
  /(api[-_ ]?key|auth[-_ ]?key|authorization|bearer)\s*[:=]\s*([^\s,;]+)/giu;

export function redactSecretText(
  input: string,
  explicitSecrets: readonly string[] = []
): string {
  let output = input.replace(
    SECRET_ASSIGNMENT,
    (_match, key: string) => key + "=[REDACTED]"
  );

  for (const secret of explicitSecrets) {
    if (!secret) {
      continue;
    }

    output = output.split(secret).join("[REDACTED]");
  }

  return output;
}

export function safeErrorSummary(
  error: unknown,
  explicitSecrets: readonly string[] = []
): string {
  if (error instanceof Error) {
    return redactSecretText(
      error.name + ": " + error.message,
      explicitSecrets
    );
  }

  if (typeof error === "string") {
    return redactSecretText(error, explicitSecrets);
  }

  return "Unknown provider error";
}
