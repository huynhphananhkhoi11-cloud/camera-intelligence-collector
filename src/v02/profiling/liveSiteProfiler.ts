import {
  chromium,
  type Page
} from "playwright";

import {
  attachNetworkObserver,
  type NetworkObserverOptions,
  type NetworkObserverSnapshot
} from "../network/networkObserver.js";

import {
  profileSite,
  type SiteProfile
} from "./siteProfiler.js";


export interface LiveSiteProfilerOptions {
  headless?: boolean;

  navigationTimeoutMs?: number;

  settleTimeoutMs?: number;

  userAgent?: string;

  networkObserverOptions?:
    NetworkObserverOptions;
}


export interface LiveSiteProfileResult {
  requestedUrl: string;

  finalUrl: string;

  profile:
    SiteProfile;

  network:
    NetworkObserverSnapshot;
}


/**
 * Observe/profile an already-created page.
 *
 * IMPORTANT:
 * Network observer is attached BEFORE goto().
 *
 * Keeping this function separate from browser creation
 * makes the ordering deterministic and unit-testable.
 */
export async function profilePageWithNetwork(
  page: Page,
  url: string,
  options:
    LiveSiteProfilerOptions = {}
): Promise<LiveSiteProfileResult> {

  const navigationTimeoutMs =
    options.navigationTimeoutMs ??
    45000;

  const settleTimeoutMs =
    options.settleTimeoutMs ??
    3000;


  /*
   * CRITICAL CONTRACT:
   * observer must exist BEFORE navigation.
   */
  const observer =
    attachNetworkObserver(
      page,
      options.networkObserverOptions
    );


  let observerStopped =
    false;


  try {

    await page.goto(
      url,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          navigationTimeoutMs
      }
    );


    /*
     * Give JS/API activity a short conditional
     * settling window.
     *
     * Failure to reach networkidle is not fatal.
     */
    if (
      settleTimeoutMs >
      0
    ) {

      try {

        await page.waitForLoadState(
          "networkidle",
          {
            timeout:
              settleTimeoutMs
          }
        );
      }
      catch {
        /*
         * Sites with analytics, websocket or
         * polling may never become network-idle.
         */
      }
    }


    const html =
      await page.content();

    const finalUrl =
      page.url();


    const network =
      await observer.stop();

    observerStopped =
      true;


    const profile =
      profileSite({
        url:
          finalUrl,

        html,

        network
      });


    return {
      requestedUrl:
        url,

      finalUrl,

      profile,

      network
    };
  }
  catch (
    error
  ) {

    if (
      !observerStopped
    ) {

      try {
        await observer.stop();
      }
      catch {
        // Preserve the original navigation error.
      }
    }

    throw error;
  }
}


/**
 * Standalone live profiler.
 *
 * Browser ownership stays here so callers do not
 * need Playwright knowledge.
 */
export async function profileSiteLive(
  url: string,
  options:
    LiveSiteProfilerOptions = {}
): Promise<LiveSiteProfileResult> {

  const browser =
    await chromium.launch({
      headless:
        options.headless ??
        true
    });


  const context =
    await browser.newContext({
      ...(options.userAgent
        ? {
            userAgent:
              options.userAgent
          }
        : {})
    });


  const page =
    await context.newPage();


  try {

    return await profilePageWithNetwork(
      page,
      url,
      options
    );
  }
  finally {

    await context.close()
      .catch(
        () => undefined
      );

    await browser.close()
      .catch(
        () => undefined
      );
  }
}