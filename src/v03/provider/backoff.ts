export interface BackoffOptions {
  readonly attempt: number;
  readonly retryAfterMs?: number | null;
  readonly baseMs?: number;
  readonly maxMs?: number;
  readonly jitterRatio?: number;
  readonly random?: () => number;
}

export function computeBoundedBackoffMs(
  options: BackoffOptions
): number {
  const attempt = Math.max(1, Math.floor(options.attempt));
  const baseMs = Math.max(1, options.baseMs ?? 1_000);
  const maxMs = Math.max(baseMs, options.maxMs ?? 30_000);
  const jitterRatio = Math.min(1, Math.max(0, options.jitterRatio ?? 0.2));
  const random = options.random ?? Math.random;

  const exponential = Math.min(
    maxMs,
    baseMs * (2 ** Math.min(attempt - 1, 16))
  );

  const jitterSpan = exponential * jitterRatio;
  const jittered = Math.max(
    0,
    Math.round(
      exponential - jitterSpan + (2 * jitterSpan * random())
    )
  );

  const retryAfterMs =
    options.retryAfterMs !== null &&
    options.retryAfterMs !== undefined &&
    Number.isFinite(options.retryAfterMs)
      ? Math.max(0, Math.round(options.retryAfterMs))
      : 0;

  return Math.min(
    maxMs,
    Math.max(retryAfterMs, jittered)
  );
}
