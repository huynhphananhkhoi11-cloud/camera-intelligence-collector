import type {
  Page
} from "playwright";

import type {
  EvidencePacket
} from "../ai/evidenceTypes.js";


export interface ProductRegionMatch {
  readonly selector:
    string;

  readonly score:
    number;

  readonly box: {
    readonly x:
      number;

    readonly y:
      number;

    readonly width:
      number;

    readonly height:
      number;
  };
}


interface RawCandidate {
  readonly selector:
    string;

  readonly selectorOrder:
    number;

  readonly text:
    string;

  readonly navFooterRatio:
    number;

  readonly viewportArea:
    number;

  readonly box: {
    readonly x:
      number;

    readonly y:
      number;

    readonly width:
      number;

    readonly height:
      number;
  };
}


const PRODUCT_REGION_SELECTORS =
  [
    '[itemtype*="schema.org/Product"]',
    '[data-testid*="product" i]',
    "[data-product-id]",
    "[data-product]",
    'main [class*="product-detail" i]',
    '[class*="product" i]',
    '[id*="product" i]',
    '[class*="detail" i]',
    '[id*="detail" i]',
    "main article",
    "main",
    "article",
    "section"
  ] as const;


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


function identityCoreTokens(
  productIdentity:
    string
): string[] {

  return normalizeText(
    productIdentity
  )
    .split(
      " "
    )
    .filter(
      token =>
        token.length >=
          2
    )
    .slice(
      0,
      12
    );
}


function selectedControlCues(
  packet:
    EvidencePacket
): string[] {

  const cues =
    new Set<
      string
    >();


  for (
    const control
    of packet.selectedControls
  ) {

    const raw =
      normalizeText(
        control.rawValue
      );


    if (
      raw.length >=
        3
    ) {
      cues.add(
        raw
      );
    }


    const parts =
      control.rawValue
        .split(
          "|"
        )
        .map(
          part =>
            normalizeText(
              part
            )
        )
        .filter(
          part =>
            part.length >=
              3
        );


    const selectedValue =
      parts.at(
        -1
      );


    if (
      selectedValue
    ) {
      cues.add(
        selectedValue
      );
    }
  }


  return Array.from(
    cues
  );
}


function containsIdentity(
  text:
    string,
  tokens:
    readonly string[]
): boolean {

  if (
    tokens.length ===
      0
  ) {
    return false;
  }


  return tokens.every(
    token =>
      text.includes(
        token
      )
  );
}


function containsSelectedControl(
  text:
    string,
  cues:
    readonly string[]
): boolean {

  return cues.some(
    cue =>
      text.includes(
        cue
      )
  );
}


function containsPriceCue(
  rawText:
    string
): boolean {

  return (
    /(?:\bvnd\b|\busd\b|\beur\b|₫|đ|\bprice\b|\bgiá\b)/iu.test(
      rawText
    ) ||
    /(?:^|[^\d])\d{1,3}(?:[.,]\d{3}){1,3}(?:[^\d]|$)/u.test(
      rawText
    )
  );
}


function selectorSpecificity(
  selector:
    string
): number {

  return /(?:product|detail|schema\.org)/iu.test(
    selector
  )
    ? 2
    : 0;
}


function scoreCandidate(
  candidate:
    RawCandidate,
  identityTokens:
    readonly string[],
  selectedCues:
    readonly string[]
): number {

  const normalized =
    normalizeText(
      candidate.text
    );

  let score =
    selectorSpecificity(
      candidate.selector
    );


  if (
    containsIdentity(
      normalized,
      identityTokens
    )
  ) {
    score +=
      4;
  }


  if (
    containsSelectedControl(
      normalized,
      selectedCues
    )
  ) {
    score +=
      3;
  }


  if (
    containsPriceCue(
      candidate.text
    )
  ) {
    score +=
      2;
  }


  const area =
    candidate.box.width *
    candidate.box.height;


  if (
    candidate.viewportArea >
      0 &&
    area /
      candidate.viewportArea >
      0.9
  ) {
    score -=
      2;
  }


  if (
    candidate.navFooterRatio >=
      0.55
  ) {
    score -=
      3;
  }


  return score;
}


