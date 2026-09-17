import type { Page } from "playwright";
import type { BrowserNode } from "../types/index.js";

export interface PageObservation {
  url: string;
  title: string;
  visibleText: string;
  nodes: BrowserNode[];
}

export async function observePage(
  page: Page
): Promise<PageObservation> {

  const nodes = await page
    .locator('a,button,[role="link"],[role="button"]')
    .evaluateAll((elements) => {
      const results: any[] = [];

      for (let index = 0; index < elements.length; index++) {
        const element = elements[index] as HTMLElement;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden";

        if (!visible) continue;

        const anchor = element as HTMLAnchorElement;

        results.push({
          id: `n${index}`,
          tag: element.tagName.toLowerCase(),
          text: (
            element.innerText ||
            element.textContent ||
            ""
          ).trim().replace(/\s+/g, " "),
          role: element.getAttribute("role") || "",
          href: anchor.href || "",
          ariaLabel: element.getAttribute("aria-label") || "",
          title: element.getAttribute("title") || "",
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });

        if (results.length >= 300) break;
      }

      return results;
    });

  const visibleText = await page.locator("body")
    .innerText()
    .catch(() => "");

  return {
    url: page.url(),
    title: await page.title(),
    visibleText: visibleText.slice(0, 12000),
    nodes
  };
}
