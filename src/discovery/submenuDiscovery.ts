import type {
  Locator,
  Page
} from "playwright";

import {
  observePage
} from "../browser/observer.js";

import {
  hoverMenuCandidate,
  resolveMenuLocator
} from "../browser/interaction.js";

import type {
  MenuCandidate
} from "./menuDiscovery.js";

export interface DiscoveredBranch {
  rootText: string;

  intent:
    MenuCandidate["inferredIntent"];

  hoverSuccess: boolean;

  interactionMethod: string;

  discoveryMethod:
    | "DOM_CHILDREN"
    | "VISIBLE_DIFF"
    | "NONE";

  newItems: {
    text: string;
    href: string;
  }[];
}

function normalize(
  value: string
): string {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function uniqueItems(
  items: {
    text: string;
    href: string;
  }[]
) {

  const map = new Map<
    string,
    {
      text: string;
      href: string;
    }
  >();

  for (const item of items) {
    if (
      !item.text ||
      !item.href
    ) {
      continue;
    }

    const key =
      `${normalize(item.text)}|${item.href}`;

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

async function readDomChildren(
  root: Locator | null
): Promise<
  {
    text: string;
    href: string;
  }[]
> {

  if (!root) {
    return [];
  }

  try {
    return await root.evaluate(
      (element: Element) => {

        /*
          Most navigation menus use:

          LI
           ├─ A root
           └─ UL
               ├─ LI > A
               └─ ...

          Children may already exist in DOM
          while hidden by CSS.
        */
        const container =
          element.closest("li") ||
          element.parentElement;

        if (!container) {
          return [];
        }

        const rootHref =
          (element as HTMLAnchorElement)
            .href || "";

        const rootText =
          (
            (element as HTMLElement)
              .innerText ||
            element.textContent ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim();

        const anchors = [
          ...container.querySelectorAll(
            "a[href]"
          )
        ];

        return anchors
          .map(anchor => ({
            text:
              (
                (anchor as HTMLElement)
                  .innerText ||
                anchor.textContent ||
                ""
              )
                .replace(/\s+/g, " ")
                .trim(),

            href:
              (
                anchor as HTMLAnchorElement
              ).href
          }))
          .filter(item =>
            Boolean(item.text) &&
            Boolean(item.href) &&
            !(
              item.href ===
                rootHref &&
              item.text ===
                rootText
            )
          );
      }
    );

  } catch {
    return [];
  }
}

function visibleKey(
  value: {
    text: string;
    href: string;
  }
): string {

  return (
    `${normalize(value.text)}|` +
    `${value.href}`
  );
}

export async function discoverSubmenu(
  page: Page,
  candidate: MenuCandidate
): Promise<DiscoveredBranch> {

  const rootText =
    candidate.node.text ||
    candidate.node.ariaLabel;

  /*
    STEP 1:
    Resolve the exact menu root,
    not page.getByText(...).first().
  */
  const rootLocator =
    await resolveMenuLocator(
      page,
      candidate.node
    );

  /*
    STEP 2:
    Read structural children BEFORE hover.

    This is intentional:
    many sites preload the full mega-menu
    and hide it with CSS.
  */
  const structuralChildren =
    uniqueItems(
      await readDomChildren(
        rootLocator
      )
    );

  /*
    STEP 3:
    Still perform a human-like hover.

    This validates the interaction and
    supports sites that lazy-render menus.
  */
  const before =
    await observePage(page);

  const beforeKeys =
    new Set(
      before.nodes.map(node =>
        visibleKey({
          text: node.text,
          href: node.href
        })
      )
    );

  const interaction =
    await hoverMenuCandidate(
      page,
      candidate.node
    );

  /*
    STEP 4:
    Read the menu structure again because
    some sites inject children only after
    hover.
  */
  const rootAfter =
    await resolveMenuLocator(
      page,
      candidate.node
    );

  const childrenAfterHover =
    uniqueItems(
      await readDomChildren(
        rootAfter
      )
    );

  const structuralCombined =
    uniqueItems([
      ...structuralChildren,
      ...childrenAfterHover
    ]);

  if (
    structuralCombined.length > 0
  ) {
    return {
      rootText,
      intent:
        candidate.inferredIntent,

      hoverSuccess:
        interaction.success,

      interactionMethod:
        interaction.method,

      discoveryMethod:
        "DOM_CHILDREN",

      newItems:
        structuralCombined
    };
  }

  /*
    STEP 5:
    If no structural descendants exist,
    detect newly visible links.
  */
  const after =
    await observePage(page);

  const diff =
    uniqueItems(
      after.nodes
        .filter(node => {
          if (
            !node.text ||
            !node.href
          ) {
            return false;
          }

          return !beforeKeys.has(
            visibleKey({
              text: node.text,
              href: node.href
            })
          );
        })
        .map(node => ({
          text: node.text,
          href: node.href
        }))
    );

  return {
    rootText,

    intent:
      candidate.inferredIntent,

    hoverSuccess:
      interaction.success,

    interactionMethod:
      interaction.method,

    discoveryMethod:
      diff.length > 0
        ? "VISIBLE_DIFF"
        : "NONE",

    newItems: diff
  };
}
