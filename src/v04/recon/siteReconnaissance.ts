import {
  createHash
} from "node:crypto";

import type {
  Locator,
  Page
} from "playwright";

import type {
  NavigationCandidate,
  NavigationVisualShot,
  SiteReconnaissancePacket
} from "../contracts/v15PipelineContracts.js";

import {
  captureVisualSnapshot
} from "../vision/visualStateFingerprint.js";


export interface SiteReconnaissanceOptions {
  readonly navigationTimeoutMs?:
    number;

  readonly interactionTimeoutMs?:
    number;

  readonly revealSettleMs?:
    number;

  readonly maxInteractiveCandidates?:
    number;

  readonly maxRevealShots?:
    number;
}


interface ObservedCandidate {
  readonly label:
    string;

  readonly url:
    string;
}


interface CapturedVisualState {
  readonly bytes:
    Buffer;

  readonly imageHash:
    string;

  readonly observedCandidates:
    readonly ObservedCandidate[];
}



const REVEAL_TRIGGER_SELECTOR =
  [
    "nav a",
    "nav button",
    "header a",
    "header button",
    "[role='navigation'] a",
    "[role='navigation'] button",
    "[role='menuitem']",
    "[aria-haspopup]",
    "[aria-expanded]"
  ].join(
    ","
  );


function sha256(
  value:
    Buffer |
    string
): string {

  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}


function navigationCandidateId(
  candidate:
    ObservedCandidate
): string {

  return (
    "nav_" +
    sha256(
      candidate.label +
      "\n" +
      candidate.url
    ).slice(
      0,
      24
    )
  );
}


async function discoverVisibleCandidates(
  page:
    Page
): Promise<readonly ObservedCandidate[]> {

  return page.evaluate(
    () => {
      const visible =
        (
          element:
            Element
        ): boolean => {

          const rect =
            element.getBoundingClientRect();

          if (
            rect.width <=
              0 ||
            rect.height <=
              0 ||
            rect.bottom <=
              0 ||
            rect.right <=
              0 ||
            rect.top >=
              window.innerHeight ||
            rect.left >=
              window.innerWidth
          ) {
            return false;
          }

          const style =
            getComputedStyle(
              element
            );

          return (
            style.display !==
              "none" &&
            style.visibility !==
              "hidden" &&
            Number(
              style.opacity
            ) >
              0.02
          );
        };

      const normalizeLabel =
        (
          value:
            string
        ): string =>
          value
            .replace(
              /\s+/gu,
              " "
            )
            .trim()
            .slice(
              0,
              240
            );

      const output:
        ObservedCandidate[] =
          [];

      for (
        const element
        of Array.from(
          document.querySelectorAll(
            "a[href]"
          )
        ).slice(
          0,
          240
        )
      ) {
        if (
          !visible(
            element
          )
        ) {
          continue;
        }

        const anchor =
          element as HTMLAnchorElement;

        let parsed:
          URL;

        try {
          parsed =
            new URL(
              anchor.href,
              document.baseURI
            );
        } catch {
          continue;
        }

        if (
          parsed.protocol !==
            "http:" &&
          parsed.protocol !==
            "https:"
        ) {
          continue;
        }

        const imageAlt =
          element.querySelector(
            "img[alt]"
          )?.getAttribute(
            "alt"
          ) ??
          "";

        const html =
          element as HTMLElement;

        const label =
          [
            element.getAttribute(
              "aria-label"
            ),
            html.innerText,
            element.getAttribute(
              "title"
            ),
            imageAlt
          ]
            .map(
              value =>
                normalizeLabel(
                  value ??
                  ""
                )
            )
            .find(
              value =>
                value.length >
                  0
            ) ??
          parsed.href;

        output.push({
          label,
          url:
            parsed.href
        });
      }

      return output;
    }
  );
}


function registerVisibleCandidates(
  observed:
    readonly ObservedCandidate[],
  candidatesById:
    Map<
      string,
      NavigationCandidate
    >
): readonly string[] {

  const visibleCandidateIds:
    string[] =
      [];

  const seenInShot =
    new Set<string>();

  for (
    const item
    of observed
  ) {
    const candidateId =
      navigationCandidateId(
        item
      );

    if (
      !candidatesById.has(
        candidateId
      )
    ) {
      candidatesById.set(
        candidateId,
        {
          candidateId,
          label:
            item.label,
          url:
            item.url
        }
      );
    }

    if (
      !seenInShot.has(
        candidateId
      )
    ) {
      seenInShot.add(
        candidateId
      );

      visibleCandidateIds.push(
        candidateId
      );
    }
  }

  return visibleCandidateIds;
}


