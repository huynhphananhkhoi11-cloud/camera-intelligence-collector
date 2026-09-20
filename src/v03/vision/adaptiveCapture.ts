import {
  createHash
} from "node:crypto";

import {
  mkdir,
  rename,
  writeFile
} from "node:fs/promises";

import {
  join
} from "node:path";

import type {
  Page
} from "playwright";

import {
  buildCapturePlan,
  type CapturePlanShot,
  type CaptureResolution,
  type CaptureRole,
  type CaptureSectionCandidate
} from "./capturePlan.js";


export interface CaptureManifestShot {
  readonly shotId:
    string;

  readonly role:
    CaptureRole;

  readonly sectionLabel:
    string;

  readonly resolution:
    CaptureResolution;

  readonly scrollY:
    number;

  readonly width:
    number;

  readonly height:
    number;

  readonly selectorUsed:
    string |
    null;

  readonly path:
    string;

  readonly contentHash:
    string;

  readonly captureTimestamp:
    string;
}


export interface CaptureManifest {
  readonly schemaVersion:
    1;

  readonly url:
    string;

  readonly finalUrl:
    string;

  readonly viewport: {
    readonly width:
      number;

    readonly height:
      number;
  };

  readonly captureTimestamp:
    string;

  readonly shots:
    readonly CaptureManifestShot[];
}


export interface AdaptiveCaptureResult {
  readonly manifest:
    CaptureManifest;

  readonly manifestPath:
    string;

  readonly imagePaths:
    readonly string[];
}


export interface AdaptiveCaptureOptions {
  readonly outputDir:
    string;

  readonly url?:
    string;

  readonly maxShots?:
    number;

  readonly navigationTimeoutMs?:
    number;

  readonly networkIdleTimeoutMs?:
    number;

  readonly interactionTimeoutMs?:
    number;
}


interface CaptureMap {
  readonly hero:
    CaptureSectionCandidate |
    null;

  readonly sections:
    readonly CaptureSectionCandidate[];
}


interface ScreenshotClip {
  readonly x:
    number;

  readonly y:
    number;

  readonly width:
    number;

  readonly height:
    number;
}


const BASE_SCREENSHOT_STYLE =
  [
    "#__camintel_agent_overlay {",
    "  visibility: hidden !important;",
    "  opacity: 0 !important;",
    "  pointer-events: none !important;",
    "}"
  ].join(
    "\n"
  );

const READ_ONLY_SECTION_PATTERN =
  /(?:thong\s*so|chi\s*tiet|danh\s*gia|review|spec(?:ification)?s?|description|mo\s*ta|features?|thong\s*tin\s*noi\s*bat|phu\s*kien|trong\s*hop|in\s*the\s*box|combo|bundle|dich\s*vu\s*thue|gia\s*thue|availability)/iu;

const MUTATING_CONTROL_PATTERN =
  /(?:mua\s*ngay|them\s*vao\s*gio|gio\s*hang|cart|checkout|thanh\s*toan|dat\s*hang|buy\s*now|add\s*to\s*cart|quantity|so\s*luong|variant|phien\s*ban|mau\s*sac|color|size|storage|dung\s*luong|installment|tra\s*gop|wishlist|yeu\s*thich)/iu;


function normalizeText(
  value:
    string
): string {

  return value
    .normalize(
      "NFD"
    )
    .replace(
      /\p{M}+/gu,
      ""
    )
    .replace(
      /đ/giu,
      "d"
    )
    .replace(
      /[^a-z0-9]+/giu,
      " "
    )
    .replace(
      /\s+/gu,
      " "
    )
    .trim()
    .toLowerCase();
}


function sha256(
  value:
    Buffer
): string {

  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}


async function shortNetworkQuiet(
  page:
    Page,
  timeoutMs:
    number
): Promise<void> {

  try {
    await page.waitForLoadState(
      "networkidle",
      {
        timeout:
          timeoutMs
      }
    );
  } catch {
    // Best effort only: product pages often keep analytics/chat connections open.
  }
}


