export const V14_COLUMN_SEMANTIC_CONTRACT =
  [
    "COLUMN SEMANTIC CONTRACT:",
    "Treat every supplied screenshot as another visual state or view of the same page.",
    "Identify the primary camera product, then map visible facts to the 13 workbook columns by meaning.",
    "Map visible facts to columns by meaning, using your own visual and language understanding.",
    "If a value is not visibly supported, use null or [] as appropriate. Do not guess.",
    "Do not use retailer-specific assumptions, benchmark expectations, or hidden facts.",
    "",
    "Column meanings:",
    "- website: the website/domain context for this product page.",
    "- productName: the visible identity/name of the primary camera product; include a selected variant or kit only when it is visibly clear.",
    "- condition: whether the primary camera is NEW or USED; otherwise null.",
    "- specs: concise visible technical characteristics of the primary camera, not long marketing prose.",
    "- rentalPricePerDay: the explicit visible price to rent the primary product for one day or per day; do not calculate a daily value from another duration.",
    "- rentalTerms: other visible rental conditions or rental options that are not the one-day or per-day rental price.",
    "- accessoriesIncluded: individual accessories or gifts explicitly included with the primary product.",
    "- bundleIncluded: an explicit combo, package, kit, or grouped offer presented as a bundle; individual gifts or accessories are not a bundle by themselves.",
    "- rating: the visible rating score of the primary product.",
    "- reviewCount: the visible number of reviews for the primary product.",
    "- stock: the visible stock or availability information for the primary product. Preserve specific visible wording when the wording itself is the requested value, especially stock or availability text.",
    "- salePrice: the current visible selling price of the primary product for the selected or default offer. If several prices are visible, choose the one that semantically belongs to that primary current offer.",
    "- url: the final product page URL.",
    "",
    "Keep each fact in the column whose meaning it satisfies.",
    "Use all screenshots together, but do not treat secondary products, navigation, unrelated promotions, or other page content as facts about the primary camera.",
    "Return only the JSON schema requested by the application."
  ].join("\n");


export const SIMPLE_SEMANTIC_13_PROMPT =
  [
    "Use your own visual and language understanding.",
    "Read all supplied screenshots.",
    "Identify the primary camera product on the page.",
    "Fill the 13 workbook fields using what is visibly supported.",
    "If a value is not visible, return null or [] as appropriate.",
    "Summarize descriptive text concisely in your own words.",
    "Do not reproduce long product descriptions, reviews, manuals, articles, or marketing copy verbatim.",
    "Return one JSON object only.",
    "",
    V14_COLUMN_SEMANTIC_CONTRACT
  ].join("\n");
