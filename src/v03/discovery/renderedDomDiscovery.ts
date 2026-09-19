import {
  chromium,
  type Browser
} from "playwright";

import type {
  RenderedDomDiscoveryResult,
  UrlDiscoveryEvidence
} from "./multiSourceDiscoveryTypes.js";

import {
  scoreDiscoveredUrl,
  shouldTraverseAsCatalog
} from "./urlDiscoveryScoring.js";


export interface RenderedDomLink {
  readonly url:
    string;

  readonly text:
    string |
    null;
}


export interface RenderedDomRuntime {
  collectLinks(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      readonly RenderedDomLink[]
    >;
}


export interface PlaywrightRenderedDomRuntimeOptions {
  readonly headless?:
    boolean;

  readonly navigationTimeoutMs?:
    number;

  readonly settleMs?:
    number;

  readonly launchBrowser?:
    () =>
      Promise<
        Browser
      >;
}


const DEFAULT_NAVIGATION_TIMEOUT_MS =
  20_000;


const DEFAULT_SETTLE_MS =
  2_500;


export class PlaywrightRenderedDomRuntime
implements RenderedDomRuntime {

  private readonly headless:
    boolean;


  private readonly navigationTimeoutMs:
    number;


  private readonly settleMs:
    number;


  private readonly launchBrowser:
    () =>
      Promise<
        Browser
      >;


  constructor(
    options:
      PlaywrightRenderedDomRuntimeOptions = {}
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


  async collectLinks(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      readonly RenderedDomLink[]
    > {

    if (
      signal?.aborted
    ) {
      throw new Error(
        "Rendered DOM discovery aborted."
      );
    }


    let browser:
      Browser |
      null =
        null;


    try {

      browser =
        await this.launchBrowser();


      const context =
        await browser.newContext({
          serviceWorkers:
            "block"
        });


      try {

        const page =
          await context.newPage();


        await page.goto(
          rootUrl,
          {
            waitUntil:
              "domcontentloaded",

            timeout:
              this.navigationTimeoutMs
          }
        );


        await page.waitForTimeout(
          this.settleMs
        );


        await page.evaluate(
          () => {
            window.scrollTo(
              0,
              document.body.scrollHeight
            );
          }
        );


        await page.waitForTimeout(
          Math.min(
            1_000,
            this.settleMs
          )
        );


        return await page.evaluate(
          () =>
            Array.from(
              document.querySelectorAll(
                "a[href]"
              )
            )
              .map(
                anchor => ({
                  url:
                    (
                      anchor as
                        HTMLAnchorElement
                    ).href,

                  text:
                    (
                      anchor.textContent ??
                      ""
                    )
                      .replace(
                        /\s+/g,
                        " "
                      )
                      .trim() ||
                    null
                })
              )
        );
      }
      finally {
        await context.close();
      }
    }
    finally {

      if (
        browser !==
          null &&
        browser.isConnected()
      ) {
        await browser.close();
      }
    }
  }
}


export class RenderedDomDiscovery {
  private readonly runtime:
    RenderedDomRuntime;


  constructor(
    runtime?:
      RenderedDomRuntime
  ) {

    this.runtime =
      runtime ??
      new PlaywrightRenderedDomRuntime();
  }


  async discover(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      RenderedDomDiscoveryResult
    > {

    const warnings:
      string[] =
        [];


    const rootSite =
      new URL(
        rootUrl
      );


    const rootSiteKey =
      rootSite.hostname
        .replace(
          /^www\./i,
          ""
        )
        .toLowerCase();


    const evidence:
      UrlDiscoveryEvidence[] =
        [];


    const queue:
      Array<{
        readonly url:
          string;

        readonly depth:
          number;
      }> = [
        {
          url:
            rootUrl,

          depth:
            0
        }
      ];


    const queued =
      new Set([
        rootUrl
      ]);


    const maxPages =
      5;


    let visited =
      0;


    while (
      queue.length >
        0 &&
      visited <
        maxPages
    ) {

      const item =
        queue.shift()!;


      try {

        const links =
          await this.runtime.collectLinks(
            item.url,
            signal
          );


        visited +=
          1;


        for (
          const link
          of links
        ) {

          let parsed:
            URL;


          try {
            parsed =
              new URL(
                link.url
              );
          }
          catch {
            continue;
          }


          if (
            parsed.hostname
              .replace(
                /^www\./i,
                ""
              )
              .toLowerCase() !==
              rootSiteKey ||
            (
              parsed.protocol !==
                "http:" &&
              parsed.protocol !==
                "https:"
            )
          ) {
            continue;
          }


          parsed.hash = "";


          const url =
            parsed.toString();


          evidence.push({
            url,

            channel:
              "RENDERED_DOM",

            parentUrl:
              item.url,

            anchorText:
              link.text,

            score:
              scoreDiscoveredUrl(
                url,
                "RENDERED_DOM",
                link.text
              )
          });


          if (
            item.depth >=
              1 ||
            queued.has(
              url
            ) ||
            !shouldTraverseAsCatalog(
              url,
              link.text
            )
          ) {
            continue;
          }


          queued.add(
            url
          );


          queue.push({
            url,

            depth:
              item.depth +
              1
          });
        }
      }
      catch (
        error
      ) {

        warnings.push(
          "Rendered DOM discovery failed: " +
          item.url +
          " | " +
          (
            error instanceof
              Error
              ? error.message
              : String(
                  error
                )
          )
        );
      }
    }


    return {
      used:
        true,

      evidence,

      warnings
    };
  }
}