async function warmLazyContent(
  page:
    Page
): Promise<void> {

  const metrics =
    await page.evaluate(
      () => ({
        startY:
          window.scrollY,

        viewportHeight:
          Math.max(
            1,
            window.innerHeight
          ),

        documentHeight:
          Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight ??
              0
          )
      })
    );


  const maxScroll =
    Math.max(
      0,
      metrics.documentHeight -
      metrics.viewportHeight
    );

  const step =
    Math.max(
      360,
      Math.floor(
        metrics.viewportHeight *
        0.72
      )
    );

  const targets:
    number[] =
      [];


  for (
    let y =
      0;
    y <=
      maxScroll &&
    targets.length <
      8;
    y +=
      step
  ) {
    targets.push(
      y
    );
  }


  if (
    targets.at(
      -1
    ) !==
      maxScroll &&
    targets.length <
      8
  ) {
    targets.push(
      maxScroll
    );
  }


  for (
    const y
    of targets
  ) {

    await page.evaluate(
      targetY => {
        window.scrollTo(
          0,
          targetY
        );
      },
      y
    );

    await page.waitForTimeout(
      55
    );
  }


  await page.evaluate(
    targetY => {
      window.scrollTo(
        0,
        targetY
      );
    },
    metrics.startY
  );
}


async function openSafeReadOnlySections(
  page:
    Page,
  timeoutMs:
    number
): Promise<void> {

  const controls =
    page.locator(
      [
        "summary",
        "button",
        "[role='tab']",
        "[aria-expanded='false']"
      ].join(
        ","
      )
    );

  const count =
    Math.min(
      60,
      await controls.count()
    );


  for (
    let index =
      0;
    index <
      count;
    index +=
      1
  ) {

    const control =
      controls.nth(
        index
      );


    if (
      !await control.isVisible()
        .catch(
          () =>
            false
        )
    ) {
      continue;
    }


    const metadata =
      await control.evaluate(
        element => {

          const html =
            element as HTMLElement;

          return {
            text:
              (
                html.innerText ??
                element.textContent ??
                ""
              )
                .replace(
                  /\s+/gu,
                  " "
                )
                .trim()
                .slice(
                  0,
                  240
                ),

            structural:
              [
                element.id,
                element.className,
                element.getAttribute(
                  "role"
                ),
                element.getAttribute(
                  "aria-label"
                ),
                element.getAttribute(
                  "title"
                ),
                element.getAttribute(
                  "data-testid"
                ),
                element.getAttribute(
                  "name"
                )
              ]
                .filter(
                  value =>
                    typeof value ===
                      "string"
                )
                .join(
                  " "
                )
                .slice(
                  0,
                  360
                ),

            tag:
              element.tagName
                .toLowerCase(),

            href:
              element.getAttribute(
                "href"
              ) ??
              ""
          };
        }
      );


    const signal =
      normalizeText(
        metadata.text +
        " " +
        metadata.structural
      );


    if (
      !READ_ONLY_SECTION_PATTERN.test(
        signal
      ) ||
      MUTATING_CONTROL_PATTERN.test(
        signal
      )
    ) {
      continue;
    }


    if (
      metadata.tag ===
        "a" &&
      metadata.href.length >
        0 &&
      !metadata.href.startsWith(
        "#"
      )
    ) {
      continue;
    }


    try {
      await control.click({
        timeout:
          timeoutMs
      });

      await page.waitForTimeout(
        70
      );
    } catch {
      // A read-only section is optional. Failure to open it must not abort capture.
    }
  }
}


async function collectCaptureMap(
  page:
    Page
): Promise<
  CaptureMap
