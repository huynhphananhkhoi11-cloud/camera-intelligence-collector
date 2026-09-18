export type CompletedArtifactOpenResult =
  | "DISABLED"
  | "NO_ARTIFACT"
  | "OPENED"
  | "OPEN_FAILED";


export interface CompletedArtifactOpenOptions {
  readonly enabled:
    boolean;

  readonly artifactPath:
    string |
    null;

  readonly openArtifact:
    (
      artifactPath:
        string
    ) =>
      Promise<void>;

  readonly writeInfo?:
    (
      message:
        string
    ) =>
      void;

  readonly writeWarning?:
    (
      message:
        string
    ) =>
      void;
}


function safeWrite(
  writer:
    (
      (
        message:
          string
      ) =>
        void
    ) |
    undefined,

  message:
    string
): void {

  if (
    writer ===
      undefined
  ) {
    return;
  }


  try {

    writer(
      message
    );
  }
  catch {

    /*
     * Presentation sinks must never change completed-run truth.
     */
  }
}


function errorMessage(
  error:
    unknown
): string {

  return error instanceof
    Error
      ? error.message
      : String(
          error
        );
}


export async function openCompletedArtifactBestEffort(
  options:
    CompletedArtifactOpenOptions
): Promise<
  CompletedArtifactOpenResult
> {

  if (
    !options.enabled
  ) {
    return "DISABLED";
  }


  const artifactPath =
    options.artifactPath
      ?.trim();


  if (
    artifactPath ===
      undefined ||
    artifactPath.length ===
      0
  ) {
    return "NO_ARTIFACT";
  }


  safeWrite(
    options.writeInfo,
    "Opening Excel..."
  );


  try {

    await options.openArtifact(
      artifactPath
    );


    return "OPENED";
  }
  catch (
    error
  ) {

    safeWrite(
      options.writeWarning,
      [
        "WARNING: Could not open Excel automatically.",
        `File saved: ${artifactPath}`,
        `Reason: ${errorMessage(error)}`
      ].join(
        "\n"
      )
    );


    return "OPEN_FAILED";
  }
}