import {
  spawn
} from "node:child_process";


export interface ArtifactOpenSpawnOptions {
  readonly windowsHide:
    boolean;

  readonly stdio:
    "ignore";
}


export interface ArtifactOpenProcess {
  onError(
    listener:
      (
        error:
          Error
      ) =>
        void
  ): void;

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
  ): void;
}


export type ArtifactSpawn =
  (
    command:
      string,

    args:
      readonly string[],

    options:
      ArtifactOpenSpawnOptions
  ) =>
    ArtifactOpenProcess;


export interface ArtifactOpenerOptions {
  readonly platform?:
    NodeJS.Platform;

  readonly environment?:
    Readonly<
      NodeJS.ProcessEnv
    >;

  readonly spawnProcess?:
    ArtifactSpawn;
}


export interface ArtifactOpenInvocation {
  readonly command:
    string;

  readonly args:
    readonly string[];

  readonly options:
    ArtifactOpenSpawnOptions;
}


function environmentValue(
  environment:
    Readonly<
      NodeJS.ProcessEnv
    >,

  name:
    string
): string |
  undefined {

  const wanted =
    name.toUpperCase();


  for (
    const [
      key,
      value
    ]
    of Object.entries(
      environment
    )
  ) {

    if (
      key.toUpperCase() ===
        wanted
    ) {
      return value;
    }
  }


  return undefined;
}


const defaultSpawn:
  ArtifactSpawn =
    (
      command,
      args,
      options
    ) => {

      const child =
        spawn(
          command,
          [
            ...args
          ],
          {
            windowsHide:
              options.windowsHide,

            stdio:
              options.stdio
          }
        );


      return {
        onError:
          listener => {

            child.once(
              "error",
              listener
            );
          },

        onClose:
          listener => {

            child.once(
              "close",
              listener
            );
          }
      };
    };


export function buildArtifactOpenInvocation(
  artifactPath:
    string,

  options:
    ArtifactOpenerOptions = {}
): ArtifactOpenInvocation {

  if (
    artifactPath.trim().length ===
      0
  ) {
    throw new Error(
      "Artifact path is required."
    );
  }


  const platform =
    options.platform ??
    process.platform;


  if (
    platform !==
      "win32"
  ) {
    throw new Error(
      `Artifact opening is unsupported on platform: ${platform}`
    );
  }


  const environment =
    options.environment ??
    process.env;


  const command =
    environmentValue(
      environment,
      "ComSpec"
    )
      ?.trim() ||
    "cmd.exe";


  return Object.freeze({
    command,

    /*
     * `start` is a cmd.exe built-in.
     * The empty argument after start is the mandatory window title;
     * the artifact path remains one independent spawn argument.
     */
    args:
      Object.freeze([
        "/d",
        "/s",
        "/c",
        "start",
        "",
        artifactPath
      ]),

    options:
      Object.freeze({
        windowsHide:
          true,

        stdio:
          "ignore"
      })
  });
}


export async function openArtifact(
  artifactPath:
    string,

  options:
    ArtifactOpenerOptions = {}
): Promise<void> {

  const invocation =
    buildArtifactOpenInvocation(
      artifactPath,
      options
    );


  const spawnProcess =
    options.spawnProcess ??
    defaultSpawn;


  await new Promise<void>(
    (
      resolve,
      reject
    ) => {

      let settled =
        false;


      const succeed =
        (): void => {

          if (
            settled
          ) {
            return;
          }


          settled =
            true;

          resolve();
        };


      const fail =
        (
          error:
            Error
        ): void => {

          if (
            settled
          ) {
            return;
          }


          settled =
            true;

          reject(
            error
          );
        };


      let processHandle:
        ArtifactOpenProcess;


      try {

        processHandle =
          spawnProcess(
            invocation.command,
            invocation.args,
            invocation.options
          );
      }
      catch (
        error
      ) {

        fail(
          error instanceof
            Error
              ? error
              : new Error(
                  String(
                    error
                  )
                )
        );

        return;
      }


      processHandle.onError(
        error => {

          fail(
            error
          );
        }
      );


      processHandle.onClose(
        (
          code,
          signal
        ) => {

          if (
            code ===
              0
          ) {

            succeed();

            return;
          }


          if (
            signal !==
              null
          ) {

            fail(
              new Error(
                `Artifact opener terminated by signal ${signal}.`
              )
            );

            return;
          }


          fail(
            new Error(
              `Artifact opener exited with exit code ${String(code)}.`
            )
          );
        }
      );
    }
  );
}