import type {
  EvidenceItem,
  EvidencePacket
} from "../ai/evidenceTypes.js";


function byteLength(
  value:
    string
): number {

  return Buffer.byteLength(
    value,
    "utf8"
  );
}


function sanitizeScriptTag(
  fullMatch:
    string,
  attributes:
    string,
  body:
    string
): string {

  /*
   * JSON-LD is semantic product data and must survive FULL_PAGE mode.
   */
  if (
    /type\s*=\s*["']application\/ld\+json["']/iu
      .test(
        attributes
      )
  ) {

    return (
      "<script" +
      attributes +
      ">" +
      body +
      "</script>"
    );
  }


  return "";
}


export function sanitizeRenderedHtmlForBenchmark(
  html:
    string
): string {

  return html
    /*
     * Remove comments first.
     */
    .replace(
      /<!--[\s\S]*?-->/gu,
      ""
    )

    /*
     * Keep JSON-LD but remove executable JS.
     */
    .replace(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/giu,
      (
        match:
          string,
        attributes:
          string,
        body:
          string
      ) =>
        sanitizeScriptTag(
          match,
          attributes,
          body
        )
    )

    /*
     * CSS contributes little semantic product information.
     */
    .replace(
      /<style\b[^>]*>[\s\S]*?<\/style>/giu,
      ""
    )

    /*
     * SVG can contain huge icon/path payloads.
     */
    .replace(
      /<svg\b[^>]*>[\s\S]*?<\/svg>/giu,
      ""
    )

    /*
     * noscript content is typically duplicate fallback content.
     */
    .replace(
      /<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu,
      ""
    )

    /*
     * Never send inline binary assets as text.
     */
    .replace(
      /data:(?:image|font)\/[^"'()\s>]+/giu,
      "[inline-asset-removed]"
    )

    /*
     * Inline JS handlers are implementation noise.
     */
    .replace(
      /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/giu,
      ""
    )

    /*
     * Collapse pathological whitespace while preserving DOM structure.
     */
    .replace(
      />\s+</gu,
      "><"
    )
    .trim();
}


function benchmarkEvidenceItem(
  item:
    EvidenceItem
): Record<
  string,
  unknown
> {

  return {
    id:
      item.id,

    fieldHint:
      item.fieldHint,

    rawValue:
      item.rawValue,

    normalizedValue:
      item.normalizedValue ??
      null,

    sourceKind:
      item.sourceKind,

    sourceUrl:
      item.sourceUrl,

    locator:
      item.locator,

    context:
      item.context,

    ownershipHint:
      item.ownershipHint ??
      null,

    confidence:
      item.confidence ??
      null
  };
}


export function buildFullEvidencePayload(
  packet:
    EvidencePacket
): string {

  /*
   * allEvidence is deliberately NOT deduplicated here.
   *
   * This benchmark mode answers:
   * "What happens if Gemini receives everything our collector sensed?"
   */
  return JSON.stringify(
    {
      packetId:
        packet.packetId,

      pageUrl:
        packet.pageUrl,

      finalUrl:
        packet.finalUrl,

      productIdentity:
        packet.productIdentity,

      primaryRegionText:
        packet.primaryRegionText,

      evidence:
        packet.allEvidence.map(
          benchmarkEvidenceItem
        ),

      selectedControlIds:
        packet.selectedControls.map(
          item =>
            item.id
        ),

      groups: {
        titleCandidates:
          packet.titleCandidates.map(
            item =>
              item.id
          ),

        moneyCandidates:
          packet.moneyCandidates.map(
            item =>
              item.id
          ),

        conditionCandidates:
          packet.conditionCandidates.map(
            item =>
              item.id
          ),

        stockCandidates:
          packet.stockCandidates.map(
            item =>
              item.id
          ),

        variantCandidates:
          packet.variantCandidates.map(
            item =>
              item.id
          ),

        ratingCandidates:
          packet.ratingCandidates.map(
            item =>
              item.id
          ),

        reviewCandidates:
          packet.reviewCandidates.map(
            item =>
              item.id
          ),

        specCandidates:
          packet.specCandidates.map(
            item =>
              item.id
          ),

        structuredFacts:
          packet.structuredFacts.map(
            item =>
              item.id
          )
      }
    },
    null,
    2
  );
}


export function buildFullPagePayload(
  input: {
    readonly packet:
      EvidencePacket;

    readonly renderedHtml:
      string;
  }
): string {

  const sanitizedHtml =
    sanitizeRenderedHtmlForBenchmark(
      input.renderedHtml
    );


  return [
    "FULL PAGE BENCHMARK INPUT",
    "",
    "URL:",
    input.packet.finalUrl,
    "",
    "COLLECTOR EVIDENCE:",
    buildFullEvidencePayload(
      input.packet
    ),
    "",
    "SANITIZED RENDERED HTML:",
    sanitizedHtml
  ].join(
    "\n"
  );
}


export function pageBenchmarkStats(
  input: {
    readonly packet:
      EvidencePacket;

    readonly renderedHtml:
      string;
  }
): {
  readonly renderedHtmlBytes:
    number;

  readonly renderedHtmlChars:
    number;

  readonly sanitizedHtmlChars:
    number;

  readonly primaryTextChars:
    number;

  readonly evidenceCount:
    number;

  readonly selectedControlCount:
    number;

  readonly controlCount:
    number;
} {

  const sanitized =
    sanitizeRenderedHtmlForBenchmark(
      input.renderedHtml
    );


  return {
    renderedHtmlBytes:
      byteLength(
        input.renderedHtml
      ),

    renderedHtmlChars:
      input.renderedHtml.length,

    sanitizedHtmlChars:
      sanitized.length,

    primaryTextChars:
      input.packet.primaryRegionText.length,

    evidenceCount:
      input.packet.allEvidence.length,

    selectedControlCount:
      input.packet.selectedControls.length,

    controlCount:
      input.packet.allEvidence.filter(
        item =>
          item.fieldHint ===
            "CONTROL"
      ).length
  };
}