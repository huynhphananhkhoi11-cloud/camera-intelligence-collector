import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page
} from "playwright";

import {
  PRIMARY_REGION_EXPRESSION
} from "./visualEvidenceCapture.js";

import type {
  ControlSnapshot,
  VisualEvidence
} from "./evidenceTypes.js";


export interface BatchCaptureResult {
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


export interface BatchCaptureFailure {
  readonly requestedUrl:
    string;

  readonly message:
    string;
}


export interface BatchCaptureOptions {
  readonly headless?:
    boolean;

  readonly browseBudgetMs?:
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

  readonly writeInfo?:
    (
      message:
        string
    ) =>
      void;
}


interface ReadinessSample {
  readonly ready:
    boolean;

  readonly signature:
    string;
}


const DEFAULT_BROWSE_BUDGET_MS =
  45_000;


function errorMessage(
  error:
    unknown
): string {

  return error instanceof
    Error
    ? error.message
    : String(
        error
      );
}


async function readiness(
  page:
    Page
): Promise<ReadinessSample> {

  return await page.evaluate(
    `(() => {
      const bodyText = (document.body?.innerText ?? "")
        .replace(/\\s+/g, " ")
        .trim();

      const hasHeading =
        Boolean(document.querySelector("h1")) ||
        Boolean(document.querySelector('[itemprop="name"]'));

      const hasMoney =
        /\\d[\\d.,\\s]{3,}\\s*(?:₫|đ|vnd)/iu.test(bodyText);

      const hasControl =
        Boolean(
          document.querySelector(
            'select,input[type="radio"],[aria-selected],[aria-pressed]'
          )
        );

      const hasPurchase =
        /(?:mua\\s*ngay|thêm\\s*vào\\s*giỏ|đặt\\s*hàng|add\\s*to\\s*cart|buy\\s*now)/iu
          .test(bodyText);

      const signature =
        [
          bodyText.length,
          bodyText.slice(0, 500)
        ].join("|");

      return {
        ready:
          hasHeading &&
          (hasMoney || hasControl || hasPurchase),

        signature
      };
    })()`
  ) as
    ReadinessSample;
}


async function waitForHumanReadableState(
  page:
    Page,
  budgetMs:
    number
): Promise<void> {

  const started =
    Date.now();


  let lastSignature =
    "";


  let stablePasses =
    0;


  while (
    Date.now() -
      started <
    budgetMs
  ) {

    const sample =
      await readiness(
        page
      );


    if (
      sample.ready &&
      sample.signature ===
        lastSignature
    ) {
      stablePasses +=
        1;
    }
    else {
      stablePasses =
        0;
    }


    if (
      sample.ready &&
      stablePasses >=
        1
    ) {
      return;
    }


    lastSignature =
      sample.signature;


    await page.waitForTimeout(
      1_000
    );
  }
}


export class BatchVisualEvidenceCapture {
  private readonly headless:
    boolean;


  private readonly browseBudgetMs:
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


  private readonly writeInfo:
    (
      message:
        string
    ) =>
      void;


  constructor(
    options:
      BatchCaptureOptions = {}
  ) {

    this.headless =
      options.headless ??
      true;


    this.browseBudgetMs =
      options.browseBudgetMs ??
      DEFAULT_BROWSE_BUDGET_MS;


    this.viewportWidth =
      options.viewportWidth ??
      768;


    this.viewportHeight =
      options.viewportHeight ??
      576;


    this.launchBrowser =
      options.launchBrowser ??
      (
        () =>
          chromium.launch({
            headless:
              this.headless
          })
      );


    this.writeInfo =
      options.writeInfo ??
      (
        message =>
          console.log(
            message
          )
      );
  }


  async run(
    urls:
      readonly string[],
    onCapture:
      (
        result:
          BatchCaptureResult
      ) =>
        Promise<void>,
    onFailure?:
      (
        failure:
          BatchCaptureFailure
      ) =>
        Promise<void>
  ):
    Promise<void> {

    if (
      urls.length ===
        0
    ) {
      return;
    }


    const browser =
      await this.launchBrowser();


    let context:
      BrowserContext |
      null =
        null;


    try {

      context =
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


      const page =
        await context.newPage();


      for (
        let index =
          0;
        index <
          urls.length;
        index +=
          1
      ) {

        const url =
          urls[
            index
          ]!;


        this.writeInfo(
          "[CAPTURE " +
          (
            index +
            1
          ) +
          "/" +
          urls.length +
          "] " +
          url
        );


        try {

          await page.goto(
            url,
            {
              waitUntil:
                "domcontentloaded",

              timeout:
                Math.min(
                  30_000,
                  this.browseBudgetMs
                )
            }
          );


          await waitForHumanReadableState(
            page,
            this.browseBudgetMs
          );


          const h1 =
            page.locator(
              "h1"
            ).first();


          if (
            await h1.count() >
              0
          ) {

            try {

              if (
                await h1.isVisible()
              ) {
                await h1.scrollIntoViewIfNeeded();


                await page.evaluate(
                  "window.scrollBy(0, -72)"
                );


                await page.waitForTimeout(
                  150
                );
              }
            }
            catch {
              // Best-effort visual positioning only.
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
                "webp",

              quality:
                84,

              scale:
                "css",

              fullPage:
                false,

              animations:
                "disabled"
            });


          const evidenceBoard:
            VisualEvidence = {
            imageId:
              "board_primary_001",

            kind:
              "PRIMARY_PRODUCT_VIEWPORT",

            mimeType:
              "image/webp",

            base64:
              screenshot.toString(
                "base64"
              ),

            width:
              this.viewportWidth,

            height:
              this.viewportHeight
          };


          await onCapture({
            requestedUrl:
              url,

            finalUrl:
              page.url(),

            renderedHtml:
              await page.content(),

            primaryRegionText:
              primary.text,

            controls:
              primary.controls,

            evidenceBoard
          });
        }
        catch (
          error
        ) {

          if (
            onFailure
          ) {
            await onFailure({
              requestedUrl:
                url,

              message:
                errorMessage(
                  error
                )
            });
          }
        }
      }
    }
    finally {

      if (
        context
      ) {
        await context.close();
      }


      if (
        browser.isConnected()
      ) {
        await browser.close();
      }
    }
  }
}
