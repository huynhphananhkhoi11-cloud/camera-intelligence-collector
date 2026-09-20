import {
  createHash
} from "node:crypto";

import type {
  Page
} from "playwright";

import type {
  EvidenceItem,
  EvidencePacket
} from "../ai/evidenceTypes.js";

import type {
  ProductRegionScreenshot,
  VisionEvidenceItem,
  VisionEvidencePacket
} from "./visionEvidenceTypes.js";


import {
  detectProductRegion
} from "./productRegionDetector.js";


const MAX_COMPACT_DOM_EVIDENCE =
  24;

const MAX_SELECTED_CONTROLS =
  18;

const MAX_STRUCTURED_FACTS =
  18;

const SCREENSHOT_STYLE =
  [
    "#__camintel_agent_overlay,",
    "[id*=\"coupon\" i],",
    "[class*=\"coupon\" i],",
    "[id*=\"voucher\" i],",
    "[class*=\"voucher\" i],",
    "[id*=\"newsletter\" i],",
    "[class*=\"newsletter\" i],",
    "[id*=\"subscribe\" i],",
    "[class*=\"subscribe\" i],",
    "[id*=\"promo-popup\" i],",
    "[class*=\"promo-popup\" i],",
    "[id*=\"promotion-popup\" i],",
    "[class*=\"promotion-popup\" i],",
    "[id*=\"cookie-banner\" i],",
    "[class*=\"cookie-banner\" i] {",
    "  visibility: hidden !important;",
    "  opacity: 0 !important;",
    "  pointer-events: none !important;",
    "}"
  ].join(
    "\n"
  );


interface ViewportMetrics {
  readonly x:
    number;

  readonly y:
    number;

  readonly width:
    number;

  readonly height:
    number;
}

interface OverlayShieldCandidate {
  readonly selector:
    string;

  readonly text:
    string;
}


