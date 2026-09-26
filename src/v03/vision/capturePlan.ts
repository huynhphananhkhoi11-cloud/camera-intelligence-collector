export type CaptureRole =
  | "hero"
  | "commerce"
  | "specs"
  | "reviews"
  | "extra";

export type CaptureResolution =
  | "high"
  | "medium";


export interface CaptureSectionCandidate {
  readonly selector:
    string |
    null;

  readonly label:
    string;

  readonly text:
    string;

  readonly y:
    number;

  readonly height:
    number;

  readonly visible:
    boolean;

  readonly kindHint?:
    CaptureRole |
    null;
}


export interface CapturePlanShot {
  readonly shotId:
    string;

  readonly role:
    CaptureRole;

  readonly sectionLabel:
    string;

  readonly selector:
    string |
    null;

  readonly resolution:
    CaptureResolution;

  readonly scrollY:
    number;
}


export interface CapturePlanInput {
  readonly hero?:
    CaptureSectionCandidate |
    null;

  readonly sections:
    readonly CaptureSectionCandidate[];

  readonly maxShots?:
    number;
}


const RELATED_PATTERN =
  /(?:san\s*pham\s*lien\s*quan|co\s*the\s*ban\s*thich|khach\s*hang\s*(?:cung|thuong)\s*mua|thuong\s*mua\s*kem|mua\s*them|related\s*products?|you\s*may\s*also\s*like|recommended\s*products?|similar\s*products?|customers?\s*also\s*(?:buy|viewed?))/iu;

const COMMERCE_PATTERN =
  /(?:gia\s*thue|dich\s*vu\s*thue|dieu\s*kien\s*thue|rental|rent\s*per\s*day|accessor(?:y|ies)|phu\s*kien|trong\s*hop|in\s*the\s*box|combo|bundle|kit\b|availability|ton\s*kho|con\s*hang|het\s*hang|cua\s*hang)/iu;

const SPECS_PATTERN =
  /(?:thong\s*so|thong\s*tin\s*noi\s*bat|dac\s*diem\s*noi\s*bat|cau\s*hinh|chi\s*tiet|mo\s*ta|spec(?:ification)?s?|description|features?)/iu;

const REVIEWS_PATTERN =
  /(?:danh\s*gia|nhan\s*xet|binh\s*luan|review|rating|ratings)/iu;


function normalizeText(
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
      /[^a-z0-9]+/giu,
      " "
    )
    .replace(
      /\s+/gu,
      " "
    )
    .trim()
    .toLowerCase();
}


function candidateText(
  candidate:
    CaptureSectionCandidate
): string {

  return normalizeText(
    [
      candidate.label,
      candidate.text
    ].join(
      " "
    )
  );
}


export function classifyCaptureSection(
  candidate:
    CaptureSectionCandidate
):
  Exclude<
    CaptureRole,
    "hero"
  > |
  null {

  const text =
    candidateText(
      candidate
    );


  if (
    RELATED_PATTERN.test(
      text
    )
  ) {
    return null;
  }


  if (
    candidate.kindHint &&
    candidate.kindHint !==
      "hero"
  ) {
    return candidate.kindHint;
  }


  if (
    COMMERCE_PATTERN.test(
      text
    )
  ) {
    return "commerce";
  }


  if (
    REVIEWS_PATTERN.test(
      text
    )
  ) {
    return "reviews";
  }


  if (
    SPECS_PATTERN.test(
      text
    )
  ) {
    return "specs";
  }


  return "extra";
}


function finiteNumber(
  value:
    number,
  fallback:
    number
): number {

  return Number.isFinite(
    value
  )
    ? value
    : fallback;
}


function maxShotsFor(
  requested:
    number |
    undefined
): number {

  const value =
    requested ??
    6;

  return Math.max(
    1,
    Math.min(
      6,
      Math.floor(
        Number.isFinite(
          value
        )
          ? value
          : 6
      )
    )
  );
}


function candidateKey(
  candidate:
    CaptureSectionCandidate
): string {

  return candidate.selector
    ? "selector:" +
        candidate.selector
    : [
        "fallback",
        normalizeText(
          candidate.label
        ),
        String(
          Math.round(
            finiteNumber(
              candidate.y,
              0
            )
          )
        )
      ].join(
        ":"
      );
}


