import type { Locator, Page } from "playwright";
import type { BrowserNode } from "../types/index.js";

function norm(value: string): string {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function resolveMenuLocator(
  page: Page,
  node: BrowserNode
): Promise<Locator | null> {

  const candidates = page.locator(
    'a,button,[role="link"],[role="button"]'
  );

  const count = Math.min(
    await candidates.count(),
    600
  );

  let best:
    | {
        locator: Locator;
        score: number;
      }
    | null = null;

  for (let i = 0; i < count; i++) {
    const locator = candidates.nth(i);

    try {
      if (!(await locator.isVisible())) {
        continue;
      }

      const info = await locator.evaluate((el: Element) => {
        const html = el as HTMLElement;
        const anchor = el as HTMLAnchorElement;
        const rect = html.getBoundingClientRect();

        return {
          text: (
            html.innerText ||
            html.textContent ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim(),

          href: anchor.href || "",

          ariaLabel:
            html.getAttribute("aria-label") || "",

          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        };
      });

      let score = 0;

      if (
        norm(info.text) ===
        norm(node.text)
      ) {
        score += 120;
      }

      if (
        node.href &&
        info.href === node.href
      ) {
        score += 220;
      }

      if (
        node.ariaLabel &&
        norm(info.ariaLabel) ===
          norm(node.ariaLabel)
      ) {
        score += 80;
      }

      const distance =
        Math.abs(info.x - node.x) +
        Math.abs(info.y - node.y);

      if (distance < 10) {
        score += 80;
      } else if (distance < 60) {
        score += 30;
      }

      if (
        !best ||
        score > best.score
      ) {
        best = {
          locator,
          score
        };
      }

    } catch {
      // ignore unstable element
    }
  }

  return best?.locator ?? null;
}

export async function hoverMenuCandidate(
  page: Page,
  node: BrowserNode
): Promise<{
  success: boolean;
  method: string;
  error?: string;
}> {

  const locator =
    await resolveMenuLocator(
      page,
      node
    );

  let lastError = "";

  if (locator) {

    try {
      await locator.scrollIntoViewIfNeeded();

      await locator.hover({
        timeout: 5000
      });

      await page.waitForTimeout(1200);

      return {
        success: true,
        method: "PLAYWRIGHT_NATIVE"
      };

    } catch (error) {
      lastError = String(error);
    }

    /*
      Fallback 1:
      Move the real mouse to the selected
      element instead of relying only on hover().
    */
    try {
      const box =
        await locator.boundingBox();

      if (box) {
        await page.mouse.move(
          box.x + box.width / 2,
          box.y + box.height / 2,
          {
            steps: 8
          }
        );

        await page.waitForTimeout(1200);

        return {
          success: true,
          method: "MOUSE_COORDINATE"
        };
      }
    } catch (error) {
      lastError = String(error);
    }

    /*
      Fallback 2:
      Reproduce the event sequence used by
      Camera Collector V8.1.

      Some mega menus listen on the LI or parent,
      not directly on the A element.
    */
    try {
      await locator.evaluate((el: Element) => {

        const targets: Element[] = [];

        targets.push(el);

        const li =
          el.closest("li");

        if (li) {
          targets.push(li);
        }

        if (el.parentElement) {
          targets.push(
            el.parentElement
          );
        }

        const uniqueTargets =
          [...new Set(targets)];

        for (
          const target of uniqueTargets
        ) {
          (
            target as HTMLElement
          ).scrollIntoView({
            block: "nearest",
            inline: "nearest"
          });

          const eventTypes = [
            "pointerover",
            "pointerenter",
            "mouseover",
            "mouseenter",
            "mousemove"
          ];

          for (
            const type of eventTypes
          ) {
            if (
              type.startsWith(
                "pointer"
              )
            ) {
              target.dispatchEvent(
                new PointerEvent(
                  type,
                  {
                    bubbles: true,
                    cancelable: true
                  }
                )
              );
            } else {
              target.dispatchEvent(
                new MouseEvent(
                  type,
                  {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  }
                )
              );
            }
          }
        }
      });

      await page.waitForTimeout(1200);

      return {
        success: true,
        method: "EVENT_CASCADE"
      };

    } catch (error) {
      lastError = String(error);
    }
  }

  /*
    Last fallback:
    We already observed this element's screen
    coordinates. Move the mouse there directly.
  */
  if (
    node.width > 0 &&
    node.height > 0
  ) {
    try {
      await page.mouse.move(
        node.x +
          node.width / 2,
        node.y +
          node.height / 2,
        {
          steps: 10
        }
      );

      await page.waitForTimeout(1200);

      return {
        success: true,
        method: "OBSERVED_COORDINATE"
      };

    } catch (error) {
      lastError = String(error);
    }
  }

  return {
    success: false,
    method: "FAILED",
    error: lastError
  };
}
