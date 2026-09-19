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
  Response
} from "playwright";

import {
  collectBrowserDetail
} from "../../../src/v02/extraction/browserDetailCollector.ts";

class FakePage
  extends EventEmitter {
  currentUrl =
    "about:blank";

  html =
    "<html><body><h1>Camera</h1></body></html>";

  navigationStatus =
    200;

  navigationError:
    Error | null =
    null;

  settleError:
    Error | null =
    null;

  listenersPresentDuringGoto =
    false;

  hydrationWaits =
    0;

  hydrateProduct =
    false;

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

  async goto(
    url: string
  ): Promise<Response | null> {
    this.listenersPresentDuringGoto =
      this.listenerCount(
        "request"
      ) > 0 &&
      this.listenerCount(
        "response"
      ) > 0 &&
      this.listenerCount(
        "requestfinished"
      ) > 0 &&
      this.listenerCount(
        "requestfailed"
      ) > 0;

    if (this.navigationError) {
      throw this.navigationError;
    }

    this.currentUrl =
      url.replace(
        "example.com/product/a",
        "www.example.com/product/a"
      );

    return {
      status:
        () =>
          this.navigationStatus
    } as unknown as Response;
  }

  async waitForLoadState():
    Promise<void> {
    if (this.settleError) {
      throw this.settleError;
    }
  }

  async evaluate():
    Promise<{
      hasProductIdentity: boolean;
      hasTransactionAction: boolean;
      hasChromeOnlyHeading: boolean;
    }> {
    const h1Matches =
      Array.from(
        this.html.matchAll(
          /<h1([^>]*)>\s*([^<\s][\s\S]*?)<\/h1>/gi
        )
      );

    const nonChromeHeading =
      h1Matches.some(
        match =>
          !/(?:logo|site-header|site-title|brand)/i
            .test(
              match[1] ??
              ""
            )
      );

    return {
      hasProductIdentity:
        nonChromeHeading,

      hasTransactionAction:
        /(?:thuê sản phẩm|mua ngay|thêm vào giỏ|rent now|book now|add to cart)/iu
          .test(
            this.html
          ),

      hasChromeOnlyHeading:
        h1Matches.length >
          0 &&
        !nonChromeHeading
    };
  }

  async waitForFunction():
    Promise<void> {
    this.hydrationWaits++;

    if (
      this.hydrateProduct
    ) {
      this.html =
        [
          "<html><body>",
          "<h1>Sony A6400</h1>",
          "<div>350.000đ/ngày</div>",
          "<button>Thuê sản phẩm này</button>",
          "</body></html>"
        ].join("");
    }
  }

  async content():
    Promise<string> {
    return this.html;
  }

  url():
    string {
    return this.currentUrl;
  }
}

function timeoutError(
  message: string
): Error {
  const error =
    new Error(
      message
    );

  error.name =
    "TimeoutError";

  return error;
}