async function transientPromotionalOverlaySelectors(
  page:
    Page,
  sourcePacket:
    EvidencePacket
): Promise<string[]> {

  const titleValues =
    sourcePacket.titleCandidates
      .map(
        item =>
          item.rawValue
      )
      .filter(
        value =>
          value.trim()
            .length >
            0
      )
      .slice(
        0,
        4
      );


  return page.evaluate(
    (
      input:
        {
          readonly titles:
            readonly string[];
        }
    ) => {

      const normalize =
        (
          value:
            string
        ): string =>
          value
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
            .trim()
            .toLowerCase();


      const titleTokens =
        new Set(
          input.titles
            .flatMap(
              title =>
                normalize(
                  title
                )
                  .split(
                    /[^a-z0-9]+/u
                  )
            )
            .filter(
              token =>
                token.length >=
                  2
            )
            .slice(
              0,
              16
            )
        );


      const productMatch =
        (
          text:
            string
        ): boolean => {

          if (
            titleTokens.size ===
              0
          ) {
            return false;
          }


          const normalized =
            normalize(
              text
            );


          let matches =
            0;


          for (
            const token
            of titleTokens
          ) {
            if (
              normalized.includes(
                token
              )
            ) {
              matches +=
                1;
            }
          }


          return matches >=
            Math.max(
              2,
              Math.ceil(
                titleTokens.size *
                0.6
              )
            );
        };


      const promotionPattern =
        /(?:nhan\s*uu\s*dai|uu\s*dai|ma\s*giam|giam\s*gia|khuyen\s*mai|voucher|coupon|newsletter|subscribe|dang\s*ky|nhan\s*ngay|qua\s*tang|promotion|promo|cookie|cookies|privacy|thong\s*bao\s*cookie)/iu;


      const structuralPattern =
        /(?:modal|popup|pop-up|overlay|dialog|coupon|voucher|newsletter|subscribe|promo|promotion|cookie)/iu;


      const viewportArea =
        Math.max(
          1,
          window.innerWidth *
          window.innerHeight
        );


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
              0
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


      const cssPath =
        (
          element:
            Element
        ): string => {

          const html =
            element as HTMLElement;


          if (
            html.id
          ) {
            return (
              "#" +
              CSS.escape(
                html.id
              )
            );
          }


          const parts:
            string[] =
              [];


          let current:
            Element |
            null =
              element;


          while (
            current &&
            current !==
              document.body &&
            parts.length <
              7
          ) {

            const tag =
              current.tagName
                .toLowerCase();


            const parent =
              current.parentElement;


            if (
              !parent
            ) {
              break;
            }


            const sameTag =
              Array.from(
                parent.children
              )
                .filter(
                  child =>
                    child.tagName ===
                      current?.tagName
                );


            const index =
              sameTag.indexOf(
                current
              ) +
              1;


            parts.unshift(
              tag +
              ":nth-of-type(" +
              String(
                Math.max(
                  1,
                  index
                )
              ) +
              ")"
            );


            current =
              parent;
          }


          return (
            "body > " +
            parts.join(
              " > "
            )
          );
        };


      const rawCandidates:
        Element[] =
          [];


      for (
        const element
        of Array.from(
          document.querySelectorAll(
            "body *"
          )
        ).slice(
          0,
          4_000
        )
      ) {

        if (
          !visible(
            element
          )
        ) {
          continue;
        }


        const rect =
          element.getBoundingClientRect();


        const intersectWidth =
          Math.max(
            0,
            Math.min(
              rect.right,
              window.innerWidth
            ) -
            Math.max(
              rect.left,
              0
            )
          );


        const intersectHeight =
          Math.max(
            0,
            Math.min(
              rect.bottom,
              window.innerHeight
            ) -
            Math.max(
              rect.top,
              0
            )
          );


        const coverage =
          (
            intersectWidth *
            intersectHeight
          ) /
          viewportArea;


        if (
          coverage <
            0.04
        ) {
          continue;
        }


        const style =
          getComputedStyle(
            element
          );


        const zIndex =
          Number.parseInt(
            style.zIndex,
            10
          );


        const structuralText =
          [
            element.id,
            element.className,
            element.getAttribute(
              "role"
            ),
            element.getAttribute(
              "aria-modal"
            )
          ]
            .filter(
              value =>
                typeof value ===
                  "string"
            )
            .join(
              " "
            );


        const text =
          (
            (
              element as
                HTMLElement
            ).innerText ??
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
              1_000
            );


        const modalLike =
          structuralPattern.test(
            structuralText
          ) ||
          element.getAttribute(
            "role"
          ) ===
            "dialog" ||
          element.getAttribute(
            "aria-modal"
          ) ===
            "true" ||
          (
            (
              style.position ===
                "fixed" ||
              style.position ===
                "sticky"
            ) &&
            (
              Number.isFinite(
                zIndex
              )
                ? zIndex >=
                  50
                : coverage >=
                  0.18
            )
          );


        if (
          !modalLike
        ) {
          continue;
        }


        const promotional =
          promotionPattern.test(
            normalize(
              text +
              " " +
              structuralText
            )
          );


        if (
          !promotional
        ) {
          continue;
        }


        if (
          productMatch(
            text
          )
        ) {
          continue;
        }


        rawCandidates.push(
          element
        );
      }


      const roots =
        rawCandidates.filter(
          element =>
            !rawCandidates.some(
              other =>
                other !==
                  element &&
                other.contains(
                  element
                )
            )
        );


      return roots
        .map(
          element => ({
            selector:
              cssPath(
                element
              ),

            text:
              (
                (
                  element as
                    HTMLElement
                ).innerText ??
                ""
              )
                .replace(
                  /\s+/gu,
                  " "
                )
                .trim()
                .slice(
                  0,
                  180
                )
          } satisfies
            OverlayShieldCandidate)
        )
        .map(
          candidate =>
            candidate.selector
        )
        .filter(
          (
            selector,
            index,
            all
          ) =>
            selector.length >
              0 &&
            all.indexOf(
              selector
            ) ===
              index
        )
        .slice(
          0,
          12
        );
    },
    {
      titles:
        titleValues
    }
  );
}


