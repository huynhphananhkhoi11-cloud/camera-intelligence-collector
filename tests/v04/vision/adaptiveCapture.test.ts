import {
  mkdtemp,
  readFile
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";

import type {
  Page
} from "playwright";

import {
  DEFAULT_CAPTURE_SETTLE_MS,
  DEFAULT_MAX_FINAL_SCREENSHOTS,
  captureAdaptiveVisualEvidence,
  finalizeCaptureStates,
  type CaptureRole
} from "../../../src/v04/vision/adaptiveCapture.js";

import {
  createVisualStateFingerprint,
  type VisualSnapshot
} from "../../../src/v04/vision/visualStateFingerprint.js";


function snapshot(
  name:
    string,
  scrollY:
    number
): VisualSnapshot {
  const bytes =
    Buffer.from(
      name
    );

  return {
    bytes,

    fingerprint:
      createVisualStateFingerprint(
        bytes,
        scrollY,
        4_000
      )
  };
}




class FakeAdaptivePage {
  readonly events:
    Array<
      {
        readonly kind:
          string;

        readonly value?:
          unknown;
      }
    > =
      [];

  private currentUrl =
    "https://example.test/start";


  url() {
    return this.currentUrl;
  }


  async goto(
    url:
      string
  ) {
    this.currentUrl =
      url;

    this.events.push({
      kind:
        "goto",

      value:
        url
    });
  }


  async addInitScript(
    script:
      {
        readonly content:
          string;
      }
  ) {
    this.events.push({
      kind:
        "addInitScript",

      value:
        script.content
    });
  }


  async evaluate(
    expression:
      string |
      ((arg?: unknown) => unknown),
    _arg?:
      unknown
  ) {
    this.events.push({
      kind:
        typeof expression ===
          "string"
          ? "evaluate:raw-string"
          : "evaluate:callback",

      value:
        expression
    });

    if (
      typeof expression ===
        "function" &&
      expression.toString().includes(
        "documentHeight"
      )
    ) {
      return {
        scrollY:
          0,

        documentHeight:
          800,

        viewportHeight:
          800
      };
    }

    return undefined;
  }


  async screenshot() {
    return Buffer.from(
      "same-viewport"
    );
  }


  async waitForTimeout() {
    return;
  }


  locator() {
    return {
      count:
        async () =>
          0
    };
  }
}


describe(
  "V04 adaptive capture",
  () => {

    it(
      "installs and executes the tsx name shim as raw script after navigation before callback evaluate",
      async () => {
        const page =
          new FakeAdaptivePage();

        await captureAdaptiveVisualEvidence(
          page as unknown as Page,
          {
            url:
              "https://example.test/product",

            settleMs:
              0,

            maxScrollStates:
              1,

            stablePassesRequired:
              1,

            maxInteractionCandidates:
              1,

            maxChangedInteractionStates:
              1,

            maxFinalScreenshots:
              1
          }
        );

        const gotoIndex =
          page.events.findIndex(
            event =>
              event.kind ===
              "goto"
          );

        const initIndex =
          page.events.findIndex(
            event =>
              event.kind ===
              "addInitScript"
          );

        const rawIndex =
          page.events.findIndex(
            event =>
              event.kind ===
              "evaluate:raw-string"
          );

        const callbackIndex =
          page.events.findIndex(
            event =>
              event.kind ===
              "evaluate:callback"
          );

        expect(
          gotoIndex
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          initIndex
        ).toBeGreaterThan(
          gotoIndex
        );

        expect(
          rawIndex
        ).toBeGreaterThan(
          initIndex
        );

        expect(
          callbackIndex
        ).toBeGreaterThan(
          rawIndex
        );

        const initScript =
          page.events[initIndex]?.value;

        const rawScript =
          page.events[rawIndex]?.value;

        expect(
          typeof initScript
        ).toBe(
          "string"
        );

        expect(
          rawScript
        ).toBe(
          initScript
        );

        expect(
          String(
            rawScript
          )
        ).toContain(
          "globalThis.__name"
        );
      }
    );


    it(
      "uses the fast capture defaults and keeps only allowed roles",
      () => {
        const allowed:
          readonly CaptureRole[] =
            [
              "hero",
              "viewport",
              "interaction"
            ];

        expect(
          DEFAULT_MAX_FINAL_SCREENSHOTS
        ).toBe(
          6
        );

        expect(
          DEFAULT_CAPTURE_SETTLE_MS
        ).toBe(
          40
        );

        const screenshots =
          finalizeCaptureStates(
            snapshot(
              "hero",
              0
            ),
            Array.from(
              {
                length:
                  7
              },
              (
                _,
                index
              ) =>
                snapshot(
                  "viewport-" +
                  String(
                    index
                  ),
                  (
                    index +
                    1
                  ) *
                  400
                )
            ),
            Array.from(
              {
                length:
                  7
              },
              (
                _,
                index
              ) =>
                snapshot(
                  "interaction-" +
                  String(
                    index
                  ),
                  0
                )
            )
          );

        expect(
          screenshots.length
        ).toBe(
          6
        );

        expect(
          screenshots.every(
            screenshot =>
              allowed.includes(
                screenshot.role
              )
          )
        ).toBe(
          true
        );
      }
    );


    it(
      "preserves hero then viewport then interaction order while exact-deduping hashes",
      () => {
        const hero =
          snapshot(
            "hero",
            0
          );

        const viewportA =
          snapshot(
            "viewport-a",
            800
          );

        const duplicateHero =
          snapshot(
            "hero",
            1_600
          );

        const interactionA =
          snapshot(
            "interaction-a",
            0
          );

        const screenshots =
          finalizeCaptureStates(
            hero,
            [
              viewportA,
              duplicateHero
            ],
            [
              interactionA
            ]
          );

        expect(
          screenshots.map(
            screenshot =>
              screenshot.role
          )
        ).toEqual([
          "hero",
          "viewport",
          "interaction"
        ]);

        expect(
          screenshots.map(
            screenshot =>
              screenshot.fingerprint.imageHash
          )
        ).toEqual([
          hero.fingerprint.imageHash,
          viewportA.fingerprint.imageHash,
          interactionA.fingerprint.imageHash
        ]);
      }
    );

    it(
      "keeps only one viewport screenshot for the same page position when dynamic pixels differ",
      () => {
        const hero =
          snapshot(
            "hero",
            0
          );

        const viewportA =
          snapshot(
            "viewport-dynamic-a",
            1_200
          );

        const viewportB =
          snapshot(
            "viewport-dynamic-b",
            1_200
          );

        const screenshots =
          finalizeCaptureStates(
            hero,
            [
              viewportA,
              viewportB
            ],
            []
          );

        expect(
          screenshots.map(
            screenshot =>
              [
                screenshot.role,
                screenshot.fingerprint.scrollY
              ]
          )
        ).toEqual([
          [
            "hero",
            0
          ],
          [
            "viewport",
            1_200
          ]
        ]);
      }
    );


    it(
      "writes a local capture audit html beside persisted screenshots",
      async () => {
        const page =
          new FakeAdaptivePage();

        const outputDir =
          await mkdtemp(
            join(
              tmpdir(),
              "v04-capture-audit-"
            )
          );

        await captureAdaptiveVisualEvidence(
          page as unknown as Page,
          {
            outputDir,
            url:
              "https://example.test/product",
            settleMs:
              0,
            maxScrollStates:
              1,
            stablePassesRequired:
              1,
            maxInteractionCandidates:
              1,
            maxChangedInteractionStates:
              1,
            maxFinalScreenshots:
              1
          }
        );

        const audit =
          await readFile(
            join(
              outputDir,
              "capture-audit.html"
            ),
            "utf8"
          );

        expect(
          audit
        ).toContain(
          "Capture Audit"
        );

        expect(
          audit
        ).toContain(
          "hero-01.png"
        );

        expect(
          audit
        ).toContain(
          "scrollY=0"
        );
      }
    );

  }
);
