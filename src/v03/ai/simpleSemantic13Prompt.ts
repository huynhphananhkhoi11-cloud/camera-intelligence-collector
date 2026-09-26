export interface SimpleSemantic13PromptShot {
  readonly shotId: string;
  readonly sectionLabel?:
    | string
    | null;
}

export interface SimpleSemantic13PromptInput {
  readonly pageUrl: string;
  readonly finalUrl: string;
  readonly website: string;
  readonly shots:
    readonly SimpleSemantic13PromptShot[];
}

export function buildSimpleSemantic13Prompt(
  input: SimpleSemantic13PromptInput
): string {
  const allowedShotIds =
    input.shots
      .map(
        shot =>
          shot.shotId
      )
      .join(", ");

  const shotContext =
    input.shots
      .map(
        (
          shot,
          index
        ) =>
          [
            `SHOT ${index + 1}:`,
            `shotId=${shot.shotId}`,
            `section=${shot.sectionLabel ?? "unknown"}`
          ].join(" ")
      )
      .join("\n");

  return [
    "You are looking at screenshots from one ecommerce page.",
    "Use your own visual and language understanding. Do not rely on retailer-specific keyword rules or special cases.",
    "First decide whether the primary page is a camera product.",
    "Then read all supplied screenshots and match visible information to these workbook columns by meaning.",
    "",
    `PAGE_URL: ${input.pageUrl}`,
    `FINAL_URL: ${input.finalUrl}`,
    `WEBSITE: ${input.website}`,
    `ALLOWED_SHOT_IDS: ${allowedShotIds}`,
    "",
    "Classification must be one of CAMERA_PRODUCT, NON_CAMERA, REVIEW.",
    "Use REVIEW only when the screenshots are genuinely unusable, contradictory, or the primary page cannot be identified reliably.",
    "A missing optional field does not make a clear camera product REVIEW.",
    "",
    "Workbook columns:",
    "1. Website -> website",
    "2. Tên sản phẩm -> productName",
    "3. Hàng cũ/Hàng mới -> condition",
    "4. Thông số mô tả -> specs",
    "5. Giá thuê/ngày -> rentalPricePerDay",
    "6. Điều kiện thuê riêng -> rentalTerms",
    "7. Phụ kiện đi kèm -> accessoriesIncluded",
    "8. Combo/gói đi kèm -> bundleIncluded",
    "9. Điểm đánh giá -> rating",
    "10. Số lượt đánh giá/review -> reviewCount",
    "11. Tồn kho -> stock",
    "12. Giá bán -> salePrice",
    "13. URL -> url",
    "",
    "For every workbook column, use your own judgment across all supplied screenshots.",
    "If you can see a supported value, fill it.",
    "If you cannot see a supported value, use null or [] as appropriate.",
    "Use information for the primary product, not unrelated recommendations or other products.",
    "Copy WEBSITE into website and FINAL_URL into url.",
    "",
    "JSON shape only:",
    "- condition is NEW, USED, or null.",
    "- specs is an array of strings.",
    "- accessoriesIncluded and bundleIncluded are null or arrays of strings.",
    "- rentalPricePerDay and salePrice are null or {value:number,currency:string}.",
    "- rating, reviewCount, and stock may be null when not visible.",
    "",
    "Evidence is only for traceability. It must not make you omit a visible workbook value.",
    "Evidence keys are classification, productName, condition, specs, rentalPricePerDay, rentalTerms, accessoriesIncluded, bundleIncluded, rating, reviewCount, stock, salePrice.",
    "Every evidence key must be an array. Use [] when no evidence is needed.",
    "Each evidence entry is {shotId,rawText}; shotId must come from ALLOWED_SHOT_IDS.",
    "Keep rawText very short, normally no more than 12 words.",
    "Do not reproduce long product descriptions, reviews, manuals, articles, or marketing copy verbatim.",
    "Summarize descriptive text concisely in your own words.",
    "",
    "Return exactly one JSON object and no prose.",
    "Top-level keys are classification, reviewReason, row, evidence.",
    "For CAMERA_PRODUCT, row keys are exactly website, productName, condition, specs, rentalPricePerDay, rentalTerms, accessoriesIncluded, bundleIncluded, rating, reviewCount, stock, salePrice, url.",
    "",
    shotContext
  ].join("\n");
}
