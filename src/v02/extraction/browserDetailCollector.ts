import type {
  Page,
  Response
} from "playwright";

import {
  attachNetworkObserver,
  type NetworkObserverOptions,
  type NetworkObserverSnapshot
} from "../network/networkObserver.js";

import {
  canonicalizeUrl
} from "../discovery/urlPolicy.js";

import type {
  AcquisitionError,
  DetailAcquisitionResult
} from "./detailAcquisitionTypes.js";
import {
  runInteractionFallback,
  type InteractionFallbackOptions
} from "./interactionFallback.js";

const DEFAULT_NAVIGATION_TIMEOUT_MS =
  30_000;

const DEFAULT_SETTLE_TIMEOUT_MS =
  2_000;

const DEFAULT_PRODUCT_HYDRATION_TIMEOUT_MS =
  1_500;

export interface BrowserDetailCollectorOptions {
  navigationTimeoutMs?: number;

  settleTimeoutMs?: number;

  networkObserverOptions?:
    NetworkObserverOptions;

  interactionFallbackOptions?:
    InteractionFallbackOptions;

  now?: () => Date;

  clock?: () => number;
}

function emptyNetworkSnapshot():
  NetworkObserverSnapshot {
  return {
    requests: [],
    responses: [],
    outcomes: [],
    apiCandidates: []
  };
}

function errorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  return String(
    error ??
    "Unknown acquisition error"
  );
}

function isTimeoutError(
  error: unknown
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "TimeoutError" ||
    /timeout/i.test(
      error.message
    )
  );
}

function safePageUrl(
  page: Page
): string {
  try {
    return page.url();
  }
  catch {
    return "";
  }
}

function navigationHttpError(
  response: Response,
  now: () => Date
): AcquisitionError | null {
  const status =
    response.status();

  if (status < 400) {
    return null;
  }

  if (status === 404) {
    return {
      stage: "NAVIGATION",
      code: "HTTP_NOT_FOUND",
      message:
        "Product detail page returned HTTP 404.",
      retriable: false,
      status,
      timestamp:
        now().toISOString()
    };
  }

  if (status === 410) {
    return {
      stage: "NAVIGATION",
      code: "HTTP_GONE",
      message:
        "Product detail page returned HTTP 410.",
      retriable: false,
      status,
      timestamp:
        now().toISOString()
    };
  }

  if (status === 408) {
    return {
      stage: "NAVIGATION",
      code: "HTTP_REQUEST_TIMEOUT",
      message:
        "Product detail page returned HTTP 408.",
      retriable: true,
      status,
      timestamp:
        now().toISOString()
    };
  }

  if (status === 429) {
    return {
      stage: "NAVIGATION",
      code: "HTTP_RATE_LIMITED",
      message:
        "Product detail page returned HTTP 429.",
      retriable: true,
      status,
      timestamp:
        now().toISOString()
    };
  }

  if (status >= 500) {
    return {
      stage: "NAVIGATION",
      code: "HTTP_SERVER_ERROR",
      message:
        `Product detail page returned HTTP ${status}.`,
      retriable: true,
      status,
      timestamp:
        now().toISOString()
    };
  }

  return {
    stage: "NAVIGATION",
    code: "HTTP_CLIENT_ERROR",
    message:
      `Product detail page returned HTTP ${status}.`,
    retriable: false,
    status,
    timestamp:
      now().toISOString()
  };
}

async function optionalLoadSettle(
  page: Page,
  timeoutMs: number
): Promise<void> {
  if (timeoutMs <= 0) {
    return;
  }

  try {
    await page.waitForLoadState(
      "load",
      {
        timeout:
          timeoutMs
      }
    );
  }
  catch (error) {
    /*
     * DOMContentLoaded navigation has already completed.
     *
     * A bounded load-state timeout is therefore not itself
     * an acquisition failure. Some commercial pages keep
     * resources active or delay the load event.
     *
     * Non-timeout errors are intentionally rethrown so the
     * caller can preserve them as technical evidence.
     */
    if (
      isTimeoutError(
        error
      )
    ) {
      return;
    }

    throw error;
  }
}

