import {
  Command
} from "commander";

import {
  createDefaultAcquisitionRouter
} from "../acquisition/defaultAcquisitionRouter.js";

import {
  formatAcquisitionDoctorReport,
  runAcquisitionDoctor
} from "../diagnostics/acquisitionDoctor.js";


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


await program.parseAsync(
  process.argv
);
