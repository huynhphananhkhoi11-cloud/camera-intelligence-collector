import {
  describe,
  expect,
  it
} from "vitest";

import type {
  Page
} from "playwright";

import {
  DEFAULT_INTERACTION_TIMEOUT_MS,
  DEFAULT_MAX_CHANGED_INTERACTION_STATES,
  DEFAULT_MAX_INTERACTION_CANDIDATES,
  INTERACTION_SELECTORS,
  exploreInteractionStates
} from "../../../src/v04/vision/interactionExplorer.js";


interface FakeCandidateInput {
  readonly text:
    string;

  readonly tagName?:
    string;

  readonly role?:
    string |
    null;

  readonly type?:
    string |
    null;

  readonly href?:
    string |
    null;

  readonly formAction?:
    string |
    null;

  readonly submitsForm?:
    boolean;

  readonly ariaExpanded?:
    string |
    null;

  readonly ariaHaspopup?:
    string |
    null;

  readonly inPageChrome?:
    boolean;

  readonly hoverState?:
    string;

  readonly clickState?:
    string;

  readonly visible?:
    boolean;

  readonly enabled?:
    boolean;
}


class FakeInteractionPage {
  visual =
    "base";

  readonly candidates:
    FakeCandidate[];

  requestedSelector =
    "";


  constructor(
    inputs:
      readonly FakeCandidateInput[]
  ) {
    this.candidates =
      inputs.map(
        input =>
          new FakeCandidate(
            this,
            input
          )
      );
  }


  viewportSize() {
    return {
      width:
        1_200,

      height:
        800
    };
  }


  locator(
    selector:
      string
  ) {
    this.requestedSelector =
      selector;

    return {
      count:
        async () =>
          this.candidates.length,

      nth:
        (
          index:
            number
        ) =>
          this.candidates[
            index
          ]
    };
  }


  async evaluate() {
    return {
      scrollY:
        0,

      documentHeight:
        1_600,

      viewportHeight:
        800
    };
  }


  async screenshot() {
    return Buffer.from(
      "visual:" +
      this.visual
    );
  }


  async waitForTimeout() {
    return;
  }
}


class FakeCandidate {
  hoverCount =
    0;

  clickCount =
    0;

  visibleCheckCount =
    0;

  enabledCheckCount =
    0;

  metadataReadCount =
    0;


  constructor(
    private readonly page:
      FakeInteractionPage,
    private readonly input:
      FakeCandidateInput
  ) {}


  async isVisible() {
    this.visibleCheckCount +=
      1;

    return this.input.visible ??
      true;
  }


  async isEnabled() {
    this.enabledCheckCount +=
      1;

    return this.input.enabled ??
      true;
  }


  async scrollIntoViewIfNeeded() {
    return;
  }


  async evaluate() {
    this.metadataReadCount +=
      1;

    return {
      text:
        this.input.text,

      tagName:
        this.input.tagName ??
        "button",

      role:
        this.input.role ??
        null,

      type:
        this.input.type ??
        "button",

      href:
        this.input.href ??
        null,

      formAction:
        this.input.formAction ??
        null,

      submitsForm:
        this.input.submitsForm ??
        false,

      ariaExpanded:
        this.input.ariaExpanded ??
        null,

      ariaHaspopup:
        this.input.ariaHaspopup ??
        null,

      inPageChrome:
        this.input.inPageChrome ??
        false
    };
  }


  async hover() {
    this.hoverCount +=
      1;

    if (
      this.input.hoverState
    ) {
      this.page.visual =
        this.input.hoverState;
    }
  }


  async click() {
    this.clickCount +=
      1;

    if (
      this.input.clickState
    ) {
      this.page.visual =
        this.input.clickState;
    }
  }
}


