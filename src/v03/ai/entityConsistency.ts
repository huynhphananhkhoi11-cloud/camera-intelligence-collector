import type {
  AISemanticDecision
} from "./semanticContracts.js";


function normalize(
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
    .toLowerCase()
    .replace(
      /\s+/gu,
      " "
    )
    .trim();
}


function hasCameraBodyCue(
  value:
    string
): boolean {

  const text =
    normalize(
      value
    );


  return /(?:\bcamera\b|\bmay anh\b|\bbody\b|\bmirrorless\b|\bdslr\b|\bcanon eos\b|\bsony alpha\b|\bsony a[1679]\b|\bnikon z\s?\d|\bnikon d\s?\d|\bfujifilm x[- ]|\bfujifilm gfx\b|\blumix\b|\bom system\b|\bolympus om\b|\bricoh gr\b)/iu.test(
    text
  );
}


function hasStandaloneLensCue(
  decision:
    AISemanticDecision
): boolean {

  const subtype =
    normalize(
      decision.entity.subtype
    );

  const productName =
    normalize(
      decision.productName.value
    );


  if (
    /(?:^|\b)(?:lens|ong kinh)(?:\b|$)/iu.test(
      subtype
    )
  ) {
    return true;
  }


  if (
    /(?:\blens\b|\bong kinh\b)/iu.test(
      productName
    )
  ) {
    return true;
  }


  /*
   * Lens model fallback for titles such as "Sony FE 50mm f/1.8",
   * which may omit the literal word "lens".
   */
  return (
    /\b\d{1,3}(?:-\d{1,3})?\s*mm\b/iu.test(
      productName
    ) &&
    /\bf\s*\/?\s*\d(?:[.,]\d+)?\b/iu.test(
      productName
    )
  );
}


export function normalizeEntityConsistency(
  decision:
    AISemanticDecision
): AISemanticDecision {

  if (
    decision.entity.type !==
      "CAMERA"
  ) {
    return decision;
  }


  if (
    hasCameraBodyCue(
      decision.productName.value
    )
  ) {
    return decision;
  }


  if (
    !hasStandaloneLensCue(
      decision
    )
  ) {
    return decision;
  }


  return {
    ...decision,

    entity: {
      ...decision.entity,

      type:
        "NON_CAMERA",

      subtype:
        "LENS"
    }
  };
}
