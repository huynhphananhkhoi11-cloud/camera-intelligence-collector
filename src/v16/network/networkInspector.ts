import {
  createHash
} from "node:crypto";

import type {
  Page,
  Response
} from "playwright";

import type {
  NetworkEvidenceBody,
  NetworkEvidenceBundle,
  NetworkEvidenceEntry,
  NetworkEvidenceLimits,
  NetworkEvidenceStats
} from "../evidence/networkEvidence.js";

import {
  isLikelyTelemetryUrl,
  sanitizeEvidenceText,
  sanitizeEvidenceUrl,
  sanitizeJsonForEvidence,
  stableEvidenceStringify
} from "./networkSanitizer.js";


export interface NetworkInspectorOptions
extends Partial<NetworkEvidenceLimits> {
  readonly captureSmallText?:
    boolean;
}


export const DEFAULT_NETWORK_EVIDENCE_LIMITS:
  NetworkEvidenceLimits =
    Object.freeze({
      maxObservedResponses:
        96,
      maxCapturedResponses:
        32,
      maxBodyBytes:
        512 *
        1_024,
      maxTextBytes:
        128 *
        1_024,
      maxTotalBodyBytes:
        4 *
        1_024 *
        1_024,
      inspectionTimeoutMs:
        12_000,
      reloadTimeoutMs:
        8_000,
      observationWindowMs:
        1_500,
      perResponseTimeoutMs:
        2_000
    });


interface MutableStats {
  observedResponses:
    number;
  capturedResponses:
    number;
  ignoredNonFetchXhr:
    number;
  ignoredTelemetry:
    number;
  ignoredBinary:
    number;
  ignoredOversized:
    number;
  ignoredObservationCap:
    number;
  ignoredCaptureCap:
    number;
  bodyReadErrors:
    number;
  bodyReadTimeouts:
    number;
  parseErrors:
    number;
  deduplicated:
    number;
}


interface TimedResult<T> {
  readonly kind:
    "value" |
    "error" |
    "timeout";
  readonly value?:
    T;
  readonly error?:
    unknown;
}


function positiveInteger(
  value:
    number | undefined,
  fallback:
    number
): number {
  if (
    value == null ||
    !Number.isFinite(
      value
    ) ||
    value <=
      0
  ) {
    return fallback;
  }


  return Math.max(
    1,
    Math.floor(
      value
    )
  );
}


function nonnegativeInteger(
  value:
    number | undefined,
  fallback:
    number
): number {
  if (
    value == null ||
    !Number.isFinite(
      value
    ) ||
    value <
      0
  ) {
    return fallback;
  }


  return Math.floor(
    value
  );
}


function resolveLimits(
  options:
    NetworkInspectorOptions
): NetworkEvidenceLimits {
  return {
    maxObservedResponses:
      positiveInteger(
        options.maxObservedResponses,
        DEFAULT_NETWORK_EVIDENCE_LIMITS.maxObservedResponses
      ),
    maxCapturedResponses:
      positiveInteger(
        options.maxCapturedResponses,
        DEFAULT_NETWORK_EVIDENCE_LIMITS.maxCapturedResponses
      ),
    maxBodyBytes:
      positiveInteger(
        options.maxBodyBytes,
        DEFAULT_NETWORK_EVIDENCE_LIMITS.maxBodyBytes
      ),
    maxTextBytes:
      positiveInteger(
        options.maxTextBytes,
        DEFAULT_NETWORK_EVIDENCE_LIMITS.maxTextBytes
      ),
    maxTotalBodyBytes:
      positiveInteger(
        options.maxTotalBodyBytes,
        DEFAULT_NETWORK_EVIDENCE_LIMITS.maxTotalBodyBytes
      ),
    inspectionTimeoutMs:
      positiveInteger(
        options.inspectionTimeoutMs,
        DEFAULT_NETWORK_EVIDENCE_LIMITS.inspectionTimeoutMs
      ),
    reloadTimeoutMs:
      positiveInteger(
        options.reloadTimeoutMs,
        DEFAULT_NETWORK_EVIDENCE_LIMITS.reloadTimeoutMs
      ),
    observationWindowMs:
      nonnegativeInteger(
        options.observationWindowMs,
        DEFAULT_NETWORK_EVIDENCE_LIMITS.observationWindowMs
      ),
    perResponseTimeoutMs:
      positiveInteger(
        options.perResponseTimeoutMs,
        DEFAULT_NETWORK_EVIDENCE_LIMITS.perResponseTimeoutMs
      )
  };
}


