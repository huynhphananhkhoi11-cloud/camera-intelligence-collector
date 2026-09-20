import {
  describe,
  expect,
  test
} from "vitest";

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";

import {
  join
} from "node:path";


const ROOT =
  process.cwd();


function readUtf8(
  relativePath: string
): string {

  return readFileSync(
    join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}


function collectTsText(
  relativeDir: string
): string {

  const absoluteDir =
    join(
      ROOT,
      relativeDir
    );

  if (
    !existsSync(
      absoluteDir
    )
  ) {
    return "";
  }


  const chunks: string[] =
    [];


  const visit =
    (
      absolutePath: string
    ): void => {

      for (
        const entry
        of readdirSync(
          absolutePath
        )
      ) {
        const child =
          join(
            absolutePath,
            entry
          );

        const stat =
          statSync(
            child
          );


        if (
          stat.isDirectory()
        ) {
          visit(
            child
          );

          continue;
        }


        if (
          stat.isFile()
          &&
          entry.endsWith(
            ".ts"
          )
        ) {
          chunks.push(
            readFileSync(
              child,
              "utf8"
            )
          );
        }
      }
    };


  visit(
    absoluteDir
  );


  return chunks.join(
    "\n"
  );
}


describe(
  "V3 Vision-First cross-integration acceptance",
  () => {

    test(
      "all release-plan integration modules exist",
      () => {

        const requiredPaths =
          [
            "src/v03/contracts/camera13.ts",
            "src/v03/pipeline/visualProductPipeline.ts",
            "src/v03/cli/smartBatchV2.ts",
            "src/v03/vision/adaptiveCapture.ts",
            "src/v03/vision/capturePlan.ts",
            "src/v03/ai/gemini36VisualExtractor.ts",
            "src/v03/ai/visualExtractionSchema.ts",
            "src/v03/validation/visualExtractionValidator.ts",
            "src/v03/export/camera13Workbook.ts"
          ];


        const missing =
          requiredPaths.filter(
            (
              relativePath
            ) =>
              !existsSync(
                join(
                  ROOT,
                  relativePath
                )
              )
          );


        expect(
          missing,
          `Missing Vision-First modules: ${missing.join(", ")}`
        ).toEqual(
          []
        );
      }
    );


    test(
      "package scripts preserve rollback path and expose V2 release commands",
      () => {

        const packageJson =
          JSON.parse(
            readUtf8(
              "package.json"
            )
          ) as {
            scripts?: Record<
              string,
              string
            >;
          };


        expect(
          packageJson.scripts?.[
            "smart-batch"
          ]
        ).toBeTruthy();


        expect(
          packageJson.scripts?.[
            "smart-batch:v2"
          ]
        ).toBeTruthy();


        expect(
          packageJson.scripts?.[
            "provider-setup"
          ]
        ).toBeTruthy();
      }
    );


    test(
      "Camera Data contract exposes exactly the 13 user columns in order",
      () => {

        const contractPath =
          join(
            ROOT,
            "src/v03/contracts/camera13.ts"
          );


        expect(
          existsSync(
            contractPath
          )
        ).toBe(
          true
        );


        if (
          !existsSync(
            contractPath
          )
        ) {
          return;
        }


        const source =
          readFileSync(
            contractPath,
            "utf8"
          );


        const expectedHeaders =
          [
            "Website",
            "Tên sản phẩm",
            "Hàng cũ/Hàng mới",
            "Thông số mô tả",
            "Giá thuê/ngày",
            "Điều kiện thuê",
            "Phụ kiện đi kèm",
            "Combo/gói đi kèm",
            "Điểm đánh giá",
            "Số lượt đánh giá/review",
            "Tồn kho",
            "Giá bán",
            "URL"
          ];


        let previousIndex =
          -1;


        for (
          const header
          of expectedHeaders
        ) {
          const index =
            source.indexOf(
              header
            );


          expect(
            index,
            `Missing Camera Data header: ${header}`
          ).toBeGreaterThan(
            -1
          );


          expect(
            index,
            `Camera Data header out of order: ${header}`
          ).toBeGreaterThan(
            previousIndex
          );


          previousIndex =
            index;
        }
      }
    );


    test(
      "run state implements the durable lifecycle required for idempotent resume",
      () => {

        const stateSource =
          collectTsText(
            "src/v03/state"
          );


        const requiredStates =
          [
            "PENDING",
            "CAPTURED",
            "AI_IN_FLIGHT",
            "EXTRACTED",
            "VALIDATED",
            "REVIEW",
            "COMMITTED"
          ];


        for (
          const status
          of requiredStates
        ) {
          expect(
            stateSource,
            `Missing RunState lifecycle status: ${status}`
          ).toContain(
            status
          );
        }
      }
    );


    test(
      "provider layer distinguishes transient rate limits from daily quota exhaustion",
      () => {

        const providerSource =
          collectTsText(
            "src/v03/provider"
          );


        expect(
          providerSource
        ).toContain(
          "rate_limit_exceeded"
        );


        expect(
          providerSource
        ).toContain(
          "quota_exceeded"
        );


        expect(
          providerSource.toLowerCase()
        ).toMatch(
          /retry-after|backoff/
        );


        expect(
          providerSource.toLowerCase()
        ).toMatch(
          /cooldown|pause|reset/
        );
      }
    );


    test(
      "new production path does not reintroduce a fixed 13-second inter-URL sleep",
      () => {

        const smartBatchV2Path =
          join(
            ROOT,
            "src/v03/cli/smartBatchV2.ts"
          );


        expect(
          existsSync(
            smartBatchV2Path
          )
        ).toBe(
          true
        );


        if (
          !existsSync(
            smartBatchV2Path
          )
        ) {
          return;
        }


        const source =
          readFileSync(
            smartBatchV2Path,
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /13_?000/
        );
      }
    );


    test(
      "gitignore protects run state and local Vision-First spool data",
      () => {

        const gitignore =
          readUtf8(
            ".gitignore"
          );


        expect(
          gitignore
        ).toContain(
          ".camintel/"
        );


        expect(
          gitignore
        ).toMatch(
          /\*\.run-state\.json|\.run-state\.json/
        );
      }
    );

  }
);
