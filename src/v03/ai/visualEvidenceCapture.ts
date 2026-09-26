import {
  chromium,
  type Browser
} from "playwright";

import type {
  ControlSnapshot,
  VisualEvidence
} from "./evidenceTypes.js";


export const PRIMARY_REGION_EXPRESSION = String.raw`(() => {
  const h1 = document.querySelector("h1");
  const main = document.querySelector("main");
  const body = document.body;

  let best = h1?.parentElement ?? main ?? body;
  let bestScore = Number.NEGATIVE_INFINITY;
  let cursor = h1?.parentElement ?? null;

  for (
    let depth = 0;
    depth < 7 && cursor !== null;
    depth += 1
  ) {
    if (
      cursor === body ||
      cursor === document.documentElement
    ) {
      break;
    }

    const text = cursor.innerText ?? "";
    const rect = cursor.getBoundingClientRect();

    let score = 0;

    if (/\\d[\\d.,\\s]{3,}\\s*(?:₫|đ|vnd)/iu.test(text)) {
      score += 4;
    }

    if (
      cursor.querySelector(
        "select,input[type=radio],[aria-selected],[aria-pressed]"
      )
    ) {
      score += 3;
    }

    if (
      cursor.querySelector(
        "button,[role=button],a[href]"
      )
    ) {
      score += 1;
    }

    if (rect.width >= 420) {
      score += 1;
    }

    if (
      text.length >= 30 &&
      text.length <= 8000
    ) {
      score += 2;
    }

    if (text.length > 15000) {
      score -= 4;
    }

    if (score > bestScore) {
      bestScore = score;
      best = cursor;
    }

    cursor = cursor.parentElement;
  }

  const root = best ?? main ?? body;
  const text = root.innerText ?? "";
  const controls = [];

  const normalize = value =>
    String(value ?? "")
      .replace(/\\s+/g, " ")
      .trim();

  const labelFor = input => {
    const id = input.id;

    if (id) {
      const explicit = root.querySelector(
        'label[for="' + CSS.escape(id) + '"]'
      );

      const explicitText = normalize(
        explicit?.textContent
      );

      if (explicitText) {
        return explicitText;
      }
    }

    return normalize(
      input.closest("label")?.textContent
    );
  };

  for (
    const select of Array.from(
      root.querySelectorAll("select")
    ).slice(0, 20)
  ) {
    for (
      const option of Array.from(
        select.options
      ).slice(0, 30)
    ) {
      const label = normalize(
        option.textContent
      );

      if (!label) {
        continue;
      }

      controls.push({
        kind: "select-option",
        label,
        value: normalize(option.value),
        selected: option.selected
      });
    }
  }

  for (
    const input of Array.from(
      root.querySelectorAll(
        'input[type="radio"],input[type="checkbox"]'
      )
    ).slice(0, 60)
  ) {
    const label = normalize(
      labelFor(input) ||
      input.getAttribute("aria-label") ||
      input.value
    );

    if (!label) {
      continue;
    }

    controls.push({
      kind: input.type,
      label,
      value: normalize(input.value),
      selected: input.checked
    });
  }

  for (
    const element of Array.from(
      root.querySelectorAll(
        '[aria-selected],[aria-pressed],[role="option"],[role="radio"]'
      )
    ).slice(0, 60)
  ) {
    const label = normalize(
      element.innerText ||
      element.getAttribute("aria-label")
    );

    if (
      !label ||
      label.length > 180
    ) {
      continue;
    }

    controls.push({
      kind:
        element.getAttribute("role") ??
        element.tagName.toLowerCase(),

      label,

      value:
        normalize(
          element.getAttribute("data-value") ||
          element.getAttribute("value")
        ),

      selected:
        element.getAttribute("aria-selected") === "true" ||
        element.getAttribute("aria-pressed") === "true"
    });
  }

  for (
    const button of Array.from(
      root.querySelectorAll("button")
    ).slice(0, 40)
  ) {
    const label = normalize(
      button.innerText ||
      button.getAttribute("aria-label")
    );

    if (
      !label ||
      label.length > 140
    ) {
      continue;
    }

    controls.push({
      kind: "button",
      label,
      value:
        normalize(
          button.getAttribute("data-value")
        ),
      selected:
        button.classList.contains("active") ||
        button.classList.contains("selected")
    });
  }

  const unique = Array.from(
    new Map(
      controls.map(item => [
        [
          item.kind,
          item.label,
          item.value,
          item.selected
        ].join("\\0"),
        item
      ])
    ).values()
  ).slice(0, 80);

  return {
    text: text.slice(0, 8000),
    controls: unique
  };
})()`;


