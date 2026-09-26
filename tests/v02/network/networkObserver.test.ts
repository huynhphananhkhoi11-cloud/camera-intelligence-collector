import {
  EventEmitter
} from "node:events";

import {
  describe,
  expect,
  test
} from "vitest";

import type {
  Page,
  Request,
  Response
} from "playwright";

import {
  attachNetworkObserver,
  isInspectableContentType
} from "../../../src/v02/network/networkObserver.ts";


class FakePage
  extends EventEmitter {

  override on(
    event: string,
    listener:
      (...args: any[]) => void
  ): this {

    return super.on(
      event,
      listener
    );
  }


  off(
    event: string,
    listener:
      (...args: any[]) => void
  ): this {

    return super.off(
      event,
      listener
    );
  }
}


function fakeRequest(
  url:
    string,
  method =
    "GET",
  resourceType =
    "xhr"
): Request {

  return {
    url:
      () => url,

    method:
      () => method,

    resourceType:
      () => resourceType,

    frame:
      () => ({
        url:
          () =>
            "https://example.com/"
      }),

    failure:
      () => null
  } as unknown as Request;
}


function fakeResponse(
  request:
    Request,

  body:
    unknown,

  contentType =
    "application/json",

  status =
    200
): Response {

  const buffer =
    Buffer.from(
      typeof body ===
      "string"
        ? body
        : JSON.stringify(
            body
          ),
      "utf8"
    );


  return {
    url:
      () =>
        request.url(),

    request:
      () =>
        request,

    status:
      () =>
        status,

    headers:
      () => ({
        "content-type":
          contentType,

        "content-length":
          String(
            buffer.byteLength
          )
      }),

    body:
      async () =>
        buffer
  } as unknown as Response;
}


describe(
  "Network Observer V2",
  () => {

    test(
      "content type policy accepts JSON and text but rejects binary",
      () => {

        expect(
          isInspectableContentType(
            "application/json; charset=utf-8"
          )
        ).toBe(true);


        expect(
          isInspectableContentType(
            "application/problem+json"
          )
        ).toBe(true);


        expect(
          isInspectableContentType(
            "text/plain"
          )
        ).toBe(true);


        expect(
          isInspectableContentType(
            "image/jpeg"
          )
        ).toBe(false);


        expect(
          isInspectableContentType(
            "video/mp4"
          )
        ).toBe(false);
      }
    );


    test(
      "captures request response lifecycle and API candidates",
      async () => {

        const page =
          new FakePage();


        const observer =
          attachNetworkObserver(
            page as unknown as Page,
            {
              now:
                () =>
                  new Date(
                    "2026-09-17T12:00:00.000Z"
                  )
            }
          );


        const request =
          fakeRequest(
            "https://example.com/api/products"
          );


        page.emit(
          "request",
          request
        );


        page.emit(
          "response",
          fakeResponse(
            request,
            {
              data: {
                products: [
                  {
                    id: 1,
                    name: "Canon R50",
                    price: 15000000,
                    url: "/canon-r50"
                  },
                  {
                    id: 2,
                    name: "Sony A6400",
                    price: 16000000,
                    url: "/sony-a6400"
                  },
                  {
                    id: 3,
                    name: "Printer",
                    price: 5000000,
                    url: "/printer"
                  }
                ]
              }
            }
          )
        );


        page.emit(
          "requestfinished",
          request
        );


        await observer.flush();


        const snapshot =
          observer.snapshot();


        expect(
          snapshot.requests
        ).toHaveLength(1);


        expect(
          snapshot.responses
        ).toHaveLength(1);


        expect(
          snapshot.responses[0]
            ?.bodyState
        ).toBe(
          "INSPECTED"
        );


        expect(
          snapshot.responses[0]
            ?.candidateCount
        ).toBe(1);


        expect(
          snapshot.outcomes
        ).toEqual([
          expect.objectContaining({
            state:
              "FINISHED"
          })
        ]);


        expect(
          snapshot.apiCandidates
        ).toHaveLength(1);


        expect(
          snapshot.apiCandidates[0]
            ?.path
        ).toBe(
          "$.data.products"
        );


        expect(
          snapshot.apiCandidates[0]
            ?.itemCount
        ).toBe(3);


        await observer.stop();


        expect(
          page.listenerCount(
            "response"
          )
        ).toBe(0);
      }
    );


    test(
      "does not read binary response body",
      async () => {

        const page =
          new FakePage();


        const observer =
          attachNetworkObserver(
            page as unknown as Page
          );


        const request =
          fakeRequest(
            "https://example.com/photo.jpg",
            "GET",
            "image"
          );


        let bodyRead =
          false;


        const response = {
          url:
            () =>
              request.url(),

          request:
            () =>
              request,

          status:
            () =>
              200,

          headers:
            () => ({
              "content-type":
                "image/jpeg",

              "content-length":
                "1000"
            }),

          body:
            async () => {

              bodyRead =
                true;

              return Buffer.alloc(
                1000
              );
            }
        } as unknown as Response;


        page.emit(
          "response",
          response
        );


        await observer.flush();


        const snapshot =
          observer.snapshot();


        expect(
          bodyRead
        ).toBe(false);


        expect(
          snapshot.responses[0]
            ?.bodyState
        ).toBe(
          "UNSUPPORTED_CONTENT_TYPE"
        );


        await observer.stop();
      }
    );


    test(
      "skips declared oversized response without reading body",
      async () => {

        const page =
          new FakePage();


        const observer =
          attachNetworkObserver(
            page as unknown as Page,
            {
              maxBodyBytes:
                100
            }
          );


        const request =
          fakeRequest(
            "https://example.com/api/huge"
          );


        let bodyRead =
          false;


        const response = {
          url:
            () =>
              request.url(),

          request:
            () =>
              request,

          status:
            () =>
              200,

          headers:
            () => ({
              "content-type":
                "application/json",

              "content-length":
                "9999"
            }),

          body:
            async () => {

              bodyRead =
                true;

              return Buffer.from(
                "{}"
              );
            }
        } as unknown as Response;


        page.emit(
          "response",
          response
        );


        await observer.flush();


        expect(
          bodyRead
        ).toBe(false);


        expect(
          observer
            .snapshot()
            .responses[0]
            ?.bodyState
        ).toBe(
          "TOO_LARGE"
        );


        await observer.stop();
      }
    );


    test(
      "records failed requests separately",
      async () => {

        const page =
          new FakePage();


        const observer =
          attachNetworkObserver(
            page as unknown as Page
          );


        const request = {
          url:
            () =>
              "https://example.com/api/error",

          method:
            () =>
              "GET",

          resourceType:
            () =>
              "xhr",

          frame:
            () => ({
              url:
                () =>
                  "https://example.com/"
            }),

          failure:
            () => ({
              errorText:
                "net::ERR_FAILED"
            })
        } as unknown as Request;


        page.emit(
          "requestfailed",
          request
        );


        const snapshot =
          await observer.stop();


        expect(
          snapshot.outcomes
        ).toEqual([
          expect.objectContaining({
            state:
              "FAILED",

            failureText:
              "net::ERR_FAILED"
          })
        ]);
      }
    );

  }
);