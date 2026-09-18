import {
  execFileSync
} from "node:child_process";

import {
  homedir
} from "node:os";

import {
  posix,
  win32
} from "node:path";

import {
  resolveOutputPath
} from "./outputPathResolver.js";


export const DOWNLOADS_KNOWN_FOLDER_ID =
  "{374DE290-123F-4565-9164-39C4925E467B}";


export const USER_SHELL_FOLDERS_REGISTRY_KEY =
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";


export type DownloadsResolutionSource =
  | "KNOWN_FOLDER_REGISTRY"
  | "USERPROFILE_FALLBACK"
  | "HOME_FALLBACK";


export interface DownloadsResolution {
  readonly path:
    string;

  readonly source:
    DownloadsResolutionSource;
}


export interface DownloadsResolverOptions {
  readonly platform?:
    NodeJS.Platform;

  readonly environment?:
    Readonly<
      NodeJS.ProcessEnv
    >;

  readonly homeDirectory?:
    string;

  readonly registryQuery?:
    () =>
      string;
}


export interface ResolveRunOutputPathInput {
  readonly explicitOutput?:
    string;

  readonly inputUrl:
    string;

  readonly runId:
    string;

  readonly startedAt:
    string;

  readonly platform?:
    NodeJS.Platform;

  readonly cwd?:
    string;

  readonly downloadsDirectoryResolver?:
    () =>
      string;
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


function expandWindowsEnvironment(
  value:
    string,

  environment:
    Readonly<
      NodeJS.ProcessEnv
    >
): string {

  return value.replace(
    /%([^%]+)%/g,
    (
      original,
      variable:
        string
    ) => {

      const replacement =
        environmentValue(
          environment,
          variable
        );


      return replacement ??
        original;
    }
  );
}


function queryWindowsDownloadsRegistry():
  string {

  return execFileSync(
    "reg.exe",
    [
      "query",
      USER_SHELL_FOLDERS_REGISTRY_KEY,
      "/v",
      DOWNLOADS_KNOWN_FOLDER_ID
    ],
    {
      encoding:
        "utf8",

      windowsHide:
        true,

      stdio: [
        "ignore",
        "pipe",
        "pipe"
      ]
    }
  );
}


export function parseWindowsDownloadsRegistryOutput(
  output:
    string,

  environment:
    Readonly<
      NodeJS.ProcessEnv
    >
): string |
  null {

  const target =
    DOWNLOADS_KNOWN_FOLDER_ID
      .toUpperCase();


  const line =
    output
      .split(
        /\r?\n/
      )
      .find(
        candidate =>
          candidate
            .toUpperCase()
            .includes(
              target
            )
      );


  if (
    line ===
      undefined
  ) {
    return null;
  }


  const match =
    line.match(
      /\bREG_(?:EXPAND_)?SZ\s+(.+?)\s*$/i
    );


  if (
    match ===
      null
  ) {
    return null;
  }


  let raw =
    match[1]
      .trim();


  if (
    raw.startsWith(
      '"'
    ) &&
    raw.endsWith(
      '"'
    ) &&
    raw.length >=
      2
  ) {

    raw =
      raw.slice(
        1,
        -1
      );
  }


  const expanded =
    expandWindowsEnvironment(
      raw,
      environment
    )
      .trim();


  /*
   * Never return an unresolved environment-variable path.
   */
  if (
    /%[^%]+%/.test(
      expanded
    ) ||
    !win32.isAbsolute(
      expanded
    )
  ) {
    return null;
  }


  return win32.normalize(
    expanded
  );
}


export function resolveDownloadsDirectory(
  options:
    DownloadsResolverOptions = {}
): DownloadsResolution {

  const platform =
    options.platform ??
    process.platform;


  const environment =
    options.environment ??
    process.env;


  const homeDirectory =
    options.homeDirectory ??
    homedir();


  if (
    platform ===
      "win32"
  ) {

    const registryQuery =
      options.registryQuery ??
      queryWindowsDownloadsRegistry;


    try {

      const registryPath =
        parseWindowsDownloadsRegistryOutput(
          registryQuery(),
          environment
        );


      if (
        registryPath !==
          null
      ) {

        return Object.freeze({
          path:
            registryPath,

          source:
            "KNOWN_FOLDER_REGISTRY"
        });
      }
    }
    catch {

      /*
       * Registry access is an adapter concern.
       * Falling back must not make output resolution fatal.
       */
    }


    const userProfile =
      environmentValue(
        environment,
        "USERPROFILE"
      );


    if (
      userProfile !==
        undefined &&
      userProfile.trim().length >
        0 &&
      win32.isAbsolute(
        userProfile
      )
    ) {

      return Object.freeze({
        path:
          win32.join(
            userProfile,
            "Downloads"
          ),

        source:
          "USERPROFILE_FALLBACK"
      });
    }


    if (
      homeDirectory.trim().length ===
        0 ||
      !win32.isAbsolute(
        homeDirectory
      )
    ) {

      throw new Error(
        "Unable to resolve a Windows Downloads directory."
      );
    }


    return Object.freeze({
      path:
        win32.join(
          homeDirectory,
          "Downloads"
        ),

      source:
        "HOME_FALLBACK"
    });
  }


  if (
    homeDirectory.trim().length ===
      0
  ) {

    throw new Error(
      "Unable to resolve a home directory for Downloads."
    );
  }


  return Object.freeze({
    path:
      posix.resolve(
        homeDirectory,
        "Downloads"
      ),

    source:
      "HOME_FALLBACK"
  });
}


export function resolveRunOutputPath(
  input:
    ResolveRunOutputPathInput
): string {

  const platform =
    input.platform ??
    process.platform;


  /*
   * Critical precedence invariant:
   * explicit output returns before registry/Known Folder access.
   */
  if (
    input.explicitOutput !==
      undefined &&
    input.explicitOutput
      .trim()
      .length >
      0
  ) {

    return resolveOutputPath({
      explicitOutput:
        input.explicitOutput,

      downloadsDirectory:
        "",

      inputUrl:
        input.inputUrl,

      runId:
        input.runId,

      startedAt:
        input.startedAt,

      platform,

      cwd:
        input.cwd
    });
  }


  const downloadsDirectory =
    input.downloadsDirectoryResolver
      ? input.downloadsDirectoryResolver()
      : resolveDownloadsDirectory({
          platform
        }).path;


  return resolveOutputPath({
    downloadsDirectory,

    inputUrl:
      input.inputUrl,

    runId:
      input.runId,

    startedAt:
      input.startedAt,

    platform,

    cwd:
      input.cwd
  });
}