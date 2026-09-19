import {
  chromium,
  type Browser,
  type BrowserContext,
  type Request,
  type Response
} from "playwright";

import {
  redactRequestBody,
  redactUrl
} from "./networkReconRedaction.js";

import type {
  NetworkExchange,
  NetworkReconHealth,
  NetworkReconRuntime,
  NetworkReconSnapshot,
  ReconResourceType
} from "./networkReconTypes.js";


export interface PlaywrightNetworkReconRuntimeOptions {
  readonly headless?:
    boolean;

  readonly navigationTimeoutMs?:
    number;

  readonly observationWindowMs?:
    number;

  readonly maxResponseBodyBytes?:
    number;

  readonly maxRequestBodyChars?:
    number;

  readonly launchBrowser?:
    () =>
      Promise<
        Browser
      >;
}


const DEFAULT_NAVIGATION_TIMEOUT_MS =
  20_000;


const DEFAULT_OBSERVATION_WINDOW_MS =
  3_500;


const DEFAULT_MAX_RESPONSE_BODY_BYTES =
  256 *
  1024;


const DEFAULT_MAX_REQUEST_BODY_CHARS =
  8_192;


function headerValue(
  headers:
    Readonly<
      Record<
        string,
        string
      >
    >,
  name:
    string
): string |
  null {

  const target =
    name.toLowerCase();


  for (
    const [
      key,
      value
    ]
    of Object.entries(
      headers
    )
  ) {
    if (
      key.toLowerCase() ===
        target
    ) {
      return value;
    }
  }


  return null;
}


function normalizedContentType(
  value:
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


  return value
    .split(
      ";",
      1
    )[0]
    ?.trim()
    .toLowerCase() ??
    null;
}


function isReconResourceType(
  value:
    string
): value is
  ReconResourceType {

  return (
    value === "xhr" ||
    value === "fetch"
  );
}


function isTextualContentType(
  contentType:
    string |
    null
): boolean {

  if (
    contentType ===
      null
  ) {
    return false;
  }


  return (
    contentType.startsWith(
      "text/"
    ) ||
    contentType.includes(
      "json"
    ) ||
    contentType.includes(
      "xml"
    ) ||
    contentType.includes(
      "javascript"
    ) ||
    contentType.includes(
      "x-www-form-urlencoded"
    )
  );
}


function truncateText(
  value:
    string |
    null,
  maxChars:
    number
): string |
  null {

  if (
    value ===
      null
  ) {
    return null;
  }


  if (
    value.length <=
      maxChars
  ) {
    return value;
  }


  return value.slice(
    0,
    maxChars
  );
}


async function responsePreview(
  response:
    Response,
  maxBytes:
    number
): Promise<{
  readonly body:
    string |
    null;

  readonly truncated:
    boolean;

  readonly contentType:
    string |
    null;
}> {

  const headers =
    response.headers();


  const contentType =
    normalizedContentType(
      headerValue(
        headers,
        "content-type"
      )
    );


  if (
    !isTextualContentType(
      contentType
    )
  ) {
    return {
      body:
        null,

      truncated:
        false,

      contentType
    };
  }


  try {

    const body =
      await response.body();


    const truncated =
      body.length >
      maxBytes;


    return {
      body:
        body
          .subarray(
            0,
            maxBytes
          )
          .toString(
            "utf8"
          ),

      truncated,

      contentType
    };
  }
  catch {

    return {
      body:
        null,

      truncated:
        false,

      contentType
    };
  }
}


async function closeBrowserResources(
  context:
    BrowserContext |
    null,
  browser:
    Browser |
    null
): Promise<void> {

  try {

    if (
      context !==
        null
    ) {
      await context.close();
    }
  }
  finally {

    if (
      browser !==
        null &&
      browser.isConnected()
    ) {
      await browser.close();
    }
  }
}


