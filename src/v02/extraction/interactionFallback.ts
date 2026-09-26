import type {
  Locator,
  Page
} from "playwright";

import type {
  InteractionEvent,
  InteractionKind
} from "./detailAcquisitionTypes.js";

import {
  extractRawProductFactsFromHtml
} from "../rawProductExtractor.js";

const DEFAULT_MAX_INTERACTIONS =
  4;

const DEFAULT_MAX_CANDIDATES_PER_ROLE =
  16;

const DEFAULT_ACTION_TIMEOUT_MS =
  1_500;

const DEFAULT_MUTATION_TIMEOUT_MS =
  500;

const DEFAULT_POLL_INTERVAL_MS =
  50;

export interface InteractionFallbackOptions {
  maxInteractions?: number;

  maxCandidatesPerRole?: number;

  actionTimeoutMs?: number;

  mutationTimeoutMs?: number;

  pollIntervalMs?: number;

  now?: () => Date;
}

export interface InteractionFallbackResult {
  html: string;

  interactions:
    InteractionEvent[];
}

type SupportedRole =
  | "tab"
  | "button";

interface CandidateControl {
  role:
    SupportedRole;

  locator:
    Locator;

  label:
    string;
}

const RELEVANT_CONTROL_PATTERN =
  /(^| )(thong so|specification|specifications|specs|chi tiet|detail|details|mo ta|description|dac diem|features|phu kien|accessories|dieu kien|condition|conditions|review|reviews|danh gia|stock|availability|ton kho|xem them|show more|load more|more details)( |$)/i;

const LOAD_MORE_PATTERN =
  /(xem them|show more|load more|more details)/i;

function cleanText(
  value: unknown
): string {
  return String(
    value || ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function normalizeText(
  value: string
): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /đ/g,
      "d"
    );
}

function errorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  return String(error);
}

function relevantLabel(
  label: string
): boolean {
  return RELEVANT_CONTROL_PATTERN
    .test(
      normalizeText(label)
    );
}

function interactionKind(
  role: SupportedRole,
  label: string,
  ariaExpanded:
    string | null
): InteractionKind {
  const normalized =
    normalizeText(label);

  if (role === "tab") {
    return "TAB";
  }

  if (
    LOAD_MORE_PATTERN.test(
      normalized
    )
  ) {
    return "LOAD_MORE";
  }

  if (
    ariaExpanded !== null
  ) {
    return "ACCORDION";
  }

  return "CLICK";
}

/**
 * Interaction is fallback only.
 *
 * It is allowed when semantic evidence is still sparse.
 * This function does not classify or resolve business values.
 */
export function shouldAttemptInteractionFallback(
  html: string,
  url: string
): boolean {
  if (!html.trim()) {
    return false;
  }

  const facts =
    extractRawProductFactsFromHtml(
      html,
      url
    );

  const titleMissing =
    !facts.title.trim();

  const sectionsMissing =
    facts.sections.length === 0;

  const commerceEvidenceMissing =
    (
      facts.visiblePriceTexts
        .length === 0 &&
      facts.buttons.length === 0
    );

  return (
    titleMissing ||
    sectionsMissing ||
    commerceEvidenceMissing
  );
}

async function safeLabel(
  locator: Locator
): Promise<string> {
  try {
    return cleanText(
      await locator.innerText()
    );
  }
  catch {
    return "";
  }
}

async function collectRoleCandidates(
  page: Page,
  role: SupportedRole,
  maxCandidates:
    number
): Promise<CandidateControl[]> {
  const getByRole =
    (
      page as unknown as {
        getByRole?: unknown;
      }
    ).getByRole;

  /*
   * Real Playwright pages always have getByRole.
   * This guard also keeps lightweight test doubles safe.
   */
  if (
    typeof getByRole !==
      "function"
  ) {
    return [];
  }

  const collection =
    page.getByRole(role);

  let count =
    0;

  try {
    count =
      await collection.count();
  }
  catch {
    return [];
  }

  const limit =
    Math.min(
      Math.max(
        0,
        maxCandidates
      ),
      count
    );

  const output:
    CandidateControl[] = [];

  for (
    let index = 0;
    index < limit;
    index += 1
  ) {
    const locator =
      collection.nth(index);

    const label =
      await safeLabel(
        locator
      );

    if (
      !label ||
      !relevantLabel(label)
    ) {
      continue;
    }

    output.push({
      role,
      locator,
      label
    });
  }

  return output;
}

async function isActionable(
  locator: Locator
): Promise<boolean> {
  try {
    const visible =
      await locator.isVisible();

    if (!visible) {
      return false;
    }

    return await locator
      .isEnabled();
  }
  catch {
    return false;
  }
}