export async function waitForProductHydration(
  page: Page,
  timeoutMs:
    number =
      DEFAULT_PRODUCT_HYDRATION_TIMEOUT_MS
): Promise<void> {
  if (
    timeoutMs <=
      0
  ) {
    return;
  }

  let state:
    {
      hasProductIdentity:
        boolean;
      hasTransactionAction:
        boolean;
      hasChromeOnlyHeading:
        boolean;
    };

  try {
    state =
      await page.evaluate(
        () => {
          const clean =
            (
              value:
                unknown
            ): string =>
              String(
                value ??
                ""
              )
                .normalize(
                  "NFD"
                )
                .replace(
                  /[\u0300-\u036f]/g,
                  ""
                )
                .replace(
                  /đ/g,
                  "d"
                )
                .replace(
                  /Đ/g,
                  "D"
                )
                .toLowerCase()
                .replace(
                  /\s+/g,
                  " "
                )
                .trim();

          const headingIsChrome = (
            element:
              Element
          ): boolean => {

            if (
              element.closest(
                [
                  "header",
                  "nav",
                  "footer",
                  '[role="navigation"]'
                ].join(",")
              )
            ) {
              return true;
            }

            const signature =
              clean(
                [
                  element.getAttribute(
                    "class"
                  ),
                  element.getAttribute(
                    "id"
                  )
                ].join(
                  " "
                )
              );

            return /(?:^|[\s_-])(?:logo|site[-_ ]?title|site[-_ ]?brand|brand)(?:$|[\s_-])/
              .test(
                signature
              );
          };


          const headings =
            Array.from(
              document.querySelectorAll(
                "h1"
              )
            );

          const nonChromeHeading =
            headings.find(
              heading =>
                clean(
                  heading.textContent
                ) &&
                !headingIsChrome(
                  heading
                )
            );

          const productJsonLd =
            Array.from(
              document.querySelectorAll(
                'script[type="application/ld+json"]'
              )
            )
              .some(
                script =>
                  /"@type"\s*:\s*(?:\[[^\]]*)?"?product"?/i
                    .test(
                      String(
                        script.textContent ??
                        ""
                      )
                    )
              );

          const actionText =
            Array.from(
              document.querySelectorAll(
                [
                  "button",
                  "a.btn",
                  "a.button",
                  '[role="button"]',
                  'input[type="submit"]',
                  'input[type="button"]'
                ].join(
                  ","
                )
              )
            )
              .map(
                element =>
                  clean(
                    element.textContent ||
                    (
                      element instanceof
                        HTMLInputElement
                        ? element.value
                        : ""
                    )
                  )
              )
              .join(
                " "
              );

          return {
            hasProductIdentity:
              Boolean(
                nonChromeHeading ||
                productJsonLd
              ),

            hasTransactionAction:
              /\b(?:mua ngay|mua hang|mua nhanh|dat mua|them vao gio(?: hang)?|thue ngay|dat thue|thue san pham(?: nay)?|lien he thue|dat lich thue|buy now|add to cart|rent now|book rental|book now)\b/i
                .test(
                  actionText
                ),

            hasChromeOnlyHeading:
              headings.length >
                0 &&
              !nonChromeHeading
          };
        }
      );
  }
  catch {
    return;
  }

  if (
    state.hasProductIdentity ||
    (
      !state.hasTransactionAction &&
      !state.hasChromeOnlyHeading
    )
  ) {
    return;
  }

  try {
    await page.waitForFunction(
      () => {
        const clean =
          (
            value:
              unknown
          ): string =>
            String(
              value ??
              ""
            )
              .normalize(
                "NFD"
              )
              .replace(
                /[\u0300-\u036f]/g,
                ""
              )
              .replace(
                /đ/g,
                "d"
              )
              .replace(
                /Đ/g,
                "D"
              )
              .toLowerCase()
              .replace(
                /\s+/g,
                " "
              )
              .trim();

        const headingIsChrome = (
          element:
            Element
        ): boolean => {

          if (
            element.closest(
              [
                "header",
                "nav",
                "footer",
                '[role="navigation"]'
              ].join(",")
            )
          ) {
            return true;
          }

          const signature =
            clean(
              [
                element.getAttribute(
                  "class"
                ),
                element.getAttribute(
                  "id"
                )
              ].join(
                " "
              )
            );

          return /(?:^|[\s_-])(?:logo|site[-_ ]?title|site[-_ ]?brand|brand)(?:$|[\s_-])/
            .test(
              signature
            );
        };

        const hasNonChromeHeading =
          Array.from(
            document.querySelectorAll(
              "h1"
            )
          )
            .some(
              heading =>
                clean(
                  heading.textContent
                ) &&
                !headingIsChrome(
                  heading
                )
            );

        if (
          hasNonChromeHeading
        ) {
          return true;
        }

        return Array.from(
          document.querySelectorAll(
            'script[type="application/ld+json"]'
          )
        )
          .some(
            script =>
              /"@type"\s*:\s*(?:\[[^\]]*)?"?product"?/i
                .test(
                  String(
                    script.textContent ??
                    ""
                  )
                )
          );
      },
      undefined,
      {
        timeout:
          timeoutMs,
        polling:
          100
      }
    );
  }
  catch (error) {
    if (
      !isTimeoutError(
        error
      )
    ) {
      throw error;
    }
  }
}


