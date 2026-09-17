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
  profilePageWithNetwork
} from "../../../src/v02/profiling/liveSiteProfiler.ts";


function fakeRequest(
  url: string
): Request {

  return {
    url:
      () =>
        url,

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
      () =>
        null
  } as unknown as Request;
}


function fakeResponse(
  request: Request,
  body: unknown
): Response {

  const buffer =
    Buffer.from(
      JSON.stringify(
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
        200,

    headers:
      () => ({
        "content-type":
          "application/json",

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


class FakePage
  extends EventEmitter {

  observerAttachedBeforeGoto =
    false;


  async goto(
    _url: string
  ): Promise<null> {

    this.observerAttachedBeforeGoto =
      this.listenerCount(
        "request"
      ) >
        0 &&
      this.listenerCount(
        "response"
      ) >
        0;


    const request =
      fakeRequest(
        "https://example.com/api/products"
      );


    this.emit(
      "request",
      request
    );


    this.emit(
      "response",
      fakeResponse(
        request,
        {
          products: [
            {
              id: 1,
              name:
                "Canon R50",
              price:
                15000000,
              url:
                "/canon-r50"
            },
            {
              id: 2,
              name:
                "Sony A6400",
              price:
                16000000,
              url:
                "/sony-a6400"
            }
          ]
        }
      )
    );


    this.emit(
      "requestfinished",
      request
    );


    return null;
  }


  async waitForLoadState():
    Promise<void> {

    return;
  }


  async content():
    Promise<string> {

    return `
      <html>

        <head>
          <title>
            Thuê máy ảnh
          </title>
        </head>

        <body>

          <nav>
            Cho thuê máy ảnh
          </nav>

          <button>
            THUÊ NGAY
          </button>

          <div>
            400.000đ/ngày
          </div>

        </body>

      </html>
    `;
  }


  url():
    string {

    return "https://example.com/";
  }
}


describe(
  "Live Site Profiler V2",
  () => {

    test(
      "attaches network observer before navigation and builds profile",
      async () => {

        const page =
          new FakePage();


        const result =
          await profilePageWithNetwork(
            page as unknown as Page,
            "https://example.com/",
            {
              settleTimeoutMs:
                1
            }
          );


        expect(
          page.observerAttachedBeforeGoto
        ).toBe(true);


        expect(
          result.profile
            .suggestedSiteMode
        ).toBe(
          "RENTAL"
        );


        expect(
          result.profile
            .network
            .apiCandidateCount
        ).toBe(
          1
        );


        expect(
          result.network
            .requests
        ).toHaveLength(
          1
        );


        expect(
          page.listenerCount(
            "response"
          )
        ).toBe(
          0
        );
      }
    );

  }
);