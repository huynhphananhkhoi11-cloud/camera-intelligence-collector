import type {
  BrowserContext,
  Page
} from "playwright";

export type CatalogIntent =
  | "RENTAL"
  | "SECOND_HAND"
  | "NEW"
  | "CAMERA_GENERIC";

export interface CatalogSeed {
  url: string;
  intent: CatalogIntent;
  label: string;
}

export interface ProductCandidate {
  url: string;
  title: string;
  intent: CatalogIntent;
  catalogUrl: string;
  priceText: string;
}

export interface CatalogCrawlResult {
  visitedCatalogs: string[];
  products: ProductCandidate[];
  queueRemaining: number;
  skippedBySafetyLimit: number;
  failedCatalogs: string[];
}

function canonicalUrl(
  value: string
): string {

  try {
    const u = new URL(value);

    u.hash = "";

    for (
      const key of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "fbclid"
      ]
    ) {
      u.searchParams.delete(key);
    }

    /*
      page=1 / p=1 represents the root page.
      Normalize it so page 1 is not crawled twice.
    */
    if (
      u.searchParams.get("p") === "1"
    ) {
      u.searchParams.delete("p");
    }

    if (
      u.searchParams.get("page") === "1"
    ) {
      u.searchParams.delete("page");
    }

    u.searchParams.sort();

    return u.href;

  } catch {
    return value;
  }
}

