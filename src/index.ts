#!/usr/bin/env node

import { Command } from "commander";

import {
  openBrowser
} from "./browser/browserManager.js";

import {
  observePage
} from "./browser/observer.js";

import {
  detectSiteMode
} from "./discovery/siteMode.js";

import {
  rankCameraMenuCandidates
} from "./discovery/menuDiscovery.js";

import {
  discoverSubmenu
} from "./discovery/submenuDiscovery.js";

import {
  probeCatalogRoot
} from "./discovery/catalogProbe.js";

import {
  crawlCatalogs
} from "./discovery/catalogCrawler.js";

import {
  bootstrapSite
} from "./v02/discovery/siteBootstrapper.js";

import {
  persistBootstrapSnapshot
} from "./v02/discovery/bootstrapSnapshot.js";

import {
  profileSiteLive
} from "./v02/profiling/liveSiteProfiler.js";

import {
  discoverCommercialRootsLive
} from "./v02/discovery/commercialRootDiscovery.js";

import {
  buildProductUrlGraphLive
} from "./v02/discovery/liveProductUrlGraph.js";

import {
  runDiscoveryAudit
} from "./v02/diagnostics/discoveryAuditEngine.js";

import {
  formatDiscoveryAuditReport
} from "./v02/diagnostics/discoveryAuditReporter.js";

import {
  createDiscoveryBaseline
} from "./v02/diagnostics/discoveryRegression.js";

import {
  loadDiscoveryBaseline,
  persistDiscoveryBaseline,
  shouldPromoteDiscoveryBaseline
} from "./v02/diagnostics/discoveryBaselineStore.js";

const program = new Command();

program
  .name("camintel")
  .description(
    "Adaptive Camera Intelligence Collector"
  )
  .version("0.1.0");

/* =========================================================
   INSPECT
========================================================= */

program
  .command("inspect")
  .description(
    "Inspect website camera business structure"
  )
  .argument("<url>")
  .action(async (url: string) => {

    console.log("");
    console.log(
      "CAMERA INTELLIGENCE COLLECTOR v0.1.0"
    );
    console.log(
      "------------------------------------"
    );
    console.log("Target: CAMERA");
    console.log(`Opening: ${url}`);
    console.log("");

    const { context, page } =
      await openBrowser();

    try {

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });

      await page.waitForTimeout(1500);

      const observation =
        await observePage(page);

      const detection =
        detectSiteMode(
          observation.nodes,
          observation.visibleText
        );

      const candidates =
        rankCameraMenuCandidates(
          observation.nodes
        );

      console.log(
        `Title: ${observation.title}`
      );

      console.log(
        `URL:   ${observation.url}`
      );

      console.log("");
      console.log(
        `Site mode: ${detection.siteMode}`
      );

      console.log("");
      console.log("Business branches:");

      console.log(
        `  RENTAL       ${
          detection.rental ? "YES" : "NO"
        }`
      );

      console.log(
        `  SECOND_HAND  ${
          detection.secondHand
            ? "YES"
            : "NO"
        }`
      );

      console.log(
        `  NEW          ${
          detection.newCamera
            ? "YES"
            : "NO"
        }`
      );

      console.log("");
      console.log(
        "Camera menu candidates:"
      );

      for (const candidate of candidates) {

        console.log(
          `  [${candidate.score}] ` +
          `${candidate.inferredIntent.padEnd(14)} ` +
          `${
            candidate.node.text ||
            candidate.node.ariaLabel
          }`
        );
      }

      console.log("");
      console.log(
        `Observed interactive nodes: ${
          observation.nodes.length
        }`
      );

      await page.waitForTimeout(4000);

    } finally {

      await context.close();
    }
  });

/* =========================================================
   DISCOVER
========================================================= */

