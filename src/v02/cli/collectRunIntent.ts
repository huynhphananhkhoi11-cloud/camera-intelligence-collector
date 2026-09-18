export interface CollectRunIntentInput {
  url?:
    string;

  resumeRunId?:
    string;

  fresh?:
    boolean;
}


export type CollectRunIntent =
  | {
      mode:
        "NEW";

      url:
        string;

      runId:
        null;

      fresh:
        boolean;
    }
  | {
      mode:
        "RESUME";

      url:
        null;

      runId:
        string;

      fresh:
        false;
    };


function optionalText(
  value:
    string |
    undefined
): string | null {
  if (
    value ===
    undefined
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized
    ? normalized
    : null;
}


function canonicalAbsoluteUrl(
  raw:
    string
): string {
  let url:
    URL;

  try {
    url =
      new URL(
        raw
      );
  }
  catch {
    throw new Error(
      `Invalid absolute URL: ${raw}`
    );
  }


  if (
    url.protocol !==
      "http:" &&
    url.protocol !==
      "https:"
  ) {
    throw new Error(
      `Unsupported URL protocol: ${url.protocol}`
    );
  }


  url.hash =
    "";


  return url.toString();
}


/**
 * Resolve only the run lifecycle intent.
 *
 * This helper intentionally does not know:
 * - browser options;
 * - discovery;
 * - site mode;
 * - business classification;
 * - output/export behavior.
 *
 * Actual Commander wiring is performed by the CLI entry point.
 */
export function resolveCollectRunIntent(
  input:
    CollectRunIntentInput
): CollectRunIntent {
  const rawUrl =
    optionalText(
      input.url
    );

  const resumeRunId =
    optionalText(
      input.resumeRunId
    );

  const fresh =
    input.fresh ===
    true;


  if (
    resumeRunId !==
      null &&
    fresh
  ) {
    throw new Error(
      "--fresh and --resume cannot be used together."
    );
  }


  if (
    resumeRunId !==
      null &&
    rawUrl !==
      null
  ) {
    throw new Error(
      "Do not provide a URL together with an explicit --resume runId."
    );
  }


  if (
    resumeRunId !==
    null
  ) {
    return {
      mode:
        "RESUME",

      url:
        null,

      runId:
        resumeRunId,

      fresh:
        false
    };
  }


  if (
    rawUrl ===
    null
  ) {
    throw new Error(
      "A URL is required for a new run, or provide --resume <runId>."
    );
  }


  return {
    mode:
      "NEW",

    url:
      canonicalAbsoluteUrl(
        rawUrl
      ),

    runId:
      null,

    fresh
  };
}