async function scanCatalogPage(
  page: Page,
  intent: CatalogIntent
): Promise<{
  products: ProductCandidate[];
  pagination: string[];
  declaredTotalPages: number | null;
}> {

  /*
    Raw JS avoids tsx/esbuild helpers inside
    the browser execution environment.
  */
  const raw = await page.evaluate(`
    (() => {

      const clean = (value) =>
        String(value || "")
          .replace(/\\s+/g, " ")
          .trim();

      const moneyRe =
        /(?:\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(?:đ|₫|vnd)/i;

      const root =
        document.querySelector(
          "main,[role='main'],#main,#MainContent,.main-content,.content"
        ) ||
        document.body;

      const bodyText =
        clean(
          root.innerText ||
          root.textContent ||
          ""
        );

      /*
        Many Vietnamese storefronts explicitly
        publish "Page 1 / 18".
      */
      const pageCountMatch =
        bodyText.match(
          /Page\\s+\\d+\\s*\\/\\s*(\\d+)/i
        );

      const declaredTotalPages =
        pageCountMatch
          ? Number(pageCountMatch[1])
          : null;

      const anchors =
        Array.from(
          root.querySelectorAll(
            "a[href]"
          )
        );

      const products = [];
      const pagination = [];

      for (const a of anchors) {

        const href =
          a.href || "";

        if (!href) {
          continue;
        }

        let url;

        try {
          url = new URL(href);
        } catch {
          continue;
        }

        if (
          url.origin !==
          location.origin
        ) {
          continue;
        }

        /*
          PRODUCT TITLE

          Prefer heading text because on this
          and many storefronts product names are
          rendered as H2/H3/H4 links.
        */
        const heading =
          a.closest(
            "h1,h2,h3,h4,h5"
          );

        const anchorText =
          clean(
            a.innerText ||
            a.textContent ||
            a.getAttribute("title") ||
            ""
          );

        const headingText =
          clean(
            heading?.innerText ||
            heading?.textContent ||
            ""
          );

        const title =
          headingText ||
          anchorText;

        if (!title) {
          /*
            Image-only product links will normally
            have a second text link to the same URL.
          */
          continue;
        }

        /*
          Reject obvious navigation text.
        */
        const genericNavigation =
          /^(home|trang chủ|sản phẩm|máy ảnh cũ|máy ảnh chính hãng|camera|giỏ hàng|tin tức|liên hệ|khuyến mãi)$/i
            .test(title);

        if (
          genericNavigation
        ) {
          continue;
        }

        /*
          Find the SMALLEST nearby container that
          has commercial/product evidence.

          Previous version climbed to a huge parent,
          causing every item to inherit 14.500.000đ.
        */
        let container =
          a.parentElement;

        let cardText =
          title;

        for (
          let depth = 0;
          depth < 7 &&
          container;
          depth++
        ) {

          const text =
            clean(
              container.innerText ||
              container.textContent ||
              ""
            );

          const hasCommercialSignal =
            moneyRe.test(text) ||
            /liên hệ báo giá|best seller|còn hàng|hết hàng/i
              .test(text);

          const linkCount =
            container.querySelectorAll(
              "a[href]"
            ).length;

          /*
            A product card should be reasonably
            compact and should not contain dozens
            of navigation links.
          */
          if (
            hasCommercialSignal &&
            text.length <= 1400 &&
            linkCount <= 10
          ) {
            cardText = text;
            break;
          }

          container =
            container.parentElement;
        }

        const hasBrand =
          /\\b(canon|sony|nikon|fujifilm|fuji|lumix|panasonic|olympus|om system|leica|ricoh|pentax|gopro|dji|insta360)\\b/i
            .test(title);

        const cameraSignal =
          /eos|alpha|máy ảnh|camera|body|mirrorless|dslr|compact|zv-|powershot|instax|x-[a-z0-9]|x\\d{2,4}|d\\d{2,4}|r\\d{1,3}/i
            .test(title);

        /*
          Require a model-like product title.
          This prevents "/" and category links
          from being mistaken for products.
        */
        const modelSignal =
          /\\d/.test(title) ||
          cameraSignal;

        const commercialSignal =
          moneyRe.test(cardText) ||
          /liên hệ báo giá|best seller|còn hàng|hết hàng/i
            .test(cardText);

        /*
          Strong accessory-only titles.
          Do NOT reject camera kits such as
          "Canon 760D + Lens Kit 18-55".
        */
        const accessoryOnly =
          /^(ống kính|lens\\b|pin\\b|sạc\\b|charger\\b|ngàm\\b|adapter\\b|filter\\b|tripod\\b|balo\\b|túi\\b|thẻ nhớ\\b|flash\\b)/i
            .test(title);

        const badPath =
          /\\/(gio-hang|cart|checkout|login|account|tin-tuc|blog|lien-he)(?:\\/|$)/i
            .test(
              url.pathname
            );

        /*
          Catalog and pagination URLs are not products.
        */
        const paginationUrl =
          url.searchParams.has("p") ||
          url.searchParams.has("page") ||
          /\\/page\\/\\d+/i.test(
            url.pathname
          );

        if (
          !badPath &&
          !paginationUrl &&
          !accessoryOnly &&
          hasBrand &&
          modelSignal &&
          commercialSignal
        ) {

          const priceMatch =
            cardText.match(
              moneyRe
            );

          const priceText =
            priceMatch
              ? priceMatch[0]
              : /liên hệ báo giá/i.test(cardText)
                ? "Liên hệ báo giá"
                : "";

          products.push({
            url:
              url.href,

            title,

            priceText
          });
        }

        /*
          Pagination fallback is deliberately
          STRICT:

          - same origin
          - same pathname as current catalog
          - numeric p/page parameter

          Therefore /gio-hang can never enter
          the catalog queue.
        */
        if (
          url.origin ===
            location.origin &&
          url.pathname ===
            location.pathname
        ) {

          const p =
            url.searchParams.get("p") ||
            url.searchParams.get("page");

          if (
            p &&
            /^\\d+$/.test(p)
          ) {
            pagination.push(
              url.href
            );
          }
        }
      }

      return {
        products,
        pagination,
        declaredTotalPages
      };

    })()
  `) as {
    products: {
      url: string;
      title: string;
      priceText: string;
    }[];
    pagination: string[];
    declaredTotalPages: number | null;
  };

  const currentCatalogUrl =
    canonicalUrl(
      page.url()
    );

  /*
    Deduplicate product URLs WITHIN each page.
  */
  const pageProducts =
    new Map<
      string,
      ProductCandidate
    >();

  for (
    const product
    of raw.products
  ) {

    const url =
      canonicalUrl(
        product.url
      );

    if (
      url ===
      currentCatalogUrl
    ) {
      continue;
    }

    const existing =
      pageProducts.get(url);

    /*
      Prefer the candidate with a real title.
    */
    if (
      !existing ||
      (
        !existing.title &&
        product.title
      )
    ) {
      pageProducts.set(
        url,
        {
          url,

          title:
            product.title,

          intent,

          catalogUrl:
            currentCatalogUrl,

          priceText:
            product.priceText
        }
      );
    }
  }

  /*
    Pagination URLs found directly in DOM.
  */
  const paginationSet =
    new Set<string>();

  for (
    const value
    of raw.pagination
  ) {

    const u =
      canonicalUrl(value);

    if (
      u !==
      currentCatalogUrl
    ) {
      paginationSet.add(u);
    }
  }

  /*
    COMPLETENESS IMPROVEMENT

    If site declares Page 1 / N,
    construct the entire sequence.

    This avoids the old behavior:
    1→2→3→... then jumping to 17/18
    before discovering 8–16.
  */
  if (
    raw.declaredTotalPages &&
    raw.declaredTotalPages > 1
  ) {

    const current =
      new URL(
        page.url()
      );

    /*
      Infer whether this site uses ?p=
      or ?page= from pagination links.
    */
    let param =
      "p";

    for (
      const value
      of raw.pagination
    ) {

      try {
        const u =
          new URL(value);

        if (
          u.searchParams.has(
            "page"
          )
        ) {
          param = "page";
          break;
        }

        if (
          u.searchParams.has(
            "p"
          )
        ) {
          param = "p";
          break;
        }
      } catch {}
    }

    /*
      Generate pages 2..N.
      Page 1 is the root URL.
    */
    for (
      let pageNumber = 2;
      pageNumber <=
        raw.declaredTotalPages;
      pageNumber++
    ) {

      const u =
        new URL(
          current.href
        );

      u.searchParams.delete("p");
      u.searchParams.delete("page");

      u.searchParams.set(
        param,
        String(pageNumber)
      );

      paginationSet.add(
        canonicalUrl(
          u.href
        )
      );
    }
  }

  return {
    products:
      [...pageProducts.values()],

    pagination:
      [...paginationSet],

    declaredTotalPages:
      raw.declaredTotalPages
  };
}

