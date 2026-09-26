import {
  createServer,
  type Server
} from "node:http";

import {
  chromium,
  type Browser
} from "playwright";

import {
  afterEach,
  describe,
  expect,
  test
} from "vitest";

import {
  captureVisualSnapshot
} from "../../../src/v04/vision/visualStateFingerprint.js";


async function listen(
  server:
    Server
): Promise<number> {
  await new Promise<void>(
    (resolve, reject) => {
      server.once(
        "error",
        reject
      );

      server.listen(
        0,
        "127.0.0.1",
        () => resolve()
      );
    }
  );

  const address =
    server.address();

  if (
    address ===
      null ||
    typeof address ===
      "string"
  ) {
    throw new Error(
      "Cannot resolve local test server port."
    );
  }

  return address.port;
}


describe(
  "V04 real Playwright screenshot reliability",
  () => {
    let browser:
      Browser |
      null =
      null;

    let server:
      Server |
      null =
      null;


    afterEach(
      async () => {
        if (
          browser !==
            null
        ) {
          await browser.close();
          browser =
            null;
        }

        if (
          server !==
            null
        ) {
          server.closeAllConnections?.();

          await new Promise<void>(
            resolve => {
              server?.close(
                () => resolve()
              );
            }
          );

          server =
            null;
        }
      }
    );


    test(
      "captures a rendered frame even when a webfont never finishes loading",
      async () => {
        server =
          createServer(
            (request, response) => {
              if (
                request.url ===
                  "/never.woff2"
              ) {
                response.writeHead(
                  200,
                  {
                    "content-type":
                      "font/woff2",
                    "cache-control":
                      "no-store"
                  }
                );

                response.write(
                  Buffer.from([
                    0
                  ])
                );

                return;
              }

              response.writeHead(
                200,
                {
                  "content-type":
                    "text/html; charset=utf-8",
                  "cache-control":
                    "no-store"
                }
              );

              response.end(
                [
                  "<!doctype html>",
                  "<html><head>",
                  "<style>",
                  "@font-face{font-family:NeverReady;src:url('/never.woff2') format('woff2');font-display:block;}",
                  "body{font-family:NeverReady,sans-serif;font-size:32px}",
                  "</style>",
                  "</head><body>",
                  "<div>Canon EOS R50 15.790.000d</div>",
                  "</body></html>"
                ].join("")
              );
            }
          );

        const port =
          await listen(
            server
          );

        browser =
          await chromium.launch({
            headless:
              true
          });

        const page =
          await browser.newPage({
            viewport: {
              width:
                1280,
              height:
                720
            }
          });

        page.setDefaultTimeout(
          1_200
        );

        await page.goto(
          `http://127.0.0.1:${port}/`,
          {
            waitUntil:
              "domcontentloaded",
            timeout:
              5_000
          }
        );

        const started =
          Date.now();

        const snapshot =
          await captureVisualSnapshot(
            page
          );

        const elapsed =
          Date.now() -
          started;

        expect(
          snapshot.bytes.length
        ).toBeGreaterThan(
          100
        );

        expect(
          elapsed
        ).toBeLessThan(
          8_000
        );
      },
      12_000
    );
  }
);
