import {
  Command
} from "commander";

import {
  chromium,
  type BrowserContext,
  type Page
} from "playwright";

import {
  mkdir
} from "node:fs/promises";

import {
  resolve
} from "node:path";

import {
  discoverProductUrls
} from "../discovery/productUrlDiscovery.js";

import {
  processProductPage,
  type PipelineResult
} from "../pipeline/productPipeline.js";

import {
  computeCoverage
} from "../coverage/coverageEngine.js";

import {
  RunReconciliation
} from "../coverage/runReconciliation.js";

import {
  exportWorkbookV2,
  type AuditRow
} from "../export/excelExporterV2.js";

import type {
  OfferInput
} from "../offerClassifier.js";


type SiteMode =
  NonNullable<
    OfferInput["siteMode"]
  >;


interface CliOptions {
  siteMode:
    SiteMode;

  headless:
    boolean;

  maxPages:
    number;

  maxProducts:
    number;

  concurrency:
    number;

  output?:
    string;
}


const VALID_SITE_MODES:
  SiteMode[] = [
    "RENTAL",
    "SALE_SECOND_HAND",
    "SALE_NEW",
    "SALE_MIXED",
    "MIXED",
    "UNKNOWN"
  ];


function intOption(
  value: string
): number {

  const parsed =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      `Invalid positive integer: ${value}`
    );
  }

  return parsed;
}


function canonical(
  raw: string
): string {

  const url =
    new URL(raw);

  url.hash = "";

  return url.toString();
}


function stamp(): string {

  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      "-"
    );
}


function dateStamp(): string {

  return new Date()
    .toISOString()
    .slice(
      0,
      10
    );
}


function audit(
  rows:
    AuditRow[],

  url:
    string,

  stage:
    string,

  status:
    AuditRow["status"],

  message:
    string
): void {

  rows.push({
    timestamp:
      new Date()
        .toISOString(),

    url,

    stage,

    status,

    message
  });
}


async function gentleLoad(
  page: Page,
  url: string
): Promise<void> {

  let lastError:
    unknown = null;

  for (
    let attempt = 1;
    attempt <= 2;
    attempt++
  ) {

    try {

      await page.goto(
        url,
        {
          waitUntil:
            "domcontentloaded",

          timeout:
            45000
        }
      );

      await page.waitForTimeout(
        350
      );

      /*
       * Raw browser-side string avoids the
       * tsx/esbuild __name issue encountered
       * earlier in this project.
       */
      await page.evaluate(
        "window.scrollTo(0, Math.min(document.body.scrollHeight, 2200))"
      );

      await page.waitForTimeout(
        300
      );

      return;

    }
    catch (
      error
    ) {

      lastError =
        error;

      await page.waitForTimeout(
        800
      );
    }
  }

  throw lastError;
}


async function createContext(
  headless:
    boolean
): Promise<{
  context:
    BrowserContext;

  close:
    () => Promise<void>;
}> {

  const browser =
    await chromium.launch({
      headless
    });

  const context =
    await browser.newContext({
      viewport: {
        width:
          1440,

        height:
          1000
      }
    });

  context.setDefaultTimeout(
    30000
  );

  return {
    context,

    close:
      async () => {
        await context.close();
        await browser.close();
      }
  };
}


