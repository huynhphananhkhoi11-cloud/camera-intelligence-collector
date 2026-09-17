import {
  chromium,
  type BrowserContext,
  type Page
} from "playwright";

import type {
  ProbedRootCandidate
} from "./commercialRootDiscovery.js";

import {
  ProductUrlGraph,
  type ProductUrlNode
} from "./productUrlGraph.js";

import {
  ingestCatalogSnapshot
} from "./productUrlGraphBuilder.js";

import {
  attachNetworkObserver
} from "../network/networkObserver.js";

import {
  canonicalizeUrl
} from "./urlPolicy.js";


export interface LiveProductUrlGraphOptions {
  headless?: boolean;

  maxRoots?: number;

  maxPagesPerRoot?: number;

  maxInteractionsPerPage?: number;

  noNewUrlRounds?: number;

  navigationTimeoutMs?: number;

  settleTimeoutMs?: number;

  interactionWaitMs?: number;

  pageTimeoutMs?: number;

  onProgress?: (
    message: string
  ) => void;
}


export interface LiveProductUrlGraphResult {
  nodes:
    ProductUrlNode[];

  rootsProcessed:
    number;

  catalogPagesVisited:
    number;

  interactions:
    number;

  errors:
    {
      url:
        string;

      error:
        string;
    }[];
}


async function bounded<T>(
  promise:
    Promise<T>,
  timeoutMs:
    number,
  label:
    string
): Promise<T> {

  let timer:
    ReturnType<
      typeof setTimeout
    > | undefined;


  const timeout =
    new Promise<never>(
      (
        _,
        reject
      ) => {

        timer =
          setTimeout(
            () => {

              reject(
                new Error(
                  `${label} timed out after ${timeoutMs}ms`
                )
              );

            },
            timeoutMs
          );
      }
    );


  try {

    return await Promise.race([
      promise,
      timeout
    ]);
  }
  finally {

    if (timer) {
      clearTimeout(timer);
    }
  }
}


export function createCatalogPageQueue(
  rootUrl:
    string,
  discovered:
    readonly string[],
  maxPages:
    number
): string[] {

  const root =
    new URL(
      rootUrl
    );

  const seen =
    new Set<string>();

  const queue:
    string[] = [];


  const add =
    (
      raw:
        string
    ): void => {

      const canonical =
        canonicalizeUrl(
          raw,
          rootUrl
        );

      if (!canonical) {
        return;
      }


      const url =
        new URL(
          canonical
        );


      if (
        url.origin !==
        root.origin
      ) {
        return;
      }


      if (
        seen.has(
          canonical
        )
      ) {
        return;
      }


      if (
        queue.length >=
        maxPages
      ) {
        return;
      }


      seen.add(
        canonical
      );

      queue.push(
        canonical
      );
    };


  add(
    rootUrl
  );


  for (
    const url
    of discovered
  ) {

    add(url);
  }


  return queue;
}


async function tryLoadMore(
  page:
    Page
): Promise<boolean> {

  const locator =
    page
      .locator(
        'button, [role="button"], a'
      )
      .filter({
        hasText:
          /(?:xem\s+thêm|load\s+more|show\s+more|more\s+products)/i
      })
      .first();


  try {

    if (
      await locator.isVisible({
        timeout:
          500
      })
    ) {

      await locator.click({
        timeout:
          1500
      });

      return true;
    }

  }
  catch {
    // No actionable load-more control.
  }


  return false;
}


async function interactForMore(
  page:
    Page,
  waitMs:
    number
): Promise<
  "CLICK" |
  "SCROLL"
> {

  const clicked =
    await tryLoadMore(
      page
    );


  if (
    clicked
  ) {

    await page.waitForTimeout(
      waitMs
    );

    return "CLICK";
  }


  await page.evaluate(
    () => {

      window.scrollTo(
        0,
        document.body.scrollHeight
      );
    }
  );


  await page.waitForTimeout(
    waitMs
  );


  return "SCROLL";
}


interface PageCollectionResult {
  paginationUrls:
    string[];

  interactions:
    number;
}