export async function collectBrowserDetail(
  page: Page,
  requestedUrl: string,
  options:
    BrowserDetailCollectorOptions = {}
): Promise<DetailAcquisitionResult> {
  const now =
    options.now ??
    (() => new Date());

  const clock =
    options.clock ??
    (() => Date.now());

  const navigationTimeoutMs =
    options.navigationTimeoutMs ??
    DEFAULT_NAVIGATION_TIMEOUT_MS;

  const settleTimeoutMs =
    options.settleTimeoutMs ??
    DEFAULT_SETTLE_TIMEOUT_MS;

  const totalStartedAt =
    clock();

  const errors:
    AcquisitionError[] = [];

  const normalizedRequestedUrl =
    canonicalizeUrl(
      requestedUrl
    );

  if (!normalizedRequestedUrl) {
    return {
      requestedUrl,
      finalUrl: "",
      canonicalUrl: "",
      html: "",
      networkSnapshot:
        emptyNetworkSnapshot(),
      interactions: [],
      timing: {
        navigationMs: 0,
        settleMs: 0,
        interactionMs: 0,
        totalMs:
          Math.max(
            0,
            clock() -
              totalStartedAt
          )
      },
      errors: [
        {
          stage: "NAVIGATION",
          code: "INVALID_REQUESTED_URL",
          message:
            "Requested product URL is not a valid HTTP(S) URL.",
          retriable: false,
          status: null,
          timestamp:
            now().toISOString()
        }
      ]
    };
  }

  /*
   * IMPORTANT:
   * Network observer MUST be attached before goto().
   */
  const observer =
    attachNetworkObserver(
      page,
      options.networkObserverOptions
    );

  let navigationResponse:
    Response | null =
    null;

  let html =
    "";

  let networkSnapshot =
    emptyNetworkSnapshot();

  let navigationMs =
    0;

  let settleMs =
    0;

  let interactionMs =
    0;

  let interactions:
    DetailAcquisitionResult[
      "interactions"
    ] = [];

  try {
    const navigationStartedAt =
      clock();

    try {
      navigationResponse =
        await page.goto(
          normalizedRequestedUrl,
          {
            waitUntil:
              "domcontentloaded",
            timeout:
              navigationTimeoutMs
          }
        );
    }
    catch (error) {
      errors.push({
        stage: "NAVIGATION",
        code:
          isTimeoutError(error)
            ? "NAVIGATION_TIMEOUT"
            : "NAVIGATION_FAILED",
        message:
          errorMessage(error),
        retriable: true,
        status: null,
        timestamp:
          now().toISOString()
      });
    }
    finally {
      navigationMs =
        Math.max(
          0,
          clock() -
            navigationStartedAt
        );
    }

    if (navigationResponse) {
      const httpError =
        navigationHttpError(
          navigationResponse,
          now
        );

      if (httpError) {
        errors.push(
          httpError
        );
      }
    }

    const settleStartedAt =
      clock();

    try {
      /*
       * No networkidle:
       * this is a bounded optional load settle after
       * DOMContentLoaded.
       */
      await optionalLoadSettle(
        page,
        settleTimeoutMs
      );
    }
    catch (error) {
      errors.push({
        stage: "SETTLE",
        code: "SETTLE_FAILED",
        message:
          errorMessage(error),
        retriable: true,
        status: null,
        timestamp:
          now().toISOString()
      });
    }
    finally {
      settleMs =
        Math.max(
          0,
          clock() -
            settleStartedAt
        );
    }

    /*
     * Some storefronts render transaction controls before the
     * product identity/content hydrates. Give that state a small,
     * bounded chance to settle before freezing the DOM snapshot.
     */
    try {
      await waitForProductHydration(
        page,
        settleTimeoutMs
      );
    }
    catch (error) {
      errors.push({
        stage:
          "SETTLE",
        code:
          "PRODUCT_HYDRATION_WAIT_FAILED",
        message:
          errorMessage(
            error
          ),
        retriable:
          true,
        status:
          null,
        timestamp:
          now()
            .toISOString()
      });
    }

    /*
     * Read initial rendered DOM before deciding whether
     * semantic interaction fallback is necessary.
     */
    try {
      html =
        await page.content();
    }
    catch (error) {
      errors.push({
        stage: "DOM",
        code: "DOM_CONTENT_READ_FAILED",
        message:
          errorMessage(error),
        retriable: true,
        status: null,
        timestamp:
          now().toISOString()
      });
    }

    if (html) {
      const interactionStartedAt =
        clock();

      try {
        const fallback =
          await runInteractionFallback(
            page,
            html,
            safePageUrl(page) ||
              normalizedRequestedUrl,
            {
              ...options
                .interactionFallbackOptions,

              now
            }
          );

        html =
          fallback.html;

        interactions =
          fallback.interactions;
      }
      catch (error) {
        errors.push({
          stage:
            "INTERACTION",

          code:
            "INTERACTION_FALLBACK_FAILED",

          message:
            errorMessage(error),

          retriable:
            true,

          status:
            null,

          timestamp:
            now().toISOString()
        });
      }
      finally {
        interactionMs =
          Math.max(
            0,
            clock() -
              interactionStartedAt
          );
      }
    }

    /*
     * Interactions may trigger new API calls.
     * Flush only after bounded fallback has finished.
     */
    await observer.flush();
  }
  finally {
    networkSnapshot =
      await observer.stop();
  }

  const finalUrl =
    safePageUrl(
      page
    );

  const canonicalUrl =
    canonicalizeUrl(
      finalUrl
    ) ??
    normalizedRequestedUrl;

  return {
    requestedUrl,
    finalUrl:
      finalUrl ||
      normalizedRequestedUrl,
    canonicalUrl,
    html,
    networkSnapshot,
    interactions,
    timing: {
      navigationMs,
      settleMs,
      interactionMs,
      totalMs:
        Math.max(
          0,
          clock() -
            totalStartedAt
        )
    },
    errors
  };
}