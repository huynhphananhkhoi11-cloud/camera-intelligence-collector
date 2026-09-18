import {
  describe,
  expect,
  test
} from "vitest";

import {
  formatOutputTimestamp,
  resolveOutputPath,
  sanitizeFilenameComponent,
  shortRunToken
} from "../../../src/v02/platform/outputPathResolver.ts";


describe(
  "Phase 11F.1 deterministic output path resolver",
  () => {

    test(
      "--output wins before URL/default naming logic",
      () => {

        const result =
          resolveOutputPath({
            explicitOutput:
              "reports\\chosen.xlsx",

            downloadsDirectory:
              "D:\\Redirected\\Downloads",

            /*
             * Deliberately invalid. Explicit output precedence means
             * default filename parsing must never inspect this URL.
             */
            inputUrl:
              "not a URL",

            runId:
              "run-explicit",

            startedAt:
              "not a timestamp",

            platform:
              "win32",

            cwd:
              "C:\\Work"
          });


        expect(
          result
        ).toBe(
          "C:\\Work\\reports\\chosen.xlsx"
        );
      }
    );


    test(
      "absolute explicit output is preserved as the selected destination",
      () => {

        const result =
          resolveOutputPath({
            explicitOutput:
              "E:\\Exports\\camera.xlsx",

            downloadsDirectory:
              "D:\\Downloads",

            inputUrl:
              "https://example.com/",

            runId:
              "run-one",

            startedAt:
              "2026-09-18T03:05:22.000Z",

            platform:
              "win32",

            cwd:
              "C:\\Work"
          });


        expect(
          result
        ).toBe(
          "E:\\Exports\\camera.xlsx"
        );
      }
    );


    test(
      "default filename follows CameraIntelligence host timestamp token contract",
      () => {

        const result =
          resolveOutputPath({
            downloadsDirectory:
              "D:\\Redirected\\Downloads",

            inputUrl:
              "https://www.example.com/catalog",

            runId:
              "2026-09-18T03-05-22-123Z",

            startedAt:
              "2026-09-18T03:05:22.123Z",

            platform:
              "win32",

            cwd:
              "C:\\Work"
          });


        expect(
          result
        ).toMatch(
          /^D:\\Redirected\\Downloads\\CameraIntelligence_example\.com_20260918_030522_[0-9a-f]{8}\.xlsx$/
        );
      }
    );


    test(
      "same persistent run resolves to the same filename across resumes",
      () => {

        const input = {
          downloadsDirectory:
            "D:\\Downloads",

          inputUrl:
            "https://shop.example.com/cameras",

          runId:
            "persistent-run-123",

          startedAt:
            "2026-09-18T09:10:11.999Z",

          platform:
            "win32" as const,

          cwd:
            "C:\\Work"
        };


        const first =
          resolveOutputPath(
            input
          );

        const resumed =
          resolveOutputPath(
            input
          );


        expect(
          resumed
        ).toBe(
          first
        );
      }
    );


    test(
      "different run IDs remain collision-resistant within the same second",
      () => {

        const common = {
          downloadsDirectory:
            "D:\\Downloads",

          inputUrl:
            "https://example.com/catalog",

          startedAt:
            "2026-09-18T03:05:22.100Z",

          platform:
            "win32" as const,

          cwd:
            "C:\\Work"
        };


        const first =
          resolveOutputPath({
            ...common,

            runId:
              "run-a"
          });


        const second =
          resolveOutputPath({
            ...common,

            runId:
              "run-b"
          });


        expect(
          first
        ).not.toBe(
          second
        );


        expect(
          first
        ).toContain(
          shortRunToken(
            "run-a"
          )
        );


        expect(
          second
        ).toContain(
          shortRunToken(
            "run-b"
          )
        );
      }
    );


    test(
      "run token is deterministic short lowercase hex",
      () => {

        const first =
          shortRunToken(
            "persistent-run-123"
          );

        const second =
          shortRunToken(
            "persistent-run-123"
          );


        expect(
          first
        ).toBe(
          second
        );


        expect(
          first
        ).toMatch(
          /^[0-9a-f]{8}$/
        );
      }
    );


    test(
      "timestamp is UTC and second-stable",
      () => {

        expect(
          formatOutputTimestamp(
            "2026-09-18T03:05:22.999Z"
          )
        ).toBe(
          "20260918_030522"
        );
      }
    );


    test(
      "invalid default timestamp is rejected rather than invented",
      () => {

        expect(
          () =>
            formatOutputTimestamp(
              "not-a-date"
            )
        ).toThrow(
          /timestamp/i
        );
      }
    );


    test(
      "filename component removes Windows-illegal characters and trailing dots",
      () => {

        expect(
          sanitizeFilenameComponent(
            "shop:name?*<>|. "
          )
        ).toBe(
          "shop_name_____"
        );
      }
    );


    test(
      "IPv6 host cannot leak Windows-illegal filename characters",
      () => {

        const result =
          resolveOutputPath({
            downloadsDirectory:
              "D:\\Downloads",

            inputUrl:
              "https://[2001:db8::1]/",

            runId:
              "ipv6-run",

            startedAt:
              "2026-09-18T03:05:22.000Z",

            platform:
              "win32",

            cwd:
              "C:\\Work"
          });


        const filename =
          result.split(
            "\\"
          ).at(
            -1
          )!;


        expect(
          filename
        ).not.toMatch(
          /[<>:"/\\|?*]/
        );


        expect(
          filename
        ).toMatch(
          /^CameraIntelligence_/
        );
      }
    );


    test(
      "path semantics are injectable for non-Windows tests",
      () => {

        const explicit =
          resolveOutputPath({
            explicitOutput:
              "reports/camera.xlsx",

            downloadsDirectory:
              "/home/test/Downloads",

            inputUrl:
              "invalid because explicit wins",

            runId:
              "run",

            startedAt:
              "invalid because explicit wins",

            platform:
              "linux",

            cwd:
              "/workspace"
          });


        expect(
          explicit
        ).toBe(
          "/workspace/reports/camera.xlsx"
        );


        const automatic =
          resolveOutputPath({
            downloadsDirectory:
              "/home/test/Downloads",

            inputUrl:
              "https://example.com/",

            runId:
              "run",

            startedAt:
              "2026-09-18T00:00:00.000Z",

            platform:
              "linux",

            cwd:
              "/workspace"
          });


        expect(
          automatic.startsWith(
            "/home/test/Downloads/CameraIntelligence_example.com_"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "blank Downloads directory is rejected for automatic output",
      () => {

        expect(
          () =>
            resolveOutputPath({
              downloadsDirectory:
                "   ",

              inputUrl:
                "https://example.com/",

              runId:
                "run",

              startedAt:
                "2026-09-18T00:00:00.000Z",

              platform:
                "win32",

              cwd:
                "C:\\Work"
            })
        ).toThrow(
          /Downloads/i
        );
      }
    );
  }
);