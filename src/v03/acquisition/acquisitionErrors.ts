import type {
  AcquisitionAttempt
} from "./acquisitionTypes.js";


export class NoAcquisitionBackendError
  extends Error {

  readonly attempts:
    readonly AcquisitionAttempt[];


  constructor(
    attempts:
      readonly AcquisitionAttempt[]
  ) {
    super(
      "No acquisition backend completed successfully."
    );

    this.name =
      "NoAcquisitionBackendError";

    this.attempts =
      [
        ...attempts
      ];
  }
}
