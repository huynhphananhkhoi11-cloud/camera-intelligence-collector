import {
  existsSync,
  readFileSync
} from "node:fs";

import {
  resolve
} from "node:path";

import {
  pathToFileURL
} from "node:url";

import {
  describe,
  expect,
  test
} from "vitest";


const repo =
  process.cwd();


const modulePath =
  resolve(
    repo,
    "src/v02/cli/interactiveUrl.ts"
  );


async function loadModule() {

  const href =
    pathToFileURL(
      modulePath
    ).href;

  return import(
    /* @vite-ignore */
    href
  );
}


describe(
  "Phase 11B interactive collect URL",
  () => {

    test(
      "production command accepts optional URL and resolves it before collector execution",
      () => {

        const source =
          readFileSync(
            resolve(
              repo,
              "src/v02/cli/camintel.ts"
            ),
            "utf8"
          );

        expect(
          source
        ).toContain(
          '.argument("[url]")'
        );

        expect(
          source
        ).toContain(
          "resolveCollectUrl"
        );


        const resolveIndex =
          source.indexOf(
            "await resolveCollectUrl("
          );

        const runIndex =
          source.lastIndexOf(
            "await runCollectV2("
          );

        expect(
          resolveIndex
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          runIndex
        ).toBeGreaterThan(
          resolveIndex
        );
      }
    );


    test(
      "interactive URL resolver module exists",
      () => {

        expect(
          existsSync(
            modulePath
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "direct valid URL does not prompt",
      async () => {

        if (
          !existsSync(
            modulePath
          )
        ) {
          return;
        }

        const {
          resolveCollectUrl
        } =
          await loadModule();


        let prompts =
          0;


        const result =
          await resolveCollectUrl(
            "  https://example.com/catalog  ",
            {
              isInteractive:
                false,

              question:
                async () => {
                  prompts +=
                    1;

                  return "https://should-not-be-used.example";
                }
            }
          );


        expect(
          result
        ).toBe(
          "https://example.com/catalog"
        );

        expect(
          prompts
        ).toBe(
          0
        );
      }
    );


    test(
      "missing URL in interactive mode prompts exactly once",
      async () => {

        if (
          !existsSync(
            modulePath
          )
        ) {
          return;
        }

        const {
          resolveCollectUrl
        } =
          await loadModule();


        const prompts:
          string[] = [];


        const result =
          await resolveCollectUrl(
            undefined,
            {
              isInteractive:
                true,

              question:
                async prompt => {
                  prompts.push(
                    prompt
                  );

                  return "https://example.com/cameras";
                }
            }
          );


        expect(
          prompts
        ).toEqual([
          "Website URL > "
        ]);

        expect(
          result
        ).toBe(
          "https://example.com/cameras"
        );
      }
    );


    test(
      "missing URL in non-interactive mode fails clearly",
      async () => {

        if (
          !existsSync(
            modulePath
          )
        ) {
          return;
        }

        const {
          resolveCollectUrl
        } =
          await loadModule();


        await expect(
          resolveCollectUrl(
            undefined,
            {
              isInteractive:
                false,

              question:
                async () =>
                  "https://should-not-run.example"
            }
          )
        ).rejects.toThrow(
          /Website URL is required in non-interactive mode/
        );
      }
    );


    test.each([
      "example.com",
      "ftp://example.com",
      "file:///C:/temp/test.html",
      "javascript:alert(1)"
    ])(
      "rejects invalid/non-http URL %s",
      async badUrl => {

        if (
          !existsSync(
            modulePath
          )
        ) {
          return;
        }

        const {
          resolveCollectUrl
        } =
          await loadModule();


        await expect(
          resolveCollectUrl(
            badUrl,
            {
              isInteractive:
                false,

              question:
                async () =>
                  ""
            }
          )
        ).rejects.toThrow(
          /http:\/\/ or https:\/\//
        );
      }
    );
  }
);