> {

  return page.evaluate(
    () => {

      type LocalRole =
        | "hero"
        | "commerce"
        | "specs"
        | "reviews"
        | "extra";


      interface LocalCandidate {
        selector:
          string |
          null;

        label:
          string;

        text:
          string;

        y:
          number;

        height:
          number;

        visible:
          boolean;

        kindHint?:
          LocalRole |
          null;
      }


      const normalize =
        (
          value:
            string |
            null |
            undefined
        ): string =>
          (
            value ??
            ""
          )
            .replace(
              /\s+/gu,
              " "
            )
            .trim();


      const rendered =
        (
          element:
            Element
        ): boolean => {

          const rect =
            element.getBoundingClientRect();

          const style =
            getComputedStyle(
              element
            );

          return (
            rect.width >
              0 &&
            rect.height >
              0 &&
            style.display !==
              "none" &&
            style.visibility !==
              "hidden" &&
            Number(
              style.opacity
            ) >
              0.02
          );
        };


      const cssPath =
        (
          element:
            Element
        ): string => {

          const html =
            element as HTMLElement;


          if (
            html.id
          ) {
            return (
              "#" +
              CSS.escape(
                html.id
              )
            );
          }


          const parts:
            string[] =
              [];

          let current:
            Element |
            null =
              element;


          while (
            current &&
            current !==
              document.body &&
            parts.length <
              7
          ) {

            const tag =
              current.tagName
                .toLowerCase();

            const parent:
              Element |
              null =
                current.parentElement;


            if (
              !parent
            ) {
              break;
            }


            const siblings =
              Array.from(
                parent.children
              )
                .filter(
                  child =>
                    child.tagName ===
                    current?.tagName
                );

            const index =
              Math.max(
                1,
                siblings.indexOf(
                  current
                ) +
                1
              );

            parts.unshift(
              tag +
              ":nth-of-type(" +
              String(
                index
              ) +
              ")"
            );

            current =
              parent;
          }


          return (
            "body > " +
            parts.join(
              " > "
            )
          );
        };


      const pricePattern =
        /(?:\bvnd\b|\busd\b|\beur\b|₫|đ|\bprice\b|\bgia\b|\bgiá\b|(?:^|[^\d])\d{1,3}(?:[.,]\d{3}){1,3}(?:[^\d]|$))/iu;


      const h1Candidates =
        Array.from(
          document.querySelectorAll(
            "h1"
          )
        )
          .filter(
            rendered
          );


      let hero:
        LocalCandidate |
        null =
          null;


      for (
        const h1
        of h1Candidates
      ) {

        let current:
          Element |
          null =
            h1;

        let depth =
          0;

        let best:
          {
            element:
              Element;

            score:
              number;

            area:
              number;
          } |
          null =
            null;


        while (
          current &&
          current !==
            document.body &&
          depth <
            7
        ) {

          if (
            /^(?:nav|header|footer)$/iu.test(
              current.tagName
            )
          ) {
            current =
              current.parentElement;

            depth +=
              1;

            continue;
          }


          const rect =
            current.getBoundingClientRect();

          const text =
            normalize(
              (
                current as HTMLElement
              ).innerText ??
              current.textContent
            )
              .slice(
                0,
                2_800
              );


          if (
            rect.width >=
              260 &&
            rect.height >=
              100
          ) {

            let score =
              0;


            if (
              pricePattern.test(
                text
              )
            ) {
              score +=
                6;
            }


            if (
              current.querySelector(
                "img, picture"
              )
            ) {
              score +=
                2;
            }


            if (
              current.querySelector(
                "button, [role='button'], select"
              )
            ) {
              score +=
                1;
            }


            if (
              /(?:product|detail|summary|commerce)/iu.test(
                [
                  current.id,
                  current.className
                ].join(
                  " "
                )
              )
            ) {
              score +=
                2;
            }


            const area =
              rect.width *
              rect.height;


            if (
              !best ||
              score >
                best.score ||
              (
                score ===
                  best.score &&
                area <
                  best.area
              )
            ) {
              best = {
                element:
                  current,

                score,

                area
              };
            }
          }


          current =
            current.parentElement;

          depth +=
            1;
        }


        const root =
          best?.element ??
          h1.parentElement ??
          h1;

        const rect =
          root.getBoundingClientRect();

        const candidate:
          LocalCandidate = {
            selector:
              cssPath(
                root
              ),

            label:
              normalize(
                (
                  h1 as HTMLElement
                ).innerText ??
                h1.textContent
              ),

            text:
              normalize(
                (
                  root as HTMLElement
                ).innerText ??
                root.textContent
              )
                .slice(
                  0,
                  2_800
                ),

            y:
              Math.max(
                0,
                window.scrollY +
                rect.top
              ),

            height:
              Math.max(
                0,
                rect.height
              ),

            visible:
              rendered(
                root
              ),

            kindHint:
              "hero"
          };


        if (
          !hero ||
          candidate.y <
            hero.y
        ) {
          hero =
            candidate;
        }
      }


      const sectionSelectors =
        [
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "[role='heading']",
          "summary"
        ].join(
          ","
        );

      const sectionNodes =
        Array.from(
          document.querySelectorAll(
            sectionSelectors
          )
        )
          .filter(
            rendered
          )
          .slice(
            0,
            220
          );

      const sectionRoots =
        new Set<
          string
        >();

      const sections:
        LocalCandidate[] =
          [];


      for (
        const heading
        of sectionNodes
      ) {

        if (
          heading.closest(
            "nav, header, footer"
          )
        ) {
          continue;
        }


        const root =
          heading.closest(
            [
              "section",
              "article",
              "details",
              "[role='tabpanel']",
              "[class*='accordion' i]",
              "[class*='spec' i]",
              "[class*='review' i]",
              "[class*='description' i]",
              "[class*='product-info' i]"
            ].join(
              ","
            )
          ) ??
          heading.parentElement ??
          heading;

        const selector =
          cssPath(
            root
          );


        if (
          hero?.selector ===
            selector ||
          sectionRoots.has(
            selector
          )
        ) {
          continue;
        }


        const rect =
          root.getBoundingClientRect();


        if (
          rect.width <
            220 ||
          rect.height <
            40
        ) {
          continue;
        }


        const label =
          normalize(
            (
              heading as HTMLElement
            ).innerText ??
            heading.textContent
          )
            .slice(
              0,
              180
            );

        const text =
          normalize(
            (
              root as HTMLElement
            ).innerText ??
            root.textContent
          )
            .slice(
              0,
              2_200
            );


        if (
          !label &&
          !text
        ) {
          continue;
        }


        sectionRoots.add(
          selector
        );

        sections.push({
          selector,

          label:
            label ||
            text.slice(
              0,
              120
            ),

          text,

          y:
            Math.max(
              0,
              window.scrollY +
              rect.top
            ),

          height:
            Math.max(
              0,
              rect.height
            ),

          visible:
            rendered(
              root
            ),

          kindHint:
            null
        });
      }


      return {
        hero,
        sections
      };
    }
  ) as Promise<
    CaptureMap
  >;
}


