import * as cheerio from "cheerio";


export type CommercialSignalKind =
  | "RENTAL"
  | "SALE"
  | "SALE_NEW"
  | "SALE_USED";


export type CommercialSignalSource =
  | "JSON_LD"
  | "CTA"
  | "PRICE_UNIT"
  | "TITLE"
  | "MENU"
  | "VISIBLE_TEXT";


export interface CommercialSignalEvidence {
  kind:
    CommercialSignalKind;

  source:
    CommercialSignalSource;

  text:
    string;

  weight:
    number;
}


export interface CommercialSignalResult {
  rentalScore:
    number;

  saleScore:
    number;

  newScore:
    number;

  usedScore:
    number;

  evidence:
    CommercialSignalEvidence[];

  title:
    string;

  menuText:
    string;

  visibleText:
    string;
}


function clean(
  value: unknown
): string {

  return String(
    value ??
    ""
  )
    .replace(
      /\u00a0/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function excerpt(
  value: string,
  maxLength = 220
): string {

  return clean(
    value
  ).slice(
    0,
    maxLength
  );
}


function normalizeSearchText(
  value: string
): string {

  return value
    .toLowerCase()
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /đ/g,
      "d"
    );
}


function parseJsonLd(
  raw: string
): unknown[] {

  try {

    const parsed =
      JSON.parse(
        raw
      );

    return Array.isArray(
      parsed
    )
      ? parsed
      : [parsed];
  }
  catch {
    return [];
  }
}


function collectBusinessFunctions(
  value: unknown,
  result:
    string[],
  depth = 0
): void {

  if (
    depth >
    8 ||
    value ===
      null ||
    value ===
      undefined
  ) {
    return;
  }


  if (
    Array.isArray(
      value
    )
  ) {

    for (
      const item
      of value
    ) {

      collectBusinessFunctions(
        item,
        result,
        depth + 1
      );
    }

    return;
  }


  if (
    typeof value !==
    "object"
  ) {
    return;
  }


  const record =
    value as Record<
      string,
      unknown
    >;


  const businessFunction =
    record.businessFunction;


  if (
    typeof businessFunction ===
    "string"
  ) {

    result.push(
      businessFunction
    );
  }


  for (
    const child
    of Object.values(
      record
    )
  ) {

    if (
      typeof child ===
        "object" &&
      child !==
        null
    ) {

      collectBusinessFunctions(
        child,
        result,
        depth + 1
      );
    }
  }
}


export function detectCommercialSignals(
  html: string
): CommercialSignalResult {

  const $ =
    cheerio.load(
      html
    );


  const title =
    clean(
      $("title")
        .first()
        .text()
    );


  const menuText =
    clean(
      $(
        [
          "nav",
          "header",
          '[role="navigation"]',
          ".menu",
          ".navbar",
          ".navigation"
        ].join(",")
      )
        .text()
    );


  const bodyClone =
    $("body")
      .clone();

  bodyClone
    .find(
      "script,style,noscript,svg"
    )
    .remove();


  const visibleText =
    clean(
      bodyClone.text()
    );


  const evidence:
    CommercialSignalEvidence[] =
      [];

  const seen =
    new Set<string>();


  const add = (
    kind:
      CommercialSignalKind,
    source:
      CommercialSignalSource,
    text:
      string,
    weight:
      number
  ): void => {

    const normalizedText =
      excerpt(
        text
      );

    if (!normalizedText) {
      return;
    }


    const key =
      `${kind}|${source}|${normalizeSearchText(
        normalizedText
      )}`;


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
      kind,
      source,
      text:
        normalizedText,
      weight
    });
  };


  const normalizedTitle =
    normalizeSearchText(
      title
    );

  const normalizedMenu =
    normalizeSearchText(
      menuText
    );

  const normalizedVisible =
    normalizeSearchText(
      visibleText
    );


  // rental title prior
  if (
    /\b(?:camera rental|rental camera|cho thue|thue may anh|thue camera)\b/i
      .test(
        normalizedTitle
      )
  ) {

    add(
      "RENTAL",
      "TITLE",
      title,
      15
    );
  }


  // rental menu prior
  if (
    /\b(?:cho thue|thue may anh|thue camera|thue thiet bi)\b/i
      .test(
        normalizedMenu
      )
  ) {

    add(
      "RENTAL",
      "MENU",
      menuText,
      10
    );
  }


  // sale menu prior
  if (
    /\b(?:san pham|cua hang|shop|store|hang cu|chinh hang)\b/i
      .test(
        normalizedMenu
      )
  ) {

    add(
      "SALE",
      "MENU",
      menuText,
      10
    );
  }


  // rental CTA
  const rentalCta =
    normalizedVisible.match(
      /\b(?:thue ngay|dat thue|dat lich thue|rent now|book rental|book now)\b/i
    );


  if (
    rentalCta
  ) {

    add(
      "RENTAL",
      "CTA",
      rentalCta[0],
      25
    );
  }


  // sale CTA
  const saleCta =
    normalizedVisible.match(
      /\b(?:mua ngay|them vao gio|them gio hang|buy now|add to cart|checkout)\b/i
    );


  if (
    saleCta
  ) {

    add(
      "SALE",
      "CTA",
      saleCta[0],
      25
    );
  }


  // rental price unit
  const rentalPriceUnit =
    normalizedVisible.match(
      /(?:\d[\d.,\s]{1,18})\s*(?:d|vnd)?\s*(?:\/\s*ngay|moi ngay|per day|\/\s*day)\b/i
    );


  if (
    rentalPriceUnit
  ) {

    add(
      "RENTAL",
      "PRICE_UNIT",
      rentalPriceUnit[0],
      20
    );
  }


  // explicit new / used hints
  const usedHint =
    normalizedVisible.match(
      /\b(?:hang cu|may cu|second hand|second-hand|used)\b/i
    );


  if (
    usedHint
  ) {

    add(
      "SALE_USED",
      "VISIBLE_TEXT",
      usedHint[0],
      12
    );
  }


  const newHint =
    normalizedVisible.match(
      /\b(?:new 100%|hang moi|moi 100%|chinh hang|brand new)\b/i
    );


  if (
    newHint
  ) {

    add(
      "SALE_NEW",
      "VISIBLE_TEXT",
      newHint[0],
      12
    );
  }


  /*
   * Structured businessFunction is stronger
   * than global site text, but still a
   * site-level prior here.
   */
  const businessFunctions:
    string[] = [];


  $(
    'script[type="application/ld+json"]'
  ).each(
    (
      _,
      element
    ) => {

      const raw =
        $(element)
          .text();

      for (
        const document
        of parseJsonLd(
          raw
        )
      ) {

        collectBusinessFunctions(
          document,
          businessFunctions
        );
      }
    }
  );


  for (
    const raw
    of businessFunctions
  ) {

    const value =
      normalizeSearchText(
        raw
      );


    if (
      /(?:leaseout|lease|rental|rent)/
        .test(
          value
        )
    ) {

      add(
        "RENTAL",
        "JSON_LD",
        raw,
        60
      );
    }


    if (
      /(?:sell|sale)/
        .test(
          value
        )
    ) {

      add(
        "SALE",
        "JSON_LD",
        raw,
        60
      );
    }
  }


  let rentalScore =
    0;

  let saleScore =
    0;

  let newScore =
    0;

  let usedScore =
    0;


  for (
    const item
    of evidence
  ) {

    switch (
      item.kind
    ) {

      case "RENTAL":
        rentalScore +=
          item.weight;
        break;

      case "SALE":
        saleScore +=
          item.weight;
        break;

      case "SALE_NEW":
        newScore +=
          item.weight;
        saleScore +=
          Math.min(
            item.weight,
            8
          );
        break;

      case "SALE_USED":
        usedScore +=
          item.weight;
        saleScore +=
          Math.min(
            item.weight,
            8
          );
        break;
    }
  }


  return {
    rentalScore,
    saleScore,
    newScore,
    usedScore,
    evidence,
    title,
    menuText,
    visibleText
  };
}