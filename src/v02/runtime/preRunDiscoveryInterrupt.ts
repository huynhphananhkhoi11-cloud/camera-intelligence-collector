export interface SigintTarget {
  on(
    event:
      "SIGINT",
    listener:
      () => void
  ): unknown;

  off(
    event:
      "SIGINT",
    listener:
      () => void
  ): unknown;
}


export interface PreRunDiscoveryInterrupt {
  requested:
    () => boolean;

  throwIfRequested:
    () => void;

  uninstall:
    () => void;
}


export function installPreRunDiscoveryInterrupt(
  target:
    SigintTarget,
  cancelActiveWork:
    () =>
      void |
      Promise<void>
): PreRunDiscoveryInterrupt {

  let requested =
    false;

  let installed =
    true;


  const handler =
    (): void => {

      if (
        requested
      ) {
        return;
      }


      requested =
        true;


      /*
       * Cancellation is best-effort.
       *
       * The signal handler must never create an unhandled rejection
       * while the caller is unwinding Playwright work.
       */
      void Promise.resolve()
        .then(
          () =>
            cancelActiveWork()
        )
        .catch(
          () => undefined
        );
    };


  target.on(
    "SIGINT",
    handler
  );


  return {
    requested:
      () =>
        requested,

    throwIfRequested:
      (): void => {

        if (
          requested
        ) {
          throw new Error(
            "Product discovery interrupted by Ctrl+C."
          );
        }
      },

    uninstall:
      (): void => {

        if (
          !installed
        ) {
          return;
        }


        installed =
          false;


        target.off(
          "SIGINT",
          handler
        );
      }
  };
}