function hasNewVisibleCandidate(
  observed:
    readonly ObservedCandidate[],
  candidatesById:
    ReadonlyMap<
      string,
      NavigationCandidate
    >
): boolean {
  return observed.some(
    candidate =>
      !candidatesById.has(
        navigationCandidateId(
          candidate
        )
      )
  );
}


async function normalizeStructuralClickState(
  page:
    Page
): Promise<void> {
  await page.mouse.move(
    0,
    0
  );

  await page.evaluate(
    () => {
      const active =
        document.activeElement;

      if (
        active instanceof
          HTMLElement
      ) {
        active.blur();
      }
    }
  );
}


async function restoreReconnaissanceUrl(
  page:
    Page,
  expectedUrl:
    string,
  navigationTimeoutMs:
    number
): Promise<boolean> {
  if (
    page.url() ===
      expectedUrl
  ) {
    return false;
  }

  await page.goto(
    expectedUrl,
    {
      waitUntil:
        "domcontentloaded",
      timeout:
        navigationTimeoutMs
    }
  );

  return true;
}


async function captureVisualState(
  page:
    Page
): Promise<CapturedVisualState> {

  const snapshot =
    await captureVisualSnapshot(
      page
    );

  return {
    bytes:
      snapshot.bytes,
    imageHash:
      snapshot.fingerprint.imageHash,
    observedCandidates:
      await discoverVisibleCandidates(
        page
      )
  };
}


function materializeShot(
  state:
    CapturedVisualState,
  role:
    NavigationVisualShot["role"],
  sequence:
    number,
  candidatesById:
    Map<
      string,
      NavigationCandidate
    >
): NavigationVisualShot {

  return {
    shotId:
      "nav-" +
      String(
        sequence
      ).padStart(
        2,
        "0"
      ),
    role,
    bytes:
      state.bytes,
    imageHash:
      state.imageHash,
    visibleCandidateIds:
      registerVisibleCandidates(
        state.observedCandidates,
        candidatesById
      )
  };
}


async function maySafelyClickRevealTrigger(
  trigger:
    Locator
): Promise<boolean> {

  const [
    href,
    ariaHasPopup,
    ariaExpanded,
    type
  ] =
    await Promise.all([
      trigger.getAttribute(
        "href"
      ),
      trigger.getAttribute(
        "aria-haspopup"
      ),
      trigger.getAttribute(
        "aria-expanded"
      ),
      trigger.getAttribute(
        "type"
      )
    ]);

  if (
    href !==
      null
  ) {
    return false;
  }

  if (
    ariaHasPopup ===
      null &&
    ariaExpanded ===
      null
  ) {
    return false;
  }

  return (
    type ===
      null ||
    type.toLowerCase() !==
      "submit"
  );
}


async function settleReveal(
  page:
    Page,
  revealSettleMs:
    number
): Promise<void> {
  await page.waitForTimeout(
    Math.max(
      0,
      revealSettleMs
    )
  );
}


