import {
  describe,
  expect,
  test
} from "vitest";

import {
  DetailIdentityAcquirer
} from "../../../src/v03/identity/detailIdentityAcquirer.js";

import type {
  StaticFetch
} from "../../../src/v03/acquisition/staticHttpBackend.js";


function fakeFetch(
  html:
    string
): StaticFetch {

  return async (
    input:
      string
  ) => ({
    status:
      200,

    ok:
      true,

    url:
      input,

    headers: {
      get(
        name:
          string
      ) {
        return name.toLowerCase() ===
          "content-type"
          ? "text/html; charset=utf-8"
          : null;
      }
    },

    async text() {
      return html;
    }
  });
}


describe(
  "V3 detail identity acquisition",
  () => {

    test(
      "acquires HTML and turns demonstrated canonical evidence into identity tokens",
      async () => {

        const acquirer =
          new DetailIdentityAcquirer({
            staticHttp: {
              fetchFn:
                fakeFetch(
                  `
                    <html>
                      <head>
                        <link
                          rel="canonical"
                          href="/canon-r50"
                        >
                      </head>
                      <body>
                        <h1>Canon EOS R50</h1>
                      </body>
                    </html>
                  `
                )
            }
          });


        const record =
          await acquirer.acquire(
            "https://example.com/canon-r50?p=2"
          );


        expect(
          record.signals.canonicalUrl
        ).toBe(
          "https://example.com/canon-r50"
        );


        expect(
          record.tokens.map(
            token =>
              token.token
          )
        ).toEqual([
          "URL:https://example.com/canon-r50",
          "URL:https://example.com/canon-r50?p=2"
        ]);
      }
    );
  }
);
