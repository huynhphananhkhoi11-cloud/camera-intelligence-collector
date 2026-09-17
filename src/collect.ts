import * as path
  from "node:path";

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
  discoverCatalogSeeds
} from "./discovery/catalogSeedDiscovery.js";

import {
  crawlCatalogs
} from "./discovery/catalogCrawler.js";

import {
  crawlProductDetails
} from "./extraction/detailCrawler.js";

import {
  exportCameraWorkbook
} from "./export/excelExporter.js";

const url =
  process.argv[2];

if (!url) {
  console.error(
    "Usage: npm run collect -- <URL>"
  );

  process.exit(1);
}

const started =
  Date.now();

console.log("");
console.log(
  "CAMERA INTELLIGENCE COLLECTOR"
);
console.log(
  "============================="
);
console.log(
  "Target: CAMERA"
);
console.log(
  `URL: ${url}`
);
console.log("");

const {
  context,
  page
} = await openBrowser();

try {

  /*
    ============================================
    PHASE 1 — DISCOVERY
    ============================================
  */

  console.log(
    "[1/4] Discovering commercial structure..."
  );

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
    1000
  );

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

  const seeds =
    await discoverCatalogSeeds(
      page,
      observation,
      detection.siteMode
    );

  if (
    seeds.length === 0
  ) {
    throw new Error(
      "No valid CAMERA catalog roots found after explicit and generic discovery."
    );
  }

  console.log("");
  console.log(
    `Catalog roots: ${seeds.length}`
  );

  for (
    const seed of seeds
  ) {
    console.log(
      `  ${seed.intent} -> ${seed.url}`
    );
  }

  /*
    ============================================
    PHASE 2 — CATALOG
    ============================================
  */

  console.log("");
  console.log(
    "[2/4] Crawling catalogs..."
  );

  const catalog =
    await crawlCatalogs(
      context,
      seeds
    );

  const catalogComplete =
    catalog.queueRemaining === 0 &&
    catalog.skippedBySafetyLimit === 0 &&
    catalog.failedCatalogs.length === 0;

  console.log("");
  console.log(
    `Catalog pages: ${catalog.visitedCatalogs.length}`
  );

  console.log(
    `Product candidates: ${catalog.products.length}`
  );

  console.log(
    `Catalog coverage: ${
      catalogComplete
        ? "PASS"
        : "NOT COMPLETE"
    }`
  );

  if (!catalogComplete) {
    throw new Error(
      "Catalog coverage incomplete."
    );
  }

  if (
    catalog.products.length === 0
  ) {
    throw new Error(
      "Catalog completed but no CAMERA product candidates were discovered."
    );
  }

  /*
    ============================================
    PHASE 3 — DETAILS
    ============================================
  */

  console.log("");
  console.log(
    "[3/4] Checking product details..."
  );

  console.log(
    "Concurrency: 3"
  );

  const details =
    await crawlProductDetails(
      context,
      catalog.products,
      3
    );

  console.log("");
  console.log(
    `Details checked: ${details.checked}/${catalog.products.length}`
  );

  console.log(
    `Accepted: ${details.accepted.length}`
  );

  console.log(
    `Excluded: ${details.excluded.length}`
  );

  console.log(
    `Review: ${details.review.length}`
  );

  console.log(
    `Errors: ${details.errors}`
  );

  console.log(
    `Price conflicts: ${details.conflicts.length}`
  );

  /*
    ============================================
    PHASE 4 — EXCEL
    ============================================
  */

  console.log("");
  console.log(
    "[4/4] Exporting Excel..."
  );

  const host =
    new URL(url)
      .hostname
      .replace(/^www\./, "");

  const date =
    new Date()
      .toISOString()
      .slice(0, 10);

  const filename =
    path.resolve(
      process.cwd(),
      "output",
      `${host}_camera_${date}.xlsx`
    );

  await exportCameraWorkbook({
    filename,
    targetUrl:
      url,
    seeds,
    catalog,
    details,
    elapsedMs:
      Date.now() -
      started
  });

  console.log("");
  console.log(
    "================================"
  );

  console.log(
    "COLLECTION COMPLETE"
  );

  console.log(
    "================================"
  );

  console.log(
    `Excel: ${filename}`
  );

  console.log(
    `Accepted: ${details.accepted.length}`
  );

  console.log(
    `Excluded: ${details.excluded.length}`
  );

  console.log(
    `Review: ${details.review.length}`
  );

  console.log(
    `Elapsed: ${
      Math.round(
        (
          Date.now() -
          started
        ) /
        1000
      )
    } sec`
  );

} finally {
  await context.close();
}
