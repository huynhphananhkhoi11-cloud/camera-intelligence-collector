import os from "node:os";


export interface InstalledOllamaModel {
  readonly name:
    string;

  readonly model:
    string;

  readonly digest:
    string;

  readonly size:
    number;
}


export interface RuntimeDoctorReport {
  readonly ollamaAvailable:
    boolean;

  readonly ollamaBaseUrl:
    string;

  readonly installedModels:
    readonly InstalledOllamaModel[];

  readonly totalRamBytes:
    number;

  readonly freeRamBytes:
    number;

  readonly reserveRamBytes:
    number;

  readonly baselineHeadroomSafe:
    boolean;

  readonly note:
    string;
}


export const DEFAULT_MODEL_CANDIDATES =
  [
    "qwen3-vl:4b-instruct-q4_K_M",
    "qwen3-vl:4b",
    "qwen3-vl:2b-instruct-q4_K_M",
    "qwen3-vl:2b"
  ] as const;


export function memorySnapshot(): {
  readonly totalRamBytes:
    number;

  readonly freeRamBytes:
    number;

  readonly reserveRamBytes:
    number;

  readonly baselineHeadroomSafe:
    boolean;
} {

  const totalRamBytes =
    os.totalmem();


  const freeRamBytes =
    os.freemem();


  const reserveRamBytes =
    Math.max(
      3 *
      1024 *
      1024 *
      1024,
      Math.ceil(
        totalRamBytes *
        0.20
      )
    );


  return {
    totalRamBytes,
    freeRamBytes,
    reserveRamBytes,
    baselineHeadroomSafe:
      freeRamBytes >
      reserveRamBytes
  };
}


export async function doctorRuntime(
  baseUrl:
    string,
  fetchFn:
    typeof fetch =
      fetch
):
  Promise<
    RuntimeDoctorReport
  > {

  const memory =
    memorySnapshot();


  try {

    const response =
      await fetchFn(
        baseUrl.replace(
          /\/+$/u,
          ""
        ) +
        "/api/tags"
      );


    if (
      !response.ok
    ) {
      throw new Error(
        "HTTP " +
        response.status
      );
    }


    const body =
      await response.json() as {
        models?:
          Array<{
            name?:
              string;

            model?:
              string;

            digest?:
              string;

            size?:
              number;
          }>;
      };


    const installedModels =
      (
        body.models ??
        []
      )
        .map(
          item => ({
            name:
              String(
                item.name ??
                ""
              ),

            model:
              String(
                item.model ??
                item.name ??
                ""
              ),

            digest:
              String(
                item.digest ??
                ""
              ),

            size:
              Number(
                item.size ??
                0
              )
          })
        )
        .filter(
          item =>
            Boolean(
              item.name
            )
        );


    return {
      ollamaAvailable:
        true,

      ollamaBaseUrl:
        baseUrl,

      installedModels,

      ...memory,

      note:
        memory.baselineHeadroomSafe
          ? "Baseline RAM reserve is currently available. Final safety still depends on measured inference."
          : "Baseline RAM reserve is already below the configured floor; do not start local VLM inference."
    };
  }
  catch (
    error
  ) {

    return {
      ollamaAvailable:
        false,

      ollamaBaseUrl:
        baseUrl,

      installedModels:
        [],

      ...memory,

      note:
        error instanceof
          Error
          ? error.message
          : String(
              error
            )
    };
  }
}


export function selectInstalledModel(
  report:
    RuntimeDoctorReport,
  requested:
    string
): InstalledOllamaModel {

  if (
    !report.ollamaAvailable
  ) {
    throw new Error(
      "Ollama is unavailable at " +
      report.ollamaBaseUrl +
      ". " +
      report.note
    );
  }


  if (
    !report.baselineHeadroomSafe
  ) {
    throw new Error(
      "Local AI admission stopped because available RAM is below the reserve floor."
    );
  }


  if (
    requested !==
      "auto"
  ) {

    const exact =
      report.installedModels.find(
        model =>
          model.name ===
            requested ||
          model.model ===
            requested
      );


    if (
      !exact
    ) {
      throw new Error(
        "Requested model is not installed: " +
        requested
      );
    }


    return exact;
  }


  for (
    const candidate
    of DEFAULT_MODEL_CANDIDATES
  ) {

    const found =
      report.installedModels.find(
        model =>
          model.name ===
            candidate ||
          model.model ===
            candidate
      );


    if (
      found
    ) {
      return found;
    }
  }


  throw new Error(
    [
      "No supported Qwen3-VL model is installed.",
      "Install one of:",
      ...DEFAULT_MODEL_CANDIDATES.map(
        model =>
          "  ollama pull " +
          model
      )
    ].join(
      "\n"
    )
  );
}