describe(
  "browserDetailCollector",
  () => {
    test(
      "attaches network observer before navigation and returns rendered detail bundle",
      async () => {
        const page =
          new FakePage();

        const result =
          await collectBrowserDetail(
            page as unknown as Page,
            "https://example.com/product/a?utm_source=test#specs",
            {
              settleTimeoutMs:
                100
            }
          );

        expect(
          page.listenersPresentDuringGoto
        ).toBe(true);

        expect(
          result.requestedUrl
        ).toBe(
          "https://example.com/product/a?utm_source=test#specs"
        );

        expect(
          result.finalUrl
        ).toBe(
          "https://www.example.com/product/a"
        );

        expect(
          result.canonicalUrl
        ).toBe(
          "https://www.example.com/product/a"
        );

        expect(
          result.html
        ).toContain(
          "<h1>Camera</h1>"
        );

        expect(
          result.errors
        ).toEqual([]);

        expect(
          result.interactions
        ).toEqual([]);

        expect(
          result.networkSnapshot
            .requests
        ).toEqual([]);

        expect(
          page.listenerCount(
            "request"
          )
        ).toBe(0);

        expect(
          page.listenerCount(
            "response"
          )
        ).toBe(0);
      }
    );

    test(
      "preserves HTTP 404 as non-retriable navigation evidence while keeping HTML",
      async () => {
        const page =
          new FakePage();

        page.navigationStatus =
          404;

        page.html =
          "<html><body>Not found</body></html>";

        const result =
          await collectBrowserDetail(
            page as unknown as Page,
            "https://example.com/product/a"
          );

        expect(
          result.html
        ).toContain(
          "Not found"
        );

        expect(
          result.errors
        ).toEqual([
          expect.objectContaining({
            stage:
              "NAVIGATION",
            code:
              "HTTP_NOT_FOUND",
            retriable:
              false,
            status:
              404
          })
        ]);
      }
    );

    test(
      "records navigation timeout as retriable and always detaches observer",
      async () => {
        const page =
          new FakePage();

        page.navigationError =
          timeoutError(
            "Navigation timeout exceeded"
          );

        const result =
          await collectBrowserDetail(
            page as unknown as Page,
            "https://example.com/product/a"
          );

        expect(
          result.errors.some(
            error =>
              error.code ===
                "NAVIGATION_TIMEOUT" &&
              error.retriable
          )
        ).toBe(true);

        expect(
          page.listenerCount(
            "request"
          )
        ).toBe(0);

        expect(
          page.listenerCount(
            "response"
          )
        ).toBe(0);

        expect(
          page.listenerCount(
            "requestfinished"
          )
        ).toBe(0);

        expect(
          page.listenerCount(
            "requestfailed"
          )
        ).toBe(0);
      }
    );

    test(
      "treats bounded optional load settle timeout as non-fatal",
      async () => {
        const page =
          new FakePage();

        page.settleError =
          timeoutError(
            "Load state timeout"
          );

        const result =
          await collectBrowserDetail(
            page as unknown as Page,
            "https://example.com/product/a",
            {
              settleTimeoutMs:
                10
            }
          );

        expect(
          result.errors
        ).toEqual([]);

        expect(
          result.html
        ).toContain(
          "Camera"
        );
      }
    );

    test(
      "classifies server and rate-limit statuses as retriable",
      async () => {
        for (
          const status
          of [429, 503]
        ) {
          const page =
            new FakePage();

          page.navigationStatus =
            status;

          const result =
            await collectBrowserDetail(
              page as unknown as Page,
              "https://example.com/product/a"
            );

          expect(
            result.errors
              .some(
                error =>
                  error.status ===
                    status &&
                  error.retriable
              )
          ).toBe(true);
        }
      }
    );

    test(
      "waits boundedly for product identity when a transaction CTA appears before hydration",
      async () => {

        const page =
          new FakePage();

        page.html =
          [
            "<html><body>",
            "<div>0đ/ngày</div>",
            "<button>Thuê sản phẩm này</button>",
            "</body></html>"
          ].join("");

        page.hydrateProduct =
          true;

        const result =
          await collectBrowserDetail(
            page as unknown as Page,
            "https://example.com/product/a",
            {
              settleTimeoutMs:
                10
            }
          );

        expect(
          page.hydrationWaits
        ).toBe(
          1
        );

        expect(
          result.html
        ).toContain(
          "<h1>Sony A6400</h1>"
        );
      }
    );


    test(
      "waits when the only early H1 is site chrome and product identity hydrates later",
      async () => {

        const page =
          new FakePage();

        page.html =
          [
            "<html><body>",
            '<header class="site-header">',
            '<h1 class="site-header__logo">RentLens</h1>',
            "</header>",
            "</body></html>"
          ].join("");

        page.hydrateProduct =
          true;

        const result =
          await collectBrowserDetail(
            page as unknown as Page,
            "https://example.com/lens/cho-thue-chan-may",
            {
              settleTimeoutMs:
                10
            }
          );

        expect(
          page.hydrationWaits
        ).toBe(
          1
        );

        expect(
          result.html
        ).toContain(
          "<h1>Sony A6400</h1>"
        );
      }
    );

  }
);