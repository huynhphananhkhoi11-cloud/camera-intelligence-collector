import {
  Command
} from "commander";

import {
  AdaptiveEndpointDiscovery
} from "../acquisition/adaptiveEndpointDiscovery.js";

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
  formatAcquisitionDoctorReport,
  runAcquisitionDoctor
} from "../diagnostics/acquisitionDoctor.js";

import {
  formatEndpointDiscoveryReport
} from "../diagnostics/endpointDiscoveryReport.js";

import {
  formatNetworkReconSnapshot
} from "../diagnostics/networkReconReport.js";

import {
  formatProductUrlGraphReport
} from "../diagnostics/productUrlGraphReport.js";


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


await program.parseAsync(
  process.argv
);
