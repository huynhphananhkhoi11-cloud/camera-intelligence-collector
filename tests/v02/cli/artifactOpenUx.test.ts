import {
  describe,
  expect,
  test
} from "vitest";

import {
  openCompletedArtifactBestEffort
} from "../../../src/v02/cli/artifactOpenUx.ts";


describe(
  "Phase 11G.2 completed artifact auto-open UX",
  () => {

    test(
      "disabled mode performs no artifact action",
      async () => {

        let calls =
          0;


        const result =
          await openCompletedArtifactBestEffort({
            enabled:
              false,

            artifactPath:
              "C:\\Downloads\\camera.xlsx",

            openArtifact:
              async () => {

                calls +=
                  1;
              }
          });


        expect(
          result
        ).toBe(
          "DISABLED"
        );


        expect(
          calls
        ).toBe(
          0
        );
      }
    );


    test(
      "missing completed artifact performs no open",
      async () => {

        let calls =
          0;


        const result =
          await openCompletedArtifactBestEffort({
            enabled:
              true,

            artifactPath:
              null,

            openArtifact:
              async () => {

                calls +=
                  1;
              }
          });


        expect(
          result
        ).toBe(
          "NO_ARTIFACT"
        );


        expect(
          calls
        ).toBe(
          0
        );
      }
    );


    test(
      "blank completed artifact path is treated as unavailable",
      async () => {

        let calls =
          0;


        const result =
          await openCompletedArtifactBestEffort({
            enabled:
              true,

            artifactPath:
              "   ",

            openArtifact:
              async () => {

                calls +=
                  1;
              }
          });


        expect(
          result
        ).toBe(
          "NO_ARTIFACT"
        );


        expect(
          calls
        ).toBe(
          0
        );
      }
    );


    test(
      "successful open is attempted exactly once",
      async () => {

        const paths:
          string[] = [];

        const info:
          string[] = [];

        const warnings:
          string[] = [];


        const result =
          await openCompletedArtifactBestEffort({
            enabled:
              true,

            artifactPath:
              "C:\\Users\\Ada\\Downloads\\camera.xlsx",

            openArtifact:
              async path => {

                paths.push(
                  path
                );
              },

            writeInfo:
              message => {

                info.push(
                  message
                );
              },

            writeWarning:
              message => {

                warnings.push(
                  message
                );
              }
          });


        expect(
          result
        ).toBe(
          "OPENED"
        );


        expect(
          paths
        ).toEqual([
          "C:\\Users\\Ada\\Downloads\\camera.xlsx"
        ]);


        expect(
          info
        ).toEqual([
          "Opening Excel..."
        ]);


        expect(
          warnings
        ).toEqual([]);
      }
    );


    test(
      "open failure is swallowed and reports saved path",
      async () => {

        const warnings:
          string[] = [];


        const result =
          await openCompletedArtifactBestEffort({
            enabled:
              true,

            artifactPath:
              "C:\\Users\\Ada\\Downloads\\camera result.xlsx",

            openArtifact:
              async () => {

                throw new Error(
                  "association unavailable"
                );
              },

            writeWarning:
              message => {

                warnings.push(
                  message
                );
              }
          });


        expect(
          result
        ).toBe(
          "OPEN_FAILED"
        );


        expect(
          warnings
        ).toHaveLength(
          1
        );


        expect(
          warnings[0]
        ).toContain(
          "Could not open Excel automatically."
        );


        expect(
          warnings[0]
        ).toContain(
          "C:\\Users\\Ada\\Downloads\\camera result.xlsx"
        );


        expect(
          warnings[0]
        ).toContain(
          "association unavailable"
        );
      }
    );


    test(
      "synchronous opener failure is also non-fatal",
      async () => {

        const result =
          await openCompletedArtifactBestEffort({
            enabled:
              true,

            artifactPath:
              "C:\\Downloads\\camera.xlsx",

            openArtifact:
              () => {

                throw new Error(
                  "sync failure"
                );
              }
          });


        expect(
          result
        ).toBe(
          "OPEN_FAILED"
        );
      }
    );


    test(
      "failing informational writer cannot block artifact opening",
      async () => {

        let opened =
          false;


        const result =
          await openCompletedArtifactBestEffort({
            enabled:
              true,

            artifactPath:
              "C:\\Downloads\\camera.xlsx",

            openArtifact:
              async () => {

                opened =
                  true;
              },

            writeInfo:
              () => {

                throw new Error(
                  "console unavailable"
                );
              }
          });


        expect(
          opened
        ).toBe(
          true
        );


        expect(
          result
        ).toBe(
          "OPENED"
        );
      }
    );


    test(
      "failing warning writer cannot turn open failure into rejection",
      async () => {

        await expect(
          openCompletedArtifactBestEffort({
            enabled:
              true,

            artifactPath:
              "C:\\Downloads\\camera.xlsx",

            openArtifact:
              async () => {

                throw new Error(
                  "open failed"
                );
              },

            writeWarning:
              () => {

                throw new Error(
                  "warning sink failed"
                );
              }
          })
        ).resolves.toBe(
          "OPEN_FAILED"
        );
      }
    );
  }
);