async function transientOverlaySelectors(
  page:
    Page
): Promise<
  string[]
> {

  return page.evaluate(
    () => {

      const normalize =
        (
          value:
            string
        ): string =>
          value
            .normalize(
              "NFD"
            )
            .replace(
              /\p{M}+/gu,
              ""
            )
            .replace(
              /đ/giu,
              "d"
            )
            .replace(
              /\s+/gu,
              " "
            )
            .trim()
            .toLowerCase();


      const identity =
        normalize(
          (
            document.querySelector(
              "h1"
            ) as HTMLElement |
              null
          )?.innerText ??
          ""
        );

      const identityTokens =
        identity
          .split(
            /[^a-z0-9]+/u
          )
          .filter(
            token =>
              token.length >=
                2
          )
          .slice(
            0,
            10
          );


      const matchesProduct =
        (
          text:
            string
        ): boolean => {

          if (
            identityTokens.length ===
              0
          ) {
            return false;
          }


          const normalized =
            normalize(
              text
            );

          const matches =
            identityTokens.filter(
              token =>
                normalized.includes(
                  token
                )
            ).length;

          return matches >=
            Math.max(
              2,
              Math.ceil(
                identityTokens.length *
                0.6
              )
            );
        };


      const nuisancePattern =
        /(?:promo|promotion|coupon|voucher|newsletter|subscribe|cookie|cookies|privacy|uu\s*dai|khuyen\s*mai|ma\s*giam|nhan\s*ngay|dang\s*ky|chat|messenger|zalo|popup|pop-up)/iu;

      const structuralPattern =
        /(?:modal|popup|pop-up|overlay|dialog|coupon|voucher|newsletter|subscribe|promo|promotion|cookie|chat)/iu;

      const viewportArea =
        Math.max(
          1,
          window.innerWidth *
          window.innerHeight
        );


      const cssPath =
        (
          element:
            Element
        ): string => {

          const html =
            element as HTMLElement;


          if (
            html.id
          ) {
            return (
              "#" +
              CSS.escape(
                html.id
              )
            );
          }


          const parts:
            string[] =
              [];

          let current:
            Element |
            null =
              element;


          while (
            current &&
            current !==
              document.body &&
            parts.length <
              7
          ) {

            const parent:
              Element |
              null =
                current.parentElement;


            if (
              !parent
            ) {
              break;
            }


            const tag =
              current.tagName
                .toLowerCase();

            const siblings =
              Array.from(
                parent.children
              )
                .filter(
                  child =>
                    child.tagName ===
                    current?.tagName
                );

            const index =
              Math.max(
                1,
                siblings.indexOf(
                  current
                ) +
                1
              );

            parts.unshift(
              tag +
              ":nth-of-type(" +
              String(
                index
              ) +
              ")"
            );

            current =
              parent;
          }


          return (
            "body > " +
            parts.join(
              " > "
            )
          );
        };


      const raw:
        Element[] =
          [];


      for (
        const element
        of Array.from(
          document.querySelectorAll(
            "body *"
          )
        ).slice(
          0,
          4_000
        )
      ) {

        const rect =
          element.getBoundingClientRect();

        const style =
          getComputedStyle(
            element
          );


        if (
          rect.width <=
            0 ||
          rect.height <=
            0 ||
          style.display ===
            "none" ||
          style.visibility ===
            "hidden" ||
          Number(
            style.opacity
          ) <=
            0.02
        ) {
          continue;
        }


        const intersectWidth =
          Math.max(
            0,
            Math.min(
              rect.right,
              window.innerWidth
            ) -
            Math.max(
              rect.left,
              0
            )
          );

        const intersectHeight =
          Math.max(
            0,
            Math.min(
              rect.bottom,
              window.innerHeight
            ) -
            Math.max(
              rect.top,
              0
            )
          );

        const coverage =
          (
            intersectWidth *
            intersectHeight
          ) /
          viewportArea;


        if (
          coverage <
            0.025
        ) {
          continue;
        }


        const structural =
          [
            element.id,
            element.className,
            element.getAttribute(
              "role"
            ),
            element.getAttribute(
              "aria-modal"
            )
          ]
            .filter(
              value =>
                typeof value ===
                  "string"
            )
            .join(
              " "
            );

        const text =
          (
            (
              element as HTMLElement
            ).innerText ??
            element.textContent ??
            ""
          )
            .replace(
              /\s+/gu,
              " "
            )
            .trim()
            .slice(
              0,
              1_200
            );

        const zIndex =
          Number.parseInt(
            style.zIndex,
            10
          );

        const modalLike =
          structuralPattern.test(
            structural
          ) ||
          element.getAttribute(
            "role"
          ) ===
            "dialog" ||
          element.getAttribute(
            "aria-modal"
          ) ===
            "true" ||
          (
            (
              style.position ===
                "fixed" ||
              style.position ===
                "sticky"
            ) &&
            (
              Number.isFinite(
                zIndex
              )
                ? zIndex >=
                  50
                : coverage >=
                  0.15
            )
          );


        if (
          !modalLike ||
          !nuisancePattern.test(
            normalize(
              text +
              " " +
              structural
            )
          ) ||
          matchesProduct(
            text
          )
        ) {
          continue;
        }


        raw.push(
          element
        );
      }


      const roots =
        raw.filter(
          element =>
            !raw.some(
              other =>
                other !==
                  element &&
                other.contains(
                  element
                )
            )
        );


      return roots
        .map(
          cssPath
        )
        .filter(
          (
            selector,
            index,
            all
          ) =>
            selector.length >
              0 &&
            all.indexOf(
              selector
            ) ===
              index
        )
        .slice(
          0,
          12
        );
    }
  );
}