async function collectCatalogPage(
  context:
    BrowserContext,
  pageUrl:
    string,
  graph:
    ProductUrlGraph,
  canonicalOrigin:
    string,
  sitemapUrls:
    readonly string[],
  options:
    Required<
      Pick<
        LiveProductUrlGraphOptions,
        | "maxInteractionsPerPage"
        | "noNewUrlRounds"
        | "navigationTimeoutMs"
        | "settleTimeoutMs"
        | "interactionWaitMs"
        | "pageTimeoutMs"
      >
    >
): Promise<PageCollectionResult> {

  const page =
    await context.newPage();


  const observer =
    attachNetworkObserver(
      page,
      {
        maxBodyBytes:
          512 * 1024,

        maxResponseBodies:
          40,

        maxRecordedEvents:
          800
      }
    );


  const work =
    async (): Promise<
      PageCollectionResult
    > => {

      await page.goto(
        pageUrl,
        {
          waitUntil:
            "domcontentloaded",

          timeout:
            options
              .navigationTimeoutMs
        }
      );


      try {

        await page.waitForLoadState(
          "networkidle",
          {
            timeout:
              options
                .settleTimeoutMs
          }
        );

      }
      catch {
        // Noisy catalog pages are acceptable.
      }


      let html =
        await page.content();


      let latest =
        ingestCatalogSnapshot(
          graph,
          {
            pageUrl:
              page.url(),

            html,

            network:
              observer.snapshot(),

            sitemapUrls
          },
          canonicalOrigin
        );


      const pagination =
        new Set(
          latest.paginationUrls
        );


      let noNewRounds =
        0;

      let interactions =
        0;


      for (
        let round = 0;
        round <
          options.maxInteractionsPerPage;
        round += 1
      ) {

        const before =
          graph.size;


        await interactForMore(
          page,
          options
            .interactionWaitMs
        );


        interactions +=
          1;


        html =
          await page.content();


        latest =
          ingestCatalogSnapshot(
            graph,
            {
              pageUrl:
                page.url(),

              html,

              network:
                observer.snapshot(),

              sitemapUrls
            },
            canonicalOrigin
          );


        for (
          const paginationUrl
          of latest.paginationUrls
        ) {

          pagination.add(
            paginationUrl
          );
        }


        if (
          graph.size ===
          before
        ) {

          noNewRounds +=
            1;
        }
        else {

          noNewRounds =
            0;
        }


        if (
          noNewRounds >=
          options.noNewUrlRounds
        ) {
          break;
        }
      }


      let finalNetwork =
        observer.snapshot();


      try {

        finalNetwork =
          await bounded(
            observer.stop(),
            1500,
            "network observer stop"
          );

      }
      catch {
        finalNetwork =
          observer.snapshot();
      }


      /*
       * One final ingest catches API candidates
       * that arrived during interaction.
       */
      ingestCatalogSnapshot(
        graph,
        {
          pageUrl:
            page.url(),

          html:
            await page.content(),

          network:
            finalNetwork,

          sitemapUrls
        },
        canonicalOrigin
      );


      return {
        paginationUrls:
          Array.from(
            pagination
          ),

        interactions
      };
    };


  try {

    return await bounded(
      work(),
      options.pageTimeoutMs,
      `catalog page ${pageUrl}`
    );

  }
  finally {

    await page.close({
      runBeforeUnload:
        false
    })
      .catch(
        () => undefined
      );


    void observer.stop()
      .catch(
        () => undefined
      );
  }
}


export async function buildProductUrlGraphLive(
  canonicalOrigin:
    string,
  roots:
    readonly ProbedRootCandidate[],
  sitemapUrls:
    readonly string[],
  options:
    LiveProductUrlGraphOptions = {}
): Promise<LiveProductUrlGraphResult> {

  const maxRoots =
    options.maxRoots ??
    3;

  const maxPagesPerRoot =
    options.maxPagesPerRoot ??
    5;

  const maxInteractionsPerPage =
    options.maxInteractionsPerPage ??
    3;

  const noNewUrlRounds =
    options.noNewUrlRounds ??
    2;

  const navigationTimeoutMs =
    options.navigationTimeoutMs ??
    10000;

  const settleTimeoutMs =
    options.settleTimeoutMs ??
    1000;

  const interactionWaitMs =
    options.interactionWaitMs ??
    500;

  const pageTimeoutMs =
    options.pageTimeoutMs ??
    20000;


  const graph =
    new ProductUrlGraph(
      canonicalOrigin
    );


  const browser =
    await chromium.launch({
      headless:
        options.headless ??
        true
    });


  const context =
    await browser.newContext();


  const errors:
    {
      url:
        string;

      error:
        string;
    }[] = [];


  let catalogPagesVisited =
    0;

  let interactions =
    0;


  const selectedRoots =
    roots.slice(
      0,
      maxRoots
    );


  try {

    for (
      const [
        rootIndex,
        root
      ]
      of selectedRoots.entries()
    ) {

      options.onProgress?.(
        `Root ${rootIndex + 1}/${selectedRoots.length}: ${root.url}`
      );


      const queue:
        string[] = [
          root.url
        ];

      const seen =
        new Set<string>();


      while (
        queue.length >
          0 &&
        seen.size <
          maxPagesPerRoot
      ) {

        const rawPageUrl =
          queue.shift();

        if (!rawPageUrl) {
          break;
        }


        const pageUrl =
          canonicalizeUrl(
            rawPageUrl,
            root.url
          );

        if (
          !pageUrl ||
          seen.has(
            pageUrl
          )
        ) {
          continue;
        }


        seen.add(
          pageUrl
        );


        options.onProgress?.(
          `  Catalog page ${seen.size}/${maxPagesPerRoot}: ${pageUrl}`
        );


        try {

          const collected =
            await collectCatalogPage(
              context,
              pageUrl,
              graph,
              canonicalOrigin,
              sitemapUrls,
              {
                maxInteractionsPerPage,
                noNewUrlRounds,
                navigationTimeoutMs,
                settleTimeoutMs,
                interactionWaitMs,
                pageTimeoutMs
              }
            );


          catalogPagesVisited +=
            1;

          interactions +=
            collected.interactions;


          for (
            const paginationUrl
            of collected.paginationUrls
          ) {

            const canonical =
              canonicalizeUrl(
                paginationUrl,
                pageUrl
              );


            if (
              canonical &&
              !seen.has(
                canonical
              ) &&
              queue.length +
                seen.size <
                maxPagesPerRoot
            ) {

              queue.push(
                canonical
              );
            }
          }

        }
        catch (
          error
        ) {

          errors.push({
            url:
              pageUrl,

            error:
              error instanceof Error
                ? error.message
                : String(error)
          });
        }
      }
    }

  }
  finally {

    await bounded(
      context.close(),
      5000,
      "product graph context close"
    )
      .catch(
        () => undefined
      );


    await bounded(
      browser.close(),
      5000,
      "product graph browser close"
    )
      .catch(
        () => undefined
      );
  }


  return {
    nodes:
      graph.values(),

    rootsProcessed:
      selectedRoots.length,

    catalogPagesVisited,

    interactions,

    errors
  };
}