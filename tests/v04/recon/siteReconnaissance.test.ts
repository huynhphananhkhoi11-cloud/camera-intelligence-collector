import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page
} from "playwright";

import {
  captureSiteReconnaissance
} from "../../../src/v04/recon/siteReconnaissance.js";


const ROOT_URL =
  "https://recon.example.test/";


async function serve(
  page: Page,
  html: string
): Promise<void> {

  await page.route(
    "https://recon.example.test/**",
    async route => {
      await route.fulfill({
        status:
          200,
        contentType:
          "text/html",
        body:
          html
      });
    }
  );
}


describe(
  "V15 site reconnaissance",
  () => {
    let browser:
      Browser;

    let context:
      BrowserContext;

    let page:
      Page;


    beforeAll(
      async () => {
        browser =
          await chromium.launch({
            headless:
              true
          });

        context =
          await browser.newContext({
            viewport: {
              width:
                1200,
              height:
                800
            }
          });
      }
    );


    beforeEach(
      async () => {
        page =
          await context.newPage();
      }
    );


    afterEach(
      async () => {
        vi.restoreAllMocks();
        await page.close();
      }
    );


    afterAll(
      async () => {
        await browser.close();
      }
    );


    it(
      "survives the known Playwright screenshot timeout through the shared V13.2 reliability path",
      async () => {
        await serve(
          page,
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<nav style="padding:24px"><a href="/catalog">Catalog</a></nav>',
            "</body></html>"
          ].join(
            ""
          )
        );

        const screenshotTimeout =
          new Error(
            "page.screenshot: Timeout 30000ms exceeded while waiting for webfonts"
          );

        screenshotTimeout.name =
          "TimeoutError";

        const rawScreenshot =
          vi.spyOn(
            page,
            "screenshot"
          )
            .mockRejectedValue(
              screenshotTimeout
            );

        const packet =
          await captureSiteReconnaissance(
            page,
            ROOT_URL,
            {
              revealSettleMs:
                0,
              maxInteractiveCandidates:
                0,
              maxRevealShots:
                0
            }
          );

        expect(
          rawScreenshot
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          packet.shots
        ).toHaveLength(
          1
        );

        expect(
          packet.shots[0]?.imageHash
        ).toMatch(
          /^[a-f0-9]{64}$/u
        );

        expect(
          packet.shots[0]?.bytes.length
        ).toBeGreaterThan(
          100
        );
      }
    );


    it(
      "captures the landing viewport and transports every visible navigation candidate without semantic filtering",
      async () => {
        await serve(
          page,
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<nav style="display:flex;gap:20px;padding:24px">',
            '<a href="/cameras">Cameras</a>',
            '<a href="/batteries">Batteries</a>',
            '<a href="/vouchers">Vouchers</a>',
            "</nav>",
            "</body></html>"
          ].join(
            ""
          )
        );

        const packet =
          await captureSiteReconnaissance(
            page,
            ROOT_URL,
            {
              revealSettleMs:
                0,
              maxRevealShots:
                4
            }
          );

        expect(
          packet.rootUrl
        ).toBe(
          ROOT_URL
        );

        expect(
          packet.finalUrl
        ).toBe(
          ROOT_URL
        );

        expect(
          packet.website
        ).toBe(
          "recon.example.test"
        );

        expect(
          packet.shots[0]?.role
        ).toBe(
          "landing"
        );

        expect(
          packet.shots[0]?.bytes.length
        ).toBeGreaterThan(
          100
        );

        expect(
          packet.shots[0]?.imageHash
        ).toMatch(
          /^[a-f0-9]{64}$/u
        );

        expect(
          packet.candidates.map(
            candidate =>
              candidate.label
          )
        ).toEqual([
          "Cameras",
          "Batteries",
          "Vouchers"
        ]);

        expect(
          packet.candidates.map(
            candidate =>
              candidate.url
          )
        ).toEqual([
          "https://recon.example.test/cameras",
          "https://recon.example.test/batteries",
          "https://recon.example.test/vouchers"
        ]);

        expect(
          packet.shots[0]?.visibleCandidateIds
        ).toEqual(
          packet.candidates.map(
            candidate =>
              candidate.candidateId
          )
        );
      }
    );


    it(
      "captures a visually changed hover menu state and maps newly visible links to that shot",
      async () => {
        await serve(
          page,
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<nav style="padding:24px">',
            '<a href="/home">Home</a>',
            '<button id="products" aria-haspopup="menu" ',
            'onmouseenter="document.getElementById(\'menu\').style.display=\'block\'">Products</button>',
            '<div id="menu" role="menu" style="display:none;background:#fff;padding:16px">',
            '<a href="/mirrorless">Mirrorless</a>',
            '<a href="/memory-cards">Memory Cards</a>',
            "</div>",
            "</nav>",
            "</body></html>"
          ].join(
            ""
          )
        );

        const packet =
          await captureSiteReconnaissance(
            page,
            ROOT_URL,
            {
              revealSettleMs:
                0,
              maxRevealShots:
                4
            }
          );

        expect(
          packet.shots.length
        ).toBe(
          2
        );

        expect(
          packet.shots[1]?.role
        ).toBe(
          "navigation-reveal"
        );

        const mirrorless =
          packet.candidates.find(
            candidate =>
              candidate.label ===
                "Mirrorless"
          );

        const memoryCards =
          packet.candidates.find(
            candidate =>
              candidate.label ===
                "Memory Cards"
          );

        expect(
          mirrorless
        ).toBeDefined();

        expect(
          memoryCards
        ).toBeDefined();

        expect(
          packet.shots[1]?.visibleCandidateIds
        ).toContain(
          mirrorless?.candidateId
        );

        expect(
          packet.shots[1]?.visibleCandidateIds
        ).toContain(
          memoryCards?.candidateId
        );
      }
    );


    it(
      "falls back to a safe structural click when hover does not reveal an aria dropdown",
      async () => {
        await serve(
          page,
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<nav style="padding:24px">',
            '<button id="more" type="button" aria-haspopup="menu" aria-expanded="false" ',
            'onclick="this.setAttribute(\'aria-expanded\',\'true\');document.getElementById(\'more-menu\').style.display=\'block\'">More</button>',
            '<div id="more-menu" role="menu" style="display:none;background:#fff;padding:16px">',
            '<a href="/used">Used</a>',
            "</div>",
            "</nav>",
            "</body></html>"
          ].join(
            ""
          )
        );

        const packet =
          await captureSiteReconnaissance(
            page,
            ROOT_URL,
            {
              revealSettleMs:
                0,
              maxRevealShots:
                4
            }
          );

        expect(
          packet.shots.map(
            shot =>
              shot.role
          )
        ).toEqual([
          "landing",
          "navigation-reveal"
        ]);

        expect(
          packet.candidates.some(
            candidate =>
              candidate.url ===
                "https://recon.example.test/used"
          )
        ).toBe(
          true
        );
      }
    );


    it(
      "numbers navigation screenshots sequentially in reveal order without semantic filtering",
      async () => {
        await serve(
          page,
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<nav style="padding:24px">',
            '<a href="/vouchers">Vouchers</a>',
            '<button id="first" aria-haspopup="menu" ',
            'onmouseenter="document.getElementById(\'first-menu\').style.display=\'block\'">First</button>',
            '<div id="first-menu" style="display:none"><a href="/cameras">Cameras</a></div>',
            '<button id="second" aria-haspopup="menu" ',
            'onmouseenter="document.getElementById(\'second-menu\').style.display=\'block\'">Second</button>',
            '<div id="second-menu" style="display:none"><a href="/batteries">Batteries</a></div>',
            "</nav>",
            "</body></html>"
          ].join(
            ""
          )
        );

        const packet =
          await captureSiteReconnaissance(
            page,
            ROOT_URL,
            {
              revealSettleMs:
                0,
              maxRevealShots:
                4
            }
          );

        expect(
          packet.shots.map(
            shot =>
              shot.shotId
          )
        ).toEqual([
          "nav-01",
          "nav-02",
          "nav-03"
        ]);

        expect(
          packet.shots.map(
            shot =>
              shot.role
          )
        ).toEqual([
          "landing",
          "navigation-reveal",
          "navigation-reveal"
        ]);

        expect(
          packet.candidates.map(
            candidate =>
              candidate.label
          )
        ).toEqual([
          "Vouchers",
          "Cameras",
          "Batteries"
        ]);
      }
    );

    it(
      "restores the landing page when a hover interaction unexpectedly navigates",
      async () => {
        await page.route(
          "https://recon.example.test/**",
          async route => {
            const pathname =
              new URL(
                route.request().url()
              ).pathname;

            await route.fulfill({
              status:
                200,
              contentType:
                "text/html",
              body:
                pathname ===
                  "/unexpected"
                  ? '<html><body><a href="/unexpected-only">Unexpected route link</a></body></html>'
                  : [
                      "<!doctype html>",
                      '<html><body style="margin:0">',
                      '<nav style="padding:24px">',
                      '<a href="/home">Home</a>',
                      '<button type="button" aria-haspopup="menu" ',
                      'onmouseenter="window.location.href=\'/unexpected\'">Hover trap</button>',
                      "</nav>",
                      "</body></html>"
                    ].join(
                      ""
                    )
            });
          }
        );

        const packet =
          await captureSiteReconnaissance(
            page,
            ROOT_URL,
            {
              revealSettleMs:
                0,
              maxRevealShots:
                4
            }
          );

        expect(
          packet.finalUrl
        ).toBe(
          ROOT_URL
        );

        expect(
          page.url()
        ).toBe(
          ROOT_URL
        );

        expect(
          packet.candidates.some(
            candidate =>
              candidate.label ===
                "Unexpected route link"
          )
        ).toBe(
          false
        );
      }
    );


    it(
      "does not register candidate transport changes from a visually unchanged discarded state",
      async () => {
        await serve(
          page,
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<nav style="padding:24px">',
            '<a id="stable-link" href="/before">Stable label</a>',
            '<button type="button" aria-haspopup="menu" aria-expanded="false" ',
            'onclick="document.getElementById(\'stable-link\').setAttribute(\'href\',\'/after\')">Reveal</button>',
            "</nav>",
            "</body></html>"
          ].join(
            ""
          )
        );

        const packet =
          await captureSiteReconnaissance(
            page,
            ROOT_URL,
            {
              revealSettleMs:
                0,
              maxRevealShots:
                4
            }
          );

        expect(
          packet.shots
        ).toHaveLength(
          1
        );

        expect(
          packet.candidates.map(
            candidate =>
              candidate.url
          )
        ).toEqual([
          "https://recon.example.test/before"
        ]);
      }
    );


    it(
      "does not add a reveal shot when a structural interaction leaves the viewport unchanged",
      async () => {
        await serve(
          page,
          [
            "<!doctype html>",
            '<html><body style="margin:0">',
            '<nav style="padding:24px">',
            '<a href="/home">Home</a>',
            '<button type="button" aria-haspopup="menu" aria-expanded="false">No-op menu</button>',
            "</nav>",
            "</body></html>"
          ].join(
            ""
          )
        );

        const packet =
          await captureSiteReconnaissance(
            page,
            ROOT_URL,
            {
              revealSettleMs:
                0,
              maxRevealShots:
                4
            }
          );

        expect(
          packet.shots
        ).toHaveLength(
          1
        );

        expect(
          packet.shots[0]?.role
        ).toBe(
          "landing"
        );
      }
    );
  }
);