async function settleWithTimeout<T>(
  promise:
    Promise<T>,
  timeoutMs:
    number
): Promise<TimedResult<T>> {
  let timer:
    ReturnType<
      typeof setTimeout
    > | null =
      null;


  const timeout =
    new Promise<TimedResult<T>>(
      resolve => {
        timer =
          setTimeout(
            () =>
              resolve({
                kind:
                  "timeout"
              }),
            Math.max(
              1,
              timeoutMs
            )
          );
      }
    );


  const settled:
    Promise<TimedResult<T>> =
      promise.then(
        value => ({
          kind:
            "value" as const,
          value
        }),
        error => ({
          kind:
            "error" as const,
          error
        })
      );


  const result =
    await Promise.race([
      settled,
      timeout
    ]);


  if (
    timer !==
      null
  ) {
    clearTimeout(
      timer
    );
  }


  return result;
}


function remainingMs(
  deadline:
    number
): number {
  return Math.max(
    1,
    deadline -
    Date.now()
  );
}


function normalizedContentType(
  raw:
    string | null
): string | null {
  if (
    !raw
  ) {
    return null;
  }


  const mime =
    raw
      .split(
        ";",
        1
      )[0]
      ?.trim()
      .toLowerCase();


  return mime ||
    null;
}


function isJsonContentType(
  contentType:
    string | null
): boolean {
  return Boolean(
    contentType &&
    (
      contentType ===
        "application/json" ||
      contentType.endsWith(
        "+json"
      ) ||
      contentType ===
        "application/graphql-response+json"
    )
  );
}


function isSmallTextContentType(
  contentType:
    string | null
): boolean {
  return Boolean(
    contentType &&
    (
      contentType.startsWith(
        "text/"
      ) ||
      contentType ===
        "application/xhtml+xml" ||
      contentType ===
        "application/xml"
    )
  );
}


function safePageUrl(
  page:
    Page
): string {
  try {
    return sanitizeEvidenceUrl(
      page.url()
    );
  }
  catch {
    return "";
  }
}


function safeResponseUrl(
  response:
    Response
): string {
  try {
    return sanitizeEvidenceUrl(
      response.url()
    );
  }
  catch {
    return "";
  }
}


function rawResponseUrl(
  response:
    Response
): string {
  try {
    return response.url();
  }
  catch {
    return "";
  }
}


function safeStatus(
  response:
    Response
): number {
  try {
    return response.status();
  }
  catch {
    return 0;
  }
}


function safeRequestMetadata(
  response:
    Response
): {
      readonly method:
        string | null;
      readonly resourceType:
        string | null;
      readonly contextUrl:
        string | null;
    } {
  try {
    const request =
      response.request();


    let contextUrl:
      string | null =
        null;


    try {
      contextUrl =
        sanitizeEvidenceUrl(
          request.frame().url()
        );
    }
    catch {
      contextUrl =
        null;
    }


    let method:
      string | null =
        null;


    try {
      const rawMethod =
        request.method();


      method =
        rawMethod
          ? rawMethod.toUpperCase()
          : null;
    }
    catch {
      method =
        null;
    }


    let resourceType:
      string | null =
        null;


    try {
      resourceType =
        request.resourceType() ||
        null;
    }
    catch {
      resourceType =
        null;
    }


    return {
      method,
      resourceType,
      contextUrl
    };
  }
  catch {
    return {
      method:
        null,
      resourceType:
        null,
      contextUrl:
        null
    };
  }
}


async function safeHeaderValue(
  response:
    Response,
  name:
    string
): Promise<string | null> {
  try {
    return await response.headerValue(
      name
    );
  }
  catch {
    return null;
  }
}


function parseContentLength(
  raw:
    string | null
): number | null {
  if (
    raw == null ||
    raw.trim() ===
      ""
  ) {
    return null;
  }


  const parsed =
    Number(
      raw
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      0
  ) {
    return null;
  }


  return Math.floor(
    parsed
  );
}


function sha256(
  content:
    string
): string {
  return createHash(
    "sha256"
  )
    .update(
      content,
      "utf8"
    )
    .digest(
      "hex"
    );
}


function bodyForJson(
  raw:
    unknown
): {
      readonly body:
        NetworkEvidenceBody;
      readonly canonical:
        string;
    } {
  const value =
    sanitizeJsonForEvidence(
      raw
    );


  const canonical =
    stableEvidenceStringify(
      value
    );


  const topLevelKeys =
    value !==
      null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
      ? Object.keys(
          value
        ).sort()
      : [];


  return {
    canonical,
    body: {
      kind:
        "json",
      value,
      topLevelKeys,
      arrayLength:
        Array.isArray(
          value
        )
          ? value.length
          : null
    }
  };
}


function bodyForText(
  raw:
    string
): {
      readonly body:
        NetworkEvidenceBody;
      readonly canonical:
        string;
    } {
  const text =
    sanitizeEvidenceText(
      raw
    );


  return {
    canonical:
      text,
    body: {
      kind:
        "text",
      text
    }
  };
}


