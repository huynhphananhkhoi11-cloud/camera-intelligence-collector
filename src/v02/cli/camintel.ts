#!/usr/bin/env node

import {
  Command
} from "commander";

import {
  runCollectV2
} from "./collectV2.js";

import {
  resolveCollectUrl
} from "./interactiveUrl.js";


interface CollectOptions {
  siteMode?:
    string;

  headless:
    boolean;

  maxPages?:
    string;

  maxProducts?:
    string;

  concurrency?:
    string;

  fresh:
    boolean;

  output?:
    string;
}


function collectArgv(
  url:
    string,
  options:
    CollectOptions
): string[] {

  const argv = [
    process.execPath,
    "camintel",
    url
  ];


  if (
    options.siteMode
  ) {
    argv.push(
      "--site-mode",
      options.siteMode
    );
  }


  if (
    options.headless
  ) {
    argv.push(
      "--headless"
    );
  }


  if (
    options.maxPages
  ) {
    argv.push(
      "--max-pages",
      options.maxPages
    );
  }


  if (
    options.maxProducts
  ) {
    argv.push(
      "--max-products",
      options.maxProducts
    );
  }


  if (
    options.concurrency
  ) {
    argv.push(
      "--concurrency",
      options.concurrency
    );
  }


  if (
    options.fresh
  ) {
    argv.push(
      "--fresh"
    );
  }


  if (
    options.output
  ) {
    argv.push(
      "--output",
      options.output
    );
  }


  return argv;
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
    "1.0.0"
  )
  .showHelpAfterError();


program
  .command("collect")
  .description(
    "Collect camera product intelligence from a website"
  )
  .argument("[url]")
  .option(
    "--site-mode <mode>",
    "Weak site prior only"
  )
  .option(
    "--headless",
    "Run Chromium headless",
    false
  )
  .option(
    "--max-pages <n>",
    "Maximum catalog pages"
  )
  .option(
    "--max-products <n>",
    "Maximum product detail pages"
  )
  .option(
    "--concurrency <n>",
    "Parallel detail workers"
  )
  .option(
    "--fresh",
    "Bypass reusable cache for a new run",
    false
  )
  .option(
    "--output <path>",
    "Explicit xlsx output path"
  )
  .action(
    async (
      url:
        string |
        undefined,
      options:
        CollectOptions
    ) => {

      const resolvedUrl =
        await resolveCollectUrl(
          url
        );


      await runCollectV2(
        collectArgv(
          resolvedUrl,
          options
        )
      );
    }
  );


try {
  await program.parseAsync();
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
    `ERROR: ${message}`
  );

  process.exitCode =
    1;
}