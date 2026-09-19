import {
  describe,
  expect,
  test
} from "vitest";

import type {
  Browser,
  Request
} from "playwright";

import {
  PlaywrightNetworkReconRuntime
} from "../../../src/v03/acquisition/playwrightNetworkReconRuntime.js";


describe(
  "V3 PlaywrightNetworkReconRuntime",
  () => {

    test(
      "captures same-origin XHR and closes context before browser",
      async () => {

        const closeOrder:
          string[] =
            [];


        const handlers:
          Record<
            string,
            (
              request:
                Request
            ) =>
              void
          > = {};


        const response = {
          status:
            () =>
              200,

          headers:
            () => ({
              "content-type":
                "text/html; charset=utf-8"
            }),

          body:
            async () =>
              Buffer.from(
                "<div class=\"product\">Canon EOS R50</div>",
                "utf8"
              )
        };


        const request = {
          url:
            () =>
              "https://example.com/api/paging.php?page=1&token=secret",

          method:
            () =>
              "POST",

          resourceType:
            () =>
              "xhr",

          headers:
            () => ({
              "content-type":
                "application/x-www-form-urlencoded"
            }),

          postData:
            () =>
              "page=1&id=6&csrf=secret",

          response:
            async () =>
              response,

          failure:
            () =>
              null
        } as unknown as
          Request;


        let connected =
          true;


        const context = {
          on(
            event:
              string,
            handler:
              (
                request:
                  Request
              ) =>
                void
          ) {
            handlers[event] =
              handler;
          },

          async newPage() {
            return {
              async goto() {
                return null;
              },

              async waitForTimeout() {
                handlers.requestfinished?.(
                  request
                );
              },

              url() {
                return "https://example.com/";
              }
            };
          },

          async close() {
            closeOrder.push(
              "context"
            );
          }
        };


        const browser = {
          async newContext() {
            return context;
          },

          isConnected() {
            return connected;
          },

          async close() {
            closeOrder.push(
              "browser"
            );

            connected =
              false;
          }
        } as unknown as
          Browser;


        const runtime =
          new PlaywrightNetworkReconRuntime({
            observationWindowMs:
              1,

            launchBrowser:
              async () =>
                browser
          });


        const snapshot =
          await runtime.observe(
            "https://example.com/"
          );


        expect(
          snapshot.exchanges
        ).toHaveLength(
          1
        );


        expect(
          snapshot.exchanges[0]
        ).toMatchObject({
          method:
            "POST",

          resourceType:
            "xhr",

          status:
            200,

          requestBodyRedacted:
            "page=1&id=6&csrf=%5BREDACTED%5D",

          responseContentType:
            "text/html",

          failed:
            false
        });


        expect(
          snapshot.exchanges[0]
            ?.url
        ).toContain(
          "token=%5BREDACTED%5D"
        );


        expect(
          snapshot.exchanges[0]
            ?.responseBodyPreview
        ).toContain(
          "Canon EOS R50"
        );


        expect(
          closeOrder
        ).toEqual([
          "context",
          "browser"
        ]);
      }
    );


    test(
      "probe validates launch capability and closes the probe browser",
      async () => {

        let closed =
          0;


        const browser = {
          isConnected() {
            return true;
          },

          async close() {
            closed +=
              1;
          }
        } as unknown as
          Browser;


        const runtime =
          new PlaywrightNetworkReconRuntime({
            launchBrowser:
              async () =>
                browser
          });


        const health =
          await runtime.probe();


        expect(
          health.available
        ).toBe(true);


        expect(
          closed
        ).toBe(
          1
        );
      }
    );
  }
);
