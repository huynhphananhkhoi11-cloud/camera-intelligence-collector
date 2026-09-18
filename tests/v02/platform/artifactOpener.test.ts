import {
  describe,
  expect,
  test
} from "vitest";

import {
  buildArtifactOpenInvocation,
  openArtifact,
  type ArtifactOpenProcess,
  type ArtifactSpawn
} from "../../../src/v02/platform/artifactOpener.ts";


class FakeProcess
implements
  ArtifactOpenProcess {

  private errorListener:
    (
      (
        error:
          Error
      ) =>
        void
    ) |
    null =
      null;


  private closeListener:
    (
      (
        code:
          number |
          null,

        signal:
          NodeJS.Signals |
          null
      ) =>
        void
    ) |
    null =
      null;


  onError(
    listener:
      (
        error:
          Error
      ) =>
        void
  ): void {

    this.errorListener =
      listener;
  }


  onClose(
    listener:
      (
        code:
          number |
          null,

        signal:
          NodeJS.Signals |
          null
      ) =>
        void
  ): void {

    this.closeListener =
      listener;
  }


  fail(
    message:
      string
  ): void {

    this.errorListener?.(
      new Error(
        message
      )
    );
  }


  close(
    code:
      number |
      null,

    signal:
      NodeJS.Signals |
      null =
        null
  ): void {

    this.closeListener?.(
      code,
      signal
    );
  }
}


describe(
  "Phase 11G.1 Windows artifact opener",
  () => {

    test(
      "builds cmd start invocation without shell interpolation",
      () => {

        const invocation =
          buildArtifactOpenInvocation(
            "C:\\Users\\Ada Lovelace\\Downloads\\Camera Intelligence & Audit.xlsx",
            {
              platform:
                "win32",

              environment: {
                ComSpec:
                  "C:\\Windows\\System32\\cmd.exe"
              }
            }
          );


        expect(
          invocation
        ).toEqual({
          command:
            "C:\\Windows\\System32\\cmd.exe",

          args: [
            "/d",
            "/s",
            "/c",
            "start",
            "",
            "C:\\Users\\Ada Lovelace\\Downloads\\Camera Intelligence & Audit.xlsx"
          ],

          options: {
            windowsHide:
              true,

            stdio:
              "ignore"
          }
        });
      }
    );


    test(
      "uses cmd.exe fallback when ComSpec is unavailable",
      () => {

        const invocation =
          buildArtifactOpenInvocation(
            "C:\\Downloads\\camera.xlsx",
            {
              platform:
                "win32",

              environment:
                {}
            }
          );


        expect(
          invocation.command
        ).toBe(
          "cmd.exe"
        );
      }
    );


    test(
      "blank artifact paths are rejected before spawning",
      async () => {

        let spawned =
          false;


        await expect(
          openArtifact(
            "   ",
            {
              platform:
                "win32",

              spawnProcess:
                () => {

                  spawned =
                    true;

                  return new FakeProcess();
                }
            }
          )
        ).rejects.toThrow(
          /artifact path/i
        );


        expect(
          spawned
        ).toBe(
          false
        );
      }
    );


    test(
      "unsupported platforms fail before spawning",
      async () => {

        let spawned =
          false;


        await expect(
          openArtifact(
            "/tmp/camera.xlsx",
            {
              platform:
                "linux",

              spawnProcess:
                () => {

                  spawned =
                    true;

                  return new FakeProcess();
                }
            }
          )
        ).rejects.toThrow(
          /platform/i
        );


        expect(
          spawned
        ).toBe(
          false
        );
      }
    );


    test(
      "spawns once and resolves only after successful command close",
      async () => {

        const process =
          new FakeProcess();

        const calls:
          Array<{
            command:
              string;

            args:
              readonly string[];
          }> = [];


        const spawnProcess:
          ArtifactSpawn =
            (
              command,
              args
            ) => {

              calls.push({
                command,
                args
              });


              return process;
            };


        let resolved =
          false;


        const opening =
          openArtifact(
            "C:\\Downloads\\camera.xlsx",
            {
              platform:
                "win32",

              environment: {
                ComSpec:
                  "C:\\Windows\\System32\\cmd.exe"
              },

              spawnProcess
            }
          )
            .then(
              () => {

                resolved =
                  true;
              }
            );


        await Promise.resolve();


        expect(
          calls
        ).toHaveLength(
          1
        );


        expect(
          resolved
        ).toBe(
          false
        );


        process.close(
          0
        );


        await opening;


        expect(
          resolved
        ).toBe(
          true
        );
      }
    );


    test(
      "spawn error rejects",
      async () => {

        const process =
          new FakeProcess();


        const opening =
          openArtifact(
            "C:\\Downloads\\camera.xlsx",
            {
              platform:
                "win32",

              spawnProcess:
                () =>
                  process
            }
          );


        process.fail(
          "spawn failed"
        );


        await expect(
          opening
        ).rejects.toThrow(
          "spawn failed"
        );
      }
    );


    test(
      "non-zero command exit rejects",
      async () => {

        const process =
          new FakeProcess();


        const opening =
          openArtifact(
            "C:\\Downloads\\camera.xlsx",
            {
              platform:
                "win32",

              spawnProcess:
                () =>
                  process
            }
          );


        process.close(
          1
        );


        await expect(
          opening
        ).rejects.toThrow(
          /exit code 1/i
        );
      }
    );


    test(
      "signal termination rejects",
      async () => {

        const process =
          new FakeProcess();


        const opening =
          openArtifact(
            "C:\\Downloads\\camera.xlsx",
            {
              platform:
                "win32",

              spawnProcess:
                () =>
                  process
            }
          );


        process.close(
          null,
          "SIGTERM"
        );


        await expect(
          opening
        ).rejects.toThrow(
          /SIGTERM/i
        );
      }
    );


    test(
      "late close cannot overwrite a prior spawn error",
      async () => {

        const process =
          new FakeProcess();


        const opening =
          openArtifact(
            "C:\\Downloads\\camera.xlsx",
            {
              platform:
                "win32",

              spawnProcess:
                () =>
                  process
            }
          );


        process.fail(
          "first failure"
        );

        process.close(
          0
        );


        await expect(
          opening
        ).rejects.toThrow(
          "first failure"
        );
      }
    );
  }
);