export class PlaywrightNetworkReconRuntime
implements NetworkReconRuntime {

  private readonly headless:
    boolean;


  private readonly navigationTimeoutMs:
    number;


  private readonly observationWindowMs:
    number;


  private readonly maxResponseBodyBytes:
    number;


  private readonly maxRequestBodyChars:
    number;


  private readonly launchBrowser:
    () =>
      Promise<
        Browser
      >;


  private cachedHealth:
    NetworkReconHealth |
    null =
      null;


  constructor(
    options:
      PlaywrightNetworkReconRuntimeOptions = {}
  ) {

    this.headless =
      options.headless ??
      true;


    this.navigationTimeoutMs =
      options.navigationTimeoutMs ??
      DEFAULT_NAVIGATION_TIMEOUT_MS;


    this.observationWindowMs =
      options.observationWindowMs ??
      DEFAULT_OBSERVATION_WINDOW_MS;


    this.maxResponseBodyBytes =
      options.maxResponseBodyBytes ??
      DEFAULT_MAX_RESPONSE_BODY_BYTES;


    this.maxRequestBodyChars =
      options.maxRequestBodyChars ??
      DEFAULT_MAX_REQUEST_BODY_CHARS;


    this.launchBrowser =
      options.launchBrowser ??
      (
        () =>
          chromium.launch({
            headless:
              this.headless
          })
      );
  }


  async probe(
    signal?:
      AbortSignal
  ):
    Promise<
      NetworkReconHealth
    > {

    if (
      this.cachedHealth !==
        null
    ) {
      return this.cachedHealth;
    }


    if (
      signal?.aborted
    ) {
      throw new Error(
        "Network reconnaissance probe aborted."
      );
    }


    let browser:
      Browser |
      null =
        null;


    try {

      browser =
        await this.launchBrowser();


      this.cachedHealth = {
        available:
          true,

        reason:
          "Chromium network reconnaissance is available."
      };


      return this.cachedHealth;
    }
    catch (
      error
    ) {

      this.cachedHealth = {
        available:
          false,

        reason:
          error instanceof
            Error
            ? error.message
            : String(
                error
              )
      };


      return this.cachedHealth;
    }
    finally {

      if (
        browser !==
          null &&
        browser.isConnected()
      ) {
        await browser.close();
      }
    }
  }


  async observe(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      NetworkReconSnapshot
    > {

    if (
      signal?.aborted
    ) {
      throw new Error(
        "Network reconnaissance aborted."
      );
    }


    const rootOrigin =
      new URL(
        rootUrl
      ).origin;


    let browser:
      Browser |
      null =
        null;


    let context:
      BrowserContext |
      null =
        null;


    const exchanges:
      NetworkExchange[] =
        [];


    const pending:
      Promise<void>[] =
        [];


    let nextSequence =
      1;


    const shouldObserve =
      (
        request:
          Request
      ): request is
        Request => {

        const resourceType =
          request.resourceType();


        if (
          !isReconResourceType(
            resourceType
          )
        ) {
          return false;
        }


        try {

          return (
            new URL(
              request.url()
            ).origin ===
              rootOrigin
          );
        }
        catch {
          return false;
        }
      };


    const captureFinished =
      (
        request:
          Request
      ): void => {

        if (
          !shouldObserve(
            request
          )
        ) {
          return;
        }


        const sequence =
          nextSequence;


        nextSequence +=
          1;


        const task =
          (
            async () => {

              const requestHeaders =
                request.headers();


              const requestContentType =
                normalizedContentType(
                  headerValue(
                    requestHeaders,
                    "content-type"
                  )
                );


              const rawRequestBody =
                request.postData();


              const redactedBody =
                truncateText(
                  redactRequestBody(
                    rawRequestBody,
                    requestContentType
                  ),
                  this.maxRequestBodyChars
                );


              const response =
                await request.response();


              if (
                response ===
                  null
              ) {
                exchanges.push({
                  sequence,
                  url:
                    redactUrl(
                      request.url()
                    ),
                  method:
                    request.method(),
                  resourceType:
                    request.resourceType() as
                      ReconResourceType,
                  requestContentType,
                  requestBodyRedacted:
                    redactedBody,
                  status:
                    null,
                  responseContentType:
                    null,
                  responseBodyPreview:
                    null,
                  responseBodyTruncated:
                    false,
                  failed:
                    true,
                  failureText:
                    "No response was received."
                });

                return;
              }


              const preview =
                await responsePreview(
                  response,
                  this.maxResponseBodyBytes
                );


              exchanges.push({
                sequence,
                url:
                  redactUrl(
                    request.url()
                  ),
                method:
                  request.method(),
                resourceType:
                  request.resourceType() as
                    ReconResourceType,
                requestContentType,
                requestBodyRedacted:
                  redactedBody,
                status:
                  response.status(),
                responseContentType:
                  preview.contentType,
                responseBodyPreview:
                  preview.body,
                responseBodyTruncated:
                  preview.truncated,
                failed:
                  false,
                failureText:
                  null
              });
            }
          )();


        pending.push(
          task
        );
      };


    const captureFailed =
      (
        request:
          Request
      ): void => {

        if (
          !shouldObserve(
            request
          )
        ) {
          return;
        }


        const requestHeaders =
          request.headers();


        const requestContentType =
          normalizedContentType(
            headerValue(
              requestHeaders,
              "content-type"
            )
          );


        exchanges.push({
          sequence:
            nextSequence,
          url:
            redactUrl(
              request.url()
            ),
          method:
            request.method(),
          resourceType:
            request.resourceType() as
              ReconResourceType,
          requestContentType,
          requestBodyRedacted:
            truncateText(
              redactRequestBody(
                request.postData(),
                requestContentType
              ),
              this.maxRequestBodyChars
            ),
          status:
            null,
          responseContentType:
            null,
          responseBodyPreview:
            null,
          responseBodyTruncated:
            false,
          failed:
            true,
          failureText:
            request.failure()
              ?.errorText ??
            "Request failed."
        });


        nextSequence +=
          1;
      };


    try {

      browser =
        await this.launchBrowser();


      context =
        await browser.newContext({
          serviceWorkers:
            "block"
        });


      context.on(
        "requestfinished",
        captureFinished
      );


      context.on(
        "requestfailed",
        captureFailed
      );


      const page =
        await context.newPage();


      await page.goto(
        rootUrl,
        {
          waitUntil:
            "domcontentloaded",

          timeout:
            this.navigationTimeoutMs
        }
      );


      await page.waitForTimeout(
        this.observationWindowMs
      );


      let cursor =
        0;


      for (
        let pass =
          0;
        pass <
          5;
        pass +=
          1
      ) {

        const batch =
          pending.slice(
            cursor
          );


        cursor =
          pending.length;


        if (
          batch.length ===
            0
        ) {
          break;
        }


        await Promise.allSettled(
          batch
        );
      }


      exchanges.sort(
        (
          left,
          right
        ) =>
          left.sequence -
          right.sequence
      );


      return {
        rootUrl,
        finalPageUrl:
          page.url(),
        exchanges,
        observationWindowMs:
          this.observationWindowMs
      };
    }
    finally {

      await closeBrowserResources(
        context,
        browser
      );
    }
  }
}