async function main(): Promise<void> {

  const program =
    new Command();

  program
    .name(
      "camintel-v02"
    )
    .description(
      "Camera Intelligence Collector v0.2"
    )
    .argument(
      "<url>",
      "Catalog/category URL to collect"
    )
    .option(
      "--site-mode <mode>",
      "Weak site prior only",
      "UNKNOWN"
    )
    .option(
      "--headless",
      "Run browser headless",
      false
    )
    .option(
      "--max-pages <n>",
      "Maximum catalog pages",
      intOption,
      250
    )
    .option(
      "--max-products <n>",
      "Maximum product detail pages",
      intOption,
      5000
    )
    .option(
      "--concurrency <n>",
      "Parallel detail workers",
      intOption,
      3
    )
    .option(
      "--output <path>",
      "Explicit xlsx output path"
    );

  program.parse();

  const startUrl =
    canonical(
      program.args[0]
    );

  const rawOptions =
    program.opts<{
      siteMode:
        string;

      headless:
        boolean;

      maxPages:
        number;

      maxProducts:
        number;

      concurrency:
        number;

      output?:
        string;
    }>();


  const siteMode =
    rawOptions.siteMode
      .toUpperCase() as
        SiteMode;


  if (
    !VALID_SITE_MODES.includes(
      siteMode
    )
  ) {

    throw new Error(
      `Invalid --site-mode. Use: ${VALID_SITE_MODES.join(", ")}`
    );
  }


  const options:
    CliOptions = {
      ...rawOptions,

      siteMode
    };


  const auditRows:
    AuditRow[] = [];

  const catalogQueue:
    string[] = [
      startUrl
    ];

  const catalogKnown =
    new Set<string>([
      startUrl
    ]);

  const catalogVisited =
    new Set<string>();

  const productUrls =
    new Set<string>();


  console.log("");
  console.log(
    "=== CAMERA INTELLIGENCE COLLECTOR v0.2 ==="
  );

  console.log(
    `Root: ${startUrl}`
  );

  console.log(
    `Site mode prior: ${siteMode}`
  );

  console.log(
    `Headless: ${options.headless}`
  );


  const {
    context,
    close
  } =
    await createContext(
      options.headless
    );


  try {

    /*
     * ======================================
     * CATALOG DISCOVERY
     * ======================================
     */

    const catalogPage =
      await context.newPage();


    while (
      catalogQueue.length >
        0 &&
      catalogVisited.size <
        options.maxPages
    ) {

      const current =
        catalogQueue.shift();

      if (
        !current ||
        catalogVisited.has(
          current
        )
      ) {
        continue;
      }

      console.log(
        `[CATALOG ${catalogVisited.size + 1}] ${current}`
      );

      try {

        await gentleLoad(
          catalogPage,
          current
        );

        const discovery =
          await discoverProductUrls(
            catalogPage
          );

        catalogVisited.add(
          current
        );


        for (
          const url
          of discovery.productUrls
        ) {

          if (
            productUrls.size >=
              options.maxProducts
          ) {
            break;
          }

          productUrls.add(
            url
          );
        }


        for (
          const url
          of discovery.paginationUrls
        ) {

          if (
            catalogKnown.size >=
              options.maxPages
          ) {
            break;
          }

          if (
            !catalogKnown.has(
              url
            )
          ) {

            catalogKnown.add(
              url
            );

            catalogQueue.push(
              url
            );
          }
        }


        audit(
          auditRows,
          current,
          "CATALOG",
          "OK",
          `products=${discovery.productUrls.length}; weak=${discovery.weakCandidates.length}; pagination=${discovery.paginationUrls.length}`
        );

      }
      catch (
        error
      ) {

        catalogVisited.add(
          current
        );

        audit(
          auditRows,
          current,
          "CATALOG",
          "ERROR",
          String(error)
        );

        console.error(
          `  ERROR: ${String(error)}`
        );
      }
    }


    await catalogPage.close();


    const urls =
      Array.from(
        productUrls
      ).slice(
        0,
        options.maxProducts
      );


    /*
     * Phase 9 zero-silent-drop boundary.
     *
     * Every run-scope detail URL is registered before
     * any detail worker can process it.
     *
     * Persistent DISCOVERED state/resume belongs to
     * the Phase 10 SQLite ledger.
     */
    const runId =
      stamp();

    const reconciliation =
      new RunReconciliation(
        runId,
        urls
      );


    console.log("");
    console.log(
      `Catalog pages visited: ${catalogVisited.size}`
    );

    console.log(
      `Product URLs discovered: ${urls.length}`
    );

    console.log("");


    /*
     * ======================================
     * DETAIL CRAWL
     * ======================================
     */

    const results:
      PipelineResult[] = [];

    let nextIndex =
      0;

    let detailAttempted =
      0;

    let detailCompleted =
      0;


    const worker =
      async (
        workerId:
          number
      ): Promise<void> => {

        const page =
          await context.newPage();

        try {

          while (
            true
          ) {

            const index =
              nextIndex++;

            if (
              index >=
              urls.length
            ) {
              break;
            }

            const url =
              urls[index];

            detailAttempted++;


            console.log(
              `[DETAIL ${index + 1}/${urls.length} W${workerId}] ${url}`
            );


            try {

              await gentleLoad(
                page,
                url
              );

              const result =
                await processProductPage(
                  page,
                  siteMode
                );

              reconciliation.markDecision(
                url,
                result.validation.decision
              );

              results.push(
                result
              );

              detailCompleted++;


              audit(
                auditRows,
                url,
                "DETAIL",
                "OK",
                `${result.validation.decision}; entity=${result.analysis.entity.type}; forms=${result.analysis.forms.join("+") || "NONE"}`
              );

            }
            catch (
              error
            ) {

              const errorClass =
                error instanceof Error
                  ? error.name ||
                    "Error"
                  : "UnknownError";

              const errorMessage =
                error instanceof Error
                  ? error.message
                  : String(error);

              reconciliation.markError(
                url,
                {
                  stage:
                    "DETAIL",

                  errorClass,

                  message:
                    errorMessage,

                  attempts:
                    1,

                  lastStatus:
                    null,

                  retriable:
                    true,

                  diagnosticPath:
                    null
                }
              );

              audit(
                auditRows,
                url,
                "DETAIL",
                "ERROR",
                errorMessage
              );

              console.error(
                `  ERROR: ${errorMessage}`
              );
            }
          }

        }
        finally {

          await page.close();
        }
      };


    const concurrency =
      Math.max(
        1,
        Math.min(
          options.concurrency,
          8
        )
      );


    await Promise.all(
      Array.from(
        {
          length:
            concurrency
        },

        (_, index) =>
          worker(
            index + 1
          )
      )
    );


    const reconciliationReport =
      reconciliation.assertComplete();

    audit(
      auditRows,
      startUrl,
      "DETAIL",
      "INFO",
      [
        "reconciliation=PASS",
        `run=${runId}`,
        `discovered=${reconciliationReport.discovered}`,
        `accept=${reconciliationReport.accepted}`,
        `review=${reconciliationReport.review}`,
        `exclude=${reconciliationReport.excluded}`,
        `error=${reconciliationReport.error}`,
        `inProgress=${reconciliationReport.inProgress}`
      ].join(
        "; "
      )
    );

    /*
     * ======================================
     * COVERAGE + EXPORT
     * ======================================
     */

    const coverage =
      computeCoverage({
        catalogPagesDiscovered:
          catalogKnown.size,

        catalogPagesVisited:
          catalogVisited.size,

        productUrlsDiscovered:
          urls.length,

        detailPagesAttempted:
          detailAttempted,

        detailPagesCompleted:
          detailCompleted,

        results
      });


    const host =
      new URL(
        startUrl
      )
        .hostname
        .replace(
          /^www\./,
          ""
        );


    const outputPath =
      options.output
        ? resolve(
            options.output
          )
        : resolve(
            process.cwd(),
            "output",
            `${host}_camera_v02_${dateStamp()}.xlsx`
          );


    await mkdir(
      resolve(
        process.cwd(),
        "output"
      ),
      {
        recursive:
          true
      }
    );


    audit(
      auditRows,
      startUrl,
      "EXPORT",
      "INFO",
      `run=${runId}`
    );


    await exportWorkbookV2(
      outputPath,
      {
        runId,

        results,

        coverage,

        reconciliation:
          reconciliationReport,

        errors:
          reconciliation.errorRows(),

        audit:
          auditRows
      }
    );


    console.log("");
    console.log(
      "=== COMPLETE ==="
    );

    console.log(
      `Accepted: ${coverage.accepted}`
    );

    console.log(
      `Review: ${coverage.review}`
    );

    console.log(
      `Excluded: ${coverage.excluded}`
    );

    for (
      const metric
      of coverage.metrics
    ) {

      const ratio =
        metric.ratio === null
          ? "N/A"
          : `${(
              metric.ratio *
              100
            ).toFixed(1)}%`;

      console.log(
        `${metric.label}: ${ratio} [${metric.status}]`
      );
    }

    console.log(
      `Excel: ${outputPath}`
    );

  }
  finally {

    await close();
  }
}


main()
  .catch(
    error => {

      console.error("");
      console.error(
        "FATAL:"
      );

      console.error(
        error
      );

      process.exitCode =
        1;
    }
  );
