import {
  Command
} from "commander";

import {
  chromium,
  type BrowserContext,
  type Page
} from "playwright";

import {
  createHash
} from "node:crypto";

import {
  mkdir
} from "node:fs/promises";

import {
  dirname,
  resolve
} from "node:path";

import {
  pathToFileURL
} from "node:url";

import {
  discoverProductUrls
} from "../discovery/productUrlDiscovery.js";

import {
  collectBrowserDetail
} from "../extraction/browserDetailCollector.js";

import {
  computeCoverage
} from "../coverage/coverageEngine.js";

import {
  exportWorkbookV2,
  type AuditRow
} from "../export/excelExporterV2.js";

import {
  resolveCollectRunIntent
} from "./collectRunIntent.js";

import {
  installGracefulInterrupt
} from "../runtime/gracefulInterrupt.js";

import {
  DetailAcquisitionFailure,
  PersistentDetailProcessor
} from "../runtime/persistentDetailProcessor.js";

import {
  loadTerminalPipelineResults,
  toExportErrorRows,
  toExportReconciliation,
  type PersistentPipelineVersions
} from "../runtime/persistentPipelineBridge.js";

import {
  RunCoordinator
} from "../runtime/runCoordinator.js";

import {
  BrowserObserverPolicy
} from "../browser/observerPolicy.js";

import {
  prepareWorkerPages
} from "../browser/workerPagePool.js";

import {
  RunEventBus,
  publishRunEventSafely,
  type RunEventPayload
} from "../runtime/runEventBus.js";

import {
  createRuntimeDiagnostics
} from "./runtimeDiagnostics.js";

import {
  resolveRunOutputPath
} from "../platform/downloadsOutputResolver.js";

import {
  SQLiteIntelligenceAuditStore
} from "../storage/sqliteIntelligenceAuditStore.js";
import {
  EXPORT_MANIFEST_SCHEMA_VERSION,
  inspectExportArtifact
} from "../storage/exportManifestStore.js";

import {
  SQLiteExportManifestStore
} from "../storage/sqliteExportManifestStore.js";

import type {
  OfferInput
} from "../offerClassifier.js";


import {
  crashIfRequested
} from "../runtime/crashInjection.js";

type SiteMode =
  NonNullable<
    OfferInput["siteMode"]
  >;


export interface CollectV2RuntimeOptions {
  eventBus?:
    RunEventBus;

  debug?:
    boolean;

  downloadsDirectoryResolver?:
    () =>
      string;

  onEventError?:
    (
      error:
        unknown
    ) =>
      void;
}


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

  resume?:
    string;

  fresh:
    boolean;

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


/*
 * Business truth remains the locked Phase 9 deterministic pipeline.
 * These identifiers are persistence-version labels, not classifiers
 * invented by the CLI.
 */
const PIPELINE_VERSIONS:
  PersistentPipelineVersions = {
    classifierVersion:
      "phase9-76670ee",

    resolverVersion:
      "phase9-76670ee",

    auditVersion:
      "phase9-76670ee"
  };


const CONFIG_SCHEMA =
  "camera-intelligence.collect-config.v1";

const CODE_VERSION =
  "phase10j2";


function intOption(
  value:
    string
): number {

  const parsed =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <=
      0
  ) {
    throw new Error(
      `Invalid positive integer: ${value}`
    );
  }

  return parsed;
}


