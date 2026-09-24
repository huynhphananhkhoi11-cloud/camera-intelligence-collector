import {
  describe,
  expect,
  test,
  vi
} from "vitest";

import {
  PlaywrightRenderedListingRuntime,
  RenderedListingDiscovery,
  type RenderedListingLink,
  type RenderedListingPageSession,
  type RenderedListingRuntime,
  type RenderedListingSnapshot
} from "../../../src/v04/discovery/renderedListingDiscovery.js";


const playwrightMock = vi.hoisted(() => ({
  browser: null as unknown
}));

vi.mock(
  "playwright",
  () => ({
    chromium: {
      launch: async () => playwrightMock.browser
    }
  })
);

function link(
  url: string,
  rel: string | null = null
): RenderedListingLink {
  return { url, rel };
}

function snapshot(
  documentHeight: number,
  links: readonly RenderedListingLink[]
): RenderedListingSnapshot {
  return {
    documentHeight,
    links
  };
}

class ScriptedPage implements RenderedListingPageSession {
  private index = 0;

  public scrollCalls = 0;
  public waitCalls = 0;
  public closeCalls = 0;

  constructor(
    private readonly snapshots: readonly RenderedListingSnapshot[]
  ) {
    if (snapshots.length === 0) {
      throw new Error("ScriptedPage requires at least one snapshot.");
    }
  }

  async snapshot(): Promise<RenderedListingSnapshot> {
    const current =
      this.snapshots[
        Math.min(
          this.index,
          this.snapshots.length - 1
        )
      ]!;

    this.index += 1;
    return current;
  }

  async scrollNearBottom(): Promise<void> {
    this.scrollCalls += 1;
  }

