import type { Page } from "playwright";
import type { MenuCandidate } from "./menuDiscovery.js";

export interface CatalogProbeResult {
  accepted: boolean;
  url: string;
  intent: MenuCandidate["inferredIntent"];
  title: string;
  productLikeLinks: number;
  paginationLinks: number;
  reason: string;
}

function norm(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveRootHref(
  page: Page,
  candidate: MenuCandidate
): Promise<string> {

  /*
    Fast path:
    observer already captured a usable href.
  */
  if (candidate.node.href) {
    return candidate.node.href;
  }

  const wanted = norm(
    candidate.node.text ||
    candidate.node.ariaLabel
  );

  if (!wanted) {
    return "";
  }

  /*
    IMPORTANT:
    Use string evaluation instead of a TS function.

    This prevents tsx/esbuild helpers such as
    __name from leaking into the browser context.
  */
  const wantedJson =
    JSON.stringify(wanted);

  const script = `
    (() => {

      const wantedText =
        ${wantedJson};

      const normalize = (value) =>
        String(value || "")
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .replace(/đ/g, "d")
          .replace(/Đ/g, "D")
          .toLowerCase()
          .replace(/\\s+/g, " ")
          .trim();

      const origin =
        window.location.origin;

      const anchors = Array.from(
        document.querySelectorAll(
          "a[href]"
        )
      );

      const scored = anchors
        .map((a) => {

          const ownText =
            normalize(
              a.innerText ||
              a.textContent ||
              ""
            );

          const title =
            normalize(
              a.getAttribute("title") ||
              ""
            );

          const aria =
            normalize(
              a.getAttribute(
                "aria-label"
              ) || ""
            );

          const href =
            a.href || "";

          let score = 0;

          /*
            Exact visible label is strongest.
          */
          if (
            ownText === wantedText
          ) {
            score += 300;
          }

          if (
            title === wantedText
          ) {
            score += 150;
          }

          if (
            aria === wantedText
          ) {
            score += 150;
          }

          /*
            Partial text is weaker evidence.
          */
          if (
            ownText &&
            ownText.includes(
              wantedText
            )
          ) {
            score += 40;
          }

          try {

            const u =
              new URL(href);

            /*
              Prefer actual internal
              catalog links.
            */
            if (
              u.origin === origin
            ) {
              score += 50;
            }

            if (
              u.pathname !== "/" &&
              u.pathname.length > 1
            ) {
              score += 30;
            }

            /*
              Avoid obviously irrelevant
              destinations.
            */
            if (
              /cart|checkout|login|account|contact|blog|tin-tuc/i
                .test(
                  u.pathname
                )
            ) {
              score -= 200;
            }

          } catch {}

          return {
            href,
            score,
            text: ownText
          };
        })
        .filter(
          (item) =>
            item.href &&
            item.score > 0
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

      return (
        scored[0]?.href || ""
      );

    })()
  `;

  const result =
    await page.evaluate(
      script
    );

  return String(
    result || ""
  );
}

export async function probeCatalogRoot(
  page: Page,
  candidate: MenuCandidate
): Promise<CatalogProbeResult> {

  const resolvedUrl =
    await resolveRootHref(
      page,
      candidate
    );

  if (!resolvedUrl) {
    return {
      accepted: false,
      url: "",
      intent:
        candidate.inferredIntent,
      title: "",
      productLikeLinks: 0,
      paginationLinks: 0,
      reason:
        "No catalog href could be resolved from DOM"
    };
  }

  const probe =
    await page.context()
      .newPage();

  try {

    await probe.goto(
      resolvedUrl,
      {
        waitUntil:
          "domcontentloaded",
        timeout: 45000
      }
    );

    await probe.waitForTimeout(
      1200
    );

    const title =
      await probe.title();

    /*
      Again use raw JS string.
      Do NOT use an inline TS callback here.
    */
    const scanScript = `
      (() => {

        const clean = (value) =>
          String(value || "")
            .replace(/\\s+/g, " ")
            .trim();

        const anchors =
          Array.from(
            document.querySelectorAll(
              "a[href]"
            )
          );

        const seenProducts =
          new Set();

        const seenPagination =
          new Set();

        for (
          const a of anchors
        ) {

          const text =
            clean(
              a.innerText ||
              a.textContent ||
              ""
            );

          const href =
            a.href || "";

          if (!href) {
            continue;
          }

          /*
            Walk a few parents upward because
            price is often in a sibling element
            inside the same product card.
          */
          let container =
            a.parentElement;

          let nearbyText =
            text;

          for (
            let depth = 0;
            depth < 4 &&
            container;
            depth++
          ) {

            const t =
              clean(
                container.innerText ||
                container.textContent ||
                ""
              );

            if (
              t.length >
              nearbyText.length
            ) {
              nearbyText = t;
            }

            container =
              container.parentElement;
          }

          const hasBrand =
            /\\b(canon|sony|nikon|fujifilm|fuji|lumix|panasonic|olympus|om system|leica|ricoh|pentax|gopro|dji|insta360)\\b/i
              .test(
                text + " " +
                nearbyText
              );

          const hasPrice =
            /(?:\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(?:đ|₫|vnd)/i
              .test(
                nearbyText
              );

          /*
            A brand + commercial price in the
            same local region is enough for
            a product-like signal.
          */
          if (
            hasBrand &&
            hasPrice
          ) {
            seenProducts.add(
              href.split("#")[0]
            );
          }

          const normalizedText =
            text.toLowerCase();

          const looksPagination =
            /^(next|last|prev|previous|tiếp|trước|sau|\\d+)$/i
              .test(
                text
              ) ||
            /[?&](p|page)=\\d+/i
              .test(
                href
              ) ||
            /\\/page\\/\\d+/i
              .test(
                href
              );

          if (
            looksPagination
          ) {
            seenPagination.add(
              href.split("#")[0]
            );
          }
        }

        return {
          productLikeLinks:
            seenProducts.size,

          paginationLinks:
            seenPagination.size,

          bodyText:
            clean(
              document.body
                ?.innerText || ""
            )
        };

      })()
    `;

    const scan =
      await probe.evaluate(
        scanScript
      ) as {
        productLikeLinks: number;
        paginationLinks: number;
        bodyText: string;
      };

    const body =
      norm(
        scan.bodyText
      );

    /*
      Branch intent is inherited from
      the commercial root, but we still
      seek supporting page evidence.
    */
    let intentEvidence = true;

    if (
      candidate.inferredIntent ===
      "SECOND_HAND"
    ) {
      intentEvidence =
        /may anh cu|hang cu|99%|second hand|used|chuyen mua ban may anh cu/
          .test(
            body
          );
    }

    if (
      candidate.inferredIntent ===
      "NEW"
    ) {
      intentEvidence =
        /chinh hang|may anh moi|new 100%|bao hanh chinh hang/
          .test(
            body
          );
    }

    if (
      candidate.inferredIntent ===
      "RENTAL"
    ) {
      intentEvidence =
        /gia thue|cho thue|thue may anh|ngay nhan|ngay tra|rental/
          .test(
            body
          );
    }

    const hasCameraEvidence =
      /may anh|camera|canon|sony|nikon|fujifilm|lumix/
        .test(
          body
        );

    const hasCommercialEvidence =
      scan.productLikeLinks > 0 ||
      /(?:\d{1,3}(?:[.,]\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(?:đ|₫|vnd)/i
        .test(
          scan.bodyText
        );

    const accepted =
      hasCameraEvidence &&
      hasCommercialEvidence &&
      intentEvidence;

    return {
      accepted,

      url:
        probe.url(),

      intent:
        candidate.inferredIntent,

      title,

      productLikeLinks:
        scan.productLikeLinks,

      paginationLinks:
        scan.paginationLinks,

      reason:
        accepted
          ? "Commercial camera catalog confirmed"
          : [
              "Catalog evidence insufficient",
              `camera=${hasCameraEvidence}`,
              `commercial=${hasCommercialEvidence}`,
              `intent=${intentEvidence}`
            ].join("; ")
    };

  } catch (error) {

    return {
      accepted: false,
      url:
        resolvedUrl,
      intent:
        candidate.inferredIntent,
      title: "",
      productLikeLinks: 0,
      paginationLinks: 0,
      reason:
        `Catalog probe error: ${String(error)}`
    };

  } finally {
    await probe.close();
  }
}
