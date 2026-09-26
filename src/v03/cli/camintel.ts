#!/usr/bin/env node

import {
  Command
} from "commander";

import {
  runProductionCollect
} from "./productionCollect.js";


interface CollectOptions {
  readonly maxProducts:
    number;

  readonly concurrency:
    number;

  readonly output?:
    string;

  readonly open:
    boolean;
}


const program =
  new Command();


program
  .name(
    "camintel"
  )
  .description(
    "Camera Intelligence Collector"
  )
  .version(
    "3.0.0"
  )
  .showHelpAfterError();


program
  .command(
    "collect"
  )
  .description(
    "Discover camera products from a website root URL and export Excel"
  )
  .argument(
    "<url>",
    "Website root URL"
  )
  .option(
    "--max-products <n>",
    "Maximum detail URLs for this run",
    value =>
      Number.parseInt(
        value,
        10
      ),
    5000
  )
  .option(
    "--concurrency <n>",
    "Parallel detail requests",
    value =>
      Number.parseInt(
        value,
        10
      ),
    3
  )
  .option(
    "--output <path>",
    "Explicit xlsx output path"
  )
  .option(
    "--no-open",
    "Do not automatically open the completed xlsx"
  )
  .action(
    async (
      url:
        string,
      options:
        CollectOptions
    ) => {

      const result =
        await runProductionCollect({
          rootUrl:
            url,

          maxProducts:
            options.maxProducts,

          concurrency:
            options.concurrency,

          output:
            options.output,

          open:
            options.open
        });


      process.stdout.write(
        [
          "",
          "=== COMPLETE ===",
          "Camera rows: " +
            result.collection.cameras.length,
          "Review rows: " +
            result.collection.uncertain.length,
          "Excluded rows: " +
            result.collection.nonCameras.length,
          "Skipped pages: " +
            result.collection.skippedPages.length,
          "Errors: " +
            result.collection.errors.length,
          "Excel: " +
            result.outputPath,
          ""
        ].join(
          "\n"
        )
      );
    }
  );


try {
  await program.parseAsync(
    process.argv
  );
}
catch (
  error
) {

  const message =
    error instanceof
      Error
      ? error.message
      : String(
          error
        );


  console.error(
    "ERROR: " +
      message
  );


  process.exitCode =
    1;
}
