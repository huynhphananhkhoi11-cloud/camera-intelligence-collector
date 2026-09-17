import type {
  Page,
  Request,
  Response
} from "playwright";

import {
  classifyJsonResponse
} from "./jsonResponseClassifier.js";

import {
  ApiCandidateStore,
  type StoredApiCandidate
} from "./apiCandidateStore.js";


export type ResponseBodyState =
  | "NOT_INSPECTED"
  | "INSPECTED"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "TOO_LARGE"
  | "EMPTY"
  | "PARSE_ERROR"
  | "READ_ERROR";


export interface NetworkRequestRecord {
  url: string;

  method: string;

  resourceType: string;

  frameUrl: string | null;

  timestamp: string;
}


export interface NetworkResponseRecord {
  url: string;

  method: string;

  resourceType: string;

  status: number;

  contentType: string;

  declaredContentLength:
    number | null;

  actualBodyBytes:
    number | null;

  bodyState:
    ResponseBodyState;

  candidateCount:
    number;

  timestamp: string;

  error:
    string | null;
}


export type NetworkRequestOutcomeState =
  | "FINISHED"
  | "FAILED";


export interface NetworkRequestOutcome {
  url: string;

  method: string;

  state:
    NetworkRequestOutcomeState;

  failureText:
    string | null;

  timestamp: string;
}


export interface NetworkObserverSnapshot {
  requests:
    NetworkRequestRecord[];

  responses:
    NetworkResponseRecord[];

  outcomes:
    NetworkRequestOutcome[];

  apiCandidates:
    StoredApiCandidate[];
}


export interface NetworkObserverOptions {
  maxBodyBytes?: number;

  maxResponseBodies?: number;

  maxRecordedEvents?: number;

  now?: () => Date;
}


export interface NetworkObserver {
  apiCandidateStore:
    ApiCandidateStore;

  flush():
    Promise<void>;

  snapshot():
    NetworkObserverSnapshot;

  stop():
    Promise<NetworkObserverSnapshot>;
}


const DEFAULT_MAX_BODY_BYTES =
  2 * 1024 * 1024;

const DEFAULT_MAX_RESPONSE_BODIES =
  150;

const DEFAULT_MAX_RECORDED_EVENTS =
  2000;


function normalizeContentType(
  value: string | undefined
): string {

  return String(
    value ??
    ""
  )
    .split(
      ";",
      1
    )[0]
    ?.trim()
    .toLowerCase() ??
    "";
}


export function isInspectableContentType(
  rawContentType: string
): boolean {

  const contentType =
    normalizeContentType(
      rawContentType
    );


  if (!contentType) {
    return false;
  }


  return (
    contentType ===
      "application/json" ||

    contentType.endsWith(
      "+json"
    ) ||

    contentType.startsWith(
      "text/"
    ) ||

    contentType ===
      "application/javascript" ||

    contentType ===
      "application/x-javascript"
  );
}


function looksLikeJson(
  text: string
): boolean {

  const trimmed =
    text.trimStart();

  return (
    trimmed.startsWith(
      "{"
    ) ||
    trimmed.startsWith(
      "["
    )
  );
}


function parseContentLength(
  value: string | undefined
): number | null {

  if (!value) {
    return null;
  }


  const parsed =
    Number.parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed < 0
  ) {
    return null;
  }


  return parsed;
}


function safeFrameUrl(
  request: Request
): string | null {

  try {

    return (
      request.frame()
        .url() ||
      null
    );
  }
  catch {
    return null;
  }
}


/**
 * Attach before page.goto().
 *
 * Async response-body work is tracked internally;
 * call flush() before consuming final diagnostics.
 */
