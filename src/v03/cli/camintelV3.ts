import {
  Command
} from "commander";

import {
  AdaptiveEndpointDiscovery
} from "../acquisition/adaptiveEndpointDiscovery.js";

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
  createDefaultAcquisitionRouter
} from "../acquisition/defaultAcquisitionRouter.js";

import {
  PlaywrightNetworkReconRuntime
} from "../acquisition/playwrightNetworkReconRuntime.js";

import {
  buildProductUrlGraphFromEndpointRun
} from "../discovery/endpointGraphBridge.js";

import {
  DetailIdentityAcquirer
} from "../identity/detailIdentityAcquirer.js";

import {
  resolveProductIdentities
} from "../identity/identityClusterer.js";

import {
  ObservationAcquirer
} from "../observations/observationAcquirer.js";

import {
  formatAcquisitionDoctorReport,
  runAcquisitionDoctor
} from "../diagnostics/acquisitionDoctor.js";

import {
  formatBulkCollectionReport
} from "../diagnostics/bulkCollectionReport.js";

import {
  formatEndpointDiscoveryReport
} from "../diagnostics/endpointDiscoveryReport.js";

import {
  formatNetworkReconSnapshot
} from "../diagnostics/networkReconReport.js";

import {
  formatProductUrlGraphReport
} from "../diagnostics/productUrlGraphReport.js";

import {
  formatProductIdentityReport
} from "../diagnostics/productIdentityReport.js";

import {
  formatObservationReport
} from "../diagnostics/observationReport.js";


const program =
  new Command();


program
  .name(
    "camintel-v3"
  )
  .description(
    "Camera Intelligence Collector V3 development CLI"
  );


program
  .command(
    "doctor"
  )
  .description(
    "Probe available acquisition capabilities for a website"
  )
  .argument(
    "<url>",
    "Website root URL"
  )
  .action(
    async (
      url:
        string
    ) => {

      const router =
        createDefaultAcquisitionRouter();


      const report =
        await runAcquisitionDoctor(
          router,
          url
        );


      process.stdout.write(
        formatAcquisitionDoctorReport(
          report
        ) +
        "\n"
      );
    }
  );


program
  .command(
    "recon"
  )
  .description(
    "Observe same-origin XHR/fetch traffic during page bootstrap"
  )
  .argument(
    "<url>",
    "Website root URL"
  )
  .option(
    "--headed",
    "Show Chromium during reconnaissance",
    false
  )
  .action(
    async (
      url:
        string,
      options:
        {
          headed:
            boolean;
        }
    ) => {

      const runtime =
        new PlaywrightNetworkReconRuntime({
          headless:
            !options.headed
        });


      const snapshot =
        await runtime.observe(
          url
        );


      process.stdout.write(
        formatNetworkReconSnapshot(
          snapshot
        ) +
        "\n"
      );
    }
  );


program
  .command(
    "endpoints"
  )
  .description(
    "Auto-qualify and replay listing-like XHR/fetch endpoints"
  )
  .argument(
    "<url>",
    "Website root URL"
  )
  .option(
    "--headed",
    "Show Chromium during reconnaissance",
    false
  )
  .action(
    async (
      url:
        string,
      options:
        {
          headed:
            boolean;
        }
    ) => {

      const networkRuntime =
        new PlaywrightNetworkReconRuntime({
          headless:
            !options.headed
        });


      const discovery =
        new AdaptiveEndpointDiscovery({
          networkRuntime
        });


      const result =
        await discovery.discover(
          url
        );


      process.stdout.write(
        formatEndpointDiscoveryReport(
          result
        ) +
        "\n"
      );
    }
  );


program
  .command(
    "graph"
  )
  .description(
    "Build a provenance-preserving URL graph from discovered endpoints"
  )
  .argument(
    "<url>",
    "Website root URL"
  )
  .option(
    "--headed",
    "Show Chromium during reconnaissance",
    false
  )
  .action(
    async (
      url:
        string,
      options:
        {
          headed:
            boolean;
        }
    ) => {

      const networkRuntime =
        new PlaywrightNetworkReconRuntime({
          headless:
            !options.headed
        });


      const discovery =
        new AdaptiveEndpointDiscovery({
          networkRuntime
        });


      const result =
        await discovery.discover(
          url
        );


      const graph =
        buildProductUrlGraphFromEndpointRun(
          result.replay
        );


      process.stdout.write(
        formatProductUrlGraphReport(
          graph.snapshot()
        ) +
        "\n"
      );
    }
  );


program
  .command(
    "identity"
  )
  .description(
    "Acquire detail identity signals and deterministically cluster duplicate product representations"
  )
  .argument(
    "<urls...>",
    "One or more product detail URLs"
  )
  .action(
    async (
      urls:
        string[]
    ) => {

      const acquirer =
        new DetailIdentityAcquirer();


      const records =
        await acquirer.acquireMany(
          urls
        );


      const resolution =
        resolveProductIdentities(
          records
        );


      process.stdout.write(
        formatProductIdentityReport(
          resolution
        ) +
        "\n"
      );
    }
  );


program
  .command(
    "observe"
  )
  .description(
    "Collect all unique observable product field values with provenance"
  )
  .argument(
    "<url>",
    "Product detail URL"
  )
  .action(
    async (
      url:
        string
    ) => {

      const acquirer =
        new ObservationAcquirer();


      const result =
        await acquirer.acquire(
          url
        );


      process.stdout.write(
        formatObservationReport(
          result
        ) +
        "\n"
      );
    }
  );


program
  .command(
    "bulk"
  )
  .description(
    "Discover, detail-collect, identity-dedupe and entity-route a site"
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
  .action(
    async (
      url:
        string,
      options:
        {
          maxProducts:
            number;

          concurrency:
            number;
        }
    ) => {

      const collector =
        new BulkCollector({
          maxProducts:
            options.maxProducts,

          concurrency:
            options.concurrency
        });


      const result =
        await collector.collect(
          url
        );


      process.stdout.write(
        formatBulkCollectionReport(
          result
        ) +
        "\n"
      );
    }
  );


program
  .command(
    "collect"
  )
  .description(
    "Run the V3 collector from a root URL and export an Excel workbook"
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
    "Explicit Excel output path"
  )
  .action(
    async (
      url:
        string,
      options:
        {
          maxProducts:
            number;

          concurrency:
            number;

          output?:
            string;
        }
    ) => {

      const collector =
        new BulkCollector({
          maxProducts:
            options.maxProducts,

          concurrency:
            options.concurrency
        });


      process.stdout.write(
        "CAMINTEL V3 COLLECT\n\n"
      );


      process.stdout.write(
        "Discovering and collecting product data...\n"
      );


      const result =
        await collector.collect(
          url
        );


      const output =
        resolveV3OutputPath({
          rootUrl:
            url,

          explicitOutput:
            options.output
        });


      await exportBulkWorkbook(
        output.outputPath,
        result
      );


      process.stdout.write(
        "\n" +
        formatBulkCollectionReport(
          result
        ) +
        "\n\n"
      );


      process.stdout.write(
        "Excel: " +
        output.outputPath +
        "\n"
      );
    }
  );


await program.parseAsync(
  process.argv
);
