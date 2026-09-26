import {
  EventEmitter
} from "node:events";

import {
  describe,
  expect,
  test
} from "vitest";

import type {
  Locator,
  Page,
  Response
} from "playwright";

import {
  runInteractionFallback,
  shouldAttemptInteractionFallback
} from "../../../src/v02/extraction/interactionFallback.ts";

import {
  collectBrowserDetail
} from "../../../src/v02/extraction/browserDetailCollector.ts";

class FakeControl {
  constructor(
    readonly label:
      string,

    readonly onClick:
      () => void,

    readonly expanded:
      string | null =
      null
  ) {}

  async innerText():
    Promise<string> {
    return this.label;
  }

  async isVisible():
    Promise<boolean> {
    return true;
  }

  async isEnabled():
    Promise<boolean> {
    return true;
  }

  async getAttribute(
    name: string
  ): Promise<string | null> {
    if (
      name ===
      "aria-expanded"
    ) {
      return this.expanded;
    }

    return null;
  }

  async click():
    Promise<void> {
    this.onClick();
  }
}

class FakeCollection {
  constructor(
    readonly items:
      FakeControl[]
  ) {}

  async count():
    Promise<number> {
    return this.items.length;
  }

  nth(
    index: number
  ): Locator {
    return this.items[
      index
    ] as unknown as Locator;
  }
}

class FakeInteractionPage
  extends EventEmitter {
  currentUrl =
    "https://example.com/products/canon-r50";

  html =
    `
      <html>
        <body>
          <h1>Canon R50</h1>
          <button>
            Mua ngay
          </button>
        </body>
      </html>
    `;

  tabs:
    FakeControl[] = [];

  buttons:
    FakeControl[] = [];

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

  getByRole(
    role: "tab" | "button"
  ): Locator {
    const items =
      role === "tab"
        ? this.tabs
        : this.buttons;

    return new FakeCollection(
      items
    ) as unknown as Locator;
  }

  async content():
    Promise<string> {
    return this.html;
  }

  async waitForTimeout():
    Promise<void> {
    return;
  }

  async waitForLoadState():
    Promise<void> {
    return;
  }

  async goto(
    url: string
  ): Promise<Response | null> {
    this.currentUrl =
      url;

    return {
      status:
        () => 200
    } as unknown as Response;
  }

  url():
    string {
    return this.currentUrl;
  }
}

describe(
  "interactionFallback",
  () => {
    test(
      "does not interact when semantic evidence is already sufficient",
      async () => {
        const page =
          new FakeInteractionPage();

        page.html = `
          <html>
            <body>
              <h1>Canon R50</h1>

              <button>
                Mua ngay
              </button>

              <h2>
                Thông số kỹ thuật
              </h2>

              <div>
                APS-C 24.2MP
              </div>
            </body>
          </html>
        `;

        page.tabs.push(
          new FakeControl(
            "Thông số kỹ thuật",
            () => {
              throw new Error(
                "Must not click"
              );
            }
          )
        );

        expect(
          shouldAttemptInteractionFallback(
            page.html,
            page.currentUrl
          )
        ).toBe(false);

        const result =
          await runInteractionFallback(
            page as unknown as Page,
            page.html,
            page.currentUrl
          );

        expect(
          result.interactions
        ).toEqual([]);
      }
    );

    test(
      "reveals missing section with a semantic tab and records success",
      async () => {
        const page =
          new FakeInteractionPage();

        page.tabs.push(
          new FakeControl(
            "Thông số kỹ thuật",
            () => {
              page.html = `
                <html>
                  <body>
                    <h1>Canon R50</h1>

                    <button>
                      Mua ngay
                    </button>

                    <h2>
                      Thông số kỹ thuật
                    </h2>

                    <div>
                      APS-C 24.2MP
                    </div>
                  </body>
                </html>
              `;
            }
          )
        );

        const result =
          await runInteractionFallback(
            page as unknown as Page,
            page.html,
            page.currentUrl,
            {
              mutationTimeoutMs:
                0
            }
          );

        expect(
          result.interactions
        ).toHaveLength(1);

        expect(
          result.interactions[0]
        ).toEqual(
          expect.objectContaining({
            kind:
              "TAB",

            target:
              "Thông số kỹ thuật",

            outcome:
              "SUCCESS"
          })
        );

        expect(
          result.html
        ).toContain(
          "APS-C 24.2MP"
        );
      }
    );

    test(
      "records a bounded no-change load-more interaction",
      async () => {
        const page =
          new FakeInteractionPage();

        page.buttons.push(
          new FakeControl(
            "Xem thêm",
            () => {
              return;
            }
          )
        );

        const result =
          await runInteractionFallback(
            page as unknown as Page,
            page.html,
            page.currentUrl,
            {
              mutationTimeoutMs:
                0
            }
          );

        expect(
          result.interactions
        ).toHaveLength(1);

        expect(
          result.interactions[0]
        ).toEqual(
          expect.objectContaining({
            kind:
              "LOAD_MORE",

            outcome:
              "NO_CHANGE"
          })
        );
      }
    );

    test(
      "respects maxInteractions",
      async () => {
        const page =
          new FakeInteractionPage();

        page.buttons.push(
          new FakeControl(
            "Xem thêm",
            () => {
              return;
            }
          ),
          new FakeControl(
            "Chi tiết",
            () => {
              return;
            }
          )
        );

        const result =
          await runInteractionFallback(
            page as unknown as Page,
            page.html,
            page.currentUrl,
            {
              maxInteractions:
                1,

              mutationTimeoutMs:
                0
            }
          );

        expect(
          result.interactions
        ).toHaveLength(1);
      }
    );

    test(
      "browser collector keeps observer active through interaction fallback",
      async () => {
        const page =
          new FakeInteractionPage();

        page.tabs.push(
          new FakeControl(
            "Thông số kỹ thuật",
            () => {
              page.html = `
                <html>
                  <body>
                    <h1>Canon R50</h1>

                    <button>
                      Mua ngay
                    </button>

                    <h2>
                      Thông số kỹ thuật
                    </h2>

                    <div>
                      APS-C 24.2MP
                    </div>
                  </body>
                </html>
              `;
            }
          )
        );

        const result =
          await collectBrowserDetail(
            page as unknown as Page,
            "https://example.com/products/canon-r50",
            {
              settleTimeoutMs:
                0,

              interactionFallbackOptions: {
                mutationTimeoutMs:
                  0
              }
            }
          );

        expect(
          result.interactions
        ).toHaveLength(1);

        expect(
          result.interactions[0]
            ?.outcome
        ).toBe(
          "SUCCESS"
        );

        expect(
          result.html
        ).toContain(
          "APS-C 24.2MP"
        );

        expect(
          result.timing
            .interactionMs
        ).toBeGreaterThanOrEqual(
          0
        );

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
  }
);