import type {
  SemanticBatchItemResult,
  SemanticBatchReport,
  SemanticBatchRunnerOptions,
  SemanticUrlProcessor
} from "./semanticBatchTypes.js";


function normalizedUrls(
  values:
    readonly string[]
): string[] {

  const seen =
    new Set<
      string
    >();

  const output:
    string[] =
      [];


  for (
    const value
    of values
  ) {

    const url =
      value.trim();


    if (
      !url ||
      url.startsWith(
        "#"
      ) ||
      seen.has(
        url
      )
    ) {
      continue;
    }


    seen.add(
      url
    );

    output.push(
      url
    );
  }


  return output;
}


function delay(
  milliseconds:
    number
): Promise<void> {

  if (
    milliseconds <=
      0
  ) {
    return Promise.resolve();
  }


  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}


function errorMessage(
  error:
    unknown
): string {

  if (
    error instanceof
      Error
  ) {
    return error.message;
  }


  return String(
    error
  );
}


function processorError(
  url:
    string,
  error:
    unknown
): SemanticBatchItemResult {

  return {
    url,

    disposition:
      "ERROR",

    path:
      "NONE",

    model:
      null,

    decision:
      null,

    validation:
      null,

    reason:
      errorMessage(
        error
      ),

    haltBatch:
      false,

    inputTokens:
      null,

    outputTokens:
      null,

    latencyMs:
      null
  };
}


function skippedAfterQuota(
  url:
    string
): SemanticBatchItemResult {

  return {
    url,

    disposition:
      "AI_PENDING",

    path:
      "NONE",

    model:
      null,

    decision:
      null,

    validation:
      null,

    reason:
      "SKIPPED_AFTER_QUOTA_STOP",

    haltBatch:
      true,

    inputTokens:
      null,

    outputTokens:
      null,

    latencyMs:
      null
  };
}


function summaryFor(
  inputUrls:
    number,
  uniqueUrls:
    number,
  attempted:
    number,
  items:
    readonly SemanticBatchItemResult[],
  halted:
    boolean
): SemanticBatchReport["summary"] {

  return {
    inputUrls,

    uniqueUrls,

    attempted,

    camera:
      items.filter(
        item =>
          item.disposition ===
            "CAMERA"
      ).length,

    nonCamera:
      items.filter(
        item =>
          item.disposition ===
            "NON_CAMERA"
      ).length,

    review:
      items.filter(
        item =>
          item.disposition ===
            "REVIEW"
      ).length,

    aiPending:
      items.filter(
        item =>
          item.disposition ===
            "AI_PENDING"
      ).length,

    errors:
      items.filter(
        item =>
          item.disposition ===
            "ERROR"
      ).length,

    halted
  };
}


export async function runSemanticBatch(
  urls:
    readonly string[],
  processor:
    SemanticUrlProcessor,
  options:
    SemanticBatchRunnerOptions = {}
): Promise<
  SemanticBatchReport
> {

  const uniqueUrls =
    normalizedUrls(
      urls
    );

  const minGapMs =
    Math.max(
      0,
      Math.floor(
        options.minGapMs ??
        0
      )
    );

  const items:
    SemanticBatchItemResult[] =
      [];

  let attempted =
    0;

  let halted =
    false;


  for (
    let index =
      0;
    index <
      uniqueUrls.length;
    index +=
      1
  ) {

    const url =
      uniqueUrls[index]!;


    if (
      halted
    ) {
      items.push(
        skippedAfterQuota(
          url
        )
      );

      continue;
    }


    if (
      attempted >
        0 &&
      minGapMs >
        0
    ) {
      await delay(
        minGapMs
      );
    }


    attempted +=
      1;


    let item:
      SemanticBatchItemResult;


    try {
      item =
        await processor(
          url
        );
    }
    catch (
      error
    ) {
      item =
        processorError(
          url,
          error
        );
    }


    /*
     * The caller owns semantic routing. The batch layer only enforces
     * sequencing and halt semantics, so it never retries or changes models.
     */
    items.push(
      item
    );


    if (
      item.haltBatch
    ) {
      halted =
        true;
    }
  }


  return {
    items,

    summary:
      summaryFor(
        urls.length,
        uniqueUrls.length,
        attempted,
        items,
        halted
      )
  };
}
