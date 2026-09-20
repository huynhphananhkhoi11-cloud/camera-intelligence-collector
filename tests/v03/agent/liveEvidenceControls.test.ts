import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";

import {
  chromium,
  type Browser,
  type Page
} from "playwright";

import {
  captureFinalEvidencePacket
} from "../../../src/v03/agent/browserAgentSession.js";


describe(
  "C4 final live selected controls",
  () => {

    let browser:
      Browser;

    let page:
      Page;


    beforeAll(
      async () => {

        browser =
          await chromium.launch({
            headless:
              true
          });


        const context =
          await browser.newContext();


        page =
          await context.newPage();


        await page.route(
          "https://example.test/camera",
          async route => {

            await route.fulfill({
              status:
                200,

              contentType:
                "text/html",

              body:
                [
                  "<!doctype html>",
                  "<html><body>",
                  '<div id="__camintel_agent_overlay">agent overlay</div>',
                  "<h1>Example Camera</h1>",
                  "<label>Color",
                  '<select id="color">',
                  '<option value="silver">Silver</option>',
                  '<option value="black" selected>Black</option>',
                  "</select>",
                  "</label>",
                  "<label>",
                  '<input type="radio" name="kit" value="Body Only" checked>',
                  "Body Only",
                  "</label>",
                  '<button role="option" aria-selected="true" aria-label="Condition">Like New</button>',
                  "</body></html>"
                ].join(
                  ""
                )
            });
          }
        );


        await page.goto(
          "https://example.test/camera"
        );


        /*
         * Keep parity with BrowserAgentSession's tsx/esbuild compatibility
         * shim so serialized callbacks cannot fail on __name.
         */
        await page.evaluate(
          "globalThis.__name = globalThis.__name || ((target, _value) => target)"
        );
      }
    );


    afterAll(
      async () => {

        await browser.close();
      }
    );


    it(
      "captures selected/default controls from final runtime DOM without mutating them",
      async () => {

        const before = {
          color:
            await page
              .locator(
                "#color"
              )
              .inputValue(),

          kitChecked:
            await page
              .locator(
                'input[name="kit"]'
              )
              .isChecked()
        };


        const packet =
          await captureFinalEvidencePacket(
            page,
            "https://example.test/camera"
          );


        const values =
          packet.selectedControls.map(
            item =>
              item.rawValue
          );


        expect(
          values.some(
            value =>
              value.includes(
                "Black"
              )
          )
        ).toBe(
          true
        );


        expect(
          values.some(
            value =>
              value.includes(
                "Body Only"
              )
          )
        ).toBe(
          true
        );


        expect(
          values.some(
            value =>
              value.includes(
                "Like New"
              )
          )
        ).toBe(
          true
        );


        expect(
          packet.selectedControls.every(
            item =>
              item.context ===
                "selected=true"
          )
        ).toBe(
          true
        );


        expect(
          packet.primaryRegionText
        ).not.toContain(
          "agent overlay"
        );


        expect(
          await page
            .locator(
              "#color"
            )
            .inputValue()
        ).toBe(
          before.color
        );


        expect(
          await page
            .locator(
              'input[name="kit"]'
            )
            .isChecked()
        ).toBe(
          before.kitChecked
        );
      }
    );
  }
);