function sortCandidates(
  values:
    readonly CaptureSectionCandidate[]
): CaptureSectionCandidate[] {

  return [
    ...values
  ].sort(
    (
      left,
      right
    ) => {

      if (
        left.visible !==
        right.visible
      ) {
        return left.visible
          ? -1
          : 1;
      }


      const leftY =
        finiteNumber(
          left.y,
          Number.MAX_SAFE_INTEGER
        );

      const rightY =
        finiteNumber(
          right.y,
          Number.MAX_SAFE_INTEGER
        );


      if (
        leftY !==
        rightY
      ) {
        return (
          leftY -
          rightY
        );
      }


      return candidateKey(
        left
      ).localeCompare(
        candidateKey(
          right
        )
      );
    }
  );
}


function shotFromCandidate(
  shotId:
    string,
  role:
    CaptureRole,
  candidate:
    CaptureSectionCandidate
): CapturePlanShot {

  return {
    shotId,

    role,

    sectionLabel:
      candidate.label.trim() ||
      role,

    selector:
      candidate.selector,

    resolution:
      role ===
        "reviews" ||
      role ===
        "extra"
        ? "medium"
        : "high",

    scrollY:
      Math.max(
        0,
        finiteNumber(
          candidate.y,
          0
        )
      )
  };
}


function fallbackHero(): CaptureSectionCandidate {

  return {
    selector:
      null,

    label:
      "Product hero / top viewport",

    text:
      "",

    y:
      0,

    height:
      0,

    visible:
      true,

    kindHint:
      "hero"
  };
}


export function buildCapturePlan(
  input:
    CapturePlanInput
): CapturePlanShot[] {

  const maxShots =
    maxShotsFor(
      input.maxShots
    );

  const hero =
    input.hero ??
    fallbackHero();

  const classified =
    input.sections
      .map(
        candidate => ({
          candidate,

          role:
            classifyCaptureSection(
              candidate
            )
        })
      )
      .filter(
        (
          value
        ): value is {
          readonly candidate:
            CaptureSectionCandidate;

          readonly role:
            Exclude<
              CaptureRole,
              "hero"
            >;
        } =>
          value.role !==
          null
      );


  const used =
    new Set<
      string
    >();

  const plan:
    CapturePlanShot[] =
      [];


  const add =
    (
      shotId:
        string,
      role:
        CaptureRole,
      candidate:
        CaptureSectionCandidate
    ): void => {

      if (
        plan.length >=
        maxShots
      ) {
        return;
      }


      const key =
        candidateKey(
          candidate
        );


      if (
        used.has(
          key
        )
      ) {
        return;
      }


      used.add(
        key
      );

      plan.push(
        shotFromCandidate(
          shotId,
          role,
          candidate
        )
      );
    };


  add(
    "hero-01",
    "hero",
    hero
  );


  const primaryRoles:
    readonly Exclude<
      CaptureRole,
      "hero" |
      "extra"
    >[] =
      [
        "commerce",
        "specs",
        "reviews"
      ];


  const primaryShotIds:
    Readonly<
      Record<
        Exclude<
          CaptureRole,
          "hero" |
          "extra"
        >,
        string
      >
    > = {
      commerce:
        "commerce-02",

      specs:
        "specs-03",

      reviews:
        "reviews-04"
    };


  for (
    const role
    of primaryRoles
  ) {

    const winner =
      sortCandidates(
        classified
          .filter(
            item =>
              item.role ===
              role
          )
          .map(
            item =>
              item.candidate
          )
      )[0];


    if (
      winner
    ) {
      add(
        primaryShotIds[
          role
        ],
        role,
        winner
      );
    }
  }


  const remaining =
    sortCandidates(
      classified
        .map(
          item =>
            item.candidate
        )
        .filter(
          candidate =>
            !used.has(
              candidateKey(
                candidate
              )
            )
        )
    );


  let extraIndex =
    5;


  for (
    const candidate
    of remaining
  ) {

    if (
      plan.length >=
      maxShots
    ) {
      break;
    }


    add(
      "extra-" +
        String(
          extraIndex
        ).padStart(
          2,
          "0"
        ),
      "extra",
      candidate
    );

    extraIndex +=
      1;
  }


  if (
    plan.length ===
      1 &&
    maxShots >=
      2
  ) {

    const continuationY =
      Math.max(
        640,
        finiteNumber(
          hero.y,
          0
        ) +
        Math.max(
          640,
          finiteNumber(
            hero.height,
            0
          )
        )
      );

    add(
      "extra-05",
      "extra",
      {
        selector:
          null,

        label:
          "Product page continuation",

        text:
          "",

        y:
          continuationY,

        height:
          0,

        visible:
          true,

        kindHint:
          "extra"
      }
    );
  }


  return plan;
}
