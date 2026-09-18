import {
  createHash
} from "node:crypto";

import {
  posix,
  win32
} from "node:path";


export interface ResolveOutputPathInput {
  readonly explicitOutput?:
    string;

  readonly downloadsDirectory:
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
}


function pathApi(
  platform:
    NodeJS.Platform
) {

  return platform ===
    "win32"
      ? win32
      : posix;
}


export function sanitizeFilenameComponent(
  value:
    string
): string {

  const sanitized =
    value
      .trim()
      .replace(
        /[<>:"/\\|?*\u0000-\u001f]/g,
        "_"
      )
      .replace(
        /[. ]+$/g,
        ""
      );


  return sanitized ||
    "site";
}


export function formatOutputTimestamp(
  startedAt:
    string
): string {

  const parsed =
    new Date(
      startedAt
    );


  if (
    !Number.isFinite(
      parsed.getTime()
    )
  ) {
    throw new Error(
      `Invalid run startedAt timestamp: ${startedAt}`
    );
  }


  const parts = [
    parsed
      .getUTCFullYear()
      .toString()
      .padStart(
        4,
        "0"
      ),

    (
      parsed.getUTCMonth() +
      1
    )
      .toString()
      .padStart(
        2,
        "0"
      ),

    parsed
      .getUTCDate()
      .toString()
      .padStart(
        2,
        "0"
      )
  ];


  const time = [
    parsed
      .getUTCHours()
      .toString()
      .padStart(
        2,
        "0"
      ),

    parsed
      .getUTCMinutes()
      .toString()
      .padStart(
        2,
        "0"
      ),

    parsed
      .getUTCSeconds()
      .toString()
      .padStart(
        2,
        "0"
      )
  ];


  return (
    parts.join(
      ""
    ) +
    "_" +
    time.join(
      ""
    )
  );
}


export function shortRunToken(
  runId:
    string
): string {

  if (
    runId.length ===
      0
  ) {
    throw new Error(
      "runId is required for automatic output naming."
    );
  }


  return createHash(
    "sha256"
  )
    .update(
      runId,
      "utf8"
    )
    .digest(
      "hex"
    )
    .slice(
      0,
      8
    );
}


export function resolveOutputPath(
  input:
    ResolveOutputPathInput
): string {

  const platform =
    input.platform ??
    process.platform;


  const paths =
    pathApi(
      platform
    );


  const cwd =
    input.cwd ??
    process.cwd();


  /*
   * Explicit user intent wins before all default-path work.
   *
   * In particular, an explicit path must not depend on the URL,
   * persistent timestamp, Downloads resolution or naming policy.
   */
  if (
    input.explicitOutput !==
      undefined &&
    input.explicitOutput
      .trim()
      .length >
      0
  ) {

    return paths.resolve(
      cwd,
      input.explicitOutput
    );
  }


  if (
    input.downloadsDirectory
      .trim()
      .length ===
      0
  ) {
    throw new Error(
      "Downloads directory is required for automatic output."
    );
  }


  let host:
    string;


  try {

    host =
      new URL(
        input.inputUrl
      )
        .hostname
        .replace(
          /^www\./i,
          ""
        );
  }
  catch {

    throw new Error(
      `Invalid input URL for automatic output naming: ${input.inputUrl}`
    );
  }


  const filename =
    [
      "CameraIntelligence",
      sanitizeFilenameComponent(
        host
      ),
      formatOutputTimestamp(
        input.startedAt
      ),
      shortRunToken(
        input.runId
      )
    ].join(
      "_"
    ) +
    ".xlsx";


  return paths.resolve(
    input.downloadsDirectory,
    filename
  );
}