async function collectCandidates(
  page:
    Page
): Promise<
  RawCandidate[]
> {

  return page.evaluate(
    (
      selectors:
        readonly string[]
    ) => {

      const normalize =
        (
          value:
            string |
            null |
            undefined
        ): string =>
          (
            value ??
            ""
          )
            .replace(
              /\s+/gu,
              " "
            )
            .trim();

      const viewportWidth =
        Math.max(
          1,
          window.innerWidth
        );

      const viewportHeight =
        Math.max(
          1,
          window.innerHeight
        );

      const viewportArea =
        viewportWidth *
        viewportHeight;

      const seen =
        new Set<
          Element
        >();

      const candidates:
        RawCandidate[] =
          [];


      selectors.forEach(
        (
          selector,
          selectorOrder
        ) => {

          for (
            const element
            of Array.from(
              document.querySelectorAll(
                selector
              )
            )
          ) {

            if (
              seen.has(
                element
              )
            ) {
              continue;
            }


            seen.add(
              element
            );


            const rect =
              element.getBoundingClientRect();

            const visibleLeft =
              Math.max(
                0,
                rect.left
              );

            const visibleTop =
              Math.max(
                0,
                rect.top
              );

            const visibleRight =
              Math.min(
                viewportWidth,
                rect.right
              );

            const visibleBottom =
              Math.min(
                viewportHeight,
                rect.bottom
              );

            const width =
              Math.floor(
                visibleRight -
                visibleLeft
              );

            const height =
              Math.floor(
                visibleBottom -
                visibleTop
              );


            if (
              width <
                180 ||
              height <
                100
            ) {
              continue;
            }


            const text =
              normalize(
                (
                  element as
                    HTMLElement
                ).innerText ??
                element.textContent
              )
                .slice(
                  0,
                  4_000
                );

            const boilerplateText =
              normalize(
                Array.from(
                  element.querySelectorAll(
                    "nav, footer, header"
                  )
                )
                  .map(
                    node =>
                      (
                        node as
                          HTMLElement
                      ).innerText ??
                      node.textContent ??
                      ""
                  )
                  .join(
                    " "
                  )
              );

            const navFooterRatio =
              text.length >
                0
                ? Math.min(
                    1,
                    boilerplateText.length /
                      text.length
                  )
                : 0;


            candidates.push({
              selector,
              selectorOrder,
              text,
              navFooterRatio,
              viewportArea,

              box: {
                x:
                  window.scrollX +
                  visibleLeft,

                y:
                  window.scrollY +
                  visibleTop,

                width,

                height
              }
            });
          }
        }
      );


      return candidates;
    },
    PRODUCT_REGION_SELECTORS
  );
}


export async function detectProductRegion(
  page:
    Page,
  sourcePacket:
    EvidencePacket
): Promise<
  ProductRegionMatch |
  null
> {

  const identityTokens =
    identityCoreTokens(
      sourcePacket.productIdentity
    );

  const selectedCues =
    selectedControlCues(
      sourcePacket
    );

  const candidates =
    await collectCandidates(
      page
    );

  const scored =
    candidates
      .map(
        candidate => ({
          candidate,

          score:
            scoreCandidate(
              candidate,
              identityTokens,
              selectedCues
            )
        })
      )
      .filter(
        value =>
          value.score >=
            5
      )
      .sort(
        (
          left,
          right
        ) => {

          if (
            left.score !==
              right.score
          ) {
            return (
              right.score -
              left.score
            );
          }


          const leftArea =
            left.candidate
              .box.width *
            left.candidate
              .box.height;

          const rightArea =
            right.candidate
              .box.width *
            right.candidate
              .box.height;


          if (
            leftArea !==
              rightArea
          ) {
            return (
              leftArea -
              rightArea
            );
          }


          return (
            left.candidate
              .selectorOrder -
            right.candidate
              .selectorOrder
          );
        }
      );

  const winner =
    scored[0];


  if (
    !winner
  ) {
    return null;
  }


  return {
    selector:
      winner.candidate
        .selector,

    score:
      winner.score,

    box:
      winner.candidate
        .box
  };
}