describe(
  "V04 interaction explorer",
  () => {

    it(
      "freezes exact selectors and shared candidate/state limits",
      () => {
        expect(
          INTERACTION_SELECTORS
        ).toEqual([
          "button",
          "summary",
          "[role='tab']",
          "[role='button']",
          "[aria-expanded]",
          "[aria-haspopup]",
          "[data-toggle]",
          "a[href^='#']"
        ]);

        expect(
          DEFAULT_MAX_INTERACTION_CANDIDATES
        ).toBe(
          8
        );

        expect(
          DEFAULT_MAX_CHANGED_INTERACTION_STATES
        ).toBe(
          2
        );

        expect(
          DEFAULT_INTERACTION_TIMEOUT_MS
        ).toBe(
          500
        );
      }
    );


    it(
      "never inspects a 9th raw matching candidate after the fast budget is exhausted",
      async () => {
        const firstEight =
          Array.from(
            {
              length:
                8
            },
            (_, index) => ({
              text:
                "Buy now " +
                String(
                  index
                )
            })
          );

        const page =
          new FakeInteractionPage([
            ...firstEight,
            {
              text:
                "Candidate 9",

              clickState:
                "candidate-9-clicked"
            }
          ]);

        const states =
          await exploreInteractionStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        const candidate9 =
          page.candidates[8];

        expect(
          candidate9?.visibleCheckCount
        ).toBe(
          0
        );

        expect(
          candidate9?.enabledCheckCount
        ).toBe(
          0
        );

        expect(
          candidate9?.metadataReadCount
        ).toBe(
          0
        );

        expect(
          candidate9?.clickCount
        ).toBe(
          0
        );

        expect(
          states
        ).toEqual([]);
      }
    );


    it(
      "records a hover-changed disclosure state and never clicks that candidate",
      async () => {
        const page =
          new FakeInteractionPage([
            {
              text:
                "Details",

              ariaExpanded:
                "false",

              hoverState:
                "hovered",

              clickState:
                "clicked"
            }
          ]);

        const states =
          await exploreInteractionStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        expect(
          page.candidates[0]?.hoverCount
        ).toBe(
          1
        );

        expect(
          page.candidates[0]?.clickCount
        ).toBe(
          0
        );

        expect(
          states.length
        ).toBe(
          1
        );
      }
    );


    it(
      "clicks a plain safe button without speculative hover",
      async () => {
        const page =
          new FakeInteractionPage([
            {
              text:
                "Show more",

              clickState:
                "clicked"
            }
          ]);

        const states =
          await exploreInteractionStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        expect(
          page.candidates[0]?.hoverCount
        ).toBe(
          0
        );

        expect(
          page.candidates[0]?.clickCount
        ).toBe(
          1
        );

        expect(
          states.length
        ).toBe(
          1
        );
      }
    );


    it(
      "skips controls that would submit a form even without an explicit type attribute",
      async () => {
        const page =
          new FakeInteractionPage([
            {
              text:
                "Continue",

              type:
                null,

              submitsForm:
                true,

              clickState:
                "submitted"
            }
          ]);

        const states =
          await exploreInteractionStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        expect(
          page.candidates[0]?.clickCount
        ).toBe(
          0
        );

        expect(
          states
        ).toEqual([]);
      }
    );


    it(
      "skips safe-looking controls inside header navigation and footer chrome",
      async () => {
        const page =
          new FakeInteractionPage([
            {
              text:
                "Cameras",

              ariaHaspopup:
                "menu",

              inPageChrome:
                true,

              hoverState:
                "mega-menu-open",

              clickState:
                "navigated"
            },
            {
              text:
                "Specifications",

              role:
                "tab",

              clickState:
                "product-tab-open"
            }
          ]);

        const states =
          await exploreInteractionStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        expect(
          page.candidates[0]?.hoverCount
        ).toBe(
          0
        );

        expect(
          page.candidates[0]?.clickCount
        ).toBe(
          0
        );

        expect(
          page.candidates[1]?.clickCount
        ).toBe(
          1
        );

        expect(
          states.length
        ).toBe(
          1
        );
      }
    );


    it(
      "never clicks an unsafe destructive or purchase action",
      async () => {
        const page =
          new FakeInteractionPage([
            {
              text:
                "Buy now",

              clickState:
                "purchased"
            },
            {
              text:
                "Delete account",

              clickState:
                "deleted"
            }
          ]);

        const states =
          await exploreInteractionStates(
            page as unknown as Page,
            {
              settleMs:
                0
            }
          );

        expect(
          page.candidates.map(
            candidate =>
              candidate.clickCount
          )
        ).toEqual([
          0,
          0
        ]);

        expect(
          states
        ).toEqual([]);
      }
    );
  }
);
