import type {
  Locator,
  Page
} from "playwright";

import {
  captureVisualSnapshot,
  isDuplicateVisualState,
  type VisualSnapshot,
  type VisualStateFingerprint
} from "./visualStateFingerprint.js";


export const INTERACTION_SELECTORS =
  [
    "button",
    "summary",
    "[role='tab']",
    "[role='button']",
    "[aria-expanded]",
    "[aria-haspopup]",
    "[data-toggle]",
    "a[href^='#']"
  ] as const;

export const DEFAULT_MAX_INTERACTION_CANDIDATES =
  8;

export const DEFAULT_MAX_CHANGED_INTERACTION_STATES =
  2;

export const DEFAULT_INTERACTION_TIMEOUT_MS =
  500;

export const UNSAFE_ACTION_PATTERN =
  /\b(?:buy|buy now|checkout|pay|payment|place order|order now|add to cart|delete|remove account|logout|log out|sign out|mua ngay|thanh toan|dat hang|them vao gio|xoa|dang xuat)\b/iu;


interface InteractionCandidateMetadata {
  readonly text:
    string;

  readonly tagName:
    string;

  readonly role:
    string |
    null;

  readonly type:
    string |
    null;

  readonly href:
    string |
    null;

  readonly formAction:
    string |
    null;

  readonly submitsForm:
    boolean;

  readonly ariaExpanded:
    string |
    null;

  readonly ariaHaspopup:
    string |
    null;

  readonly inPageChrome:
    boolean;
}


interface SafeCandidate {
  readonly locator:
    Locator;

  readonly metadata:
    InteractionCandidateMetadata;
}


export interface InteractionExplorerOptions {
  readonly maxInteractionCandidates?:
    number;

  readonly maxChangedInteractionStates?:
    number;

  readonly settleMs?:
    number;

  readonly interactionTimeoutMs?:
    number;

  readonly priorFingerprints?:
    readonly VisualStateFingerprint[];
}


function boundedInteger(
  value:
    number |
    undefined,
  fallback:
    number,
  maximum:
    number
): number {
  if (
    value ===
      undefined ||
    !Number.isFinite(
      value
    )
  ) {
    return fallback;
  }

  return Math.max(
    1,
    Math.min(
      maximum,
      Math.floor(
        value
      )
    )
  );
}


function normalizeSafetyText(
  value:
    string
): string {
  return value
    .normalize(
      "NFD"
    )
    .replace(
      /\p{M}+/gu,
      ""
    )
    .replace(
      /đ/giu,
      "d"
    )
    .replace(
      /\s+/gu,
      " "
    )
    .trim();
}


function unsafeHumanAction(
  text:
    string
): boolean {
  return UNSAFE_ACTION_PATTERN.test(
    text
  ) ||
  UNSAFE_ACTION_PATTERN.test(
    normalizeSafetyText(
      text
    )
  );
}


function isStructurallyHoverable(
  metadata:
    InteractionCandidateMetadata
): boolean {
  return metadata.tagName ===
    "summary" ||
  metadata.role ===
    "tab" ||
  metadata.ariaExpanded !==
    null ||
  metadata.ariaHaspopup !==
    null;
}


function isSafeCandidate(
  metadata:
    InteractionCandidateMetadata
): boolean {
  if (
    metadata.inPageChrome
  ) {
    return false;
  }

  if (
    unsafeHumanAction(
      metadata.text
    )
  ) {
    return false;
  }

  if (
    metadata.type?.toLowerCase() ===
      "submit"
  ) {
    return false;
  }

  if (
    metadata.formAction !==
      null ||
    metadata.submitsForm
  ) {
    return false;
  }

  if (
    metadata.href !==
      null &&
    metadata.href.length >
      0 &&
    !metadata.href.startsWith(
      "#"
    )
  ) {
    return false;
  }

  return true;
}


async function candidateMetadata(
  locator:
    Locator
): Promise<
  InteractionCandidateMetadata
> {
  return locator.evaluate(
    element => {
      const html =
        element as HTMLElement;

      return {
        text:
          (
            html.innerText ??
            element.textContent ??
            ""
          )
            .replace(
              /\s+/gu,
              " "
            )
            .trim()
            .slice(
              0,
              300
            ),

        tagName:
          element.tagName
            .toLowerCase(),

        role:
          element.getAttribute(
            "role"
          ),

        type:
          element.getAttribute(
            "type"
          ),

        href:
          element.getAttribute(
            "href"
          ),

        formAction:
          element.getAttribute(
            "formaction"
          ),

        submitsForm:
          (
            element.tagName
              .toLowerCase() ===
              "button" &&
            Boolean(
              (
                element as HTMLButtonElement
              ).form
            ) &&
            (
              element.getAttribute(
                "type"
              ) ===
                null ||
              element.getAttribute(
                "type"
              )?.toLowerCase() ===
                "submit"
            )
          ) ||
          (
            element.tagName
              .toLowerCase() ===
              "input" &&
            Boolean(
              (
                element as HTMLInputElement
              ).form
            ) &&
            [
              "submit",
              "image"
            ].includes(
              (
                element.getAttribute(
                  "type"
                ) ??
                "text"
              ).toLowerCase()
            )
          ),

        ariaExpanded:
          element.getAttribute(
            "aria-expanded"
          ),

        ariaHaspopup:
          element.getAttribute(
            "aria-haspopup"
          ),

        inPageChrome:
          Boolean(
            element.closest(
              [
                "header",
                "nav",
                "footer",
                "[role='navigation']",
                "[role='banner']",
                "[role='contentinfo']"
              ].join(
                ","
              )
            )
          )
      };
    }
  );
}


