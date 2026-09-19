import {
  BulkCollector
} from "../bulk/bulkCollector.js";

import {
  exportBulkWorkbook
} from "../export/excelExporter.js";

import {
  resolveV3OutputPath
} from "../platform/outputPath.js";

import {
  openArtifact
} from "../../v02/platform/artifactOpener.js";

import {
  openCompletedArtifactBestEffort
} from "../../v02/cli/artifactOpenUx.js";

import type {
  BulkCollectionResult
} from "../bulk/bulkTypes.js";


export interface ProductionCollectOptions {
  readonly rootUrl:
    string;

  readonly maxProducts:
    number;

  readonly concurrency:
    number;

  readonly output?:
    string;

  readonly open:
    boolean;

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

  readonly createCollector?:
    () =>
      Pick<
        BulkCollector,
        "collect"
      >;

  readonly exportWorkbook?:
    (
      outputPath:
        string,
      result:
        BulkCollectionResult
    ) =>
      Promise<void>;

  readonly openArtifact?:
    (
      path:
        string
    ) =>
      Promise<void>;
}


export interface ProductionCollectResult {
  readonly outputPath:
    string;

  readonly collection:
    BulkCollectionResult;

  readonly openResult:
    "DISABLED" |
    "NO_ARTIFACT" |
    "OPENED" |
    "OPEN_FAILED";
}


function positiveInteger(
  value:
    number,
  name:
    string
): number {

  if (
    !Number.isInteger(
      value
    ) ||
    value <=
      0
  ) {
    throw new Error(
      name +
      " must be a positive integer."
    );
  }


  return value;
}


export async function runProductionCollect(
  options:
    ProductionCollectOptions
): Promise<
  ProductionCollectResult
> {

  const rootUrl =
    new URL(
      options.rootUrl
    ).toString();


  const maxProducts =
    positiveInteger(
      options.maxProducts,
      "maxProducts"
    );


  const concurrency =
    positiveInteger(
      options.concurrency,
      "concurrency"
    );


  const writeInfo =
    options.writeInfo ??
    (
      message => {
        console.log(
          message
        );
      }
    );


  const writeWarning =
    options.writeWarning ??
    (
      message => {
        console.error(
          message
        );
      }
    );


  writeInfo(
    "Discovering product data..."
  );


  const collector =
    options.createCollector
      ? options.createCollector()
      : new BulkCollector({
          maxProducts,
          concurrency
        });


  const collection =
    await collector.collect(
      rootUrl
    );


  writeInfo(
    [
      "Discovery complete.",
      "Candidates: " +
        collection.candidateUrls.length,
      "Sources(static/sitemap/endpoint/rendered): " +
        [
          collection.discovery.channelCounts.STATIC_HTML,
          collection.discovery.channelCounts.SITEMAP,
          collection.discovery.channelCounts.ENDPOINT_REPLAY,
          collection.discovery.channelCounts.RENDERED_DOM
        ].join(
          "/"
        ),
      "Identities: " +
        collection.identityResolution.clusters.length,
      "Cameras: " +
        collection.cameras.length,
      "Excluded: " +
        collection.nonCameras.length,
      "Review: " +
        collection.uncertain.length,
      "Skipped non-product: " +
        collection.skippedPages.length,
      "Errors: " +
        collection.errors.length
    ].join(
      " "
    )
  );


  const output =
    resolveV3OutputPath({
      rootUrl,
      explicitOutput:
        options.output
    });


  writeInfo(
    "Writing Excel..."
  );


  const exporter =
    options.exportWorkbook ??
    exportBulkWorkbook;


  await exporter(
    output.outputPath,
    collection
  );


  writeInfo(
    "Saved: " +
      output.outputPath
  );


  const openResult =
    await openCompletedArtifactBestEffort({
      enabled:
        options.open,

      artifactPath:
        output.outputPath,

      openArtifact:
        options.openArtifact ??
        openArtifact,

      writeInfo,
      writeWarning
    });


  return {
    outputPath:
      output.outputPath,
    collection,
    openResult
  };
}
