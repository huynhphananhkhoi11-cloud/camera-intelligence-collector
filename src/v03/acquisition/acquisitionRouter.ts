import {
  NoAcquisitionBackendError
} from "./acquisitionErrors.js";

import type {
  AcquisitionAttempt,
  AcquisitionBackend,
  AcquisitionContext,
  AcquisitionDoctorReport,
  AcquisitionProbe,
  AcquisitionRunResult
} from "./acquisitionTypes.js";


function errorMessage(
  error:
    unknown
): string {

  if (
    error instanceof
      Error
  ) {
    return error.message;
  }


  return String(
    error
  );
}


function throwIfAborted(
  context:
    AcquisitionContext
): void {

  if (
    context.signal?.aborted
  ) {
    throw new Error(
      "Acquisition aborted."
    );
  }
}


export class AcquisitionRouter {
  private readonly backends:
    readonly AcquisitionBackend[];


  constructor(
    backends:
      readonly AcquisitionBackend[]
  ) {

    const ids =
      new Set<string>();


    for (
      const backend
      of backends
    ) {

      if (
        ids.has(
          backend.id
        )
      ) {
        throw new Error(
          "Duplicate acquisition backend id: " +
          backend.id
        );
      }


      ids.add(
        backend.id
      );
    }


    this.backends =
      [
        ...backends
      ];
  }


  async doctor(
    context:
      AcquisitionContext
  ):
    Promise<
      AcquisitionDoctorReport
    > {

    const probes:
      AcquisitionProbe[] =
        [];


    for (
      const backend
      of this.backends
    ) {

      throwIfAborted(
        context
      );


      try {

        const probe =
          await backend.probe(
            context
          );


        probes.push({
          ...probe,
          backendId:
            backend.id
        });
      }
      catch (
        error
      ) {

        throwIfAborted(
          context
        );


        probes.push({
          backendId:
            backend.id,

          status:
            "ERROR",

          reason:
            errorMessage(
              error
            )
        });
      }
    }


    const recommended =
      probes.find(
        probe =>
          probe.status ===
            "AVAILABLE"
      ) ??
      null;


    return {
      rootUrl:
        context.rootUrl,

      probes,

      recommendedBackend:
        recommended?.backendId ??
        null
    };
  }


  async acquire(
    context:
      AcquisitionContext
  ):
    Promise<
      AcquisitionRunResult
    > {

    const attempts:
      AcquisitionAttempt[] =
        [];


    for (
      const backend
      of this.backends
    ) {

      throwIfAborted(
        context
      );


      let probe:
        AcquisitionProbe;


      try {

        probe =
          await backend.probe(
            context
          );
      }
      catch (
        error
      ) {

        throwIfAborted(
          context
        );


        attempts.push({
          backendId:
            backend.id,

          phase:
            "PROBE",

          outcome:
            "FAILED",

          reason:
            errorMessage(
              error
            )
        });


        continue;
      }


      if (
        probe.status !==
          "AVAILABLE"
      ) {

        attempts.push({
          backendId:
            backend.id,

          phase:
            "PROBE",

          outcome:
            "SKIPPED",

          reason:
            probe.reason
        });


        continue;
      }


      attempts.push({
        backendId:
          backend.id,

        phase:
          "PROBE",

        outcome:
          "SUCCESS",

        reason:
          probe.reason
      });


      try {

        const result =
          await backend.acquire(
            context
          );


        attempts.push({
          backendId:
            backend.id,

          phase:
            "ACQUIRE",

          outcome:
            "SUCCESS",

          reason:
            "Acquisition completed."
        });


        return {
          result,

          attempts
        };
      }
      catch (
        error
      ) {

        throwIfAborted(
          context
        );


        attempts.push({
          backendId:
            backend.id,

          phase:
            "ACQUIRE",

          outcome:
            "FAILED",

          reason:
            errorMessage(
              error
            )
        });
      }
    }


    throw new NoAcquisitionBackendError(
      attempts
    );
  }
}
