import type { Page } from "playwright";

import type {
  BrowserNode,
  SiteMode
} from "../types/index.js";

import type {
  MenuCandidate
} from "./menuDiscovery.js";

import {
  rankCameraMenuCandidates
} from "./menuDiscovery.js";

import {
  probeCatalogRoot
} from "./catalogProbe.js";

import type {
  CatalogSeed
} from "./catalogCrawler.js";

import type {
  PageObservation
} from "../browser/observer.js";

function syntheticNode(
  id: string,
  text: string,
  href: string
): BrowserNode {
  return {
    id,
    tag: "a",
    text,
    role: "link",
    href,
    ariaLabel: "",
    title: "",
    x: 0,
    y: 0,
    width: 0,
    height: 0
  };
}

async function genericRentalCandidates(
  page: Page
): Promise<MenuCandidate[]> {

  /*
    Look for generic commercial navigation.

    Rental sites often do NOT have a menu literally
    named "CAMERA". Instead they expose:
    categories / products / equipment / devices.
  */
  const raw = await page.evaluate(`
    (() => {

      const clean = (v) =>
        String(v || "")
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .replace(/đ/g, "d")
          .replace(/Đ/g, "D")
          .toLowerCase()
          .replace(/\\s+/g, " ")
          .trim();

      const origin =
        location.origin;

      const result = [];

      const anchors =
        Array.from(
          document.querySelectorAll(
            "a[href]"
          )
        );

      for (const a of anchors) {

        const href =
          a.href || "";

        if (!href) continue;

        let url;

        try {
          url =
            new URL(href);
        } catch {
          continue;
        }

        if (
          url.origin !== origin ||
          url.pathname === "/"
        ) {
          continue;
        }

        const text =
          clean(
            a.innerText ||
            a.textContent ||
            a.getAttribute("title") ||
            a.getAttribute("aria-label") ||
            ""
          );

        const path =
          clean(
            url.pathname
          );

        let score = 0;

        /*
          Strong generic catalog signals.
        */
        if (
          /danh muc|categories|category/
            .test(text + " " + path)
        ) {
          score += 180;
        }

        if (
          /san pham|products|product/
            .test(text + " " + path)
        ) {
          score += 130;
        }

        if (
          /thiet bi|equipment|device/
            .test(text + " " + path)
        ) {
          score += 120;
        }

        if (
          /catalog|shop/
            .test(text + " " + path)
        ) {
          score += 100;
        }

        /*
          Rental context helps generic roots.
        */
        if (
          /thue|rental/
            .test(text)
        ) {
          score += 40;
        }

        /*
          These are workflow pages, NOT catalogs.
        */
        if (
          /booking|dat thue|gio hang|cart|checkout|policy|chinh sach|contact|lien he|blog|tin tuc|login|account/
            .test(
              text + " " + path
            )
        ) {
          score -= 300;
        }

        if (score > 0) {
          result.push({
            text:
              text || url.pathname,
            href:
              url.href,
            score
          });
        }
      }

      return result
        .sort(
          (a, b) =>
            b.score - a.score
        )
        .slice(0, 15);

    })()
  `) as {
    text: string;
    href: string;
    score: number;
  }[];

  const map =
    new Map<
      string,
      MenuCandidate
    >();

  let index = 0;

  for (const item of raw) {

    if (map.has(item.href)) {
      continue;
    }

    map.set(
      item.href,
      {
        node:
          syntheticNode(
            `generic-${index++}`,
            item.text,
            item.href
          ),

        score:
          item.score,

        /*
          The SITE has already been verified
          as RENTAL, so generic inventory
          inherits RENTAL intent.
        */
        inferredIntent:
          "RENTAL"
      }
    );
  }

  /*
    Recovery layer.

    Some modern sites do not expose the inventory
    route in the initial rendered navigation.

    Try common catalog endpoints, but NEVER trust
    them blindly. probeCatalogRoot() still has to
    verify real camera + commercial + rental evidence.
  */
  const conventionalPaths = [
    "/categories",
    "/products",
    "/equipment",
    "/catalog",
    "/shop"
  ];

  for (
    const pathname
    of conventionalPaths
  ) {

    const href =
      new URL(
        pathname,
        page.url()
      ).href;

    if (map.has(href)) {
      continue;
    }

    map.set(
      href,
      {
        node:
          syntheticNode(
            `recovery-${index++}`,
            pathname,
            href
          ),

        score:
          80,

        inferredIntent:
          "RENTAL"
      }
    );
  }

  return [...map.values()];
}

export async function discoverCatalogSeeds(
  page: Page,
  observation: PageObservation,
  siteMode: SiteMode
): Promise<CatalogSeed[]> {

  const seeds:
    CatalogSeed[] = [];

  const seen =
    new Set<string>();

  /*
    ========================================
    1. EXPLICIT CAMERA ROOTS
    ========================================
  */

  const explicit =
    rankCameraMenuCandidates(
      observation.nodes
    )
    .filter(
      candidate =>
        candidate.score >= 100
    );

  for (
    const candidate
    of explicit
  ) {

    const probe =
      await probeCatalogRoot(
        page,
        candidate
      );

    if (
      !probe.accepted ||
      !probe.url ||
      seen.has(probe.url)
    ) {
      continue;
    }

    seen.add(
      probe.url
    );

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

  /*
    Explicit roots win.
  */
  if (
    seeds.length > 0
  ) {
    return seeds;
  }

  /*
    ========================================
    2. RENTAL GENERIC ROOT FALLBACK
    ========================================
  */

  if (
    siteMode === "RENTAL"
  ) {

    console.log("");
    console.log(
      "No explicit CAMERA root found."
    );

    console.log(
      "Trying generic RENTAL catalog discovery..."
    );

    const generic =
      await genericRentalCandidates(
        page
      );

    for (
      const candidate
      of generic
    ) {

      console.log(
        `  Probe generic root: ${candidate.node.href}`
      );

      const probe =
        await probeCatalogRoot(
          page,
          candidate
        );

      console.log(
        `    ${
          probe.accepted
            ? "ACCEPTED"
            : "rejected"
        }`
      );

      if (
        !probe.accepted ||
        !probe.url ||
        seen.has(probe.url)
      ) {
        continue;
      }

      seen.add(
        probe.url
      );

      seeds.push({
        url:
          probe.url,

        intent:
          "RENTAL",

        label:
          candidate.node.text ||
          "Rental catalog"
      });

      /*
        One complete generic inventory root is
        enough initially. Its pagination/category
        graph will expand from there.
      */
      break;
    }
  }

  return seeds;
}
