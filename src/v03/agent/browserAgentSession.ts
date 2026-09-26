import {
  chromium,
  type Page
} from "playwright";

import {
  AgentTokenBudget
} from "./tokenBudget.js";

import {
  GeminiBrowserPlanner
} from "./geminiBrowserPlanner.js";

import {
  buildEvidencePacket
} from "../ai/evidencePacket.js";

import type {
  ControlSnapshot,
  EvidencePacket
} from "../ai/evidenceTypes.js";

import {
  collectProductObservationsFromHtml
} from "../observations/observationCollector.js";

import type {
  BrowserAgentAction,
  BrowserAgentCandidate,
  BrowserAgentEventSink,
  BrowserAgentObservation
} from "./browserAgentTypes.js";



async function captureFinalControlSnapshots(
  page:
    Page
): Promise<
  ControlSnapshot[]
> {

  return page.evaluate(
    () => {

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
            .trim()
            .slice(
              0,
              180
            );


      const labelFor =
        (
          element:
            Element
        ): string => {

          const aria =
            normalize(
              element.getAttribute(
                "aria-label"
              )
            );


          if (
            aria
          ) {
            return aria;
          }


          if (
            element instanceof
              HTMLInputElement ||
            element instanceof
              HTMLSelectElement
          ) {

            const directLabel =
              element.labels?.[0]
                ?.textContent;


            if (
              directLabel
            ) {
              return normalize(
                directLabel
              );
            }
          }


          const wrappingLabel =
            element.closest(
              "label"
            )
              ?.textContent;


          if (
            wrappingLabel
          ) {
            return normalize(
              wrappingLabel
            );
          }


          return normalize(
            element.getAttribute(
              "name"
            ) ??
            element.getAttribute(
              "id"
            ) ??
            element.getAttribute(
              "title"
            ) ??
            element.getAttribute(
              "role"
            ) ??
            element.tagName
          );
        };


      const controls:
        ControlSnapshot[] =
          [];


      const seen =
        new Set<
          string
        >();


      const push =
        (
          control:
            ControlSnapshot
        ): void => {

          if (
            !control.value
          ) {
            return;
          }


          const key =
            [
              control.kind,
              control.label,
              control.value,
              String(
                control.selected
              )
            ]
              .join(
                "\u0000"
              );


          if (
            seen.has(
              key
            )
          ) {
            return;
          }


          seen.add(
            key
          );


          controls.push(
            control
          );
        };


      for (
        const element
        of document.querySelectorAll(
          "select"
        )
      ) {

        if (
          !(
            element instanceof
              HTMLSelectElement
          )
        ) {
          continue;
        }


        for (
          const option
          of Array.from(
            element.selectedOptions
          )
        ) {

          push({
            kind:
              "select",

            label:
              labelFor(
                element
              ),

            value:
              normalize(
                option.textContent ??
                option.value
              ),

            selected:
              true
          });
        }
      }


      for (
        const element
        of document.querySelectorAll(
          'input[type="radio"], input[type="checkbox"]'
        )
      ) {

        if (
          !(
            element instanceof
              HTMLInputElement
          ) ||
          !element.checked
        ) {
          continue;
        }


        push({
          kind:
            element.type,

          label:
            labelFor(
              element
            ),

          value:
            normalize(
              element.value ||
              element.getAttribute(
                "aria-label"
              ) ||
              element.closest(
                "label"
              )
                ?.textContent ||
              "selected"
            ),

          selected:
            true
        });
      }


      for (
        const element
        of document.querySelectorAll(
          '[aria-selected="true"], [aria-pressed="true"]'
        )
      ) {

        push({
          kind:
            normalize(
              element.getAttribute(
                "role"
              ) ??
              element.tagName
            )
              .toLowerCase(),

          label:
            labelFor(
              element
            ),

          value:
            normalize(
              element.textContent ??
              element.getAttribute(
                "aria-label"
              ) ??
              "selected"
            ),

          selected:
            true
        });
      }


      return controls.slice(
        0,
        60
      );
    }
  );
}


export async function captureFinalEvidencePacket(
  page:
    Page,

  requestedUrl:
    string
): Promise<
  EvidencePacket
