import {
  randomUUID
} from "node:crypto";

import {
  resolveRunOutputPath
} from "../../v02/platform/downloadsOutputResolver.js";


export interface V3OutputPathOptions {
  readonly rootUrl:
    string;

  readonly explicitOutput?:
    string;

  readonly startedAt?:
    string;

  readonly runId?:
    string;

  readonly downloadsDirectoryResolver?:
    () =>
      string;
}


export interface V3OutputPathResolution {
  readonly outputPath:
    string;

  readonly startedAt:
    string;

  readonly runId:
    string;
}


export function resolveV3OutputPath(
  options:
    V3OutputPathOptions
): V3OutputPathResolution {

  const startedAt =
    options.startedAt ??
    new Date()
      .toISOString();


  const runId =
    options.runId ??
    randomUUID();


  return {
    outputPath:
      resolveRunOutputPath({
        explicitOutput:
          options.explicitOutput,
        inputUrl:
          options.rootUrl,
        runId,
        startedAt,
        downloadsDirectoryResolver:
          options.downloadsDirectoryResolver
      }),

    startedAt,
    runId
  };
}
