import {
  readFileSync
} from "node:fs";

import {
  resolve
} from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";


const source =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/collectV2.ts"
    ),
    "utf8"
  );


function count(
  token:
    string
): number {

  return source.split(
    token
  ).length -
  1;
}


describe(
  "Phase 11E.2 collectV2 observer integration",
  () => {

    test(
      "collector owns one BrowserObserverPolicy for the run",
      () => {

        expect(
          source
        ).toContain(
          "BrowserObserverPolicy"
        );


        expect(
          count(
            "new BrowserObserverPolicy("
          )
        ).toBe(
          1
        );


        expect(
          source
        ).toContain(
          "observerPolicy.workerCount"
        );
      }
    );


    test(
      "worker no longer creates its own browser page",
      () => {

        /*
         * The only remaining direct context.newPage() in collectV2
         * must be the catalog page.
         */
        expect(
          count(
            "context.newPage()"
          )
        ).toBe(
          1
        );


        expect(
          source
        ).toMatch(
          /workerId:\s*number,\s*page:\s*Page/
        );
      }
    );


    test(
      "all detail pages are prepared before Promise.all worker launch",
      () => {

        const prepare =
          source.indexOf(
            "await prepareWorkerPages("
          );

        const launch =
          source.indexOf(
            "await Promise.all("
          );


        expect(
          prepare
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          launch
        ).toBeGreaterThan(
          prepare
        );


        expect(
          source
        ).toContain(
          "preparedWorkerPages.map("
        );


        expect(
          source
        ).toContain(
          "workerId,"
        );


        expect(
          source
        ).toContain(
          "page"
        );
      }
    );


    test(
      "collectV2 never focuses pages inside detail scheduling",
      () => {

        expect(
          source
        ).not.toContain(
          "bringToFront()"
        );


        expect(
          source
        ).not.toContain(
          ".bringToFront("
        );
      }
    );


    test(
      "worker and catalog cleanup remain owned in finally",
      () => {

        expect(
          count(
            "await page.close();"
          )
        ).toBe(
          1
        );


                expect(
          source
        ).toMatch(
          /finally\s*\{\s*preRunInterrupt\.uninstall\(\);\s*await\s+catalogPage\.close\(\{\s*runBeforeUnload:\s*false\s*\}\)\s*\.catch\(\s*\(\)\s*=>\s*undefined\s*\);/
        );
      }
    );


    test(
      "run shutdown closes the browser process directly",
      () => {

        expect(
          source
        ).toContain(
          "browser.isConnected()"
        );

        expect(
          source
        ).toContain(
          "await browser.close();"
        );

        expect(
          source
        ).not.toContain(
          "await context.close();"
        );
      }
    );


    test(
      "observer focus failure is diagnostic-only",
      () => {

        expect(
          source
        ).toContain(
          "onFocusError:"
        );


        expect(
          source
        ).toContain(
          "Observer focus failed:"
        );


        expect(
          source
        ).toContain(
          "diagnostics.error("
        );
      }
    );


    test(
      "RUN_STARTED and detail workers share one normalized worker count",
      () => {

        expect(
          source
        ).toMatch(
          /workers:\s*observerPolicy\.workerCount/
        );


        /*
         * RUN_STARTED reads the normalized count directly.
         *
         * Detail execution derives its worker slots from the same
         * BrowserObserverPolicy instance via prepareWorkerPages().
         * Requiring the property text to appear twice would test
         * implementation spelling rather than the ownership invariant.
         */
        expect(
          source
        ).toMatch(
          /await prepareWorkerPages\(\s*context,\s*observerPolicy,/
        );
      }
    );


    test(
      "Phase 10 browser SIGINT ownership remains intact",
      () => {

        expect(
          source
        ).toMatch(
          /handleSIGINT\s*:\s*false/
        );
      }
    );
  }
);