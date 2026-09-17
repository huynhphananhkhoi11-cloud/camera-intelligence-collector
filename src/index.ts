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

await program.parseAsync(
  process.argv
);
