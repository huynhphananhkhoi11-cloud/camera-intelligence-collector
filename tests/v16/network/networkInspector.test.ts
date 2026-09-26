import {
  describe,
  expect,
  test
} from "vitest";

import {
  NetworkInspector
} from "../../../src/v16/network/networkInspector.js";

import type {
  NetworkEvidenceBundle
} from "../../../src/v16/evidence/networkEvidence.js";


type ResponseListener =
  (response: FakeResponse) =>
    void;


class FakeRequest {
  constructor(
    private readonly methodValue:
      string,
    private readonly resourceTypeValue:
      string,
    private readonly frameUrlValue:
      string =
        "https://shop.example/cameras"
  ) {}


  method(): string {
    return this.methodValue;
  }


  resourceType(): string {
    return this.resourceTypeValue;
  }


  frame(): {
    url(): string;
  } {
    return {
      url: () =>
        this.frameUrlValue
    };
  }
}


class FakeResponse {
  bodyReadCount =
    0;


  constructor(
    private readonly options: {
      readonly url:
        string;
      readonly status?:
        number;
      readonly method?:
        string;
      readonly resourceType?:
        string;
      readonly contentType?:
        string | null;
      readonly contentLength?:
        number | null;
      readonly body?:
        string | Buffer;
      readonly bodyError?:
        Error;
      readonly neverResolveBody?:
        boolean;
      readonly frameUrl?:
        string;
    }
  ) {}


  url(): string {
    return this.options.url;
  }


  status(): number {
    return this.options.status ?? 200;
  }


  request(): FakeRequest {
    return new FakeRequest(
      this.options.method ?? "GET",
      this.options.resourceType ?? "xhr",
      this.options.frameUrl
    );
  }


  async headerValue(
    name:
      string
  ):
    Promise<string | null> {
    if (
      name.toLowerCase() ===
        "content-type"
    ) {
      return this.options.contentType ?? null;
    }


    if (
      name.toLowerCase() ===
        "content-length"
    ) {
      return this.options.contentLength == null
        ? null
        : String(this.options.contentLength);
    }


    return null;
  }


  async body():
    Promise<Buffer> {
    this.bodyReadCount +=
      1;


    if (
      this.options.neverResolveBody
    ) {
      return await new Promise<Buffer>(
        () =>
          undefined
      );
    }


    if (
      this.options.bodyError
    ) {
      throw this.options.bodyError;
    }


    return Buffer.isBuffer(
      this.options.body
    )
      ? this.options.body
      : Buffer.from(
          this.options.body ?? "",
          "utf8"
        );
  }
}


class FakePage {
  readonly operations:
    string[] =
      [];


  private readonly responseListeners =
    new Set<ResponseListener>();


  constructor(
    private readonly reloadResponses:
      readonly FakeResponse[],
    private readonly reloadError:
      Error | null =
        null
  ) {}


  on(
    event:
      "response",
    listener:
      ResponseListener
  ):
    this {
    this.operations.push(
      "on:response"
    );
    this.responseListeners.add(
      listener
    );
    return this;
  }


  off(
    event:
      "response",
    listener:
      ResponseListener
  ):
    this {
    this.operations.push(
      "off:response"
    );
    this.responseListeners.delete(
      listener
    );
    return this;
  }


  async reload():
    Promise<null> {
    this.operations.push(
      "reload"
    );


    for (
      const response
      of this.reloadResponses
    ) {
      for (
        const listener
        of this.responseListeners
      ) {
        listener(
          response
        );
      }
    }


    if (
      this.reloadError
    ) {
      throw this.reloadError;
    }


    return null;
  }


  async waitForTimeout(
    _ms:
      number
  ):
    Promise<void> {
    return;
  }


  url(): string {
    return "https://shop.example/cameras";
  }
}


function inspector(
  overrides: Partial<{
    maxObservedResponses: number;
    maxCapturedResponses: number;
    maxBodyBytes: number;
    maxTextBytes: number;
    maxTotalBodyBytes: number;
    inspectionTimeoutMs: number;
    reloadTimeoutMs: number;
    observationWindowMs: number;
    perResponseTimeoutMs: number;
  }> = {}
): NetworkInspector {
  return new NetworkInspector({
    maxObservedResponses:
      32,
    maxCapturedResponses:
      16,
    maxBodyBytes:
      1_024,
    maxTextBytes:
      512,
    maxTotalBodyBytes:
      4_096,
    inspectionTimeoutMs:
      100,
    reloadTimeoutMs:
      40,
    observationWindowMs:
      0,
    perResponseTimeoutMs:
      10,
    ...overrides
  });
}


function serialized(
  bundle:
    NetworkEvidenceBundle
): string {
  return JSON.stringify(
    bundle
  );
}