async function collectSafeCandidates(
  page:
    Page,
  maximum:
    number
): Promise<
  SafeCandidate[]
> {
  const collection =
    page.locator(
      INTERACTION_SELECTORS.join(
        ","
      )
    );

  const count =
    Math.min(
      DEFAULT_MAX_INTERACTION_CANDIDATES,
      maximum,
      await collection.count()
    );

  const safe:
    SafeCandidate[] =
      [];

  for (
    let index =
      0;
    index <
      count;
    index +=
      1
  ) {
    const locator =
      collection.nth(
        index
      );

    const visible =
      await locator.isVisible()
        .catch(
          () =>
            false
        );

    if (
      !visible
    ) {
      continue;
    }

    const enabled =
      await locator.isEnabled()
        .catch(
          () =>
            false
        );

    if (
      !enabled
    ) {
      continue;
    }

    const metadata =
      await candidateMetadata(
        locator
      )
        .catch(
          () =>
            null
        );

    if (
      !metadata ||
      !isSafeCandidate(
        metadata
      )
    ) {
      continue;
    }

    safe.push({
      locator,
      metadata
    });
  }

  return safe;
}


function changedFrom(
  before:
    VisualStateFingerprint,
  after:
    VisualStateFingerprint
): boolean {
  return before.imageHash !==
    after.imageHash;
}


export async function exploreInteractionStates(
  page:
    Page,
  options:
    InteractionExplorerOptions =
      {}
): Promise<
  VisualSnapshot[]
> {
  const maxInteractionCandidates =
    boundedInteger(
      options.maxInteractionCandidates,
      DEFAULT_MAX_INTERACTION_CANDIDATES,
      DEFAULT_MAX_INTERACTION_CANDIDATES
    );

  const maxChangedInteractionStates =
    boundedInteger(
      options.maxChangedInteractionStates,
      DEFAULT_MAX_CHANGED_INTERACTION_STATES,
      DEFAULT_MAX_CHANGED_INTERACTION_STATES
    );

  const settleMs =
    Math.max(
      0,
      options.settleMs ??
      80
    );

  const interactionTimeoutMs =
    Math.max(
      100,
      options.interactionTimeoutMs ??
      DEFAULT_INTERACTION_TIMEOUT_MS
    );

  const candidates =
    await collectSafeCandidates(
      page,
      maxInteractionCandidates
    );

  const states:
    VisualSnapshot[] =
      [];

  const prior:
    VisualStateFingerprint[] =
      [
        ...(
          options.priorFingerprints ??
          []
        )
      ];


  for (
    const candidate
    of candidates
  ) {
    if (
      states.length >=
        maxChangedInteractionStates
    ) {
      break;
    }

    try {
      await candidate.locator.scrollIntoViewIfNeeded({
        timeout:
          interactionTimeoutMs
      });
    } catch {
      continue;
    }

    if (
      settleMs >
        0
    ) {
      await page.waitForTimeout(
        settleMs
      );
    }

    const before =
      await captureVisualSnapshot(
        page
      );

    if (
      isStructurallyHoverable(
        candidate.metadata
      )
    ) {
      try {
        await candidate.locator.hover({
          timeout:
            interactionTimeoutMs
        });
      } catch {
        continue;
      }

      if (
        settleMs >
          0
      ) {
        await page.waitForTimeout(
          settleMs
        );
      }

      const afterHover =
        await captureVisualSnapshot(
          page
        );

      if (
        changedFrom(
          before.fingerprint,
          afterHover.fingerprint
        )
      ) {
        if (
          !isDuplicateVisualState(
            afterHover.fingerprint,
            [
              ...prior,
              ...states.map(
                state =>
                  state.fingerprint
              )
            ]
          )
        ) {
          states.push(
            afterHover
          );
        }

        // Contract: hover-changed candidates are never clicked.
        continue;
      }
    }

    try {
      await candidate.locator.click({
        timeout:
          interactionTimeoutMs
      });
    } catch {
      continue;
    }

    if (
      settleMs >
        0
    ) {
      await page.waitForTimeout(
        settleMs
      );
    }

    const afterClick =
      await captureVisualSnapshot(
        page
      );

    if (
      !changedFrom(
        before.fingerprint,
        afterClick.fingerprint
      )
    ) {
      continue;
    }

    if (
      !isDuplicateVisualState(
        afterClick.fingerprint,
        [
          ...prior,
          ...states.map(
            state =>
              state.fingerprint
          )
        ]
      )
    ) {
      states.push(
        afterClick
      );
    }
  }


  return states.slice(
    0,
    maxChangedInteractionStates
  );
}