  async waitForSettle(): Promise<void> {
    this.waitCalls += 1;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

class ScriptedRuntime implements RenderedListingRuntime {
  public readonly opened: string[] = [];

  constructor(
    private readonly pages: ReadonlyMap<string, ScriptedPage>
  ) {}

  async open(url: string): Promise<RenderedListingPageSession> {
    this.opened.push(url);

    const page = this.pages.get(url);
    if (page === undefined) {
      throw new Error(`No scripted page for ${url}`);
    }

    return page;
  }
}

describe(
  "V04 rendered listing discovery",
  () => {
    test(
      "collects links revealed by infinite-scroll growth",
      async () => {
        const root = "https://shop.test/category";
        const page = new ScriptedPage([
          snapshot(2000, [
            link("https://shop.test/a"),
            link("https://shop.test/b")
          ]),
          snapshot(3600, [
            link("https://shop.test/a"),
            link("https://shop.test/b"),
            link("https://shop.test/c"),
            link("https://shop.test/d")
          ]),
          snapshot(3600, [
            link("https://shop.test/a"),
            link("https://shop.test/b"),
            link("https://shop.test/c"),
            link("https://shop.test/d")
          ]),
          snapshot(3600, [
            link("https://shop.test/a"),
            link("https://shop.test/b"),
            link("https://shop.test/c"),
            link("https://shop.test/d")
          ])
        ]);

        const discovery = new RenderedListingDiscovery(
          new ScriptedRuntime(
            new Map([[root, page]])
          )
        );

        const result = await discovery.discover(root);

        expect(result.urls).toEqual([
          "https://shop.test/a",
          "https://shop.test/b",
          "https://shop.test/c",
          "https://shop.test/d"
        ]);
        expect(result.passes).toBe(4);
      }
    );

    test(
      "terminates only after two unchanged passes",
      async () => {
        const root = "https://shop.test/category";
        const page = new ScriptedPage([
          snapshot(1000, [link("https://shop.test/a")]),
          snapshot(1000, [link("https://shop.test/a")]),
          snapshot(1000, [link("https://shop.test/a")]),
          snapshot(1000, [link("https://shop.test/a")])
        ]);

        const discovery = new RenderedListingDiscovery(
          new ScriptedRuntime(
            new Map([[root, page]])
          )
        );

        const result = await discovery.discover(root);

        expect(result.passes).toBe(3);
        expect(page.scrollCalls).toBe(2);
        expect(page.waitCalls).toBe(2);
      }
    );

    test(
      "never exceeds the hard cap of eight passes",
      async () => {
        const root = "https://shop.test/category";
        const page = new ScriptedPage(
          Array.from(
            { length: 10 },
            (_, index) =>
              snapshot(
                1000 + index * 100,
                [link(`https://shop.test/item-${index + 1}`)]
              )
          )
        );

        const discovery = new RenderedListingDiscovery(
          new ScriptedRuntime(
            new Map([[root, page]])
          )
        );

        const result = await discovery.discover(root);

        expect(result.passes).toBe(8);
        expect(page.scrollCalls).toBe(7);
        expect(page.waitCalls).toBe(7);
        expect(result.urls).toHaveLength(8);
      }
    );

    test(
      "follows rel-next pagination and keeps pagination links out of candidates",
      async () => {
        const root = "https://shop.test/category";
        const page2 = "https://shop.test/category?page=2";

        const first = new ScriptedPage([
          snapshot(1200, [
            link("https://shop.test/a"),
            link(page2, "next")
          ]),
          snapshot(1200, [
            link("https://shop.test/a"),
            link(page2, "next")
          ]),
          snapshot(1200, [
            link("https://shop.test/a"),
            link(page2, "next")
          ])
        ]);

        const second = new ScriptedPage([
          snapshot(1400, [link("https://shop.test/b")]),
          snapshot(1400, [link("https://shop.test/b")]),
          snapshot(1400, [link("https://shop.test/b")])
        ]);

        const runtime = new ScriptedRuntime(
          new Map([
            [root, first],
            [page2, second]
          ])
        );

        const result = await new RenderedListingDiscovery(runtime)
          .discover(root);

        expect(runtime.opened).toEqual([root, page2]);
        expect(result.urls).toEqual([
          "https://shop.test/a",
          "https://shop.test/b"
        ]);
        expect(result.urls).not.toContain(page2);
        expect(result.passes).toBe(6);
      }
    );

    test(
      "deduplicates normalized URLs across passes",
      async () => {
        const root = "https://shop.test/category";
        const page = new ScriptedPage([
          snapshot(1000, [
            link("https://shop.test/a#details"),
            link("https://shop.test/a"),
            link("https://shop.test/a#reviews")
          ]),
          snapshot(1000, [link("https://shop.test/a")]),
          snapshot(1000, [link("https://shop.test/a")])
        ]);

        const result = await new RenderedListingDiscovery(
          new ScriptedRuntime(
            new Map([[root, page]])
          )
        ).discover(root);

        expect(result.urls).toEqual([
          "https://shop.test/a"
        ]);
      }
    );

    test(
      "does not semantically filter same-site links",
      async () => {
        const root = "https://shop.test/category";
        const page = new ScriptedPage([
          snapshot(1000, [
            link("https://shop.test/blog"),
            link("https://shop.test/support"),
            link("https://shop.test/not-a-camera"),
            link("https://shop.test/camera-x")
          ]),
          snapshot(1000, [
            link("https://shop.test/blog"),
            link("https://shop.test/support"),
            link("https://shop.test/not-a-camera"),
            link("https://shop.test/camera-x")
          ]),
          snapshot(1000, [
            link("https://shop.test/blog"),
            link("https://shop.test/support"),
            link("https://shop.test/not-a-camera"),
            link("https://shop.test/camera-x")
          ])
        ]);

        const result = await new RenderedListingDiscovery(
          new ScriptedRuntime(
            new Map([[root, page]])
          )
        ).discover(root);

        expect(result.urls).toEqual([
          "https://shop.test/blog",
          "https://shop.test/support",
          "https://shop.test/not-a-camera",
          "https://shop.test/camera-x"
        ]);
      }
    );


    test(
      "installs the raw tsx __name shim before discovery callback evaluates",
      async () => {
        const events: string[] = [];
        const rawScripts: string[] = [];
        let callbackEvaluates = 0;

        const page = {
          async goto(): Promise<void> {
            events.push("goto");
          },

          async waitForTimeout(): Promise<void> {},

          async addInitScript(
            script: { readonly content: string }
          ): Promise<void> {
            events.push("addInitScript:raw");
            rawScripts.push(script.content);
          },

          async evaluate(
            input: string | (() => unknown)
          ): Promise<unknown> {
            if (typeof input === "string") {
              events.push("evaluate:raw");
              rawScripts.push(input);
              return undefined;
            }

            callbackEvaluates += 1;
            events.push(
              callbackEvaluates === 1
                ? "evaluate:snapshot"
                : "evaluate:scroll"
            );

            if (callbackEvaluates === 1) {
              return {
                documentHeight: 1000,
                links: []
              };
            }

            return undefined;
          }
        };

        const context = {
          async newPage() {
            return page;
          },
          async close(): Promise<void> {}
        };

        const browser = {
          async newContext() {
            return context;
          },
          isConnected() {
            return true;
          },
          async close(): Promise<void> {}
        };

        playwrightMock.browser = browser;

        const session = await new PlaywrightRenderedListingRuntime({
          settleMs: 0
        }).open("https://shop.test/category");

        await session.snapshot();
        await session.scrollNearBottom();
        await session.close();

        expect(events).toEqual([
          "goto",
          "addInitScript:raw",
          "evaluate:raw",
          "evaluate:snapshot",
          "evaluate:scroll"
        ]);

        expect(rawScripts).toHaveLength(2);
        expect(rawScripts[0]).toBe(rawScripts[1]);
        expect(rawScripts[0]).toContain("globalThis.__name");
      }
    );
  }
);
