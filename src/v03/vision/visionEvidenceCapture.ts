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
    "#__camintel_agent_overlay {",
    "  visibility: hidden !important;",
    "  opacity: 0 !important;",
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
        SCREENSHOT_STYLE,

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