function screenshotStyle(
  transientSelectors:
    readonly string[]
): string {

  const dynamic =
    transientSelectors.length >
      0
      ? [
          transientSelectors.join(
            ",\n"
          ),
          "{",
          "  visibility: hidden !important;",
          "  opacity: 0 !important;",
          "  pointer-events: none !important;",
          "}"
        ].join(
          "\n"
        )
      : "";


  return [
    SCREENSHOT_STYLE,
    dynamic
  ]
    .filter(
      Boolean
    )
    .join(
      "\n"
    );
}




function clipText(
  value:
    string |
    null |
    undefined,
  maxChars:
    number
): string |
  null {

  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  const clean =
    value
      .replace(
        /\s+/gu,
        " "
      )
      .trim();


  if (
    !clean
  ) {
    return "";
  }


  return clean.length <=
    maxChars
    ? clean
    : clean.slice(
        0,
        maxChars
      );
}


function compactEvidenceItem(
  item:
    EvidenceItem
): VisionEvidenceItem {

  return {
    id:
      item.id,

    fieldHint:
      clipText(
        item.fieldHint,
        48
      ) ??
      "",

    rawValue:
      clipText(
        item.rawValue,
        180
      ) ??
      "",

    normalizedValue:
      item.normalizedValue,

    sourceKind:
      item.sourceKind,

    locator:
      clipText(
        item.locator,
        96
      ),

    context:
      clipText(
        item.context,
        96
      ),

    ownershipHint:
      item.ownershipHint
  };
}


function uniqueById(
  values:
    readonly EvidenceItem[]
): EvidenceItem[] {

  const seen =
    new Set<
      string
    >();


  const unique:
    EvidenceItem[] =
      [];


  for (
    const item
    of values
  ) {

    if (
      seen.has(
        item.id
      )
    ) {
      continue;
    }


    seen.add(
      item.id
    );


    unique.push(
      item
    );
  }


  return unique;
}


function compactDomEvidence(
  packet:
    EvidencePacket
): VisionEvidenceItem[] {

  const structuredIds =
    new Set(
      packet.structuredFacts.map(
        item =>
          item.id
      )
    );


  const candidates =
    uniqueById([
      ...packet.titleCandidates,
      ...packet.moneyCandidates,
      ...packet.conditionCandidates,
      ...packet.stockCandidates,
      ...packet.variantCandidates,
      ...packet.specCandidates,
      ...packet.breadcrumbs,
      ...packet.ratingCandidates,
      ...packet.reviewCandidates,
      ...packet.allEvidence
    ]);


  return candidates
    .filter(
      item =>
        item.fieldHint !==
          "CONTROL" &&
        !structuredIds.has(
          item.id
        ) &&
        [
          "VISIBLE_TEXT",
          "DOM",
          "ATTRIBUTE",
          "META"
        ].includes(
          item.sourceKind
        )
    )
    .slice(
      0,
      MAX_COMPACT_DOM_EVIDENCE
    )
    .map(
      compactEvidenceItem
    );
}


function compactSelectedControls(
  packet:
    EvidencePacket
): VisionEvidenceItem[] {

  return uniqueById(
    packet.selectedControls
  )
    .slice(
      0,
      MAX_SELECTED_CONTROLS
    )
    .map(
      compactEvidenceItem
    );
}


function compactStructuredFacts(
  packet:
    EvidencePacket
): VisionEvidenceItem[] {

  return uniqueById(
    packet.structuredFacts
  )
    .slice(
      0,
      MAX_STRUCTURED_FACTS
    )
    .map(
      compactEvidenceItem
    );
}


async function viewportMetrics(
  page:
    Page
): Promise<
  ViewportMetrics