export function attachNetworkObserver(
  page: Page,
  options:
    NetworkObserverOptions = {}
): NetworkObserver {

  const maxBodyBytes =
    options.maxBodyBytes ??
    DEFAULT_MAX_BODY_BYTES;

  const maxResponseBodies =
    options.maxResponseBodies ??
    DEFAULT_MAX_RESPONSE_BODIES;

  const maxRecordedEvents =
    options.maxRecordedEvents ??
    DEFAULT_MAX_RECORDED_EVENTS;

  const now =
    options.now ??
    (() => new Date());


  const requests:
    NetworkRequestRecord[] = [];

  const responses:
    NetworkResponseRecord[] = [];

  const outcomes:
    NetworkRequestOutcome[] = [];

  const apiCandidateStore =
    new ApiCandidateStore();

  const pending =
    new Set<
      Promise<void>
    >();

  let inspectedBodies =
    0;

  let stopped =
    false;


  const timestamp =
    (): string =>
      now().toISOString();


  const canRecord =
    (
      currentLength: number
    ): boolean =>
      currentLength <
      maxRecordedEvents;


  const onRequest =
    (
      request: Request
    ): void => {

      if (
        stopped ||
        !canRecord(
          requests.length
        )
      ) {
        return;
      }


      requests.push({
        url:
          request.url(),

        method:
          request.method(),

        resourceType:
          request.resourceType(),

        frameUrl:
          safeFrameUrl(
            request
          ),

        timestamp:
          timestamp()
      });
    };


  const inspectResponse =
    async (
      response: Response,
      record:
        NetworkResponseRecord
    ): Promise<void> => {

      const contentType =
        record.contentType;


      if (
        !isInspectableContentType(
          contentType
        )
      ) {

        record.bodyState =
          "UNSUPPORTED_CONTENT_TYPE";

        return;
      }


      if (
        record.declaredContentLength !==
          null &&
        record.declaredContentLength >
          maxBodyBytes
      ) {

        record.bodyState =
          "TOO_LARGE";

        return;
      }


      if (
        inspectedBodies >=
        maxResponseBodies
      ) {

        record.bodyState =
          "NOT_INSPECTED";

        return;
      }


      inspectedBodies +=
        1;


      let body:
        Buffer;


      try {

        body =
          await response.body();
      }
      catch (
        error
      ) {

        record.bodyState =
          "READ_ERROR";

        record.error =
          String(
            error
          );

        return;
      }


      record.actualBodyBytes =
        body.byteLength;


      if (
        body.byteLength ===
        0
      ) {

        record.bodyState =
          "EMPTY";

        return;
      }


      if (
        body.byteLength >
        maxBodyBytes
      ) {

        record.bodyState =
          "TOO_LARGE";

        return;
      }


      const text =
        body.toString(
          "utf8"
        );


      /*
       * text/html, text/plain, JavaScript etc.
       * are allowed for safe inspection, but only
       * JSON-looking payloads are sent into the
       * JSON candidate classifier.
       */
      if (
        !looksLikeJson(
          text
        )
      ) {

        record.bodyState =
          "INSPECTED";

        return;
      }


      let payload:
        unknown;


      try {

        payload =
          JSON.parse(
            text
          );
      }
      catch (
        error
      ) {

        record.bodyState =
          "PARSE_ERROR";

        record.error =
          String(
            error
          );

        return;
      }


      const classification =
        classifyJsonResponse(
          payload
        );


      record.candidateCount =
        classification
          .candidates
          .length;


      for (
        const candidate
        of classification.candidates
      ) {

        apiCandidateStore.add({
          responseUrl:
            record.url,

          method:
            record.method,

          status:
            record.status,

          contentType:
            record.contentType,

          candidate
        });
      }


      record.bodyState =
        "INSPECTED";
    };


  const onResponse =
    (
      response: Response
    ): void => {

      if (
        stopped ||
        !canRecord(
          responses.length
        )
      ) {
        return;
      }


      const request =
        response.request();

      const headers =
        response.headers();

      const contentType =
        String(
          headers[
            "content-type"
          ] ??
          ""
        );


      const record:
        NetworkResponseRecord = {

        url:
          response.url(),

        method:
          request.method(),

        resourceType:
          request.resourceType(),

        status:
          response.status(),

        contentType,

        declaredContentLength:
          parseContentLength(
            headers[
              "content-length"
            ]
          ),

        actualBodyBytes:
          null,

        bodyState:
          "NOT_INSPECTED",

        candidateCount:
          0,

        timestamp:
          timestamp(),

        error:
          null
      };


      responses.push(
        record
      );


      const task =
        inspectResponse(
          response,
          record
        );


      pending.add(
        task
      );


      void task.finally(
        () => {
          pending.delete(
            task
          );
        }
      );
    };


  const onRequestFinished =
    (
      request: Request
    ): void => {

      if (
        stopped ||
        !canRecord(
          outcomes.length
        )
      ) {
        return;
      }


      outcomes.push({
        url:
          request.url(),

        method:
          request.method(),

        state:
          "FINISHED",

        failureText:
          null,

        timestamp:
          timestamp()
      });
    };


  const onRequestFailed =
    (
      request: Request
    ): void => {

      if (
        stopped ||
        !canRecord(
          outcomes.length
        )
      ) {
        return;
      }


      let failureText:
        string | null =
        null;


      try {

        failureText =
          request.failure()
            ?.errorText ??
          null;
      }
      catch {
        failureText =
          null;
      }


      outcomes.push({
        url:
          request.url(),

        method:
          request.method(),

        state:
          "FAILED",

        failureText,

        timestamp:
          timestamp()
      });
    };


  /*
   * IMPORTANT:
   * All listeners are attached immediately.
   * Caller should create observer BEFORE goto().
   */
  page.on(
    "request",
    onRequest
  );

  page.on(
    "response",
    onResponse
  );

  page.on(
    "requestfinished",
    onRequestFinished
  );

  page.on(
    "requestfailed",
    onRequestFailed
  );


  const flush =
    async (): Promise<void> => {

      while (
        pending.size >
        0
      ) {

        await Promise.allSettled(
          Array.from(
            pending
          )
        );
      }
    };


  const snapshot =
    (): NetworkObserverSnapshot => ({

      requests:
        requests.map(
          item => ({
            ...item
          })
        ),

      responses:
        responses.map(
          item => ({
            ...item
          })
        ),

      outcomes:
        outcomes.map(
          item => ({
            ...item
          })
        ),

      apiCandidates:
        apiCandidateStore.values()
          .map(
            item => ({
              ...item,

              commonKeys:
                [...item.commonKeys],

              signalKeys:
                [...item.signalKeys],

              sample:
                item.sample.map(
                  sample => ({
                    ...sample
                  })
                )
            })
          )
    });


  const stop =
    async (): Promise<
      NetworkObserverSnapshot
    > => {

      if (!stopped) {

        stopped =
          true;

        page.off(
          "request",
          onRequest
        );

        page.off(
          "response",
          onResponse
        );

        page.off(
          "requestfinished",
          onRequestFinished
        );

        page.off(
          "requestfailed",
          onRequestFailed
        );
      }


      await flush();

      return snapshot();
    };


  return {
    apiCandidateStore,

    flush,

    snapshot,

    stop
  };
}