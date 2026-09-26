import {
  describe,
  expect,
  test
} from "vitest";

import {
  DOWNLOADS_KNOWN_FOLDER_ID,
  parseWindowsDownloadsRegistryOutput,
  resolveDownloadsDirectory,
  resolveRunOutputPath
} from "../../../src/v02/platform/downloadsOutputResolver.ts";


describe(
  "Phase 11F.2 Windows Downloads resolver",
  () => {

    test(
      "parses and expands the Downloads known-folder registry value",
      () => {

        const output = [
          "",
          "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders",
          `    ${DOWNLOADS_KNOWN_FOLDER_ID}    REG_EXPAND_SZ    %USERPROFILE%\\Downloads`,
          ""
        ].join(
          "\r\n"
        );


        expect(
          parseWindowsDownloadsRegistryOutput(
            output,
            {
              USERPROFILE:
                "D:\\Profiles\\Ada"
            }
          )
        ).toBe(
          "D:\\Profiles\\Ada\\Downloads"
        );
      }
    );


    test(
      "supports redirected absolute REG_SZ Downloads",
      () => {

        const output =
          `    ${DOWNLOADS_KNOWN_FOLDER_ID}    REG_SZ    E:\\Redirected\\Camera Downloads`;


        expect(
          parseWindowsDownloadsRegistryOutput(
            output,
            {}
          )
        ).toBe(
          "E:\\Redirected\\Camera Downloads"
        );
      }
    );


    test(
      "environment expansion is case-insensitive like Windows",
      () => {

        const output =
          `    ${DOWNLOADS_KNOWN_FOLDER_ID}    REG_EXPAND_SZ    %UserProfile%\\Downloads`;


        expect(
          parseWindowsDownloadsRegistryOutput(
            output,
            {
              userprofile:
                "C:\\Users\\CaseTest"
            }
          )
        ).toBe(
          "C:\\Users\\CaseTest\\Downloads"
        );
      }
    );


    test(
      "malformed or unresolved registry values are rejected",
      () => {

        expect(
          parseWindowsDownloadsRegistryOutput(
            "unrelated output",
            {}
          )
        ).toBeNull();


        expect(
          parseWindowsDownloadsRegistryOutput(
            `    ${DOWNLOADS_KNOWN_FOLDER_ID}    REG_EXPAND_SZ    %MISSING_VAR%\\Downloads`,
            {}
          )
        ).toBeNull();
      }
    );


    test(
      "Windows prefers the known-folder registry value",
      () => {

        let queryCount =
          0;


        const resolution =
          resolveDownloadsDirectory({
            platform:
              "win32",

            environment: {
              USERPROFILE:
                "C:\\Users\\Fallback"
            },

            homeDirectory:
              "C:\\Users\\Home",

            registryQuery:
              () => {

                queryCount +=
                  1;


                return (
                  `    ${DOWNLOADS_KNOWN_FOLDER_ID}` +
                  "    REG_SZ    D:\\Redirected\\Downloads"
                );
              }
          });


        expect(
          queryCount
        ).toBe(
          1
        );


        expect(
          resolution
        ).toEqual({
          path:
            "D:\\Redirected\\Downloads",

          source:
            "KNOWN_FOLDER_REGISTRY"
        });
      }
    );


    test(
      "registry failure falls back to USERPROFILE Downloads",
      () => {

        const resolution =
          resolveDownloadsDirectory({
            platform:
              "win32",

            environment: {
              USERPROFILE:
                "C:\\Users\\Fallback"
            },

            homeDirectory:
              "C:\\Users\\Home",

            registryQuery:
              () => {
                throw new Error(
                  "registry unavailable"
                );
              }
          });


        expect(
          resolution
        ).toEqual({
          path:
            "C:\\Users\\Fallback\\Downloads",

          source:
            "USERPROFILE_FALLBACK"
        });
      }
    );


    test(
      "missing USERPROFILE falls back to home directory",
      () => {

        const resolution =
          resolveDownloadsDirectory({
            platform:
              "win32",

            environment:
              {},

            homeDirectory:
              "C:\\Portable\\Home",

            registryQuery:
              () => {
                throw new Error(
                  "registry unavailable"
                );
              }
          });


        expect(
          resolution
        ).toEqual({
          path:
            "C:\\Portable\\Home\\Downloads",

          source:
            "HOME_FALLBACK"
        });
      }
    );


    test(
      "non-Windows fallback never queries Windows registry",
      () => {

        let queried =
          false;


        const resolution =
          resolveDownloadsDirectory({
            platform:
              "linux",

            environment:
              {},

            homeDirectory:
              "/home/test",

            registryQuery:
              () => {

                queried =
                  true;

                throw new Error(
                  "must not execute"
                );
              }
          });


        expect(
          queried
        ).toBe(
          false
        );


        expect(
          resolution
        ).toEqual({
          path:
            "/home/test/Downloads",

          source:
            "HOME_FALLBACK"
        });
      }
    );
  }
);


describe(
  "Phase 11F.2 run output destination",
  () => {

    test(
      "--output short-circuits Downloads lookup completely",
      () => {

        let downloadsCalls =
          0;


        const result =
          resolveRunOutputPath({
            explicitOutput:
              "reports\\chosen.xlsx",

            inputUrl:
              "invalid because explicit output wins",

            runId:
              "run-explicit",

            startedAt:
              "invalid because explicit output wins",

            platform:
              "win32",

            cwd:
              "C:\\Work",

            downloadsDirectoryResolver:
              () => {

                downloadsCalls +=
                  1;

                throw new Error(
                  "Downloads lookup must not occur"
                );
              }
          });


        expect(
          downloadsCalls
        ).toBe(
          0
        );


        expect(
          result
        ).toBe(
          "C:\\Work\\reports\\chosen.xlsx"
        );
      }
    );


    test(
      "automatic output resolves Downloads exactly once",
      () => {

        let downloadsCalls =
          0;


        const result =
          resolveRunOutputPath({
            inputUrl:
              "https://www.example.com/catalog",

            runId:
              "persistent-run-123",

            startedAt:
              "2026-09-18T03:05:22.999Z",

            platform:
              "win32",

            cwd:
              "C:\\Work",

            downloadsDirectoryResolver:
              () => {

                downloadsCalls +=
                  1;

                return "D:\\Redirected\\Downloads";
              }
          });


        expect(
          downloadsCalls
        ).toBe(
          1
        );


        expect(
          result
        ).toMatch(
          /^D:\\Redirected\\Downloads\\CameraIntelligence_example\.com_20260918_030522_[0-9a-f]{8}\.xlsx$/
        );
      }
    );


    test(
      "persistent run identity produces stable resume output",
      () => {

        const input = {
          inputUrl:
            "https://shop.example.com/cameras",

          runId:
            "same-persistent-run",

          startedAt:
            "2026-09-18T08:09:10.555Z",

          platform:
            "win32" as const,

          cwd:
            "C:\\Work",

          downloadsDirectoryResolver:
            () =>
              "D:\\Downloads"
        };


        expect(
          resolveRunOutputPath(
            input
          )
        ).toBe(
          resolveRunOutputPath(
            input
          )
        );
      }
    );
  }
);