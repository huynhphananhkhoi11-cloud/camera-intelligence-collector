import type {
  Page
} from "playwright";

import {
  captureVisualSnapshot,
  isDuplicateVisualState,
  readVisualMetrics,
  type VisualSnapshot,
  type VisualStateFingerprint
} from "./visualStateFingerprint.js";


export const DEFAULT_MAX_SCROLL_STATES =
  4;

export const DEFAULT_STABLE_PASSES_REQUIRED =
  1;


export const PRIMARY_CONTENT_BOUNDARY_EVALUATE_MARKER =
  "v04-primary-content-boundary";

export const DEFAULT_FOOTER_STOP_COVERAGE =
  0.25;

export const DEFAULT_REPEATED_CARD_STOP_COVERAGE =
  0.55;

export const DEFAULT_REPEATED_CARD_MIN_SCROLL_PROGRESS =
  0.55;


export interface PrimaryContentBoundaryMetrics {
  readonly scrollProgress:
    number;

  readonly footerCoverage:
    number;

  readonly repeatedLinkedCardCoverage:
    number;
}


function finiteUnit(
  value:
    number
): number {
  if (
    !Number.isFinite(
      value
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      value
    )
  );
}


export function shouldStopAtSecondaryBoundary(
  metrics:
    PrimaryContentBoundaryMetrics
): boolean {
  const scrollProgress =
    finiteUnit(
      metrics.scrollProgress
    );

  const footerCoverage =
    finiteUnit(
      metrics.footerCoverage
    );

  const repeatedLinkedCardCoverage =
    finiteUnit(
      metrics.repeatedLinkedCardCoverage
    );

  if (
    footerCoverage >=
      DEFAULT_FOOTER_STOP_COVERAGE
  ) {
    return true;
  }

  return scrollProgress >=
    DEFAULT_REPEATED_CARD_MIN_SCROLL_PROGRESS &&
  repeatedLinkedCardCoverage >=
    DEFAULT_REPEATED_CARD_STOP_COVERAGE;
}


async function readPrimaryContentBoundaryMetrics(
  page:
    Page
): Promise<
  PrimaryContentBoundaryMetrics
> {
  return page.evaluate(
    config => {
      void config.marker;

      const repeatedCardMinScrollProgress =
        config.repeatedCardMinScrollProgress;

      const viewportHeight =
        Math.max(
          1,
          window.innerHeight
        );

      const viewportWidth =
        Math.max(
          1,
          window.innerWidth
        );

      const viewportArea =
        viewportHeight *
        viewportWidth;

      const documentHeight =
        Math.max(
          viewportHeight,
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ??
          0
        );

      const maxScrollY =
        Math.max(
          1,
          documentHeight -
          viewportHeight
        );

      const scrollProgress =
        Math.max(
          0,
          Math.min(
            1,
            window.scrollY /
            maxScrollY
          )
        );

      const visibleArea =
        (element:
          Element): number => {
          const rect =
            element.getBoundingClientRect();

          const width =
            Math.max(
              0,
              Math.min(
                rect.right,
                viewportWidth
              ) -
              Math.max(
                rect.left,
                0
              )
            );

          const height =
            Math.max(
              0,
              Math.min(
                rect.bottom,
                viewportHeight
              ) -
              Math.max(
                rect.top,
                0
              )
            );

          return width *
            height;
        };

      const chrome =
        Array.from(
          document.querySelectorAll(
            "footer,[role='contentinfo']"
          )
        );

      const footerCoverage =
        Math.min(
          1,
          chrome.reduce(
            (maximum, element) =>
              Math.max(
                maximum,
                visibleArea(
                  element
                ) /
                viewportArea
              ),
            0
          )
        );

      const containers =
        scrollProgress >=
          repeatedCardMinScrollProgress
          ? Array.from(
              document.querySelectorAll(
                [
                  "main section",
                  "main ul",
                  "main ol",
                  "article section",
                  "article ul",
                  "article ol",
                  "[role='main'] section",
                  "[role='list']"
                ].join(
                  ","
                )
              )
            )
          : [];

      let repeatedLinkedCardCoverage =
        0;

      for (
        const container
        of containers
      ) {
        const children =
          Array.from(
            container.children
          )
            .filter(
              child =>
                visibleArea(
                  child
                ) >
                0 &&
              child.querySelector(
                "a[href]"
              ) !==
                null &&
              child.querySelector(
                "img"
              ) !==
                null
            );

        if (
          children.length <
            4
        ) {
          continue;
        }

        const coverage =
          Math.min(
            1,
            children.reduce(
              (sum, child) =>
                sum +
                visibleArea(
                  child
                ),
              0
            ) /
            viewportArea
          );

        repeatedLinkedCardCoverage =
          Math.max(
            repeatedLinkedCardCoverage,
            coverage
          );
      }

      return {
        scrollProgress,
        footerCoverage,
        repeatedLinkedCardCoverage
      };
    },
    {
      marker:
        PRIMARY_CONTENT_BOUNDARY_EVALUATE_MARKER,

      repeatedCardMinScrollProgress:
        DEFAULT_REPEATED_CARD_MIN_SCROLL_PROGRESS
    }
  );
}


