export type CommercePlatform =
  | "SHOPIFY"
  | "WOOCOMMERCE"
  | "NEXT"
  | "NUXT"
  | "CUSTOM";


export interface PlatformEvidence {
  platform:
    Exclude<
      CommercePlatform,
      "CUSTOM"
    >;

  source:
    "HTML"
    | "NETWORK";

  text:
    string;

  weight:
    number;
}


export interface PlatformDetection {
  platform:
    CommercePlatform;

  scores:
    Record<
      Exclude<
        CommercePlatform,
        "CUSTOM"
      >,
      number
    >;

  evidence:
    PlatformEvidence[];
}


function normalize(
  value: string
): string {

  return value
    .toLowerCase();
}


export function detectPlatform(
  html: string,
  networkUrls:
    readonly string[] = []
): PlatformDetection {

  const evidence:
    PlatformEvidence[] =
      [];

  const seen =
    new Set<string>();


  const add = (
    platform:
      Exclude<
        CommercePlatform,
        "CUSTOM"
      >,
    source:
      PlatformEvidence["source"],
    text:
      string,
    weight:
      number
  ): void => {

    const key =
      `${platform}|${source}|${text}`;

    if (
      seen.has(
        key
      )
    ) {
      return;
    }

    seen.add(
      key
    );

    evidence.push({
      platform,
      source,
      text:
        text.slice(
          0,
          250
        ),
      weight
    });
  };


  const normalizedHtml =
    normalize(
      html
    );


  if (
    normalizedHtml.includes(
      "cdn.shopify.com"
    ) ||
    normalizedHtml.includes(
      "shopify-section"
    ) ||
    normalizedHtml.includes(
      "shopify.theme"
    )
  ) {

    add(
      "SHOPIFY",
      "HTML",
      "Shopify HTML marker",
      60
    );
  }


  if (
    normalizedHtml.includes(
      "woocommerce"
    ) ||
    normalizedHtml.includes(
      "wc-ajax"
    ) ||
    normalizedHtml.includes(
      "wp-content/plugins/woocommerce"
    )
  ) {

    add(
      "WOOCOMMERCE",
      "HTML",
      "WooCommerce HTML marker",
      60
    );
  }


  if (
    normalizedHtml.includes(
      "__next_data__"
    ) ||
    normalizedHtml.includes(
      "/_next/"
    )
  ) {

    add(
      "NEXT",
      "HTML",
      "Next.js HTML marker",
      50
    );
  }


  if (
    normalizedHtml.includes(
      "__nuxt__"
    ) ||
    normalizedHtml.includes(
      "/_nuxt/"
    )
  ) {

    add(
      "NUXT",
      "HTML",
      "Nuxt HTML marker",
      50
    );
  }


  for (
    const rawUrl
    of networkUrls
  ) {

    const url =
      normalize(
        rawUrl
      );


    if (
      url.includes(
        "cdn.shopify.com"
      ) ||
      url.includes(
        "/cart.js"
      )
    ) {

      add(
        "SHOPIFY",
        "NETWORK",
        rawUrl,
        40
      );
    }


    if (
      url.includes(
        "wc-ajax"
      ) ||
      url.includes(
        "woocommerce"
      )
    ) {

      add(
        "WOOCOMMERCE",
        "NETWORK",
        rawUrl,
        40
      );
    }


    if (
      url.includes(
        "/_next/"
      )
    ) {

      add(
        "NEXT",
        "NETWORK",
        rawUrl,
        35
      );
    }


    if (
      url.includes(
        "/_nuxt/"
      )
    ) {

      add(
        "NUXT",
        "NETWORK",
        rawUrl,
        35
      );
    }
  }


  const scores = {
    SHOPIFY: 0,
    WOOCOMMERCE: 0,
    NEXT: 0,
    NUXT: 0
  };


  for (
    const item
    of evidence
  ) {

    scores[
      item.platform
    ] +=
      item.weight;
  }


  const ranking =
    Object.entries(
      scores
    )
      .sort(
        (
          a,
          b
        ) =>
          b[1] -
          a[1]
      );


  const winner =
    ranking[0];


  const platform:
    CommercePlatform =
    winner &&
    winner[1] >
      0
      ? winner[0] as Exclude<
          CommercePlatform,
          "CUSTOM"
        >
      : "CUSTOM";


  return {
    platform,
    scores,
    evidence
  };
}