> {

  const finalUrl =
    page.url();


  /*
   * Capture the DOM only AFTER planner actions have run.
   * Remove our own overlay from the captured HTML so it can never become
   * product evidence.
   */
  const renderedHtml =
    await page.evaluate(
      () => {

        const clone =
          document.documentElement
            .cloneNode(
              true
            ) as HTMLElement;


        clone
          .querySelector(
            "#__camintel_agent_overlay"
          )
          ?.remove();


        return (
          "<!doctype html>\n" +
          clone.outerHTML
        );
      }
    );


  /*
   * Primary rendered text is taken from the final live DOM as well.
   * Strip the overlay's own visible text without mutating the page.
   */
  const primaryRegionText =
    await page.evaluate(
      () => {

        const bodyText =
          document.body
            ?.innerText ??
          "";


        const overlayText =
          document
            .getElementById(
              "__camintel_agent_overlay"
            )
            ?.innerText ??
          "";


        if (
          overlayText &&
          bodyText.includes(
            overlayText
          )
        ) {

          return bodyText
            .replace(
              overlayText,
              ""
            )
            .trim();
        }


        return bodyText.trim();
      }
    );


  const collected =
    collectProductObservationsFromHtml(
      renderedHtml,
      requestedUrl,
      finalUrl
    );


  const capturedControls =
    await captureFinalControlSnapshots(
      page
    );


  /*
   * Keep the C3 mock/unit contract backward-compatible: a mocked
   * page.evaluate() may not yet know about the new third evaluate call.
   * Production Playwright returns the serialized array produced by the
   * page function; anything else is treated as no captured controls.
   */
  const controls =
    Array.isArray(
      capturedControls
    )
      ? capturedControls
      : [];


  /*
   * C4 live-control hardening:
   * preserve selected/default state from the FINAL live DOM.
   * This is observation-only. The collector never clicks or mutates a
   * variant while taking this snapshot.
   */
  return buildEvidencePacket({
    pageUrl:
      requestedUrl,

    finalUrl,

    observations:
      collected.observations,

    primaryRegionText,

    controls
  });
}

function clean(
  value:
    string,
  maxChars:
    number
): string {

  const normalized =
    value
      .replace(
        /\s+/gu,
        " "
      )
      .trim();


  return normalized.length <=
    maxChars
    ? normalized
    : normalized.slice(
        0,
        maxChars
      );
}


async function setOverlay(
  page:
    Page,

  title:
    string,

  detail:
    string
): Promise<void> {

  await page.evaluate(
    (
      input:
        {
          title:
            string;

          detail:
            string;
        }
    ) => {

      const id =
        "__camintel_agent_overlay";


      let box =
        document.getElementById(
          id
        );


      if (
        !box
      ) {

        box =
          document.createElement(
            "div"
          );

        box.id =
          id;

        Object.assign(
          box.style,
          {
            position:
              "fixed",

            top:
              "16px",

            right:
              "16px",

            zIndex:
              "2147483647",

            maxWidth:
              "420px",

            padding:
              "12px 16px",

            background:
              "rgba(15, 23, 42, 0.94)",

            color:
              "white",

            fontFamily:
              "Arial, sans-serif",

            fontSize:
              "14px",

            lineHeight:
              "1.45",

            borderRadius:
              "10px",

            boxShadow:
              "0 8px 30px rgba(0,0,0,.30)",

            pointerEvents:
              "none"
          }
        );


        document.body.appendChild(
          box
        );
      }


      box.textContent =
        input.title +
        "\n" +
        input.detail;

      box.style.whiteSpace =
        "pre-wrap";
    },
    {
      title,
      detail
    }
  );
}


async function observePage(
  page:
    Page
): Promise<
  BrowserAgentObservation
