import {
  chromium
} from "playwright";

import {
  captureSiteReconnaissance
} from "../../../src/v04/recon/siteReconnaissance.js";


const browser =
  await chromium.launch({
    headless:
      true
  });

try {

  const context =
    await browser.newContext({
      viewport: {
        width:
          1000,
        height:
          700
      }
    });

  const page =
    await context.newPage();

  await page.route(
    "https://tsx-recon.example.test/**",
    async route => {

      await route.fulfill({
        status:
          200,

        contentType:
          "text/html",

        body:
          [
            "<!doctype html>",
            "<html>",
            "<body>",
            "<nav>",
            '<a href="/camera">Camera</a>',
            '<a href="/lens">Lens</a>',
            "</nav>",
            "</body>",
            "</html>"
          ].join("")
      });
    }
  );

  const packet =
    await captureSiteReconnaissance(
      page,
      "https://tsx-recon.example.test/",
      {
        revealSettleMs:
          0,

        maxInteractiveCandidates:
          0,

        maxRevealShots:
          0
      }
    );

  if (
    packet.candidates.length !==
      2
  ) {

    throw new Error(
      "Expected two visible navigation candidates."
    );
  }

  console.log(
    "TSX_RECON_OK"
  );

  await context.close();
}
finally {

  await browser.close();
}