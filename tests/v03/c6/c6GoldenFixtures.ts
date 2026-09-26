import type {
  EvidenceItem,
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";

import type {
  AISemanticDecision
} from "../../../src/v03/ai/semanticContracts.js";


export type GoldenCondition =
  "NEW" |
  "USED";


export interface C6GoldenExpected {
  readonly entityType:
    "CAMERA" |
    "NON_CAMERA";

  readonly currentPrice:
    number |
    null;

  readonly selectedVariant:
    string |
    null;

  readonly condition:
    GoldenCondition |
    null;
}


export interface C6GoldenCase {
  readonly id:
    string;

  readonly description:
    string;

  readonly packet:
    EvidencePacket;

  readonly decision:
    AISemanticDecision;

  readonly expected:
    C6GoldenExpected;
}


function item(
  input:
    {
      readonly id:
        string;

      readonly fieldHint:
        string;

      readonly rawValue:
        string;

      readonly normalizedValue?:
        string |
        number |
        boolean |
        null;

      readonly sourceKind?:
        "VISIBLE_TEXT" |
        "DOM";

      readonly sourceUrl:
        string;

      readonly locator?:
        string;

      readonly context?:
        string;
    }
): EvidenceItem {

  return {
    id:
      input.id,

    fieldHint:
      input.fieldHint,

    rawValue:
      input.rawValue,

    normalizedValue:
      input.normalizedValue,

    sourceKind:
      input.sourceKind ??
      "VISIBLE_TEXT",

    sourceUrl:
      input.sourceUrl,

    locator:
      input.locator,

    context:
      input.context,

    ownershipHint:
      "PRIMARY_PRODUCT",

    confidence:
      0.99
  };
}


function cameraCase(
  input:
    {
      readonly id:
        string;

      readonly description:
        string;

      readonly url:
        string;

      readonly title:
        string;

      readonly subtype:
        string;

      readonly currentPrice:
        number;

      readonly variant:
        string;

      readonly condition:
        GoldenCondition;

      readonly conditionText:
        string;

      readonly spec:
        string;
    }
): C6GoldenCase {

  const title =
    item({
      id:
        "ev_title",

      fieldHint:
        "PRODUCT",

      rawValue:
        input.title,

      sourceUrl:
        input.url
    });


  const price =
    item({
      id:
        "ev_price",

      fieldHint:
        "PRICE",

      rawValue:
        String(
          input.currentPrice
        ) +
        " VND",

      normalizedValue:
        input.currentPrice,

      sourceUrl:
        input.url
    });


  const selected =
    item({
      id:
        "ctrl_variant",

      fieldHint:
        "CONTROL",

      rawValue:
        "Tùy Chọn | " +
        input.variant,

      sourceKind:
        "DOM",

      sourceUrl:
        input.url,

      locator:
        "variant",

      context:
        "selected=true"
    });


  const condition =
    item({
      id:
        "ev_condition",

      fieldHint:
        "CONDITION",

      rawValue:
        input.conditionText,

      sourceUrl:
        input.url
    });


  const stock =
    item({
      id:
        "ev_stock",

      fieldHint:
        "AVAILABILITY",

      rawValue:
        "In stock",

      sourceUrl:
        input.url
    });


  const spec =
    item({
      id:
        "ev_spec",

      fieldHint:
        "SPECS",

      rawValue:
        input.spec,

      sourceUrl:
        input.url
    });


  const allEvidence =
    [
      title,
      price,
      selected,
      condition,
      stock,
      spec
    ];


  const packet:
    EvidencePacket = {
      packetId:
        "pkt_" +
        input.id,

      pageUrl:
        input.url,

      finalUrl:
        input.url,

      productIdentity:
        input.title,

      primaryRegionText:
        [
          input.title,
          price.rawValue,
          selected.rawValue,
          condition.rawValue,
          stock.rawValue,
          spec.rawValue
        ].join(
          "\n"
        ),

      allEvidence,

      titleCandidates:
        [
          title
        ],

      breadcrumbs:
        [],

      moneyCandidates:
        [
          price
        ],

      conditionCandidates:
        [
          condition
        ],

      stockCandidates:
        [
          stock
        ],

      ratingCandidates:
        [],

      reviewCandidates:
        [],

      specCandidates:
        [
          spec
        ],

      variantCandidates:
        [
          selected
        ],

      selectedControls:
        [
          selected
        ],

      structuredFacts:
        []
    };


  const decision:
    AISemanticDecision = {
      entity: {
        type:
          "CAMERA",

        subtype:
          input.subtype,

        confidence:
          0.99,

        evidenceIds:
          [
            title.id
          ]
      },

      productName: {
        value:
          input.title,

        evidenceIds:
          [
            title.id
          ],

        confidence:
          0.99
      },

      currentPrice: {
        value:
          input.currentPrice,

        currency:
          "VND",

        evidenceIds:
          [
            price.id
          ],

        confidence:
          0.99
      },

      oldPrice:
        null,

      giftValues:
        [],

      savingValues:
        [],

      installmentAmounts:
        [],

      variants: [
        {
          label:
            input.variant,

          selected:
            true,

          condition:
            input.condition,

          price: {
            value:
              input.currentPrice,

            currency:
              "VND",

            evidenceIds:
              [
                price.id
              ],

            confidence:
              0.99
          },

          priceDelta:
            null,

          evidenceIds:
            [
              selected.id
            ],

          confidence:
            0.99
        }
      ],

      condition: {
        value:
          input.condition,

        evidenceIds:
          [
            condition.id
          ],

        confidence:
          0.99
      },

      availableConditions: [
        {
          value:
            input.condition,

          evidenceIds:
            [
              condition.id
            ],

          confidence:
            0.99
        }
      ],

      stock: {
        state:
          "IN_STOCK",

        quantity:
          null,

        evidenceIds:
          [
            stock.id
          ],

        confidence:
          0.99
      },

      rating:
        null,

      reviewCount:
        null,

      specs: [
        {
          key:
            "golden_spec",

          value:
            input.spec,

          evidenceIds:
            [
              spec.id
            ],

          confidence:
            0.99
        }
      ],

      conflicts:
        [],

      pageConfidence:
        0.99
    };


  return {
    id:
      input.id,

    description:
      input.description,

    packet,

    decision,

    expected: {
      entityType:
        "CAMERA",

      currentPrice:
        input.currentPrice,

      selectedVariant:
        input.variant,

      condition:
        input.condition
    }
  };
}


function nonCameraCase(
  input:
    {
      readonly id:
        string;

      readonly description:
        string;

      readonly url:
        string;

      readonly title:
        string;

      readonly subtype:
        string;

      readonly currentPrice?:
        number;

      readonly spec?:
        string;
    }
): C6GoldenCase {

  const title =
    item({
      id:
        "ev_title",

      fieldHint:
        "PRODUCT",

      rawValue:
        input.title,

      sourceUrl:
        input.url
    });


  const price =
    input.currentPrice ===
      undefined
      ? null
      : item({
          id:
            "ev_price",

          fieldHint:
            "PRICE",

          rawValue:
            String(
              input.currentPrice
            ) +
            " VND",

          normalizedValue:
            input.currentPrice,

          sourceUrl:
            input.url
        });


  const spec =
    input.spec ===
      undefined
      ? null
      : item({
          id:
            "ev_spec",

          fieldHint:
            "SPECS",

          rawValue:
            input.spec,

          sourceUrl:
            input.url
        });


  const allEvidence:
    EvidenceItem[] =
      [
        title
      ];


  if (
    price
  ) {
    allEvidence.push(
      price
    );
  }


  if (
    spec
  ) {
    allEvidence.push(
      spec
    );
  }


  const packet:
    EvidencePacket = {
      packetId:
        "pkt_" +
        input.id,

      pageUrl:
        input.url,

      finalUrl:
        input.url,

      productIdentity:
        input.title,

      primaryRegionText:
        allEvidence
          .map(
            evidence =>
              evidence.rawValue
          )
          .join(
            "\n"
          ),

      allEvidence,

      titleCandidates:
        [
          title
        ],

      breadcrumbs:
        [],

      moneyCandidates:
        price
          ? [
              price
            ]
          : [],

      conditionCandidates:
        [],

      stockCandidates:
        [],

      ratingCandidates:
        [],

      reviewCandidates:
        [],

      specCandidates:
        spec
          ? [
              spec
            ]
          : [],

      variantCandidates:
        [],

      selectedControls:
        [],

      structuredFacts:
        []
    };


  const decision:
    AISemanticDecision = {
      entity: {
        type:
          "NON_CAMERA",

        subtype:
          input.subtype,

        confidence:
          0.99,

        evidenceIds:
          [
            title.id
          ]
      },

      productName: {
        value:
          input.title,

        evidenceIds:
          [
            title.id
          ],

        confidence:
          0.99
      },

      currentPrice:
        price &&
        input.currentPrice !==
          undefined
          ? {
              value:
                input.currentPrice,

              currency:
                "VND",

              evidenceIds:
                [
                  price.id
                ],

              confidence:
                0.99
            }
          : null,

      oldPrice:
        null,

      giftValues:
        [],

      savingValues:
        [],

      installmentAmounts:
        [],

      variants:
        [],

      condition:
        null,

      availableConditions:
        [],

      stock:
        null,

      rating:
        null,

      reviewCount:
        null,

      specs:
        spec
          ? [
              {
                key:
                  "golden_spec",

                value:
                  spec.rawValue,

                evidenceIds:
                  [
                    spec.id
                  ],

                confidence:
                  0.99
              }
            ]
          : [],

      conflicts:
        [],

      pageConfidence:
        0.99
    };


  return {
    id:
      input.id,

    description:
      input.description,

    packet,

    decision,

    expected: {
      entityType:
        "NON_CAMERA",

      currentPrice:
        input.currentPrice ??
        null,

      selectedVariant:
        null,

      condition:
        null
    }
  };
}


/*
 * Golden snapshots are intentionally versioned facts.
 *
 * They are NOT fetched from the live web during tests. If a store changes
 * price later, the golden fixture changes only through an explicit review.
 * This makes build PASS/FAIL reflect our code rather than quota/network/site
 * volatility.
 */
export const C6_GOLDEN_CASES:
  readonly C6GoldenCase[] = [
    cameraCase({
      id:
        "01_zshop_r50_body",

      description:
        "Canon EOS R50 body-only baseline",

      url:
        "https://zshop.vn/canon-eos-r50-vi.html",

      title:
        "Canon EOS R50 (Body Only, Black, Hàng Mới Chính Hãng)",

      subtype:
        "MIRRORLESS",

      currentPrice:
        15_990_000,

      variant:
        "Body Only",

      condition:
        "NEW",

      conditionText:
        "Hàng Mới Chính Hãng",

      spec:
        "APS-C CMOS 24.2MP"
    }),

    cameraCase({
      id:
        "02_zshop_r50_kit",

      description:
        "Canon EOS R50 kit 18-45mm selected variant",

      url:
        "https://zshop.vn/canon-eos-r50-vi.html?variation_id=65130",

      title:
        "Canon EOS R50 (Kèm Kit Lens 18-45mm, White, Hàng Mới Chính Hãng)",

      subtype:
        "MIRRORLESS",

      currentPrice:
        18_490_000,

      variant:
        "Kèm Kit Lens 18-45mm",

      condition:
        "NEW",

      conditionText:
        "Hàng Mới Chính Hãng",

      spec:
        "APS-C CMOS 24.2MP"
    }),

    cameraCase({
      id:
        "03_zshop_r50_likenew",

      description:
        "Canon EOS R50 used/likenew baseline",

      url:
        "https://zshop.vn/canon-eos-r50-likenew.html",

      title:
        "Canon EOS R50 - Likenew (Body Only, Black)",

      subtype:
        "MIRRORLESS",

      currentPrice:
        14_990_000,

      variant:
        "Body Only",

      condition:
        "USED",

      conditionText:
        "Hàng Likenew",

      spec:
        "APS-C CMOS 24.2MP"
    }),

    cameraCase({
      id:
        "04_vjshop_sony_a7iv",

      description:
        "Sony A7 IV cross-site camera baseline",

      url:
        "https://vjshop.vn/may-anh-mirrorless/sony-alpha-a7-mark-iv-body-only-chinh-hang",

      title:
        "Máy ảnh Sony Alpha A7 Mark IV (Body Only) | Chính hãng",

      subtype:
        "MIRRORLESS",

      /*
       * Preserve the value observed by the C6 live browser snapshot.
       * Live store pricing may change independently of this test.
       */
      currentPrice:
        53_990_182,

      variant:
        "Body Only",

      condition:
        "NEW",

      conditionText:
        "Hàng Mới Chính Hãng",

      spec:
        "Full-frame mirrorless camera"
    }),

    nonCameraCase({
      id:
        "05_zshop_sony_fe50_lens",

      description:
        "Sony FE 50mm lens negative camera-control",

      url:
        "https://zshop.vn/sony-fe-50mm-f-1.8.html",

      title:
        "Sony FE 50mm f/1.8 (Chính hãng)",

      subtype:
        "LENS",

      currentPrice:
        5_690_000,

      spec:
        "Lens Mount Sony E; Focal Length 50mm; Maximum Aperture f/1.8"
    }),

    nonCameraCase({
      id:
        "06_zshop_workshop_blog",

      description:
        "Workshop article negative product-control",

      url:
        "https://zshop.vn/blogs/workshop-nhiep-anh-anh-sang-cam-xuc-28032026.html",

      title:
        "[Canon – TP.HCM] Workshop Nhiếp Ảnh Ánh Sáng & Cảm Xúc 28/03/2026",

      subtype:
        "ARTICLE"
    })
  ];
