export interface RuntimeDiagnosticSink {
  log(
    ...values:
      unknown[]
  ): void;

  error(
    ...values:
      unknown[]
  ): void;
}


export interface RuntimeDiagnostics {
  log(
    ...values:
      unknown[]
  ): void;

  error(
    ...values:
      unknown[]
  ): void;
}


const DEFAULT_SINK:
  RuntimeDiagnosticSink = {
    log:
      (...values) => {
        console.log(
          ...values
        );
      },

    error:
      (...values) => {
        console.error(
          ...values
        );
      }
  };


export function createRuntimeDiagnostics(
  enabled:
    boolean,

  sink:
    RuntimeDiagnosticSink =
      DEFAULT_SINK
): RuntimeDiagnostics {

  return {
    log:
      (...values) => {

        if (
          !enabled
        ) {
          return;
        }


        sink.log(
          ...values
        );
      },


    error:
      (...values) => {

        if (
          !enabled
        ) {
          return;
        }


        sink.error(
          ...values
        );
      }
  };
}