program
  .command("discover")
  .description(
    "Discover camera commercial roots"
  )
  .argument("<url>")
  .action(async (url: string) => {

    console.log("");
    console.log(
      "CAMERA INTELLIGENCE — DISCOVERY"
    );
    console.log(
      "--------------------------------"
    );
    console.log("Target: CAMERA");
    console.log("");

    const { context, page } =
      await openBrowser();

    try {

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });

      await page.waitForTimeout(1500);

      const observation =
        await observePage(page);

      const detection =
        detectSiteMode(
          observation.nodes,
          observation.visibleText
        );

      console.log(
        `Site mode: ${detection.siteMode}`
      );

      const candidates =
        rankCameraMenuCandidates(
          observation.nodes
        )
        .filter(
          candidate =>
            candidate.score >= 100
        );

      console.log(
        `High-confidence roots: ${
          candidates.length
        }`
      );

      console.log("");

      for (
        const candidate
        of candidates
      ) {

        console.log(
          `Testing root: ${
            candidate.node.text
          }`
        );

        console.log(
          `Intent: ${
            candidate.inferredIntent
          }`
        );

        const result =
          await discoverSubmenu(
            page,
            candidate
          );

        console.log(
          `Interaction: ${
            result.hoverSuccess
              ? "SUCCESS"
              : "FAILED"
          }`
        );

        console.log(
          `Interaction method: ${
            result.interactionMethod
          }`
        );

        console.log(
          `Discovery method: ${
            result.discoveryMethod
          }`
        );

        if (
          result.newItems.length === 0
        ) {
          console.log(
            "No submenu/category links detected."
          );
        }

        for (
          const item of result.newItems
        ) {

          console.log(
            `  + ${item.text}`
          );

          console.log(
            `    ${item.href}`
          );
        }

        console.log("");
        console.log(
          "Probing root as complete catalog..."
        );

        const catalog =
          await probeCatalogRoot(
            page,
            candidate
          );

        console.log(
          `Catalog root: ${
            catalog.accepted
              ? "ACCEPTED"
              : "REJECTED"
          }`
        );

        console.log(
          `Catalog URL: ${catalog.url}`
        );

        console.log(
          `Product-like links: ${
            catalog.productLikeLinks
          }`
        );

        console.log(
          `Pagination signals: ${
            catalog.paginationLinks
          }`
        );

        console.log(
          `Reason: ${catalog.reason}`
        );

        console.log("");
      }

      console.log(
        "Discovery completed."
      );

      await page.waitForTimeout(5000);

    } finally {

      await context.close();
    }
  });

/* =========================================================
   CRAWL
========================================================= */

program
  .command("crawl")
  .description(
    "Crawl CAMERA catalogs and pagination"
  )
  .argument("<url>")
  .action(async (url: string) => {

    console.log("");
    console.log(
      "CAMERA INTELLIGENCE — CATALOG CRAWLER"
    );
    console.log(
      "-------------------------------------"
    );
    console.log("Target: CAMERA");
    console.log(`Opening: ${url}`);
    console.log("");

    const { context, page } =
      await openBrowser();

    try {

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });

      await page.waitForTimeout(1200);

      /*
        1. Observe homepage.
      */
      const observation =
        await observePage(page);

      const detection =
        detectSiteMode(
          observation.nodes,
          observation.visibleText
        );

      console.log(
        `Site mode: ${detection.siteMode}`
      );

      /*
        2. Find CAMERA commercial roots.
      */
      const candidates =
        rankCameraMenuCandidates(
          observation.nodes
        )
        .filter(
          candidate =>
            candidate.score >= 100
        );

      console.log(
        `Root candidates: ${
          candidates.length
        }`
      );

      /*
        3. Probe each root.
      */
      const seeds: {
        url: string;
        intent:
          | "RENTAL"
          | "SECOND_HAND"
          | "NEW"
          | "CAMERA_GENERIC";
        label: string;
      }[] = [];

      for (
        const candidate
        of candidates
      ) {

        console.log("");
        console.log(
          `Probing: ${
            candidate.node.text ||
            candidate.node.ariaLabel
          }`
        );

        const probe =
          await probeCatalogRoot(
            page,
            candidate
          );

        console.log(
          `  ${
            probe.accepted
              ? "ACCEPTED"
              : "REJECTED"
          }`
        );

        if (
          !probe.accepted ||
          !probe.url
        ) {
          continue;
        }

        /*
          Avoid duplicate catalog seeds.
        */
        const alreadyExists =
          seeds.some(
            seed =>
              seed.url ===
              probe.url
          );

        if (
          alreadyExists
        ) {
          continue;
        }

        seeds.push({
          url:
            probe.url,

          intent:
            candidate.inferredIntent,

          label:
            candidate.node.text ||
            candidate.node.ariaLabel
        });
      }

      console.log("");
      console.log(
        `Confirmed catalog seeds: ${
          seeds.length
        }`
      );

      for (
        const seed of seeds
      ) {

        console.log(
          `  ${seed.intent} -> ${seed.url}`
        );
      }

      /*
        Never claim completion with zero seeds.
      */
      if (
        seeds.length === 0
      ) {

        console.log("");
        console.log(
          "STOP: No valid CAMERA catalog seeds."
        );

        return;
      }

      console.log("");
      console.log(
        "Starting catalog queue..."
      );

      /*
        4. Crawl pagination and collect
           product candidates.
      */
      const result =
        await crawlCatalogs(
          context,
          seeds
        );

      console.log("");
      console.log(
        "===================================="
      );

      console.log(
        "CATALOG CRAWL RESULT"
      );

      console.log(
        "===================================="
      );

      console.log(
        `Catalog pages visited: ${
          result.visitedCatalogs.length
        }`
      );

      console.log(
        `Products discovered: ${
          result.products.length
        }`
      );

      console.log(
        `Queue remaining: ${
          result.queueRemaining
        }`
      );

      console.log(
        `Skipped by safety limit: ${
          result.skippedBySafetyLimit
        }`
      );

      /*
        Completeness is deterministic.
        AI does not decide this.
      */
      const complete =
        result.queueRemaining === 0 &&
        result.skippedBySafetyLimit === 0;

      console.log("");
      console.log(
        `Completeness: ${
          complete
            ? "PASS"
            : "NOT COMPLETE"
        }`
      );

      console.log("");
      console.log(
        "Sample product candidates:"
      );

      for (
        const product
        of result.products.slice(
          0,
          20
        )
      ) {

        console.log("");
        console.log(
          `  [${product.intent}] ${
            product.title ||
            "(untitled)"
          }`
        );

        console.log(
          `       Price: ${
            product.priceText ||
            "(none)"
          }`
        );

        console.log(
          `       URL: ${
            product.url
          }`
        );
      }

      console.log("");
      console.log(
        "Crawler stage completed."
      );

      await page.waitForTimeout(
        5000
      );

    } finally {

      await context.close();
    }
  });