async function waitForHtmlChange(
  page: Page,
  beforeHtml: string,
  timeoutMs: number,
  pollIntervalMs:
    number
): Promise<{
  html: string;
  changed: boolean;
}> {
  /*
   * Check synchronously first.
   * Many accordion/tab expansions update DOM during click().
   */
  try {
    const immediate =
      await page.content();

    if (
      immediate !==
      beforeHtml
    ) {
      return {
        html: immediate,
        changed: true
      };
    }
  }
  catch {
    return {
      html:
        beforeHtml,
      changed:
        false
    };
  }

  if (timeoutMs <= 0) {
    return {
      html:
        beforeHtml,
      changed:
        false
    };
  }

  const startedAt =
    Date.now();

  const pollMs =
    Math.max(
      10,
      pollIntervalMs
    );

  let lastHtml =
    beforeHtml;

  while (
    Date.now() -
      startedAt <
    timeoutMs
  ) {
    const remaining =
      timeoutMs -
      (
        Date.now() -
        startedAt
      );

    if (remaining <= 0) {
      break;
    }

    try {
      await page.waitForTimeout(
        Math.min(
          pollMs,
          remaining
        )
      );

      lastHtml =
        await page.content();
    }
    catch {
      break;
    }

    if (
      lastHtml !==
      beforeHtml
    ) {
      return {
        html:
          lastHtml,

        changed:
          true
      };
    }
  }

  return {
    html:
      lastHtml,

    changed:
      false
  };
}

export async function runInteractionFallback(
  page: Page,
  initialHtml: string,
  url: string,
  options:
    InteractionFallbackOptions = {}
): Promise<InteractionFallbackResult> {
  if (
    !shouldAttemptInteractionFallback(
      initialHtml,
      url
    )
  ) {
    return {
      html:
        initialHtml,

      interactions:
        []
    };
  }

  const maxInteractions =
    Math.max(
      0,
      options.maxInteractions ===
        undefined
        ? DEFAULT_MAX_INTERACTIONS
        : options.maxInteractions
    );

  if (maxInteractions === 0) {
    return {
      html:
        initialHtml,

      interactions:
        []
    };
  }

  const maxCandidatesPerRole =
    Math.max(
      0,
      options.maxCandidatesPerRole ===
        undefined
        ? DEFAULT_MAX_CANDIDATES_PER_ROLE
        : options.maxCandidatesPerRole
    );

  const actionTimeoutMs =
    Math.max(
      0,
      options.actionTimeoutMs ===
        undefined
        ? DEFAULT_ACTION_TIMEOUT_MS
        : options.actionTimeoutMs
    );

  const mutationTimeoutMs =
    Math.max(
      0,
      options.mutationTimeoutMs ===
        undefined
        ? DEFAULT_MUTATION_TIMEOUT_MS
        : options.mutationTimeoutMs
    );

  const pollIntervalMs =
    Math.max(
      10,
      options.pollIntervalMs ===
        undefined
        ? DEFAULT_POLL_INTERVAL_MS
        : options.pollIntervalMs
    );

  const now =
    options.now ||
    (() => new Date());

  const tabCandidates =
    await collectRoleCandidates(
      page,
      "tab",
      maxCandidatesPerRole
    );

  const buttonCandidates =
    await collectRoleCandidates(
      page,
      "button",
      maxCandidatesPerRole
    );

  const candidates = [
    ...tabCandidates,
    ...buttonCandidates
  ];

  const seen =
    new Set<string>();

  const interactions:
    InteractionEvent[] = [];

  let currentHtml =
    initialHtml;

  for (
    const candidate
    of candidates
  ) {
    if (
      interactions.length >=
      maxInteractions
    ) {
      break;
    }

    const identity =
      candidate.role +
      ":" +
      normalizeText(
        candidate.label
      );

    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);

    if (
      !await isActionable(
        candidate.locator
      )
    ) {
      continue;
    }

    let ariaExpanded:
      string | null =
      null;

    try {
      ariaExpanded =
        await candidate.locator
          .getAttribute(
            "aria-expanded"
          );
    }
    catch {
      ariaExpanded =
        null;
    }

    const kind =
      interactionKind(
        candidate.role,
        candidate.label,
        ariaExpanded
      );

    const startedAt =
      now().toISOString();

    try {
      const beforeHtml =
        currentHtml;

      await candidate.locator
        .click({
          timeout:
            actionTimeoutMs
        });

      const changed =
        await waitForHtmlChange(
          page,
          beforeHtml,
          mutationTimeoutMs,
          pollIntervalMs
        );

      currentHtml =
        changed.html;

      interactions.push({
        kind,

        target:
          candidate.label,

        outcome:
          changed.changed
            ? "SUCCESS"
            : "NO_CHANGE",

        startedAt,

        finishedAt:
          now().toISOString(),

        detail:
          changed.changed
            ? "Rendered DOM changed after interaction."
            : "No rendered DOM change observed within bounded settle."
      });

      /*
       * Re-evaluate after every successful reveal.
       * Stop as soon as fallback is no longer necessary.
       */
      if (
        changed.changed &&
        !shouldAttemptInteractionFallback(
          currentHtml,
          url
        )
      ) {
        break;
      }
    }
    catch (error) {
      interactions.push({
        kind,

        target:
          candidate.label,

        outcome:
          "ERROR",

        startedAt,

        finishedAt:
          now().toISOString(),

        detail:
          errorMessage(
            error
          )
      });
    }
  }

  return {
    html:
      currentHtml,

    interactions
  };
}