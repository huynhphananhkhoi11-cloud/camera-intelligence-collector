import {
  detectChallenge
} from "../contracts/challengeContract.js";

import type {
  EndpointReplayRequest,
  EndpointReplayResponse
} from "./endpointReplayTypes.js";


export interface EndpointReplayTransport {
  execute(
    request:
      EndpointReplayRequest,
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      EndpointReplayResponse
    >;
}


export interface FetchEndpointReplayTransportOptions {
  readonly fetchFn?:
    typeof fetch;

  readonly timeoutMs?:
    number;

  readonly maxBodyBytes?:
    number;
}


const DEFAULT_TIMEOUT_MS =
  20_000;


const DEFAULT_MAX_BODY_BYTES =
  8 *
  1024 *
  1024;


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


function createSignal(
  parent:
    AbortSignal |
    undefined,
  timeoutMs:
    number
): {
  readonly signal:
    AbortSignal;

  readonly cleanup:
    () =>
      void;
} {

  const controller =
    new AbortController();


  const abortFromParent =
    () => {
      controller.abort(
        parent?.reason
      );
    };


  if (
    parent?.aborted
  ) {
    abortFromParent();
  }
  else {
    parent?.addEventListener(
      "abort",
      abortFromParent,
      {
        once:
          true
      }
    );
  }


  const timer =
    setTimeout(
      () => {
        controller.abort(
          new Error(
            "Endpoint replay timed out."
          )
        );
      },
      timeoutMs
    );


  return {
    signal:
      controller.signal,

    cleanup:
      () => {
        clearTimeout(
          timer
        );

        parent?.removeEventListener(
          "abort",
          abortFromParent
        );
      }
  };
}


export class FetchEndpointReplayTransport
implements EndpointReplayTransport {

  private readonly fetchFn:
    typeof fetch;


  private readonly timeoutMs:
    number;


  private readonly maxBodyBytes:
    number;


  constructor(
    options:
      FetchEndpointReplayTransportOptions = {}
  ) {

    this.fetchFn =
      options.fetchFn ??
      fetch;


    this.timeoutMs =
      options.timeoutMs ??
      DEFAULT_TIMEOUT_MS;


    this.maxBodyBytes =
      options.maxBodyBytes ??
      DEFAULT_MAX_BODY_BYTES;
  }


  async execute(
    request:
      EndpointReplayRequest,
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      EndpointReplayResponse
    > {

    const root =
      new URL(
        rootUrl
      );


    const target =
      new URL(
        request.url
      );


    if (
      target.origin !==
        root.origin
    ) {
      throw new Error(
        "Endpoint replay refused a cross-origin request."
      );
    }


    const requestSignal =
      createSignal(
        signal,
        this.timeoutMs
      );


    try {

      const headers:
        Record<
          string,
          string
        > = {
          Accept:
            "text/html,application/json,text/plain;q=0.9,*/*;q=0.1",

          Referer:
            rootUrl
        };


      if (
        request.contentType !==
          null &&
        request.method ===
          "POST"
      ) {
        headers[
          "Content-Type"
        ] =
          request.contentType;
      }


      const response =
        await this.fetchFn(
          request.url,
          {
            method:
              request.method,

            headers,

            body:
              request.method ===
                "POST"
                ? (
                    request.body ??
                    ""
                  )
                : undefined,

            redirect:
              "follow",

            signal:
              requestSignal.signal
          }
        );


      const declaredLength =
        response.headers.get(
          "content-length"
        );


      if (
        declaredLength !==
          null
      ) {

        const parsed =
          Number.parseInt(
            declaredLength,
            10
          );


        if (
          Number.isFinite(
            parsed
          ) &&
          parsed >
            this.maxBodyBytes
        ) {
          throw new Error(
            "Endpoint replay response exceeds maximum body size."
          );
        }
      }


      const body =
        await response.text();


      if (
        Buffer.byteLength(
          body,
          "utf8"
        ) >
          this.maxBodyBytes
      ) {
        throw new Error(
          "Endpoint replay response exceeds maximum body size."
        );
      }


      const finalUrl =
        response.url ||
        request.url;


      const challenge =
        detectChallenge({
          status:
            response.status,

          bodyText:
            body,

          url:
            finalUrl
        });


      return {
        request,

        finalUrl,

        status:
          response.status,

        contentType:
          normalizedContentType(
            response.headers.get(
              "content-type"
            )
          ),

        body,

        challengeState:
          challenge.state
      };
    }
    finally {
      requestSignal.cleanup();
    }
  }
}