> {

  const value =
    await page.evaluate(
      "({ x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight })"
    ) as ViewportMetrics;


  return {
    x:
      Number.isFinite(
        value.x
      )
        ? value.x
        : 0,

    y:
      Number.isFinite(
        value.y
      )
        ? value.y
        : 0,

    width:
      Math.max(
        1,
        Math.floor(
          value.width
        )
      ),

    height:
      Math.max(
        1,
        Math.floor(
          value.height
        )
      )
  };
}


function sha256(
  value:
    string |
    Buffer
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


async function captureProductRegionScreenshot(
  page:
    Page,
  sourcePacket:
    EvidencePacket
): Promise<
  ProductRegionScreenshot
> {

  const viewport =
    await viewportMetrics(
      page
    );

  const region =
    await detectProductRegion(
      page,
      sourcePacket
    );


  const transientSelectors =
    await transientPromotionalOverlaySelectors(
      page,
      sourcePacket
    );


  const screenshot =
    await page.screenshot({
      type:
        "png",

      fullPage:
        false,

      animations:
        "disabled",

      caret:
        "hide",

      style:
        screenshotStyle(
          transientSelectors
        ),

      clip:
        region
          ? {
              x:
                region.box.x,

              y:
                region.box.y,

              width:
                region.box.width,

              height:
                region.box.height
            }
          : undefined
    });


  const width =
    region?.box.width ??
    viewport.width;

  const height =
    region?.box.height ??
    viewport.height;


  return {
    imageId:
      "vision_image_" +
      sha256(
        screenshot
      ).slice(
        0,
        16
      ),

    mimeType:
      "image/png",

    base64:
      screenshot.toString(
        "base64"
      ),

    width,

    height,

    selectorUsed:
      region?.selector ??
      null,

    fallback:
      region ===
      null
  };
}


function packetIdFor(
  sourcePacket:
    EvidencePacket,
  screenshot:
    ProductRegionScreenshot,
  domEvidence:
    readonly VisionEvidenceItem[],
  selectedControls:
    readonly VisionEvidenceItem[],
  structuredFacts:
    readonly VisionEvidenceItem[]
): string {

  /*
   * Deliberately do not hash screenshot bytes into the packet ID.
   * Screenshot encoders may produce byte-level differences across
   * environments even when the captured visual region is equivalent.
   * The image itself still has imageId = sha256(bytes).
   */
  const stablePayload =
    JSON.stringify({
      sourceEvidencePacketId:
        sourcePacket.packetId,

      pageUrl:
        sourcePacket.pageUrl,

      finalUrl:
        sourcePacket.finalUrl,

      productIdentity:
        sourcePacket.productIdentity,

      screenshot: {
        width:
          screenshot.width,

        height:
          screenshot.height,

        selectorUsed:
          screenshot.selectorUsed,

        fallback:
          screenshot.fallback
      },

      compactDomEvidence:
        domEvidence,

      selectedControls,

      structuredFacts
    });


  return (
    "vision_packet_" +
    sha256(
      stablePayload
    ).slice(
      0,
      16
    )
  );
}


export async function captureVisionEvidencePacket(
  page:
    Page,
  sourcePacket:
    EvidencePacket
): Promise<
  VisionEvidencePacket
> {

  const domEvidence =
    compactDomEvidence(
      sourcePacket
    );

  const selectedControls =
    compactSelectedControls(
      sourcePacket
    );

  const structuredFacts =
    compactStructuredFacts(
      sourcePacket
    );

  const productRegionScreenshot =
    await captureProductRegionScreenshot(
      page,
      sourcePacket
    );


  return {
    packetId:
      packetIdFor(
        sourcePacket,
        productRegionScreenshot,
        domEvidence,
        selectedControls,
        structuredFacts
      ),

    sourceEvidencePacketId:
      sourcePacket.packetId,

    pageUrl:
      sourcePacket.pageUrl,

    finalUrl:
      sourcePacket.finalUrl,

    productIdentity:
      sourcePacket.productIdentity,

    productRegionScreenshot,

    compactDomEvidence:
      domEvidence,

    selectedControls,

    structuredFacts
  };
}