> {

  return page.evaluate(
    () => {

      const visible =
        (
          element:
            Element
        ): boolean => {

          const rect =
            element
              .getBoundingClientRect();


          if (
            rect.width <=
              0 ||
            rect.height <=
              0
          ) {
            return false;
          }


          const style =
            window
              .getComputedStyle(
                element
              );


          return (
            style.display !==
              "none" &&
            style.visibility !==
              "hidden" &&
            Number(
              style.opacity
            ) !==
              0
          );
        };


      const normalize =
        (
          value:
            string
        ) =>
          value
            .replace(
              /\s+/gu,
              " "
            )
            .trim();


      const semanticPattern =
        /(?:Ã¢â€šÂ«|Ã„â€˜\b|vnd|giÃƒÂ¡|price|cÃƒÂ²n hÃƒÂ ng|hÃ¡ÂºÂ¿t hÃƒÂ ng|stock|availability|thÃƒÂ´ng sÃ¡Â»â€˜|specification|specifications|cÃ¡ÂºÂ¥u hÃƒÂ¬nh|variant|phiÃƒÂªn bÃ¡ÂºÂ£n|tÃƒÂ¹y chÃ¡Â»Ân|option|body only|kit lens|condition|tÃƒÂ¬nh trÃ¡ÂºÂ¡ng|review|Ã„â€˜ÃƒÂ¡nh giÃƒÂ¡)/iu;


      const selectors =
        [
          "h1",
          "h2",
          "h3",
          "h4",
          "button",
          "[role='button']",
          "[role='tab']",
          "summary",
          "label",
          "input",
          "select",
          "a",
          "span",
          "div",
          "p",
          "li"
        ].join(
          ","
        );


      const nodes =
        Array.from(
          document
            .querySelectorAll(
              selectors
            )
        )
          .slice(
            0,
            5_000
          );


      const candidates:
        Array<{
          id:
            string;

          tag:
            string;

          role:
            string |
            null;

          text:
            string;

          value:
            string |
            null;

          selected:
            boolean;

          href:
            string |
            null;
        }> =
          [];


      for (
        const element
        of nodes
      ) {

        if (
          candidates.length >=
            55
        ) {
          break;
        }


        if (
          !visible(
            element
          )
        ) {
          continue;
        }


        const htmlElement =
          element as
            HTMLElement;


        const tag =
          element.tagName
            .toUpperCase();


        const role =
          element.getAttribute(
            "role"
          );


        const value =
          element instanceof
            HTMLInputElement ||
          element instanceof
            HTMLSelectElement
            ? element.value
            : null;


        const text =
          normalize(
            htmlElement.innerText ||
            element.textContent ||
            value ||
            ""
          );


        const interactive =
          [
            "BUTTON",
            "A",
            "INPUT",
            "SELECT",
            "SUMMARY",
            "H1",
            "H2",
            "H3",
            "H4"
          ].includes(
            tag
          ) ||
          role ===
            "button" ||
          role ===
            "tab";


        const semantic =
          text.length >
            0 &&
          text.length <=
            180 &&
          semanticPattern.test(
            text
          );


        if (
          !interactive &&
          !semantic
        ) {
          continue;
        }


        if (
          !interactive &&
          text.length >
            140
        ) {
          continue;
        }


        const id =
          "ai_" +
          String(
            candidates.length +
            1
          ).padStart(
            3,
            "0"
          );


        element.setAttribute(
          "data-camintel-agent-id",
          id
        );


        const selected =
          element instanceof
            HTMLInputElement
            ? element.checked
            : element instanceof
                HTMLOptionElement
              ? element.selected
              : element.getAttribute(
                    "aria-selected"
                  ) ===
                    "true";


        const href =
          element instanceof
            HTMLAnchorElement
            ? element.getAttribute(
                "href"
              )
            : null;


        candidates.push({
          id,
          tag,
          role,
          text:
            text.slice(
              0,
              140
            ),
          value,
          selected,
          href
        });
      }


      const viewportPieces:
        string[] =
          [];


      const viewportNodes =
        Array.from(
          document.querySelectorAll(
            "h1,h2,h3,p,span,button,label,li"
          )
        );


      for (
        const element
        of viewportNodes
      ) {

        const rect =
          element
            .getBoundingClientRect();


        if (
          rect.bottom <
            0 ||
          rect.top >
            window.innerHeight ||
          !visible(
            element
          )
        ) {
          continue;
        }


        const text =
          normalize(
            (
              element as
                HTMLElement
            ).innerText ||
            element.textContent ||
            ""
          );


        if (
          !text ||
          text.length >
            300 ||
          viewportPieces.includes(
            text
          )
        ) {
          continue;
        }


        viewportPieces.push(
          text
        );


        if (
          viewportPieces
            .join(
              "\n"
            )
            .length >
            3_500
        ) {
          break;
        }
      }


      return {
        url:
          location.href,

        title:
          document.title,

        viewportText:
          viewportPieces
            .join(
              "\n"
            )
            .slice(
              0,
              3_500
            ),

        candidates
      };
    }
  );
}