function screenshotStyle(
  selectors:
    readonly string[]
): string {

  const dynamic =
    selectors.length >
      0
      ? [
          selectors.join(
            ",\n"
          ),
          "{",
          "  visibility: hidden !important;",
          "  opacity: 0 !important;",
          "  pointer-events: none !important;",
          "}"
        ].join(
          "\n"
        )
      : "";


  return [
    BASE_SCREENSHOT_STYLE,
    dynamic
  ]
    .filter(
      Boolean
    )
    .join(
      "\n"
    );
}


async function clipForSelector(
  page:
    Page,
  selector:
    string,
  resolution:
    CaptureResolution
): Promise<
  ScreenshotClip |
  null
> {

  return page.evaluate(
    (
      input:
        {
          readonly selector:
            string;

          readonly resolution:
            CaptureResolution;
        }
    ) => {

      const element =
        document.querySelector(
          input.selector
        );


      if (
        !element
      ) {
        return null;
      }


      const rect =
        element.getBoundingClientRect();


      if (
        rect.width <=
          0 ||
        rect.height <=
          0
      ) {
        return null;
      }


      const docWidth =
        Math.max(
          document.documentElement.scrollWidth,
          document.body?.scrollWidth ??
            0,
          window.innerWidth
        );

      const docHeight =
        Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ??
            0,
          window.innerHeight
        );

      const maxWidth =
        input.resolution ===
          "high"
          ? 1_400
          : 1_100;

      const maxHeight =
        input.resolution ===
          "high"
          ? 1_100
          : 850;

      const padding =
        16;

      const x =
        Math.max(
          0,
          window.scrollX +
          rect.left -
          padding
        );

      const y =
        Math.max(
          0,
          window.scrollY +
          rect.top -
          padding
        );

      const width =
        Math.max(
          1,
          Math.min(
            maxWidth,
            docWidth -
            x,
            rect.width +
            (
              padding *
              2
            )
          )
        );

      const height =
        Math.max(
          1,
          Math.min(
            maxHeight,
            docHeight -
            y,
            Math.max(
              260,
              rect.height +
              (
                padding *
                2
              )
            )
          )
        );


      return {
        x,
        y,
        width,
        height
      };
    },
    {
      selector,
      resolution
    }
  ) as Promise<
    ScreenshotClip |
    null
  >;
}