export async function crawlCatalogs(
  context: BrowserContext,
  seeds: CatalogSeed[]
): Promise<CatalogCrawlResult> {

  const queue =
    seeds.map(
      seed => ({
        ...seed,
        url:
          canonicalUrl(
            seed.url
          )
      })
    );

  const queued =
    new Set(
      queue.map(
        item => item.url
      )
    );

  const intentByUrl =
    new Map<
      string,
      CatalogIntent
    >();

  for (
    const seed
    of queue
  ) {
    intentByUrl.set(
      seed.url,
      seed.intent
    );
  }

  const visited =
    new Set<string>();

  const failed =
    new Set<string>();

  const products =
    new Map<
      string,
      ProductCandidate
    >();

  const SAFETY_MAX_PAGES =
    2000;

  let skippedBySafetyLimit =
    0;

  const page =
    await context.newPage();

  try {

    while (
      queue.length > 0
    ) {

      if (
        visited.size >=
        SAFETY_MAX_PAGES
      ) {

        skippedBySafetyLimit =
          queue.length;

        break;
      }

      const current =
        queue.shift()!;

      const currentUrl =
        canonicalUrl(
          current.url
        );

      queued.delete(
        currentUrl
      );

      if (
        visited.has(
          currentUrl
        )
      ) {
        continue;
      }

      console.log("");
      console.log(
        `[CATALOG ${
          visited.size + 1
        }]`
      );

      console.log(
        currentUrl
      );

      let loaded = false;
      let lastError = "";

      /*
        Two attempts before marking unresolved.
      */
      for (
        let attempt = 1;
        attempt <= 2;
        attempt++
      ) {

        try {

          await page.goto(
            currentUrl,
            {
              waitUntil:
                "domcontentloaded",
              timeout: 45000
            }
          );

          await page.waitForTimeout(
            600
          );

          loaded = true;
          break;

        } catch (error) {

          lastError =
            String(error);

          if (
            attempt < 2
          ) {
            await page.waitForTimeout(
              800
            );
          }
        }
      }

      if (!loaded) {

        failed.add(
          currentUrl
        );

        console.log(
          `  FAILED: ${lastError}`
        );

        continue;
      }

      visited.add(
        currentUrl
      );

      const inheritedIntent =
        intentByUrl.get(
          currentUrl
        ) ??
        current.intent;

      const scan =
        await scanCatalogPage(
          page,
          inheritedIntent
        );

      if (
        scan.declaredTotalPages
      ) {
        console.log(
          `  Declared pages: ${
            scan.declaredTotalPages
          }`
        );
      }

      let newProducts = 0;

      for (
        const product
        of scan.products
      ) {

        if (
          product.url ===
          currentUrl
        ) {
          continue;
        }

        if (
          !products.has(
            product.url
          )
        ) {

          products.set(
            product.url,
            product
          );

          newProducts++;
        }
      }

      let newPages = 0;

      for (
        const nextRaw
        of scan.pagination
      ) {

        const next =
          canonicalUrl(
            nextRaw
          );

        if (
          visited.has(next) ||
          queued.has(next) ||
          failed.has(next)
        ) {
          continue;
        }

        intentByUrl.set(
          next,
          inheritedIntent
        );

        queue.push({
          url: next,
          intent:
            inheritedIntent,
          label:
            current.label
        });

        queued.add(next);

        newPages++;
      }

      console.log(
        `  Products: +${newProducts}`
      );

      console.log(
        `  Pagination: +${newPages}`
      );

      console.log(
        `  Total products: ${
          products.size
        }`
      );

      console.log(
        `  Queue: ${
          queue.length
        }`
      );
    }

  } finally {

    await page.close();
  }

  /*
    Failed pages count as unresolved work.
    Queue zero alone is NOT completeness.
  */
  return {
    visitedCatalogs:
      [...visited],

    products:
      [...products.values()],

    queueRemaining:
      queue.length +
      failed.size,

    skippedBySafetyLimit,

    failedCatalogs:
      [...failed]
  };
}