/* =========================================================
   COLLECT — ROOT DOMAIN BOOTSTRAP
========================================================= */

program
  .command("collect")
  .description(
    "Bootstrap collection from a root website URL"
  )
  .argument("<url>")
  .action(
    async (
      url: string
    ) => {

      console.log("");
      console.log(
        "CAMERA INTELLIGENCE — SITE BOOTSTRAP"
      );
      console.log(
        "------------------------------------"
      );
      console.log(
        `Input: ${url}`
      );
      console.log("");


      console.log("[1/4] Bootstrapping site...");

      const bootstrapStartedAt = Date.now();

      const result = await bootstrapSite(url);

      console.log(
        `[1/4] Bootstrap complete in ${((Date.now() - bootstrapStartedAt) / 1000).toFixed(1)}s`
      );

      /*
       * ======================================
       * PHASE 3 — AUTOMATIC SITE PROFILE
       * ======================================
       *
       * No --site-mode input.
       * Site profile is observational prior only.
       */
      console.log("[2/4] Profiling site...");

      const profileStartedAt = Date.now();

      const liveProfile =
        await profileSiteLive(
          result.finalUrl,
          {
            headless:
              true,

            navigationTimeoutMs:
              45000,

            settleTimeoutMs:
              3000
          }
        );


      console.log(
        `[2/4] Profiling complete in ${((Date.now() - profileStartedAt) / 1000).toFixed(1)}s`
      );

      console.log("");
      console.log(
        "Automatic site profile:"
      );

      console.log(
        `  Mode prior:     ${
          liveProfile.profile
            .suggestedSiteMode
        }`
      );

      console.log(
        `  Confidence:     ${
          liveProfile.profile
            .confidence
        }`
      );

      console.log(
        `  Rental score:   ${
          liveProfile.profile
            .rentalScore
        }`
      );

      console.log(
        `  Sale score:     ${
          liveProfile.profile
            .saleScore
        }`
      );

      console.log(
        `  New score:      ${
          liveProfile.profile
            .newScore
        }`
      );

      console.log(
        `  Used score:     ${
          liveProfile.profile
            .usedScore
        }`
      );

      console.log(
        `  Platform:       ${
          liveProfile.profile
            .platform
        }`
      );

      console.log(
        `  Network:        requests=${
          liveProfile.profile
            .network
            .requestCount
        }; responses=${
          liveProfile.profile
            .network
            .responseCount
        }; failed=${
          liveProfile.profile
            .network
            .failedRequestCount
        }`
      );

      console.log(
        `  API candidates: ${
          liveProfile.profile
            .network
            .apiCandidateCount
        }`
      );


      if (
        liveProfile.profile
          .commercialEvidence
          .length >
        0
      ) {

        console.log(
          "  Commercial evidence:"
        );


        for (
          const evidence
          of liveProfile.profile
            .commercialEvidence
            .slice(
              0,
              10
            )
        ) {

          console.log(
            `    [${
              evidence.kind
            }/${
              evidence.source
            } +${
              evidence.weight
            }] ${
              evidence.text
            }`
          );
        }
      }


      /*
       * IMPORTANT:
       * liveProfile.profile.suggestedSiteMode
       * is NOT injected as product truth.
       *
       * Product-level ENTITY/OFFER/CONDITION
       * remain authoritative later.
       */





      /*
       * ======================================
       * PHASE 4 — COMMERCIAL ROOT DISCOVERY
       * ======================================
       */
      console.log("[3/4] Discovering commercial roots...");

      const rootDiscoveryStartedAt = Date.now();

      const rootDiscovery =
        await discoverCommercialRootsLive(
          result,
          {
            headless:
              true,

            maxCandidates:
              4,

            minimumInitialScore:
              20,

            minimumRootScore:
              45,

            navigationTimeoutMs:
              10000,

            settleTimeoutMs:
              750,

            candidateTimeoutMs:
              15000,

            observerStopTimeoutMs:
              1500,

            onProgress:
              (
                current,
                total,
                candidateUrl
              ) => {

                console.log(
                  `  Root probe ${current}/${total}: ${candidateUrl}`
                );
              }
          }
        );


      console.log(
        `[3/4] Root discovery complete in ${((Date.now() - rootDiscoveryStartedAt) / 1000).toFixed(1)}s`
      );

      console.log("");
      console.log(
        "Commercial root discovery:"
      );

      console.log(
        `  Candidates: ${
          rootDiscovery
            .candidates
            .length
        }`
      );

      console.log(
        `  Probed:     ${
          rootDiscovery
            .probed
            .length
        }`
      );

      console.log(
        `  Roots:      ${
          rootDiscovery
            .roots
            .length
        }`
      );

      console.log(
        `  Errors:     ${
          rootDiscovery
            .errors
            .length
        }`
      );


      for (
        const root
        of rootDiscovery.roots
          .slice(
            0,
            10
          )
      ) {

        console.log(
          `  [${
            root.score
          }] ${root.url}`
        );

        console.log(
          `       initial=${
            root.initialScore
          }; probe=${
            root.probe.score
          }; cards=${
            root.probe
              .repeatedCardCount
          }; api=${
            root.probe
              .apiCandidateCount
          }`
        );
      }


      /*
       * Root candidates are catalog-region hints.
       * They DO NOT classify product entity.
       */

      console.log(
        "[4/4] Building Product URL Graph..."
      );

      const productGraphStartedAt =
        Date.now();


      const productGraph =
        await buildProductUrlGraphLive(
          result.canonicalOrigin,
          rootDiscovery.roots,
          result.sitemaps.pageUrls,
          {
            headless:
              true,

            maxRoots:
              3,

            maxPagesPerRoot:
              5,

            maxInteractionsPerPage:
              3,

            noNewUrlRounds:
              2,

            navigationTimeoutMs:
              10000,

            settleTimeoutMs:
              1000,

            interactionWaitMs:
              500,

            pageTimeoutMs:
              20000,

            onProgress:
              message => {

                console.log(
                  `  ${message}`
                );
              }
          }
        );


      console.log(
        `[4/4] Product URL Graph complete in ${(
          (
            Date.now() -
            productGraphStartedAt
          ) /
          1000
        ).toFixed(1)}s`
      );


      console.log("");
      console.log(
        "Product URL Graph:"
      );

      console.log(
        `  Nodes:          ${productGraph.nodes.length}`
      );

      console.log(
        `  Roots:          ${productGraph.rootsProcessed}`
      );

      console.log(
        `  Catalog pages:  ${productGraph.catalogPagesVisited}`
      );

      console.log(
        `  Interactions:   ${productGraph.interactions}`
      );

      console.log(
        `  Errors:         ${productGraph.errors.length}`
      );


      const sourceCounts =
        new Map<
          string,
          number
        >();


      for (
        const node
        of productGraph.nodes
      ) {

        for (
          const evidence
          of node.evidence
        ) {

          sourceCounts.set(
            evidence.source,
            (
              sourceCounts.get(
                evidence.source
              ) ??
              0
            ) +
            1
          );
        }
      }


      if (
        sourceCounts.size >
        0
      ) {

        console.log(
          "  Sources:"
        );


        for (
          const [
            source,
            count
          ]
          of Array.from(
            sourceCounts.entries()
          )
            .sort(
              (
                a,
                b
              ) =>
                b[1] -
                a[1]
            )
        ) {

          console.log(
            `    ${source}: ${count}`
          );
        }
      }


      console.log(
        "  Top discovered URLs:"
      );


      for (
        const node
        of productGraph.nodes
          .slice(
            0,
            20
          )
      ) {

        console.log(
          `    [${node.score}] ${node.url}`
        );
      }

      /*
       * ======================================
       * PHASE 5.7 — DISCOVERY SELF-AUDIT
       * Discovery Self-Audit integration
       * ======================================
       *
       * No additional browser/network work.
       * All checks run on structured facts
       * already collected in this process.
       */

      const baselineLoad =
        await loadDiscoveryBaseline(
          result.canonicalOrigin
        );


      const discoveryAudit =
        runDiscoveryAudit(
          {
            bootstrap:
              result,

            profile:
              liveProfile.profile,

            roots:
              rootDiscovery,

            graph:
              productGraph,

            timingsMs: {
              bootstrapMs:
                Math.max(
                  0,
                  profileStartedAt -
                  bootstrapStartedAt
                ),

              profileMs:
                Math.max(
                  0,
                  rootDiscoveryStartedAt -
                  profileStartedAt
                ),

              rootDiscoveryMs:
                Math.max(
                  0,
                  productGraphStartedAt -
                  rootDiscoveryStartedAt
                ),

              productGraphMs:
                Math.max(
                  0,
                  Date.now() -
                  productGraphStartedAt
                )
            },

            budgets: {
              rootProbeLimit:
                4,

              minimumRootScore:
                45,

              maxGraphRoots:
                3,

              maxPagesPerRoot:
                5,

              maxInteractionsPerPage:
                3,

              noNewUrlRounds:
                2
            }
          },
          {
            baseline:
              baselineLoad.baseline
          }
        );


      console.log("");


      for (
        const line
        of formatDiscoveryAuditReport(
          discoveryAudit
        )
      ) {

        console.log(
          line
        );
      }


      console.log("");


      console.log(
        `Historical baseline: ${baselineLoad.status}`
      );


      if (
        baselineLoad.status ===
          "INVALID" &&
        baselineLoad.error
      ) {

        console.log(
          `  Baseline warning: ${baselineLoad.error}`
        );
      }


      const baselineDecision =
        shouldPromoteDiscoveryBaseline(
          discoveryAudit,
          baselineLoad.baseline !==
            null
        );


      if (
        baselineDecision.promote
      ) {

        const baseline =
          createDiscoveryBaseline(
            discoveryAudit.telemetry
          );


        const baselinePath =
          await persistDiscoveryBaseline(
            baseline
          );


        console.log(
          `Baseline update: SAVED`
        );

        console.log(
          `  ${baselinePath}`
        );
      }
      else {

        console.log(
          `Baseline update: SKIPPED (${baselineDecision.reason})`
        );
      }


      console.log("");

const persisted =
        await persistBootstrapSnapshot(
          result
        );


      console.log(
        `Canonical origin: ${
          result.canonicalOrigin
        }`
      );

      console.log(
        `Final entry URL:   ${
          result.finalUrl
        }`
      );

      console.log(
        `Redirects:         ${
          result.diagnostics
            .redirectCount
        }`
      );

      console.log(
        `robots.txt:        ${
          result.robots.available
            ? "AVAILABLE"
            : "NOT AVAILABLE"
        }`
      );

      console.log(
        `Sitemaps:          ${
          result.diagnostics
            .sitemapCount
        }`
      );

      console.log(
        `Sitemap URLs:      ${
          result.diagnostics
            .sitemapPageCount
        }`
      );

      console.log(
        `Menu seeds:        ${
          result.diagnostics
            .menuSeedCount
        }`
      );

      console.log(
        `Seed pool:         ${
          result.diagnostics
            .seedCount
        }`
      );


      console.log("");
      console.log(
        "Top bootstrap seeds:"
      );


      for (
        const seed
        of result.seeds.slice(
          0,
          25
        )
      ) {

        console.log(
          `  [${
            seed.confidence.toFixed(
              2
            )
          }] ${
            seed.sources.join(
              "+"
            )
          } -> ${seed.url}`
        );
      }


      console.log("");
      console.log(
        `Bootstrap run: ${
          persisted.runId
        }`
      );

      console.log(
        `Snapshot: ${
          persisted.path
        }`
      );

      console.log("");
      if (
        discoveryAudit.summary.status ===
        "FAIL"
      ) {

        console.log(
          "PHASE 5 SELF-AUDIT FAILED"
        );

        process.exitCode =
          1;
      }
      else {

        console.log(
          "PHASE 5 PRODUCT URL GRAPH + SELF-AUDIT COMPLETE"
        );
      }
    }
  );

await program.parseAsync(
  process.argv
);