export interface ScrollExplorerOptions {
  readonly maxScrollStates?:
    number;

  readonly stablePassesRequired?:
    number;

  readonly settleMs?:
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


export async function exploreScrollStates(
  page:
    Page,
  options:
    ScrollExplorerOptions =
      {}
): Promise<
  VisualSnapshot[]
> {
  const maxScrollStates =
    boundedInteger(
      options.maxScrollStates,
      DEFAULT_MAX_SCROLL_STATES,
      DEFAULT_MAX_SCROLL_STATES
    );

  const stablePassesRequired =
    boundedInteger(
      options.stablePassesRequired,
      DEFAULT_STABLE_PASSES_REQUIRED,
      DEFAULT_STABLE_PASSES_REQUIRED
    );

  const settleMs =
    Math.max(
      0,
      options.settleMs ??
      40
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

  let previousMetrics =
    await readVisualMetrics(
      page
    );

  let stablePasses =
    0;

  let attempts =
    0;

  const maxAttempts =
    maxScrollStates +
    stablePassesRequired;


  while (
    states.length <
      maxScrollStates &&
    stablePasses <
      stablePassesRequired &&
    attempts <
      maxAttempts
  ) {
    attempts +=
      1;

    const viewportHeight =
      Math.max(
        1,
        previousMetrics.viewportHeight
      );

    const maxScrollY =
      Math.max(
        0,
        previousMetrics.documentHeight -
        viewportHeight
      );

    const step =
      Math.max(
        viewportHeight,
        Math.ceil(
          maxScrollY /
          maxScrollStates
        )
      );

    const targetY =
      Math.min(
        maxScrollY,
        previousMetrics.scrollY +
        step
      );

    if (
      targetY <=
        previousMetrics.scrollY
    ) {
      stablePasses +=
        1;

      continue;
    }

    await page.evaluate(
      y => {
        window.scrollTo(
          0,
          y
        );
      },
      targetY
    );

    if (
      settleMs >
        0
    ) {
      await page.waitForTimeout(
        settleMs
      );
    }

    const boundaryMetrics =
      await readPrimaryContentBoundaryMetrics(
        page
      );

    if (
      shouldStopAtSecondaryBoundary(
        boundaryMetrics
      )
    ) {
      break;
    }

    const snapshot =
      await captureVisualSnapshot(
        page
      );

    const currentMetrics = {
      scrollY:
        snapshot.fingerprint.scrollY,

      documentHeight:
        snapshot.fingerprint.documentHeight,

      viewportHeight
    };

    const duplicate =
      isDuplicateVisualState(
        snapshot.fingerprint,
        [
          ...prior,
          ...states.map(
            state =>
              state.fingerprint
          )
        ]
      );

    if (
      !duplicate
    ) {
      states.push(
        snapshot
      );
    }

    if (
      currentMetrics.scrollY ===
        previousMetrics.scrollY &&
      currentMetrics.documentHeight ===
        previousMetrics.documentHeight
    ) {
      stablePasses +=
        1;
    } else {
      stablePasses =
        0;
    }

    previousMetrics =
      currentMetrics;
  }


  return states;
}