async function currentScrollY(
  page:
    Page
): Promise<
  number
> {

  const value =
    await page.evaluate(
      () =>
        window.scrollY
    );

  return Number.isFinite(
    value
  )
    ? value
    : 0;
}


async function viewportSize(
  page:
    Page
): Promise<
  {
    readonly width:
      number;

    readonly height:
      number;
  }
> {

  const configured =
    page.viewportSize();


  if (
    configured
  ) {
    return {
      width:
        configured.width,

      height:
        configured.height
    };
  }


  return page.evaluate(
    () => ({
      width:
        Math.max(
          1,
          window.innerWidth
        ),

      height:
        Math.max(
          1,
          window.innerHeight
        )
    })
  );
}


async function scrollForShot(
  page:
    Page,
  shot:
    CapturePlanShot
): Promise<void> {

  if (
    shot.selector
  ) {

    const target =
      page.locator(
        shot.selector
      )
        .first();


    try {
      await target.scrollIntoViewIfNeeded({
        timeout:
          1_500
      });
    } catch {
      await page.evaluate(
        y => {
          window.scrollTo(
            0,
            y
          );
        },
        shot.scrollY
      );
    }
  } else {
    await page.evaluate(
      y => {
        window.scrollTo(
          0,
          y
        );
      },
      shot.scrollY
    );
  }


  await page.waitForTimeout(
    70
  );
}


async function captureShot(
  page:
    Page,
  shot:
    CapturePlanShot,
  viewport:
    {
      readonly width:
        number;

      readonly height:
        number;
    }
): Promise<
  {
    readonly bytes:
      Buffer;

    readonly width:
      number;

    readonly height:
      number;

    readonly scrollY:
      number;

    readonly selectorUsed:
      string |
      null;
  }