async function screenshotBase64(
  page:
    Page
): Promise<string> {

  /*
   * Screenshot is useful context, not a hard dependency.
   *
   * Some commerce pages keep web fonts pending indefinitely. Playwright
   * waits for fonts before taking a screenshot, so a normal 30s screenshot
   * timeout can kill the whole browser-agent session before Gemini is even
   * called.
   *
   * Bound screenshot work tightly. On failure, return an empty string;
   * GeminiBrowserPlanner already treats an empty screenshot as "no image"
   * and continues from the DOM/candidate observation.
   */
  try {

    const image =
      await page.screenshot({
        type:
          "webp",

        quality:
          42,

        fullPage:
          false,

        animations:
          "disabled",

        caret:
          "hide",

        timeout:
          4_000
      });


    return image.toString(
      "base64"
    );
  }
  catch {

    return "";
  }
}


const dangerousPattern =
  /(?:add to cart|buy now|checkout|login|sign in|mua hÃƒÂ ng|mua ngay|giÃ¡Â»Â hÃƒÂ ng|thanh toÃƒÂ¡n|Ã„â€˜Ã¡ÂºÂ·t hÃƒÂ ng|Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p)/iu;


async function highlight(
  page:
    Page,
  targetId:
    string
): Promise<void> {

  const locator =
    page.locator(
      `[data-camintel-agent-id="${targetId}"]`
    ).first();


  if (
    await locator.count() ===
      0
  ) {
    return;
  }


  await locator
    .scrollIntoViewIfNeeded();


  await locator.evaluate(
    element => {

      const html =
        element as
          HTMLElement;


      html.dataset
        .camintelOldOutline =
          html.style.outline;

      html.style.outline =
        "4px solid #ff3b30";

      html.style.outlineOffset =
        "4px";
    }
  );
}


async function clearHighlight(
  page:
    Page,
  targetId:
    string
): Promise<void> {

  const locator =
    page.locator(
      `[data-camintel-agent-id="${targetId}"]`
    ).first();


  if (
    await locator.count() ===
      0
  ) {
    return;
  }


  await locator.evaluate(
    element => {

      const html =
        element as
          HTMLElement;


      html.style.outline =
        html.dataset
          .camintelOldOutline ??
        "";

      html.style.outlineOffset =
        "";

      delete html.dataset
        .camintelOldOutline;
    }
  );
}


async function executeAction(
  page:
    Page,

  action:
    BrowserAgentAction,

  candidate:
    BrowserAgentCandidate |
    undefined,

  actionDelayMs:
    number
): Promise<string> {

  if (
    action.action ===
      "FINISH"
  ) {
    return "AI marked browsing complete.";
  }


  if (
    action.action ===
      "WAIT"
  ) {

    await page.waitForTimeout(
      700
    );

    return "Waited for page update.";
  }


  if (
    !action.targetId ||
    !candidate
  ) {
    return "Target unavailable.";
  }


  await setOverlay(
    page,
    "CAMERA INTELLIGENCE AI",
    action.action +
    " Ã¢â‚¬Â¢ " +
    (
      action.field ??
      "PAGE"
    ) +
    "\n" +
    action.reason
  );


  await highlight(
    page,
    action.targetId
  );


  const locator =
    page.locator(
      `[data-camintel-agent-id="${action.targetId}"]`
    ).first();


  await page.waitForTimeout(
    actionDelayMs
  );


  try {

    if (
      action.action ===
        "SCROLL_TO"
    ) {

      await locator
        .scrollIntoViewIfNeeded();

      return (
        "Scrolled to " +
        candidate.text
          .slice(
            0,
            100
          )
      );
    }


    if (
      action.action ===
        "INSPECT"
    ) {

      const text =
        clean(
          await locator
            .innerText()
            .catch(
              () =>
                candidate.text
            ),
          240
        );


      return (
        "Inspected: " +
        text
      );
    }


    if (
      action.action ===
        "SELECT"
    ) {

      /*
       * V1 safety:
       * do not mutate default product variant yet.
       * Variant enumeration will be enabled after
       * restore-to-default behavior is tested.
       */
      return (
        "SELECT blocked by read-only V1 policy: " +
        candidate.text
          .slice(
            0,
            100
          )
      );
    }


    if (
      action.action ===
        "CLICK"
    ) {

      if (
        dangerousPattern.test(
          candidate.text
        )
      ) {
        return (
          "Unsafe commerce action blocked: " +
          candidate.text
            .slice(
              0,
              100
            )
        );
      }


      if (
        candidate.tag ===
          "A" &&
        candidate.href &&
        !candidate.href
          .startsWith(
            "#"
          )
      ) {
        return (
          "Navigation link blocked: " +
          candidate.text
            .slice(
              0,
              100
            )
        );
      }


      const safeClickable =
        [
          "BUTTON",
          "SUMMARY"
        ].includes(
          candidate.tag
        ) ||
        candidate.role ===
          "button" ||
        candidate.role ===
          "tab" ||
        (
          candidate.tag ===
            "A" &&
          (
            candidate.href ===
              null ||
            candidate.href
              .startsWith(
                "#"
              )
          )
        );


      if (
        !safeClickable
      ) {
        return (
          "CLICK blocked for non-expandable target: " +
          candidate.text
            .slice(
              0,
              100
            )
        );
      }


      await locator.click({
        timeout:
          3_000
      });


      await page.waitForTimeout(
        600
      );


      return (
        "Clicked information control: " +
        candidate.text
          .slice(
            0,
            100
          )
      );
    }


    return "No action performed.";
  }
  finally {

    await page.waitForTimeout(
      actionDelayMs
    );


    await clearHighlight(
      page,
      action.targetId
    );
  }
}