export async function captureSiteReconnaissance(
  page:
    Page,
  rootUrl:
    string,
  options:
    SiteReconnaissanceOptions =
      {}
): Promise<SiteReconnaissancePacket> {

  const navigationTimeoutMs =
    options.navigationTimeoutMs ??
    30_000;

  const interactionTimeoutMs =
    options.interactionTimeoutMs ??
    2_000;

  const revealSettleMs =
    options.revealSettleMs ??
    120;

  const maxInteractiveCandidates =
    Math.max(
      0,
      options.maxInteractiveCandidates ??
      60
    );

  const maxRevealShots =
    Math.max(
      0,
      options.maxRevealShots ??
      8
    );

  await page.goto(
    rootUrl,
    {
      waitUntil:
        "domcontentloaded",
      timeout:
        navigationTimeoutMs
    }
  );

  const finalUrl =
    page.url();

  const website =
    new URL(
      finalUrl
    ).hostname;

  const candidatesById =
    new Map<
      string,
      NavigationCandidate
    >();

  const shots:
    NavigationVisualShot[] =
      [];

  const seenImageHashes =
    new Set<string>();

  const landingState =
    await captureVisualState(
      page
    );

  const landing =
    materializeShot(
      landingState,
      "landing",
      1,
      candidatesById
    );

  shots.push(
    landing
  );

  seenImageHashes.add(
    landing.imageHash
  );

  const triggers =
    page.locator(
      REVEAL_TRIGGER_SELECTOR
    );

  const triggerCount =
    Math.min(
      maxInteractiveCandidates,
      await triggers.count()
    );

  for (
    let index =
      0;
    index <
      triggerCount &&
    shots.length <=
      maxRevealShots;
    index +=
      1
  ) {
    const trigger =
      triggers.nth(
        index
      );

    if (
      !await trigger.isVisible()
        .catch(
          () =>
            false
        )
    ) {
      continue;
    }

    let revealAdded =
      false;

    try {
      const beforeHoverUrl =
        page.url();

      await trigger.hover({
        timeout:
          interactionTimeoutMs
      });

      await settleReveal(
        page,
        revealSettleMs
      );

      if (
        page.url() !==
          beforeHoverUrl
      ) {
        await restoreReconnaissanceUrl(
          page,
          finalUrl,
          navigationTimeoutMs
        );

        continue;
      }

      const hoveredState =
        await captureVisualState(
          page
        );

      if (
        await restoreReconnaissanceUrl(
          page,
          finalUrl,
          navigationTimeoutMs
        )
      ) {
        continue;
      }

      if (
        !seenImageHashes.has(
          hoveredState.imageHash
        ) &&
        hasNewVisibleCandidate(
          hoveredState.observedCandidates,
          candidatesById
        )
      ) {
        const hovered =
          materializeShot(
            hoveredState,
            "navigation-reveal",
            shots.length +
              1,
            candidatesById
          );

        shots.push(
          hovered
        );

        seenImageHashes.add(
          hovered.imageHash
        );

        revealAdded =
          true;
      }
    } catch {
      // Best effort only: individual structural candidates may disappear while menus change.
      await restoreReconnaissanceUrl(
        page,
        finalUrl,
        navigationTimeoutMs
      ).catch(
        () =>
          false
      );
    }

    if (
      shots.length >
        maxRevealShots
    ) {
      break;
    }

    if (
      revealAdded ||
      !await maySafelyClickRevealTrigger(
        trigger
      ).catch(
        () =>
          false
      )
    ) {
      continue;
    }

    try {
      const beforeUrl =
        page.url();

      await trigger.click({
        timeout:
          interactionTimeoutMs
      });

      await settleReveal(
        page,
        revealSettleMs
      );

      if (
        page.url() !==
          beforeUrl
      ) {
        await restoreReconnaissanceUrl(
          page,
          finalUrl,
          navigationTimeoutMs
        );

        continue;
      }

      await normalizeStructuralClickState(
        page
      );

      const clickedState =
        await captureVisualState(
          page
        );

      if (
        await restoreReconnaissanceUrl(
          page,
          finalUrl,
          navigationTimeoutMs
        )
      ) {
        continue;
      }

      if (
        !seenImageHashes.has(
          clickedState.imageHash
        ) &&
        hasNewVisibleCandidate(
          clickedState.observedCandidates,
          candidatesById
        )
      ) {
        const clicked =
          materializeShot(
            clickedState,
            "navigation-reveal",
            shots.length +
              1,
            candidatesById
          );

        shots.push(
          clicked
        );

        seenImageHashes.add(
          clicked.imageHash
        );
      }
    } catch {
      // Best effort only: one failed reveal must not abort the reconnaissance packet.
      await restoreReconnaissanceUrl(
        page,
        finalUrl,
        navigationTimeoutMs
      ).catch(
        () =>
          false
      );
    }
  }

  await restoreReconnaissanceUrl(
    page,
    finalUrl,
    navigationTimeoutMs
  );

  return {
    website,
    rootUrl,
    finalUrl,
    candidates:
      Array.from(
        candidatesById.values()
      ),
    shots
  };
}
