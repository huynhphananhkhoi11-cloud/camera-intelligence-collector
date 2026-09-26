import {
  describe,
  expect,
  it
} from "vitest";

import type {
  Page
} from "playwright";

import {
  DEFAULT_MAX_SCROLL_STATES,
  DEFAULT_STABLE_PASSES_REQUIRED,
  exploreScrollStates
} from "../../../src/v04/vision/scrollExplorer.js";


class FakeScrollPage {
  scrollY =
    0;

  documentHeight =
    2_400;

  readonly viewportHeight =
    800;

  readonly scrollTargets:
    number[] =
      [];


  viewportSize() {
    return {
      width:
        1_200,

      height:
        this.viewportHeight
    };
  }


  async evaluate(
    _fn:
      unknown,
    arg?:
      unknown
  ) {
    if (
      typeof arg ===
        "number"
    ) {
      this.scrollY =
        Math.max(
          0,
          Math.min(
            arg,
            this.documentHeight -
            this.viewportHeight
          )
        );

      this.scrollTargets.push(
        this.scrollY
      );

      return;
    }

    return {
      scrollY:
        this.scrollY,

      documentHeight:
        this.documentHeight,

      viewportHeight:
        this.viewportHeight
    };
  }


  async screenshot() {
    return Buffer.from(
      "scroll-state:" +
      String(
        this.scrollY
      )
    );
  }


  async waitForTimeout() {
    return;
  }
}


class SecondaryBoundaryScrollPage extends FakeScrollPage {
  boundaryAtY =
    Number.POSITIVE_INFINITY;

  repeatedCardAtY =
    Number.POSITIVE_INFINITY;

  boundaryEvaluateArgs:
    unknown[] = [];


  async evaluate(
    fn:
      unknown,
    arg?:
      unknown
  ) {
    const boundaryMarker =
      typeof arg ===
        "string"
        ? arg
        : arg !==
              null &&
            typeof arg ===
              "object" &&
            "marker" in arg
          ? (
              arg as {
                readonly marker?:
                  unknown;
              }
            ).marker
          : null;

    if (
      boundaryMarker ===
        "v04-primary-content-boundary"
    ) {
      this.boundaryEvaluateArgs.push(
        arg
      );
      const maxScrollY =
        Math.max(
          1,
          this.documentHeight -
          this.viewportHeight
        );

      return {
        scrollProgress:
          this.scrollY /
          maxScrollY,

        footerCoverage:
          this.scrollY >=
            this.boundaryAtY
            ? 0.45
            : 0,

        repeatedLinkedCardCoverage:
          this.scrollY >=
            this.repeatedCardAtY
            ? 0.70
            : 0
      };
    }

    return super.evaluate(
      fn,
      arg
    );
  }
}


class ChangingBottomScrollPage extends FakeScrollPage {
  screenshotCalls =
    0;


  async screenshot() {
    this.screenshotCalls +=
      1;

    return Buffer.from(
      "changing-scroll-state:" +
      String(
        this.scrollY
      ) +
      ":" +
      String(
        this.screenshotCalls
      )
    );
  }
}


describe(
  "V04 scroll explorer",
  () => {

    it(
      "uses the fast 4-state and 1-stable-pass defaults",
      () => {
        expect(
          DEFAULT_MAX_SCROLL_STATES
        ).toBe(
          4
        );

        expect(
          DEFAULT_STABLE_PASSES_REQUIRED
        ).toBe(
          1
        );
      }
    );


    it(
      "iteratively explores viewports and stops after one unchanged bottom pass",
      async () => {
        const page =
          new FakeScrollPage();

        const states =
          await exploreScrollStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        expect(
          states.length
        ).toBeLessThanOrEqual(
          4
        );

        expect(
          states.map(
            state =>
              state.fingerprint.scrollY
          )
        ).toContain(
          1_600
        );

        expect(
          page.scrollTargets.at(
            -1
          )
        ).toBe(
          1_600
        );
      }
    );
    it(
      "samples a long page across its full height within the fast scroll budget",
      async () => {
        const page =
          new FakeScrollPage();

        page.documentHeight =
          10_000;

        const states =
          await exploreScrollStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        expect(
          states.length
        ).toBeLessThanOrEqual(
          4
        );

        expect(
          page.scrollTargets.length
        ).toBeLessThanOrEqual(
          5
        );

        expect(
          page.scrollTargets.at(
            -1
          )
        ).toBe(
          9_200
        );
      }
    );


    it(
      "never records two viewport states at the same scroll position even when pixels change",
      async () => {
        const page =
          new ChangingBottomScrollPage();

        const states =
          await exploreScrollStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        const positions =
          states.map(
            state =>
              state.fingerprint.scrollY
          );

        expect(
          new Set(
            positions
          ).size
        ).toBe(
          positions.length
        );

        expect(
          positions
        ).toEqual([
          800,
          1_600
        ]);
      }
    );


    it(
      "passes smart-stop browser thresholds through page.evaluate arguments",
      async () => {
        const page =
          new SecondaryBoundaryScrollPage();

        page.documentHeight =
          10_000;

        await exploreScrollStates(
          page as unknown as Page,
          {
            settleMs:
              0
          }
        );

        expect(
          page.boundaryEvaluateArgs[0]
        ).toEqual({
          marker:
            "v04-primary-content-boundary",

          repeatedCardMinScrollProgress:
            0.55
        });
      }
    );


    it(
      "stops before a footer-dominated late viewport is captured",
      async () => {
        const page =
          new SecondaryBoundaryScrollPage();

        page.documentHeight =
          10_000;

        page.boundaryAtY =
          9_000;

        const states =
          await exploreScrollStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        expect(
          states.map(
            state =>
              state.fingerprint.scrollY
          )
        ).toEqual([
          2_300,
          4_600,
          6_900
        ]);

        expect(
          page.scrollTargets.at(-1)
        ).toBe(
          9_200
        );
      }
    );


    it(
      "stops before a late repeated linked-card viewport is captured",
      async () => {
        const page =
          new SecondaryBoundaryScrollPage();

        page.documentHeight =
          10_000;

        page.repeatedCardAtY =
          6_500;

        const states =
          await exploreScrollStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        expect(
          states.map(
            state =>
              state.fingerprint.scrollY
          )
        ).toEqual([
          2_300,
          4_600
        ]);

        expect(
          page.scrollTargets.at(-1)
        ).toBe(
          6_900
        );
      }
    );

  }
);