export interface BrowserAgentSessionOptions {
  readonly apiKey:
    string;

  readonly model?:
    string;

  readonly headless?:
    boolean;

  readonly plannerTimeoutMs?:
    number;

  readonly maxPlannerTurns?:
    number;

  readonly actionDelayMs?:
    number;

  readonly tokenBudget?:
    AgentTokenBudget;

  readonly onEvent?:
    BrowserAgentEventSink;
}


export class BrowserAgentSession {
  private readonly options:
    Required<
      Omit<
        BrowserAgentSessionOptions,
        "tokenBudget" |
        "onEvent"
      >
    >;

  readonly tokenBudget:
    AgentTokenBudget;

  private readonly onEvent?:
    BrowserAgentEventSink;


  constructor(
    options:
      BrowserAgentSessionOptions
  ) {

    this.options = {
      apiKey:
        options.apiKey,

      model:
        options.model ??
        "gemini-3.6-flash",

      headless:
        options.headless ??
        false,

      plannerTimeoutMs:
        options.plannerTimeoutMs ??
        30_000,

      maxPlannerTurns:
        options.maxPlannerTurns ??
        2,

      actionDelayMs:
        options.actionDelayMs ??
        450
    };


    this.tokenBudget =
      options.tokenBudget ??
      new AgentTokenBudget();


    this.onEvent =
      options.onEvent;
  }


  private emit(
    event:
      Parameters<
        BrowserAgentEventSink
      >[0]
  ): void {

    this.onEvent?.(
      event
    );
  }