export interface VisualPageCapture {
  readonly requestedUrl:
    string;

  readonly finalUrl:
    string;

  readonly renderedHtml:
    string;

  readonly primaryRegionText:
    string;

  readonly controls:
    readonly ControlSnapshot[];

  readonly evidenceBoard:
    VisualEvidence;
}


export interface VisualEvidenceCaptureOptions {
  readonly headless?:
    boolean;

  readonly navigationTimeoutMs?:
    number;

  readonly settleMs?:
    number;

  readonly viewportWidth?:
    number;

  readonly viewportHeight?:
    number;

  readonly launchBrowser?:
    () =>
      Promise<
        Browser
      >;
}


const DEFAULT_NAVIGATION_TIMEOUT_MS =
  30_000;


const DEFAULT_SETTLE_MS =
  1_200;


export class VisualEvidenceCapture {
  private readonly headless:
    boolean;


  private readonly navigationTimeoutMs:
    number;


  private readonly settleMs:
    number;


  private readonly viewportWidth:
    number;


  private readonly viewportHeight:
    number;


  private readonly launchBrowser:
    () =>
      Promise<
        Browser
      >;


  constructor(
    options:
      VisualEvidenceCaptureOptions = {}
  ) {

    this.headless =
      options.headless ??
      true;


    this.navigationTimeoutMs =
      options.navigationTimeoutMs ??
      DEFAULT_NAVIGATION_TIMEOUT_MS;


    this.settleMs =
      options.settleMs ??
      DEFAULT_SETTLE_MS;


    this.viewportWidth =
      options.viewportWidth ??
      896;


    this.viewportHeight =
      options.viewportHeight ??
      672;


    this.launchBrowser =
      options.launchBrowser ??
      (
        () =>
          chromium.launch({
            headless:
              this.headless
          })
      );
  }


  async capture(
    url:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      VisualPageCapture
    > {

    if (
      signal?.aborted
    ) {
      throw new Error(
        "Visual evidence capture aborted."
      );
    }


    const browser =
      await this.launchBrowser();


    const context =
      await browser.newContext({
        viewport: {
          width:
            this.viewportWidth,

          height:
            this.viewportHeight
        },

        serviceWorkers:
          "block"
      });


    try {

      const page =
        await context.newPage();


      await page.goto(
        url,
        {
          waitUntil:
            "domcontentloaded",

          timeout:
            this.navigationTimeoutMs
        }
      );


      try {
        await page.waitForLoadState(
          "networkidle",
          {
            timeout:
              4_000
          }
        );
      }
      catch {
        // Some commerce pages keep long-lived requests.
      }


      await page.waitForTimeout(
        this.settleMs
      );


      const heading =
        page.locator(
          "h1"
        ).first();


      if (
        await heading.count() >
          0
      ) {

        try {

          if (
            await heading.isVisible()
          ) {

            await heading.scrollIntoViewIfNeeded();


            await page.evaluate(
              "window.scrollBy(0, -96)"
            );


            await page.waitForTimeout(
              150
            );
          }
        }
        catch {
          // Screenshot remains usable even if scrolling is blocked.
        }
      }


      const primary =
        await page.evaluate(
          PRIMARY_REGION_EXPRESSION
        ) as {
          readonly text:
            string;

          readonly controls:
            readonly ControlSnapshot[];
        };


      const screenshot =
        await page.screenshot({
          type:
            "png",

          fullPage:
            false,

          animations:
            "disabled"
        });


      const renderedHtml =
        await page.content();


      const evidenceBoard:
        VisualEvidence = {
          imageId:
            "board_primary_001",

          kind:
            "PRIMARY_PRODUCT_VIEWPORT",

          mimeType:
            "image/png",

          base64:
            screenshot.toString(
              "base64"
            ),

          width:
            this.viewportWidth,

          height:
            this.viewportHeight
        };


      return {
        requestedUrl:
          url,

        finalUrl:
          page.url(),

        renderedHtml,

        primaryRegionText:
          primary.text,

        controls:
          primary.controls,

        evidenceBoard
      };
    }
    finally {

      await context.close();


      if (
        browser.isConnected()
      ) {
        await browser.close();
      }
    }
  }
}
