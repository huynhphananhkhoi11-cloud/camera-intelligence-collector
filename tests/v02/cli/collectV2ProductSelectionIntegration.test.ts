import {
  describe,
  expect,
  test
} from "vitest";

import {
  readFileSync
} from "node:fs";

import {
  resolve
} from "node:path";


const source =
  readFileSync(
    resolve(
      process.cwd(),
      "src",
      "v02",
      "cli",
      "collectV2.ts"
    ),
    "utf8"
  );


describe(
  "collectV2 product candidate selection integration",
  () => {

    test(
      "does not truncate product candidates inside individual catalog pages",
      () => {

        expect(
          source
        ).not.toMatch(
          /productUrls\.size\s*>=\s*options\.maxProducts/
        );
      }
    );


    test(
      "selects globally ranked discovery candidates after catalog traversal",
      () => {

        expect(
          source
        ).toContain(
          "discovery.candidates"
        );

        expect(
          source
        ).toContain(
          "selectProductCandidates("
        );
      }
    );


    test(
      "persists discovery score and reasons instead of discarding ranking evidence",
      () => {

        expect(
          source
        ).toMatch(
          /discoveryScore:\s*candidate\.score/
        );

        expect(
          source
        ).toMatch(
          /reasons:\s*candidate\.reasons/
        );
      }
    );

    test(
      "passes a proven direct start product into candidate selection as a pinned seed",
      () => {

        expect(
          source
        ).toMatch(
          /pinnedUrl:\s*requestedSeedUrl/
        );

        expect(
          source
        ).toContain(
          "DIRECT_START_PRODUCT"
        );
      }
    );


    test(
      "settles dynamic product hydration before start-page discovery",
      () => {

        expect(
          source
        ).toContain(
          "waitForProductHydration"
        );

        expect(
          source
        ).toMatch(
          /await\s+waitForProductHydration\(\s*page/
        );
      }
    );

  }
);