function stamp():
  string {

  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      "-"
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


function runConfigHash(
  siteMode:
    SiteMode
): string {

  const payload =
    JSON.stringify({
      schema:
        CONFIG_SCHEMA,

      siteMode,

      versions:
        PIPELINE_VERSIONS
    });

  return createHash(
    "sha256"
  )
    .update(
      payload,
      "utf8"
    )
    .digest(
      "hex"
    );
}


/*
 * Phase 10 currently persists configHash rather than individual
 * CLI configuration columns. Reconstruct the locked site mode
 * deterministically by testing all legal values against that hash.
 */
function recoverSiteMode(
  persistedHash:
    string
): SiteMode {

  const matches =
    VALID_SITE_MODES.filter(
      candidate =>
        runConfigHash(
          candidate
        ) ===
        persistedHash
    );

  if (
    matches.length !==
    1
  ) {
    throw new Error(
      [
        "Persistent run configuration is incompatible",
        "with this collect runtime.",
        `configHash=${persistedHash}`
      ].join(
        " "
      )
    );
  }

  return matches[0]!;
}


function stateDatabasePath():
  string {

  const override =
    process.env
      .CAMINTEL_STATE_DB
      ?.trim();

  if (override) {
    return resolve(
      override
    );
  }

  return resolve(
    process.cwd(),
    "data",
    "camera-intelligence.sqlite"
  );
}


async function gentleLoad(
  page:
    Page,

  url:
    string
): Promise<void> {

  let lastError:
    unknown =
      null;

  for (
    let attempt =
      1;
    attempt <=
      2;
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
    () =>
      Promise<void>;
}> {

  const browser =
    await chromium.launch({
      headless,
      handleSIGINT:
        false
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
        try {
          await context.close();
        }
        finally {
          await browser.close();
        }
      }
  };
}


function interruptRunningRun(
  coordinator:
    RunCoordinator
): void {

  const active =
    coordinator.getActiveRun();

  if (
    active?.status !==
    "RUNNING"
  ) {
    return;
  }

  coordinator.interruptActiveRun();
}


function isDirectExecution():
  boolean {

  const rawEntry =
    process.argv[1];


  if (
    !rawEntry
  ) {
    return false;
  }


  return (
    import.meta.url ===
    pathToFileURL(
      resolve(
        rawEntry
      )
    ).href
  );
}


export async function runCollectV2(
  argv:
    string[] =
      process.argv,

  runtimeOptions:
    CollectV2RuntimeOptions = {}
): Promise<void> {

  const diagnostics =
    createRuntimeDiagnostics(
      runtimeOptions.debug ===
        true
    );


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
      "[url]",
      "Catalog/category URL for a new run"
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
      "--resume <runId>",
      "Resume a persistent run by runId"
    )
    .option(
      "--fresh",
      "Bypass reusable run-local facts for a new run",
      false
    )
    .option(
      "--output <path>",
      "Explicit xlsx output path"
    );

  program.parse(argv);


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

      resume?:
        string;

      fresh:
        boolean;

      output?:
        string;
    }>();


  const requestedSiteMode =
    rawOptions.siteMode
      .toUpperCase() as
        SiteMode;


  if (
    !VALID_SITE_MODES.includes(
      requestedSiteMode
    )
  ) {
    throw new Error(
      `Invalid --site-mode. Use: ${VALID_SITE_MODES.join(", ")}`
    );
  }


  const runIntent =
    resolveCollectRunIntent({
      url:
        program.args[0],

      resumeRunId:
        rawOptions.resume,

      fresh:
        rawOptions.fresh
    });


  const options:
    CliOptions = {
      ...rawOptions,

      siteMode:
        requestedSiteMode
    };


  const siteModeExplicit =
    program.getOptionValueSource(
      "siteMode"
    ) ===
    "cli";


  const databasePath =
    stateDatabasePath();


  await mkdir(
    dirname(
      databasePath
    ),
    {
      recursive:
        true
    }
  );


  const auditRows:
    AuditRow[] = [];


  /*
   * Browser is created before a persistent run is activated.
   * If Chromium itself cannot launch, no RUNNING run is stranded.
   */
  const {
    context,
    close:
      closeBrowser
  } =
    await createContext(
      options.headless
    );


  const eventBus =
    runtimeOptions.eventBus ??
    new RunEventBus();


  const onEventError =
    runtimeOptions.onEventError;


  const observerPolicy =
    new BrowserObserverPolicy({
      headless:
        options.headless,

      requestedWorkers:
        options.concurrency
    });


  const publishEvent =
    (
      payload:
        RunEventPayload
    ): void => {

      publishRunEventSafely(
        eventBus,
        payload,
        onEventError
      );
    };


  const elapsedMs =
    (
      startedAt:
        number
    ): number =>
      Math.max(
        0,
        Date.now() -
          startedAt
      );


  const coordinator =
    new RunCoordinator(
      databasePath,
      {
        eventBus,

        onEventError
      }
    );


  let runEstablished =
    false;


  try {
    let startUrl:
      string;

    let siteMode:
      SiteMode;

    let runId:
      string;

    let urls:
      string[];

    let catalogPagesDiscovered =
      0;

    let catalogPagesVisited =
      0;


    /*
     * ======================================
     * RESUME
     * ======================================
     */
    if (
      runIntent.mode ===
      "RESUME"
    ) {
      const plan =
        coordinator.resumeRun(
          runIntent.runId
        );

      runEstablished =
        true;

      runId =
        plan.runId;


      const activeRun =
        coordinator.getActiveRun();

      if (!activeRun) {
        throw new Error(
          `Resumed run disappeared: ${runId}`
        );
      }


      startUrl =
        activeRun.inputUrl;

      /*
       * Validate persisted URL before any worker starts.
       */
      new URL(
        startUrl
      );


      siteMode =
        recoverSiteMode(
          activeRun.configHash
        );


      if (
        siteModeExplicit &&
        requestedSiteMode !==
          siteMode
      ) {
        throw new Error(
          [
            "Explicit --site-mode does not match",
            "the persisted run configuration.",
            `persisted=${siteMode}`,
            `requested=${requestedSiteMode}`
          ].join(
            " "
          )
        );
      }


      urls =
        plan.queuedUrls;


      audit(
        auditRows,
        startUrl,
        "RESUME",
        "INFO",
        [
          `run=${runId}`,
          `queued=${urls.length}`,
          `alreadyDiscovered=${plan.alreadyDiscovered}`,
          `recoveredInProgress=${plan.recoveredInProgress}`,
          `requeuedErrors=${plan.requeuedRetriableErrors}`,
          `staleFetches=${plan.staleFetchesRecovered}`,
          `skippedTerminal=${plan.skippedTerminal}`
        ].join(
          "; "
        )
      );
    }
    else {
      /*
       * ======================================
       * NEW RUN: CATALOG DISCOVERY
       * ======================================
       */

      startUrl =
        runIntent.url;

      siteMode =
        requestedSiteMode;


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


      const catalogPage =
        await context.newPage();


      try {
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


          diagnostics.log(
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
              String(
                error
              )
            );

            diagnostics.error(
              `  ERROR: ${String(error)}`
            );
          }
        }
      }
      finally {
        await catalogPage.close();
      }


      catalogPagesDiscovered =
        catalogKnown.size;

      catalogPagesVisited =
        catalogVisited.size;


      const discoveredUrls =
        Array.from(
          productUrls
        ).slice(
          0,
          options.maxProducts
        );


      runId =
        stamp();


      /*
       * Critical Phase 10 boundary:
       * every run-scope URL is durable before detail scheduling.
       */
      const started =
        coordinator.startNewRun({
          run: {
            runId,

            inputUrl:
              startUrl,

            canonicalOrigin:
              new URL(
                startUrl
              ).origin,

            startedAt:
              new Date()
                .toISOString(),

            codeVersion:
              CODE_VERSION,

            configHash:
              runConfigHash(
                siteMode
              )
          },

          productUrls:
            discoveredUrls.map(
              canonicalUrl => ({
                canonicalUrl,

                discoveryScore:
                  null,

                sourcesJson:
                  JSON.stringify({
                    kind:
                      "CATALOG_DISCOVERY",

                    root:
                      startUrl
                  })
              })
            )
        });


      runEstablished =
        true;

      urls =
        started.queuedUrls;

      crashIfRequested(
        "AFTER_URL_REGISTER",
        {
          runId
        }
      );
    }


    const outputRun =
      coordinator.getActiveRun();


    if (
      outputRun ===
        null ||
      outputRun.runId !==
        runId
    ) {

      throw new Error(
        "Active run unavailable for output resolution: " +
        runId
      );
    }


    const outputPath =
      resolveRunOutputPath({
        explicitOutput:
          options.output,

        inputUrl:
          startUrl,

        runId,

        startedAt:
          outputRun.startedAt,

        downloadsDirectoryResolver:
          runtimeOptions.downloadsDirectoryResolver
      });


    publishEvent({
      type:
        "RUN_STARTED",

      runId,

      inputUrl:
        startUrl,

      mode:
        runIntent.mode,

      options: {
        headless:
          options.headless,

        workers:
          observerPolicy.workerCount,

        fresh:
          runIntent.fresh,

        /*
         * Resolved exactly once from persistent run identity.
         * Export, manifest and terminal UX share this target.
         */
        outputPath:
          outputPath
      }
    });


    diagnostics.log("");
    diagnostics.log(
      "=== CAMERA INTELLIGENCE COLLECTOR v0.2 ==="
    );

    diagnostics.log(
      `Mode: ${runIntent.mode}`
    );

    diagnostics.log(
      `Run: ${runId}`
    );

    diagnostics.log(
      `Root: ${startUrl}`
    );

    diagnostics.log(
      `Site mode prior: ${siteMode}`
    );

    diagnostics.log(
      `Headless: ${options.headless}`
    );

    diagnostics.log(
      `State DB: ${databasePath}`
    );

    diagnostics.log(
      `Catalog pages visited this process: ${catalogPagesVisited}`
    );

    diagnostics.log(
      `Detail URLs queued this process: ${urls.length}`
    );

    diagnostics.log("");


    let signalFailure:
      unknown =
        null;


    const uninstallSignal =
      installGracefulInterrupt(
        process,
        coordinator,
        {
          onInterrupt:
            result => {
              if (
                result.interrupted
              ) {
                diagnostics.log("");
                diagnostics.log(
                  `Interrupt requested. Run: ${result.runId}`
                );
              }
            },

          onError:
            error => {
              signalFailure =
                error;

              diagnostics.error("");
              diagnostics.error(
                "SIGINT persistence failure:"
              );

              diagnostics.error(
                error
              );
            }
        }
      );


    const detailProcessor =
      new PersistentDetailProcessor(
        databasePath,
        runId,
        {
          siteMode,

          versions:
            PIPELINE_VERSIONS
        }
      );


    const errorStore =
      new SQLiteIntelligenceAuditStore(
        databasePath
      );

    const exportManifestStore =
      new SQLiteExportManifestStore(
        databasePath
      );


    try {
      /*
       * ======================================
       * DETAIL CRAWL / OFFLINE REPLAY
       * ======================================
       */

      let nextIndex =
        0;

      let detailAttempted =
        0;

      let detailCompleted =
        0;


      const detailStageStartedAt =
        Date.now();


      publishEvent({
        type:
          "STAGE_STARTED",

        runId,

        stage:
          "DETAIL_COLLECTION"
      });


      const worker =
        async (
          workerId:
            number,

          page:
            Page
        ): Promise<void> => {

          try {
            while (
              true
            ) {
              if (
                signalFailure !==
                null
              ) {
                throw signalFailure;
              }


              if (
                coordinator
                  .isInterruptionRequested()
              ) {
                break;
              }


              const index =
                nextIndex++;

              if (
                index >=
                urls.length
              ) {
                break;
              }


              const url =
                urls[index]!;


              /*
               * SIGINT may land between taking a queue index and
               * beginProduct(). If that happens the URL is still
               * DISCOVERED and must simply remain for resume.
               */
              try {
                coordinator.beginProduct(
                  url
                );

              crashIfRequested(
                "AFTER_BEGIN_PRODUCT",
                {
                  runId,
                  url
                }
              );
              }
              catch (
                error
              ) {
                if (
                  coordinator
                    .isInterruptionRequested()
                ) {
                  break;
                }

                throw error;
              }


              const detailStartedAt =
                Date.now();


              publishEvent({
                type:
                  "DETAIL_STARTED",

                runId,

                url,

                workerId,

                index:
                  index +
                  1,

                total:
                  urls.length
              });


              detailAttempted++;


              diagnostics.log(
                `[DETAIL ${index + 1}/${urls.length} W${workerId}] ${url}`
              );


              try {
                /*
                 * Do not pre-navigate the detail page here.
                 *
                 * collectBrowserDetail() attaches its observer before
                 * navigation. PersistentDetailProcessor may skip the
                 * acquisition callback entirely when replay facts exist.
                 */
                const processed =
                  await detailProcessor.process(
                    url,

                    () =>
                      collectBrowserDetail(
                        page,
                        url
                      ),

                    {
                      fresh:
                        runIntent.fresh
                    }
                  );


                                crashIfRequested(
                  "AFTER_CLASSIFICATION",
                  {
                    runId,
                    url
                  }
                );

coordinator.terminalizeProduct(
                  url,
                  processed.result
                    .validation
                    .decision
                );

                crashIfRequested(
                  "AFTER_TERMINALIZATION",
                  {
                    runId,
                    url
                  }
                );


                publishEvent({
                  type:
                    "DETAIL_FINISHED",

                  runId,

                  url,

                  workerId,

                  decision:
                    processed.result
                      .validation
                      .decision,

                  durationMs:
                    elapsedMs(
                      detailStartedAt
                    )
                });


                detailCompleted++;


                audit(
                  auditRows,
                  url,
                  "DETAIL",
                  "OK",
                  [
                    processed.result
                      .validation
                      .decision,

                    `source=${processed.source}`,

                    `entity=${processed.result.analysis.entity.type}`,

                    `forms=${processed.result.analysis.forms.join("+") || "NONE"}`
                  ].join(
                    "; "
                  )
                );
              }
              catch (
                error
              ) {
                /*
                 * Expected acquisition failures have an explicit
                 * structured technical contract.
                 *
                 * Unknown/invariant failures are NOT silently converted
                 * into URL ERROR. They escape and the run is interrupted,
                 * leaving IN_PROGRESS recoverable by resume.
                 */
                if (
                  !(
                    error instanceof
                    DetailAcquisitionFailure
                  )
                ) {
                  throw error;
                }


                errorStore.appendError({
                  runId,

                  canonicalUrl:
                    url,

                  stage:
                    error.stage,

                  errorClass:
                    error.code,

                  message:
                    error.message,

                  attempts:
                    1,

                  lastStatus:
                    error.status,

                  retriable:
                    error.retriable,

                  diagnosticPath:
                    null
                });


                coordinator.terminalizeProduct(
                  url,
                  "ERROR"
                );


                publishEvent({
                  type:
                    "ERROR_RECORDED",

                  runId,

                  url,

                  stage:
                    error.stage,

                  errorClass:
                    error.code,

                  retriable:
                    error.retriable,

                  attempts:
                    1
                });


                publishEvent({
                  type:
                    "DETAIL_FINISHED",

                  runId,

                  url,

                  workerId,

                  decision:
                    "ERROR",

                  durationMs:
                    elapsedMs(
                      detailStartedAt
                    )
                });


                audit(
                  auditRows,
                  url,
                  error.stage,
                  "ERROR",
                  error.message
                );


                diagnostics.error(
                  `  ERROR: ${error.message}`
                );
              }
            }
          }
          finally {
            await page.close();
          }
        };


      /*
       * BrowserObserverPolicy is the single worker-count authority.
       * Worker pages are created deterministically before launch.
       */
      try {
        const preparedWorkerPages =
          await prepareWorkerPages(
            context,
            observerPolicy,
            {
              onFocusError:
                error => {

                  diagnostics.error(
                    "Observer focus failed:",
                    error
                  );
                }
            }
          );


        await Promise.all(
          preparedWorkerPages.map(
            (
              {
                workerId,
                page
              }
            ) =>
              worker(
                workerId,
                page
              )
          )
        );
      }
      catch (
        error
      ) {
        /*
         * Unexpected detail/invariant failure:
         * make the run explicitly resumable instead of leaving
         * a stale RUNNING owner process.
         */
        try {
          interruptRunningRun(
            coordinator
          );
        }
        catch (
          interruptError
        ) {
          throw new AggregateError(
            [
              error,
              interruptError
            ],
            `Runtime failure and run interruption both failed: ${runId}`
          );
        }

        throw error;
      }


      if (
        signalFailure !==
        null
      ) {
        throw signalFailure;
      }


      /*
       * ======================================
       * GRACEFUL INTERRUPT EXIT
       * ======================================
       */
      if (
        coordinator
          .isInterruptionRequested()
      ) {
        const interrupted =
          coordinator.getActiveRun();


        diagnostics.log("");
        diagnostics.log(
          "=== INTERRUPTED ==="
        );

        diagnostics.log(
          `Run: ${runId}`
        );

        diagnostics.log(
          `Status: ${interrupted?.status ?? "INTERRUPTED"}`
        );

        diagnostics.log(
          `Detail attempts this process: ${detailAttempted}`
        );

        diagnostics.log(
          `Completed this process: ${detailCompleted}`
        );

        process.exitCode =
          130;

        return;
      }


      publishEvent({
        type:
          "STAGE_COMPLETED",

        runId,

        stage:
          "DETAIL_COLLECTION",

        durationMs:
          elapsedMs(
            detailStageStartedAt
          ),

        summary: {
          attempted:
            detailAttempted,

          completed:
            detailCompleted,

          queued:
            urls.length
        }
      });


      /*
       * ======================================
       * PERSISTED RECONCILIATION
       * ======================================
       */
      const reconciliationStageStartedAt =
        Date.now();


      publishEvent({
        type:
          "STAGE_STARTED",

        runId,

        stage:
          "AUDIT_RECONCILE"
      });


      const persistedReport =
        coordinator.reconciliation();


      const reconciliationReport =
        toExportReconciliation(
          persistedReport
        );


      /*
       * Reconstruct the ENTIRE business-terminal result set
       * from persistent raw facts, including products completed
       * by a process that died before export.
       */
      const results =
        loadTerminalPipelineResults(
          databasePath,
          runId,
          siteMode
        );


      const expectedBusinessTerminal =
        reconciliationReport.accepted +
        reconciliationReport.review +
        reconciliationReport.excluded;


      if (
        results.length !==
        expectedBusinessTerminal
      ) {
        throw new Error(
          [
            "Persisted export reconstruction mismatch.",
            `run=${runId}`,
            `results=${results.length}`,
            `businessTerminal=${expectedBusinessTerminal}`
          ].join(
            " "
          )
        );
      }


      const errors =
        toExportErrorRows(
          errorStore.listErrors(
            runId
          )
        );


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


      publishEvent({
        type:
          "STAGE_COMPLETED",

        runId,

        stage:
          "AUDIT_RECONCILE",

        durationMs:
          elapsedMs(
            reconciliationStageStartedAt
          ),

        summary: {
          discovered:
            reconciliationReport.discovered,

          accepted:
            reconciliationReport.accepted,

          review:
            reconciliationReport.review,

          excluded:
            reconciliationReport.excluded,

          error:
            reconciliationReport.error,

          inProgress:
            reconciliationReport.inProgress
        }
      });


      /*
       * ======================================
       * COVERAGE + EXPORT
       * ======================================
       *
       * Catalog counters are not persisted in the current Phase 10
       * schema. On resume, 0/0 intentionally renders catalog
       * coverage as N/A rather than inventing historical traversal.
       */
      const coverage =
        computeCoverage({
          catalogPagesDiscovered,

          catalogPagesVisited,

          productUrlsDiscovered:
            reconciliationReport.discovered,

          detailPagesAttempted:
            detailAttempted,

          detailPagesCompleted:
            results.length,

          results
        });


      /*
       * outputPath was resolved once after persistent NEW/RESUME
       * establishment. Only its parent directory is materialized
       * immediately before workbook export.
       */
      await mkdir(
        dirname(
          outputPath
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


      /*
       * Critical ordering:
       *
       * workbook write first
       * completed export_manifest second
       * completeRun third
       *
       * A crash during export therefore leaves the run resumable.
       * A manifest row therefore proves a completed workbook write.
       */
      const exportStageStartedAt =
        Date.now();


      publishEvent({
        type:
          "STAGE_STARTED",

        runId,

        stage:
          "EXCEL_EXPORT"
      });


      publishEvent({
        type:
          "EXPORT_STARTED",

        runId,

        targetPath:
          outputPath
      });


      crashIfRequested(
        "BEFORE_EXPORT",
        {
          runId
        }
      );

      await exportWorkbookV2(
        outputPath,
        {
          runId,

          results,

          coverage,

          reconciliation:
            reconciliationReport,

          errors,

          audit:
            auditRows
        }
      );


      crashIfRequested(
        "AFTER_WORKBOOK_BEFORE_MANIFEST",
        {
          runId
        }
      );

      const exportedArtifact =
        await inspectExportArtifact(
          outputPath
        );


      exportManifestStore.recordCompletedExport({
        runId,

        path:
          exportedArtifact.path,

        fileHash:
          exportedArtifact.fileHash,

        fileSize:
          exportedArtifact.fileSize,

        schemaVersion:
          EXPORT_MANIFEST_SCHEMA_VERSION
      });


      audit(
        auditRows,
        startUrl,
        "EXPORT_MANIFEST",
        "OK",
        [
          `run=${runId}`,
          `bytes=${exportedArtifact.fileSize}`,
          `sha256=${exportedArtifact.fileHash}`
        ].join(
          "; "
        )
      );

      publishEvent({
        type:
          "EXPORT_COMPLETED",

        runId,

        targetPath:
          exportedArtifact.path,

        fileHash:
          exportedArtifact.fileHash,

        fileSize:
          exportedArtifact.fileSize
      });


      publishEvent({
        type:
          "STAGE_COMPLETED",

        runId,

        stage:
          "EXCEL_EXPORT",

        durationMs:
          elapsedMs(
            exportStageStartedAt
          ),

        summary: {
          fileSize:
            exportedArtifact.fileSize,

          fileHash:
            exportedArtifact.fileHash
        }
      });


      crashIfRequested(
        "AFTER_MANIFEST_BEFORE_FINALIZE",
        {
          runId
        }
      );

      const finalized =
        coordinator.finalizeRun();


      diagnostics.log("");
      diagnostics.log(
        "=== COMPLETE ==="
      );

      diagnostics.log(
        `Run: ${runId}`
      );

      diagnostics.log(
        `Run status: ${finalized.status}`
      );

      diagnostics.log(
        `Accepted: ${coverage.accepted}`
      );

      diagnostics.log(
        `Review: ${coverage.review}`
      );

      diagnostics.log(
        `Excluded: ${coverage.excluded}`
      );

      diagnostics.log(
        `Errors: ${reconciliationReport.error}`
      );


      for (
        const metric
        of coverage.metrics
      ) {
        const ratio =
          metric.ratio ===
          null
            ? "N/A"
            : `${(
                metric.ratio *
                100
              ).toFixed(1)}%`;

        diagnostics.log(
          `${metric.label}: ${ratio} [${metric.status}]`
        );
      }


      diagnostics.log(
        `Excel: ${outputPath}`
      );
    }
    finally {
      uninstallSignal();

      /*
       * Both stores must be given a close attempt even when
       * one close operation itself fails.
       */
      try {
        detailProcessor.close();
      }
      finally {
        try {
          errorStore.close();
        }
        finally {
          exportManifestStore.close();
        }
      }
    }
  }
  catch (
    error
  ) {
    /*
     * Any fatal error after run activation leaves a resumable
     * INTERRUPTED run rather than an orphan RUNNING row.
     */
    let failure:
      unknown =
        error;


    let failedRunId:
      string |
      null =
        null;


    if (
      runEstablished
    ) {

      /*
       * Best-effort correlation only.
       *
       * Failure to inspect the active run must never mask the
       * original runtime failure.
       */
      try {

        failedRunId =
          coordinator
            .getActiveRun()
            ?.runId ??
          null;
      }
      catch {
      }


      try {

        interruptRunningRun(
          coordinator
        );
      }
      catch (
        interruptError
      ) {

        failure =
          new AggregateError(
            [
              error,
              interruptError
            ],
            "Fatal runtime error and persistent interruption both failed."
          );
      }
    }


    publishEvent({
      type:
        "RUN_FAILED",

      runId:
        failedRunId,

      errorClass:
        failure instanceof
          Error
          ? failure.name
          : "UnknownError",

      message:
        failure instanceof
          Error
          ? failure.message
          : String(
              failure
            )
    });


    throw failure;
  }
  finally {
    try {
      coordinator.close();
    }
    finally {
      await closeBrowser();
    }
  }
}


if (
  isDirectExecution()
) {
  runCollectV2(
    process.argv,
    {
      debug:
        true
    }
  )
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
}