  async run(
    url:
      string,

    finalizeBeforeClose?:
      (
        packet:
          EvidencePacket
      ) =>
        Promise<void>
  ): Promise<{
    readonly finalUrl:
      string;

    readonly turns:
      number;

    readonly budget:
      ReturnType<
        AgentTokenBudget[
          "snapshot"
        ]
      >;

    readonly packet:
      EvidencePacket;
  }> {

    const browser =
      await chromium.launch({
        headless:
          this.options
            .headless,

        slowMo:
          this.options
            .headless
            ? 0
            : 80
      });


    const context =
      await browser.newContext({
        viewport: {
          width:
            1440,

          height:
            900
        }
      });


    /*
     * tsx/esbuild may preserve local function names by injecting
     * __name(...) into callbacks that Playwright serializes into the
     * browser context. That helper exists in Node but not inside the page.
     *
     * Install a harmless browser-side compatibility shim before navigation.
     * Use string content deliberately so the shim itself cannot be rewritten
     * by the TypeScript/esbuild transform.
     */
    await context.addInitScript({
      content:
        "globalThis.__name = globalThis.__name || ((target, _value) => target);"
    });


    const page =
      await context.newPage();


    this.emit({
      type:
        "SESSION_STARTED",
      url
    });


    let completedTurns =
      0;

    let previousInteractionId:
      string |
      null =
        null;


    try {

      await page.goto(
        url,
        {
          /*
           * For heavy commerce/SPAs the document can be usable long before
           * DOMContentLoaded fires. Commit is the hard navigation gate.
           */
          waitUntil:
            "commit",

          timeout:
            30_000
        }
      );


      /*
       * DOMContentLoaded is best-effort after the main document commits.
       * Third-party scripts must not kill an otherwise usable live session.
       */
      try {

        await page.waitForLoadState(
          "domcontentloaded",
          {
            timeout:
              8_000
          }
        );
      }
      catch {

        /*
         * Intentionally continue. The document is already committed.
         * The next bounded body check is the readiness gate.
         */
      }


      await page.locator(
        "body"
      ).waitFor({
        state:
          "attached",

        timeout:
          10_000
      });


      await page.waitForTimeout(
        700
      );


      await setOverlay(
        page,
        "CAMERA INTELLIGENCE AI",
        "Page opened Ã¢â‚¬Â¢ preparing observation"
      );


      const planner =
        new GeminiBrowserPlanner({
          apiKey:
            this.options
              .apiKey,

          model:
            this.options
              .model,

          timeoutMs:
            this.options
              .plannerTimeoutMs
        });


      for (
        let turn =
          1;
        turn <=
          this.options
            .maxPlannerTurns;
        turn +=
          1
      ) {

        const observation =
          await observePage(
            page
          );


        const screenshot =
          await screenshotBase64(
            page
          );


        const observationJson =
          JSON.stringify(
            observation
          );


        const estimatedInputTokens =
          this.tokenBudget
            .estimateInput(
              observationJson
                .length,
              "low"
            );


        if (
          !this.tokenBudget
            .canStartRequest(
              estimatedInputTokens
            )
        ) {

          await setOverlay(
            page,
            "CAMERA INTELLIGENCE AI",
            "TOKEN BUDGET STOP\nNo additional planner request."
          );

          break;
        }


        this.emit({
          type:
            "PLANNER_STARTED",
          turn,
          estimatedInputTokens
        });


        await setOverlay(
          page,
          "CAMERA INTELLIGENCE AI",
          "Gemini MINIMAL planning...\nTurn " +
          turn +
          " Ã¢â‚¬Â¢ est. " +
          estimatedInputTokens +
          " input tokens"
        );


        const startedAt =
          Date.now();


        const heartbeat =
          setInterval(
            () => {

              const elapsedMs =
                Date.now() -
                startedAt;


              this.emit({
                type:
                  "PLANNER_WAITING",
                turn,
                elapsedMs
              });


              void setOverlay(
                page,
                "CAMERA INTELLIGENCE AI",
                "Gemini MINIMAL planning...\nWaiting " +
                (
                  elapsedMs /
                  1000
                ).toFixed(
                  0
                ) +
                "s"
              );
            },
            2_000
          );


        let result;


        try {

          result =
            await planner.plan(
              observation,
              {
                screenshotBase64:
                  screenshot,

                previousInteractionId
              }
            );
        }
        catch (
          error
        ) {

          const message =
            error instanceof Error
              ? error.message
              : String(
                  error
                );


          const transient =
            /GEMINI_BROWSER_PLANNER_HTTP_(?:502|503|504)/u
              .test(
                message
              );


          if (
            transient
          ) {

            await setOverlay(
              page,
              "CAMERA INTELLIGENCE AI",
              "PROVIDER TRANSIENT\nRetrying planner once after 2s..."
            );


            /*
             * One bounded retry only.
             * Google classifies 5xx/503 as transient; do not loop forever.
             */
            await page.waitForTimeout(
              2_000
            );


            try {

              result =
                await planner.plan(
                  observation,
                  {
                    screenshotBase64:
                      screenshot,

                    previousInteractionId
                  }
                );
            }
            catch (
              retryError
            ) {

              const retryMessage =
                retryError instanceof Error
                  ? retryError.message
                  : String(
                      retryError
                    );


              if (
                retryMessage.startsWith(
                  "GEMINI_BROWSER_PLANNER_HTTP_429"
                ) ||
                /GEMINI_BROWSER_PLANNER_HTTP_(?:502|503|504)/u
                  .test(
                    retryMessage
                  )
              ) {

                await setOverlay(
                  page,
                  "CAMERA INTELLIGENCE AI",
                  "PROVIDER STOP\nFinalizing current page evidence."
                );


                /*
                 * We already have useful live evidence from completed actions.
                 * Stop planner work and continue to final evidence + semantic LOW.
                 */
                break;
              }


              throw retryError;
            }
          }
          else if (
            message.startsWith(
              "GEMINI_BROWSER_PLANNER_HTTP_429"
            )
          ) {

            await setOverlay(
              page,
              "CAMERA INTELLIGENCE AI",
              "PROVIDER QUOTA STOP\nFinalizing current page evidence."
            );


            break;
          }
          else {

            throw error;
          }
        }
        finally {

          clearInterval(
            heartbeat
          );
        }


        completedTurns =
          turn;


        previousInteractionId =
          result.interactionId;


        this.tokenBudget.record({
          inputTokens:
            result.usage
              .inputTokens,

          outputTokens:
            result.usage
              .outputTokens,

          thoughtTokens:
            result.usage
              .thoughtTokens,

          cachedTokens:
            result.usage
              .cachedTokens,

          totalTokens:
            result.usage
              .totalTokens
        });


        this.emit({
          type:
            "PLANNER_COMPLETED",
          turn,
          usage:
            result.usage
        });


        const budget =
          this.tokenBudget
            .snapshot();


        this.emit({
          type:
            "BUDGET_UPDATED",

          inputTokens:
            budget.inputTokens,

          remainingInputTokens:
            budget
              .remainingInputTokens,

          level:
            budget.level
        });


        await setOverlay(
          page,
          "CAMERA INTELLIGENCE AI",
          "Plan ready Ã¢â‚¬Â¢ " +
          result.plan.actions.length +
          " actions\nInput " +
          result.usage.inputTokens +
          " Ã¢â‚¬Â¢ cached " +
          result.usage.cachedTokens
        );


        let pageMutated =
          false;

        let finished =
          false;


        const candidates =
          new Map(
            observation
              .candidates
              .map(
                candidate => [
                  candidate.id,
                  candidate
                ] as const
              )
          );


        for (
          const action
          of result.plan.actions
        ) {

          this.emit({
            type:
              "ACTION_STARTED",
            action
          });


          const detail =
            await executeAction(
              page,
              action,
              action.targetId
                ? candidates.get(
                    action.targetId
                  )
                : undefined,
              this.options
                .actionDelayMs
            );


          this.emit({
            type:
              "ACTION_COMPLETED",
            action,
            detail
          });


          if (
            action.action ===
              "CLICK" ||
            action.action ===
              "SELECT"
          ) {
            pageMutated =
              true;
          }


          if (
            action.action ===
              "FINISH"
          ) {
            finished =
              true;
            break;
          }
        }


        if (
          finished ||
          (
            !pageMutated &&
            result.plan
              .unresolvedFields
              .length ===
              0
          )
        ) {
          break;
        }
      }


      /*
       * C3: evidence-after-action.
       * The page is still alive here; capture the final rendered DOM before
       * SESSION_COMPLETED and before context/browser cleanup.
       */
      const packet =
        await captureFinalEvidencePacket(
          page,
          url
        );


      if (
        finalizeBeforeClose
      ) {

        await setOverlay(
          page,
          "CAMERA INTELLIGENCE AI",
          "SEMANTIC LOW\nFinalizing final evidence..."
        );


        await finalizeBeforeClose(
          packet
        );
      }


      const finalUrl =
        packet.finalUrl;


      const budget =
        this.tokenBudget
          .snapshot();


      await setOverlay(
        page,
        "CAMERA INTELLIGENCE AI",
        "Browsing complete\nInput tokens: " +
        budget.inputTokens +
        " / " +
        this.tokenBudget
          .limits
          .hardInputTokens
      );


      this.emit({
        type:
          "SESSION_COMPLETED",
        url:
          finalUrl
      });


      /*
       * Keep final state visible briefly.
       */
      await page.waitForTimeout(
        this.options.headless
          ? 100
          : 2_000
      );


      return {
        finalUrl,
        turns:
          completedTurns,
        budget,
        packet
      };
    }
    finally {

      await context.close();
      await browser.close();
    }
  }
}