export class NetworkInspector {
  private readonly limits:
    NetworkEvidenceLimits;


  private readonly captureSmallText:
    boolean;


  constructor(
    options:
      NetworkInspectorOptions =
        {}
  ) {
    this.limits =
      resolveLimits(
        options
      );


    this.captureSmallText =
      options.captureSmallText ??
      false;
  }


  async inspect(
    page:
      Page
  ):
    Promise<NetworkEvidenceBundle> {
    const limits =
      this.limits;


    const startedAt =
      Date.now();


    const deadline =
      startedAt +
      limits.inspectionTimeoutMs;


    const pageUrl =
      safePageUrl(
        page
      );


    const entries:
      NetworkEvidenceEntry[] =
        [];


    const dedupeIndex =
      new Map<
        string,
        number
      >();


    const stats:
      MutableStats =
        {
          observedResponses:
            0,
          capturedResponses:
            0,
          ignoredNonFetchXhr:
            0,
          ignoredTelemetry:
            0,
          ignoredBinary:
            0,
          ignoredOversized:
            0,
          ignoredObservationCap:
            0,
          ignoredCaptureCap:
            0,
          bodyReadErrors:
            0,
          bodyReadTimeouts:
            0,
          parseErrors:
            0,
          deduplicated:
            0
        };


    let candidateResponsesSeen =
      0;


    let totalBodyBytesRead =
      0;


    const queue:
      Response[] =
        [];


    let drainPromise:
      Promise<void> | null =
        null;


    let accepting =
      true;


    const processResponse =
      async (
        response:
          Response
      ):
        Promise<void> => {
        if (
          entries.length >=
            limits.maxCapturedResponses
        ) {
          stats.ignoredCaptureCap +=
            1;
          return;
        }


        const rawUrl =
          rawResponseUrl(
            response
          );


        if (
          isLikelyTelemetryUrl(
            rawUrl
          )
        ) {
          stats.ignoredTelemetry +=
            1;
          return;
        }


        const contentType =
          normalizedContentType(
            await safeHeaderValue(
              response,
              "content-type"
            )
          );


        const isJson =
          isJsonContentType(
            contentType
          );


        const isText =
          this.captureSmallText &&
          isSmallTextContentType(
            contentType
          );


        if (
          !isJson &&
          !isText
        ) {
          stats.ignoredBinary +=
            1;
          return;
        }


        const contentLength =
          parseContentLength(
            await safeHeaderValue(
              response,
              "content-length"
            )
          );


        const remainingBodyBudget =
          limits.maxTotalBodyBytes -
          totalBodyBytesRead;


        if (
          remainingBodyBudget <=
            0 ||
          (
            contentLength != null &&
            (
              contentLength >
                limits.maxBodyBytes ||
              contentLength >
                remainingBodyBudget ||
              (
                isText &&
                contentLength >
                  limits.maxTextBytes
              )
            )
          )
        ) {
          stats.ignoredOversized +=
            1;
          return;
        }


        const bodyTimeoutMs =
          Math.min(
            limits.perResponseTimeoutMs,
            remainingMs(
              deadline
            )
          );


        const bodyResult =
          await settleWithTimeout(
            response.body(),
            bodyTimeoutMs
          );


        if (
          bodyResult.kind ===
            "timeout"
        ) {
          stats.bodyReadTimeouts +=
            1;
          return;
        }


        if (
          bodyResult.kind ===
            "error" ||
          !bodyResult.value
        ) {
          stats.bodyReadErrors +=
            1;
          return;
        }


        const bytes =
          bodyResult.value;


        const bodyBytes =
          bytes.length;


        if (
          bodyBytes >
            limits.maxBodyBytes ||
          bodyBytes >
            remainingBodyBudget ||
          (
            isText &&
            bodyBytes >
              limits.maxTextBytes
          )
        ) {
          stats.ignoredOversized +=
            1;
          return;
        }


        totalBodyBytesRead +=
          bodyBytes;


        let parsedBody:
          {
            readonly body:
              NetworkEvidenceBody;
            readonly canonical:
              string;
          };


        const text =
          bytes.toString(
            "utf8"
          );


        if (
          isJson
        ) {
          let parsed:
            unknown;


          try {
            parsed =
              JSON.parse(
                text
              );
          }
          catch {
            stats.parseErrors +=
              1;
            return;
          }


          parsedBody =
            bodyForJson(
              parsed
            );
        }
        else {
          parsedBody =
            bodyForText(
              text
            );
        }


        const bodySha256 =
          sha256(
            parsedBody.canonical
          );


        const status =
          safeStatus(
            response
          );


        const metadata =
          safeRequestMetadata(
            response
          );


        const resourceType =
          metadata.resourceType ===
            "fetch"
            ? "fetch"
            : "xhr";


        const dedupeKey =
          [
            parsedBody.body.kind,
            bodySha256,
            status,
            contentType ??
              "",
            metadata.method ??
              "",
            resourceType
          ].join(
            "|"
          );


        const existingIndex =
          dedupeIndex.get(
            dedupeKey
          );


        if (
          existingIndex != null
        ) {
          const existing =
            entries[
              existingIndex
            ];


          if (
            existing
          ) {
            entries[
              existingIndex
            ] =
              {
                ...existing,
                duplicateCount:
                  existing.duplicateCount +
                  1
              };
          }


          stats.deduplicated +=
            1;
          return;
        }


        const entry:
          NetworkEvidenceEntry =
            {
              responseUrl:
                safeResponseUrl(
                  response
                ),
              requestMethod:
                metadata.method,
              status,
              contentType,
              resourceType,
              contextUrl:
                metadata.contextUrl,
              body:
                parsedBody.body,
              bodyBytes,
              bodySha256,
              priority:
                isJson
                  ? "high"
                  : "normal",
              duplicateCount:
                1
            };


        dedupeIndex.set(
          dedupeKey,
          entries.length
        );


        entries.push(
          entry
        );


        stats.capturedResponses =
          entries.length;
      };


    const scheduleDrain =
      (): void => {
        if (
          drainPromise
        ) {
          return;
        }


        drainPromise =
          (
            async () => {
              while (
                queue.length >
                  0 &&
                Date.now() <
                  deadline
              ) {
                const response =
                  queue.shift();


                if (
                  response
                ) {
                  await processResponse(
                    response
                  );
                }
              }
            }
          )()
            .finally(
              () => {
                drainPromise =
                  null;


                if (
                  queue.length >
                    0 &&
                  Date.now() <
                    deadline
                ) {
                  scheduleDrain();
                }
              }
            );
      };


    const responseListener =
      (
        response:
          Response
      ): void => {
        stats.observedResponses +=
          1;


        if (
          !accepting
        ) {
          return;
        }


        const metadata =
          safeRequestMetadata(
            response
          );


        if (
          metadata.resourceType !==
            "fetch" &&
          metadata.resourceType !==
            "xhr"
        ) {
          stats.ignoredNonFetchXhr +=
            1;
          return;
        }


        candidateResponsesSeen +=
          1;


        if (
          candidateResponsesSeen >
            limits.maxObservedResponses
        ) {
          stats.ignoredObservationCap +=
            1;
          return;
        }


        queue.push(
          response
        );


        scheduleDrain();
      };


    let reloadErrorCode:
      "TIMEOUT" |
      "RELOAD_FAILED" |
      null =
        null;


    page.on(
      "response",
      responseListener
    );


    try {
      const reloadBudget =
        Math.min(
          limits.reloadTimeoutMs,
          remainingMs(
            deadline
          )
        );


      const reloadResult =
        await settleWithTimeout(
          page.reload({
            waitUntil:
              "domcontentloaded",
            timeout:
              reloadBudget
          }),
          reloadBudget
        );


      if (
        reloadResult.kind ===
          "timeout"
      ) {
        reloadErrorCode =
          "TIMEOUT";
      }
      else if (
        reloadResult.kind ===
          "error"
      ) {
        reloadErrorCode =
          "RELOAD_FAILED";
      }


      const observationMs =
        Math.min(
          limits.observationWindowMs,
          Math.max(
            0,
            deadline -
            Date.now()
          )
        );


      if (
        observationMs >
          0
      ) {
        try {
          await page.waitForTimeout(
            observationMs
          );
        }
        catch {
          // A closing page must not fail the inspection result.
        }
      }
    }
    finally {
      accepting =
        false;


      page.off(
        "response",
        responseListener
      );
    }


    if (
      !drainPromise &&
      queue.length >
        0
    ) {
      scheduleDrain();
    }


    if (
      drainPromise
    ) {
      await settleWithTimeout(
        drainPromise,
        remainingMs(
          deadline
        )
      );
    }


    const frozenStats:
      NetworkEvidenceStats =
        {
          ...stats,
          capturedResponses:
            entries.length
        };


    return {
      pageUrl,
      finalUrl:
        safePageUrl(
          page
        ),
      reloadCount:
        1,
      reloadErrorCode,
      entries:
        entries.map(
          entry =>
            Object.freeze({
              ...entry,
              body:
                Object.freeze(
                  entry.body
                )
            })
        ),
      stats:
        Object.freeze(
          frozenStats
        ),
      limits:
        limits
    };
  }
}
