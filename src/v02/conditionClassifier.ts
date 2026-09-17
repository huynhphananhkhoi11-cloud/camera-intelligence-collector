export type ItemCondition =
  | "NEW"
  | "USED"
  | "REFURBISHED"
  | "DAMAGED"
  | "UNKNOWN";

export type ConditionEvidenceSource =
  | "JSON_LD"
  | "TITLE"
  | "DETAIL"
  | "CATEGORY"
  | "BREADCRUMB";

export interface ConditionEvidence {
  condition: Exclude<ItemCondition, "UNKNOWN">;
  source: ConditionEvidenceSource;
  text: string;
  weight: number;
}

export interface ConditionInput {
  title?: string;
  category?: string;
  breadcrumbs?: string[];
  pageText?: string;
  jsonLdItemConditions?: string[];
}

export interface ConditionResult {
  condition: ItemCondition;

  confidence:
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  newScore: number;
  usedScore: number;
  refurbishedScore: number;
  damagedScore: number;

  conflict: boolean;

  evidence: ConditionEvidence[];
}

function norm(
  value: unknown
): string {

  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function add(
  evidence: ConditionEvidence[],
  condition: Exclude<
    ItemCondition,
    "UNKNOWN"
  >,
  source: ConditionEvidenceSource,
  text: string,
  weight: number
): void {

  evidence.push({
    condition,
    source,
    text,
    weight
  });
}

export function classifyCondition(
  input: ConditionInput
): ConditionResult {

  const evidence:
    ConditionEvidence[] = [];

  const title =
    norm(input.title);

  const category =
    norm(input.category);

  const pageText =
    norm(input.pageText);

  const breadcrumbs =
    (input.breadcrumbs ?? [])
      .map(norm)
      .filter(Boolean);

  const structured =
    (
      input.jsonLdItemConditions ??
      []
    )
      .map(norm)
      .filter(Boolean);

  let newScore = 0;
  let usedScore = 0;
  let refurbishedScore = 0;
  let damagedScore = 0;

  /*
   * ==========================================
   * 1. JSON-LD itemCondition
   * ==========================================
   *
   * Strongest evidence because the website
   * explicitly states structured condition.
   */

  for (
    const value
    of structured
  ) {

    if (
      /newcondition/
        .test(value)
    ) {

      newScore += 100;

      add(
        evidence,
        "NEW",
        "JSON_LD",
        value,
        100
      );
    }

    if (
      /usedcondition/
        .test(value)
    ) {

      usedScore += 100;

      add(
        evidence,
        "USED",
        "JSON_LD",
        value,
        100
      );
    }

    if (
      /refurbishedcondition/
        .test(value)
    ) {

      refurbishedScore +=
        100;

      add(
        evidence,
        "REFURBISHED",
        "JSON_LD",
        value,
        100
      );
    }

    if (
      /damagedcondition/
        .test(value)
    ) {

      damagedScore += 100;

      add(
        evidence,
        "DAMAGED",
        "JSON_LD",
        value,
        100
      );
    }
  }

  /*
   * ==========================================
   * 2. TITLE
   * ==========================================
   */

  if (
    /\b(hang cu|may cu|da qua su dung|second hand|second-hand|used)\b/
      .test(title)
  ) {

    usedScore += 90;

    add(
      evidence,
      "USED",
      "TITLE",
      title,
      90
    );
  }

  /*
   * Vietnamese used-camera stores frequently
   * use 99%, 98%... as condition indicators.
   *
   * Percentage alone is supporting evidence,
   * not universal proof.
   */
  if (
    /(?:^|[\s(-])(9[0-9]|8[5-9])%(?:[\s)-]|$)/
      .test(title)
  ) {

    usedScore += 55;

    add(
      evidence,
      "USED",
      "TITLE",
      "used-condition percentage",
      55
    );
  }

  /*
   * NEW-condition title evidence.
   *
   * Do NOT use \b after "%" because "%" is not a
   * JavaScript word character. A word boundary does
   * not exist between "%" and end-of-string / space.
   *
   * Examples that must match:
   *   NEW 100%
   *   (NEW 100%)
   *   MỚI 100%
   *   HÀNG MỚI
   *   BRAND NEW
   */
  const explicitNewPercentage =
    /\b(?:new|moi)\s*100%(?![\p{L}\p{N}_])/u
      .test(title);

  const explicitNewWords =
    /\b(?:hang moi|brand new)\b/
      .test(title);

  if (
    explicitNewPercentage ||
    explicitNewWords
  ) {

    newScore += 90;

    add(
      evidence,
      "NEW",
      "TITLE",
      title,
      90
    );
  }

  if (
    /\b(refurbished|tan trang|hang tan trang)\b/
      .test(title)
  ) {

    refurbishedScore +=
      95;

    add(
      evidence,
      "REFURBISHED",
      "TITLE",
      title,
      95
    );
  }

  if (
    /\b(damaged|hang hong|bi hong|hang loi nang)\b/
      .test(title)
  ) {

    damagedScore += 95;

    add(
      evidence,
      "DAMAGED",
      "TITLE",
      title,
      95
    );
  }

  /*
   * ==========================================
   * 3. EXPLICIT DETAIL-PAGE CONDITION
   * ==========================================
   */

  const usedDetailPatterns = [
    /tinh trang\s*[:：-]?\s*(?:hang\s*)?cu\b/,
    /phan loai hang\s*[:：-]?\s*(?:hang\s*)?cu\b/,
    /da qua su dung/,
    /tinh trang\s*[:：-]?\s*used\b/
  ];

  if (
    usedDetailPatterns.some(
      pattern =>
        pattern.test(pageText)
    )
  ) {

    usedScore += 75;

    add(
      evidence,
      "USED",
      "DETAIL",
      "explicit used condition",
      75
    );
  }

  const newDetailPatterns = [
    /tinh trang\s*[:：-]?\s*(?:hang\s*)?moi\b/,
    /phan loai hang\s*[:：-]?\s*(?:hang\s*)?moi\b/,
    /tinh trang\s*[:：-]?\s*new\b/,
    /new\s*100%/,
    /moi\s*100%/
  ];

  if (
    newDetailPatterns.some(
      pattern =>
        pattern.test(pageText)
    )
  ) {

    newScore += 75;

    add(
      evidence,
      "NEW",
      "DETAIL",
      "explicit new condition",
      75
    );
  }

  if (
    /\b(refurbished|tan trang)\b/
      .test(pageText)
  ) {

    refurbishedScore +=
      75;

    add(
      evidence,
      "REFURBISHED",
      "DETAIL",
      "refurbished detail evidence",
      75
    );
  }

  if (
    /\b(damaged|hang hong|bi hong|hang loi nang)\b/
      .test(pageText)
  ) {

    damagedScore += 75;

    add(
      evidence,
      "DAMAGED",
      "DETAIL",
      "damaged detail evidence",
      75
    );
  }

  /*
   * ==========================================
   * 4. CATEGORY / BREADCRUMB
   * ==========================================
   *
   * Supporting evidence only.
   */

  const navigationText =
    `${category} ${
      breadcrumbs.join(" ")
    }`;

  if (
    /\b(may anh cu|hang cu|used camera|second hand)\b/
      .test(navigationText)
  ) {

    usedScore += 35;

    add(
      evidence,
      "USED",
      "CATEGORY",
      navigationText,
      35
    );
  }

  if (
    /\b(may anh moi|new camera)\b/
      .test(navigationText)
  ) {

    newScore += 35;

    add(
      evidence,
      "NEW",
      "CATEGORY",
      navigationText,
      35
    );
  }

  /*
   * "Chính hãng" means authenticity /
   * official distribution, not necessarily
   * physical condition.
   *
   * Therefore this is deliberately weak.
   */
  if (
    /\bchinh hang\b/
      .test(navigationText) &&
    !/\bcu\b|\bused\b|second hand/
      .test(navigationText)
  ) {

    newScore += 15;

    add(
      evidence,
      "NEW",
      "CATEGORY",
      "chinh hang",
      15
    );
  }

  /*
   * ==========================================
   * 5. RANK SCORES
   * ==========================================
   */

  const scores = [
    {
      condition:
        "NEW" as const,
      score:
        newScore
    },
    {
      condition:
        "USED" as const,
      score:
        usedScore
    },
    {
      condition:
        "REFURBISHED" as const,
      score:
        refurbishedScore
    },
    {
      condition:
        "DAMAGED" as const,
      score:
        damagedScore
    }
  ]
    .sort(
      (a, b) =>
        b.score -
        a.score
    );

  const top =
    scores[0];

  const second =
    scores[1];

  /*
   * ==========================================
   * 6. CONFLICT DETECTION
   * ==========================================
   *
   * Example:
   *
   * title = NEW 100%
   * detail = Tình trạng: hàng cũ
   *
   * Never guess.
   */

  const conflict =
    top.score >= 60 &&
    second.score >= 60 &&
    Math.abs(
      top.score -
      second.score
    ) < 40;

  if (
    conflict
  ) {

    return {
      condition:
        "UNKNOWN",

      confidence:
        "LOW",

      newScore,
      usedScore,
      refurbishedScore,
      damagedScore,

      conflict:
        true,

      evidence
    };
  }

  /*
   * ==========================================
   * 7. FINAL DECISION
   * ==========================================
   */

  if (
    top.score < 60
  ) {

    return {
      condition:
        "UNKNOWN",

      confidence:
        "LOW",

      newScore,
      usedScore,
      refurbishedScore,
      damagedScore,

      conflict:
        false,

      evidence
    };
  }

  return {
    condition:
      top.condition,

    confidence:
      top.score >= 90
        ? "HIGH"
        : "MEDIUM",

    newScore,
    usedScore,
    refurbishedScore,
    damagedScore,

    conflict:
      false,

    evidence
  };
}

