import {
  createAcquisitionContext
} from "../acquisition/acquisitionContext.js";

import {
  AcquisitionRouter
} from "../acquisition/acquisitionRouter.js";

import type {
  AcquisitionDoctorReport
} from "../acquisition/acquisitionTypes.js";


export async function runAcquisitionDoctor(
  router:
    AcquisitionRouter,
  rootUrl:
    string,
  signal?:
    AbortSignal
): Promise<
  AcquisitionDoctorReport
> {

  return router.doctor(
    createAcquisitionContext(
      rootUrl,
      signal
    )
  );
}


export function formatAcquisitionDoctorReport(
  report:
    AcquisitionDoctorReport
): string {

  const lines =
    [
      "CAMINTEL V3 ACQUISITION DOCTOR",
      "",
      "Site: " +
        report.rootUrl,
      ""
    ];


  for (
    const probe
    of report.probes
  ) {
    lines.push(
      probe.backendId.padEnd(
        18
      ) +
      " " +
      probe.status.padEnd(
        11
      ) +
      " " +
      probe.reason
    );
  }


  lines.push(
    "",
    "Recommended: " +
      (
        report.recommendedBackend ??
        "NONE"
      )
  );


  return lines.join(
    "\n"
  );
}