> {

  await scrollForShot(
    page,
    shot
  );

  const selectors =
    await transientOverlaySelectors(
      page
    );

  const style =
    screenshotStyle(
      selectors
    );

  const clip =
    shot.selector
      ? await clipForSelector(
          page,
          shot.selector,
          shot.resolution
        )
      : null;

  const bytes =
    await page.screenshot({
      type:
        "png",

      fullPage:
        false,

      animations:
        "disabled",

      caret:
        "hide",

      style,

      clip:
        clip ??
        undefined
    });

  const scrollY =
    await currentScrollY(
      page
    );


  return {
    bytes,

    width:
      Math.round(
        clip?.width ??
        viewport.width
      ),

    height:
      Math.round(
        clip?.height ??
        viewport.height
      ),

    scrollY,

    selectorUsed:
      clip
        ? shot.selector
        : null
  };
}


async function writeManifestAtomic(
  outputDir:
    string,
  manifest:
    CaptureManifest
): Promise<
  string
> {

  const finalPath =
    join(
      outputDir,
      "capture_manifest.json"
    );

  const tempPath =
    finalPath +
    ".tmp";

  await writeFile(
    tempPath,
    JSON.stringify(
      manifest,
      null,
      2
    ) +
    "\n",
    "utf8"
  );

  await rename(
    tempPath,
    finalPath
  );

  return finalPath;
}


export async function captureAdaptiveVisualEvidence(
  page:
    Page,
  options:
    AdaptiveCaptureOptions
): Promise<
  AdaptiveCaptureResult
> {

  const navigationTimeoutMs =
    Math.max(
      1_000,
      options.navigationTimeoutMs ??
      20_000
    );

  const networkIdleTimeoutMs =
    Math.max(
      250,
      options.networkIdleTimeoutMs ??
      1_500
    );

  const interactionTimeoutMs =
    Math.max(
      250,
      options.interactionTimeoutMs ??
      1_500
    );


  await mkdir(
    options.outputDir,
    {
      recursive:
        true
    }
  );


  const requestedUrl =
    options.url ??
    page.url();


  if (
    options.url
  ) {

    await page.goto(
      options.url,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          navigationTimeoutMs
      }
    );

    await shortNetworkQuiet(
      page,
      networkIdleTimeoutMs
    );
  }


  const finalUrl =
    page.url();


  await warmLazyContent(
    page
  );

  await openSafeReadOnlySections(
    page,
    interactionTimeoutMs
  );


  const captureMap =
    await collectCaptureMap(
      page
    );

  const plan =
    buildCapturePlan({
      hero:
        captureMap.hero,

      sections:
        captureMap.sections,

      maxShots:
        options.maxShots
    });

  const viewport =
    await viewportSize(
      page
    );

  const shots:
    CaptureManifestShot[] =
      [];

  const imagePaths:
    string[] =
      [];

  const seenHashes =
    new Set<
      string
    >();


  for (
    const shot
    of plan
  ) {

    const captured =
      await captureShot(
        page,
        shot,
        viewport
      );

    const contentHash =
      sha256(
        captured.bytes
      );


    if (
      seenHashes.has(
        contentHash
      )
    ) {
      continue;
    }


    seenHashes.add(
      contentHash
    );


    const fileName =
      shot.shotId +
      ".png";

    const imagePath =
      join(
        options.outputDir,
        fileName
      );

    await writeFile(
      imagePath,
      captured.bytes
    );


    const captureTimestamp =
      new Date()
        .toISOString();


    shots.push({
      shotId:
        shot.shotId,

      role:
        shot.role,

      sectionLabel:
        shot.sectionLabel,

      resolution:
        shot.resolution,

      scrollY:
        captured.scrollY,

      width:
        captured.width,

      height:
        captured.height,

      selectorUsed:
        captured.selectorUsed,

      path:
        fileName,

      contentHash,

      captureTimestamp
    });

    imagePaths.push(
      imagePath
    );
  }


  const captureTimestamp =
    new Date()
      .toISOString();

  const manifest:
    CaptureManifest = {
      schemaVersion:
        1,

      url:
        requestedUrl,

      finalUrl,

      viewport,

      captureTimestamp,

      shots
  };

  const manifestPath =
    await writeManifestAtomic(
      options.outputDir,
      manifest
    );


  return {
    manifest,
    manifestPath,
    imagePaths
  };
}
