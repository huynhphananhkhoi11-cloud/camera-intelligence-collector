import {
  chromium
} from "playwright";

import type {
  GeminiVisionResult
} from "../ai/geminiVisionProvider.js";

import {
  captureAndAnalyzeVisionPage,
  type FinalVisionSemanticResult,
  type VisionSemanticAnalyzer
} from "./visionFastPath.js";


export interface VisionFastPathSessionOptions {
  readonly headless?:
    boolean;

  readonly navigationTimeoutMs?:
    number;

  readonly readinessTimeoutMs?:
    number;

  readonly settleMs?:
    number;
}


export class VisionFastPathSession {

  private readonly options:
    Required<
      VisionFastPathSessionOptions
    >;


  constructor(
    options:
      VisionFastPathSessionOptions =
        {}
  ) {

    this.options = {
      headless:
        options.headless ??
        false,

      navigationTimeoutMs:
        options.navigationTimeoutMs ??
        30_000,

      readinessTimeoutMs:
        options.readinessTimeoutMs ??
        10_000,

      settleMs:
        options.settleMs ??
        700
    };
  }


  async run(
    url:
      string,

    provider:
      VisionSemanticAnalyzer
  ): Promise<
    FinalVisionSemanticResult
  > {

    const browser =
      await chromium.launch({
        headless:
          this.options.headless,

        slowMo:
          this.options.headless
            ? 0
            : 80
      });


    const context =
      await browser.newContext({
        viewport: {
          width:
            1440,

          height:
            900
        }
      });


    /*
     * Keep parity with BrowserAgentSession when TypeScript/esbuild serializes
     * page.evaluate callbacks that reference the helper injected by tsx.
     */
    await context.addInitScript({
      content:
        "globalThis.__name = globalThis.__name || ((target, _value) => target);"
    });


    const page =
      await context.newPage();


    try {

      await page.goto(
        url,
        {
          waitUntil:
            "commit",

          timeout:
            this.options
              .navigationTimeoutMs
        }
      );


      try {

        await page.waitForLoadState(
          "domcontentloaded",
          {
            timeout:
              Math.min(
                8_000,
                this.options
                  .readinessTimeoutMs
              )
          }
        );
      }
      catch {

        /*
         * The committed document remains usable. The body readiness check
         * below is the bounded hard gate.
         */
      }


      await page.locator(
        "body"
      ).waitFor({
        state:
          "attached",

        timeout:
          this.options
            .readinessTimeoutMs
      });


      await page.waitForTimeout(
        this.options
          .settleMs
      );


      return await captureAndAnalyzeVisionPage({
        page,

        requestedUrl:
          url,

        provider
      });
    }
    finally {

      await context.close();
      await browser.close();
    }
  }
}


export type VisionFastPathProviderResult =
  GeminiVisionResult;