describe(
  "V16 NetworkInspector",
  () => {
    test(
      "captures an XHR JSON catalog payload that appears during the single reload",
      async () => {
        const response =
          new FakeResponse({
            url:
              "https://shop.example/api/catalog?page=1",
            resourceType:
              "xhr",
            contentType:
              "application/json; charset=utf-8",
            body:
              JSON.stringify({
                items: [
                  {
                    id:
                      "p1",
                    name:
                      "Camera Alpha"
                  }
                ],
                page:
                  1
              })
          });


        const page =
          new FakePage([
            response
          ]);


        const bundle =
          await inspector().inspect(
            page as never
          );


        expect(
          bundle.entries
        ).toHaveLength(
          1
        );
        expect(
          bundle.entries[0]?.resourceType
        ).toBe(
          "xhr"
        );
        expect(
          bundle.entries[0]?.requestMethod
        ).toBe(
          "GET"
        );
        expect(
          bundle.entries[0]?.body.kind
        ).toBe(
          "json"
        );
        expect(
          bundle.entries[0]?.priority
        ).toBe(
          "high"
        );
        expect(
          bundle.reloadCount
        ).toBe(
          1
        );
      }
    );


    test(
      "ignores generic analytics and logging endpoints without reading their bodies",
      async () => {
        const analytics =
          new FakeResponse({
            url:
              "https://metrics.example/analytics/events",
            resourceType:
              "fetch",
            contentType:
              "application/json",
            body:
              JSON.stringify({
                event:
                  "page_view"
              })
          });


        const logs =
          new FakeResponse({
            url:
              "https://shop.example/telemetry/logs",
            resourceType:
              "xhr",
            contentType:
              "application/json",
            body:
              JSON.stringify({
                level:
                  "info"
              })
          });


        const ads =
          new FakeResponse({
            url:
              "https://shop.example/ads/events",
            resourceType:
              "fetch",
            contentType:
              "application/json",
            body:
              JSON.stringify({
                impression:
                  1
              })
          });


        const bundle =
          await inspector().inspect(
            new FakePage([
              analytics,
              logs,
              ads
            ]) as never
          );


        expect(
          bundle.entries
        ).toHaveLength(
          0
        );
        expect(
          bundle.stats.ignoredTelemetry
        ).toBe(
          3
        );
        expect(
          analytics.bodyReadCount
        ).toBe(
          0
        );
        expect(
          logs.bodyReadCount
        ).toBe(
          0
        );
        expect(
          ads.bodyReadCount
        ).toBe(
          0
        );
      }
    );


    test(
      "skips an oversized response before reading its body when Content-Length exceeds the bound",
      async () => {
        const response =
          new FakeResponse({
            url:
              "https://shop.example/api/huge",
            resourceType:
              "xhr",
            contentType:
              "application/json",
            contentLength:
              9_999,
            body:
              "{}"
          });


        const bundle =
          await inspector({
            maxBodyBytes:
              1_024
          }).inspect(
            new FakePage([
              response
            ]) as never
          );


        expect(
          bundle.entries
        ).toHaveLength(
          0
        );
        expect(
          bundle.stats.ignoredOversized
        ).toBe(
          1
        );
        expect(
          response.bodyReadCount
        ).toBe(
          0
        );
      }
    );


    test(
      "skips binary Fetch/XHR responses without reading the body",
      async () => {
        const response =
          new FakeResponse({
            url:
              "https://shop.example/api/blob",
            resourceType:
              "fetch",
            contentType:
              "application/octet-stream",
            body:
              Buffer.from([
                0,
                1,
                2,
                3
              ])
          });


        const bundle =
          await inspector().inspect(
            new FakePage([
              response
            ]) as never
          );


        expect(
          bundle.entries
        ).toHaveLength(
          0
        );
        expect(
          bundle.stats.ignoredBinary
        ).toBe(
          1
        );
        expect(
          response.bodyReadCount
        ).toBe(
          0
        );
      }
    );


    test(
      "collapses equivalent response bodies instead of retaining duplicate evidence",
      async () => {
        const payload =
          JSON.stringify({
            items: [
              {
                id:
                  "same-product"
              }
            ]
          });


        const bundle =
          await inspector().inspect(
            new FakePage([
              new FakeResponse({
                url:
                  "https://shop.example/api/catalog?page=1&request=1",
                resourceType:
                  "xhr",
                contentType:
                  "application/json",
                body:
                  payload
              }),
              new FakeResponse({
                url:
                  "https://shop.example/api/catalog?page=1&request=2",
                resourceType:
                  "xhr",
                contentType:
                  "application/json",
                body:
                  payload
              })
            ]) as never
          );


        expect(
          bundle.entries
        ).toHaveLength(
          1
        );
        expect(
          bundle.entries[0]?.duplicateCount
        ).toBe(
          2
        );
        expect(
          bundle.stats.deduplicated
        ).toBe(
          1
        );
      }
    );


    test(
      "body timeout and reload failure are contained and do not crash the inspection run",
      async () => {
        const hanging =
          new FakeResponse({
            url:
              "https://shop.example/api/slow",
            resourceType:
              "xhr",
            contentType:
              "application/json",
            neverResolveBody:
              true
          });


        const page =
          new FakePage(
            [
              hanging
            ],
            new Error(
              "navigation timed out"
            )
          );


        const bundle =
          await inspector({
            perResponseTimeoutMs:
              5,
            reloadTimeoutMs:
              20,
            inspectionTimeoutMs:
              50
          }).inspect(
            page as never
          );


        expect(
          bundle.reloadErrorCode
        ).toBe(
          "RELOAD_FAILED"
        );
        expect(
          bundle.entries
        ).toHaveLength(
          0
        );
        expect(
          bundle.stats.bodyReadTimeouts
        ).toBe(
          1
        );
      }
    );


    test(
      "redacts secret-bearing URL parameters and JSON fields from emitted evidence",
      async () => {
        const response =
          new FakeResponse({
            url:
              "https://shop.example/api/catalog?api_key=TOPSECRET&token=SESSION123&auth=AUTHSECRET&page=1",
            resourceType:
              "xhr",
            contentType:
              "application/json",
            frameUrl:
              "https://shop.example/cameras?session_token=FRAMESECRET",
            body:
              JSON.stringify({
                items: [
                  {
                    id:
                      "p1",
                    title:
                      "Camera Alpha"
                  }
                ],
                authorization:
                  "Bearer ABC.DEF.XYZ",
                cookie:
                  "sid=COOKIESECRET",
                accessToken:
                  "TOKENVALUE",
                nested: {
                  csrfToken:
                    "CSRFVALUE",
                  apiKey:
                    "APIKEYVALUE",
                  note:
                    "Bearer INLINESECRET"
                }
              })
          });


        const bundle =
          await inspector().inspect(
            new FakePage([
              response
            ]) as never
          );


        const output =
          serialized(
            bundle
          );


        for (
          const forbidden
          of [
            "TOPSECRET",
            "SESSION123",
            "AUTHSECRET",
            "FRAMESECRET",
            "ABC.DEF.XYZ",
            "COOKIESECRET",
            "TOKENVALUE",
            "CSRFVALUE",
            "APIKEYVALUE",
            "INLINESECRET"
          ]
        ) {
          expect(
            output.includes(
              forbidden
            )
          ).toBe(
            false
          );
        }


        expect(
          output.toLowerCase().includes(
            "authorization"
          )
        ).toBe(
          false
        );
        expect(
          output.toLowerCase().includes(
            "cookie"
          )
        ).toBe(
          false
        );
        expect(
          output.toLowerCase().includes(
            "apikey"
          )
        ).toBe(
          false
        );
        expect(
          output.toLowerCase().includes(
            "accesstoken"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "scrubs generic auth token and secret assignments when optional small text capture is enabled",
      async () => {
        const response =
          new FakeResponse({
            url:
              "https://shop.example/fragment",
            resourceType:
              "fetch",
            contentType:
              "text/html",
            body:
              "<div>auth=AUTHVALUE token=TOKENVALUE secret=SECRETVALUE safe=visible</div>"
          });


        const bundle =
          await new NetworkInspector({
            maxObservedResponses:
              8,
            maxCapturedResponses:
              8,
            maxBodyBytes:
              1_024,
            maxTextBytes:
              1_024,
            maxTotalBodyBytes:
              2_048,
            inspectionTimeoutMs:
              100,
            reloadTimeoutMs:
              40,
            observationWindowMs:
              0,
            perResponseTimeoutMs:
              10,
            captureSmallText:
              true
          }).inspect(
            new FakePage([
              response
            ]) as never
          );


        const output =
          serialized(
            bundle
          );


        expect(
          bundle.entries
        ).toHaveLength(
          1
        );
        expect(
          output.includes(
            "AUTHVALUE"
          )
        ).toBe(
          false
        );
        expect(
          output.includes(
            "TOKENVALUE"
          )
        ).toBe(
          false
        );
        expect(
          output.includes(
            "SECRETVALUE"
          )
        ).toBe(
          false
        );
        expect(
          output.includes(
            "safe=visible"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "arms the response listener before invoking reload and reloads exactly once",
      async () => {
        const page =
          new FakePage([]);


        await inspector().inspect(
          page as never
        );


        expect(
          page.operations.filter(
            operation =>
              operation ===
                "reload"
          )
        ).toHaveLength(
          1
        );
        expect(
          page.operations.indexOf(
            "on:response"
          ) <
            page.operations.indexOf(
              "reload"
            )
        ).toBe(
          true
        );
      }
    );
  }
);
