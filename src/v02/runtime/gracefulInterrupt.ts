import type {
  InterruptResult,
  RunCoordinator
} from "./runCoordinator.js";


export interface SigintHost {
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


export interface GracefulInterruptOptions {
  onInterrupt?:
    (
      result:
        InterruptResult
    ) => void;

  onError?:
    (
      error:
        unknown
    ) => void;
}


export type UninstallSignalHandler =
  () => void;


/**
 * Install a synchronous SIGINT bridge.
 *
 * Important:
 * - it does NOT call process.exit();
 * - it does NOT close browser/store itself;
 * - it only requests persisted interruption through RunCoordinator;
 * - outer CLI finally blocks remain responsible for cleanup.
 *
 * This prevents Ctrl+C from bypassing the persistent lifecycle.
 */
export function installGracefulInterrupt(
  host:
    SigintHost,
  coordinator:
    RunCoordinator,
  options:
    GracefulInterruptOptions = {}
): UninstallSignalHandler {
  let installed =
    true;


  const handler =
    (): void => {
      try {
        const result =
          coordinator.interruptActiveRun();

        options.onInterrupt?.(
          result
        );
      }
      catch (error) {
        if (
          options.onError
        ) {
          options.onError(
            error
          );

          return;
        }

        throw error;
      }
    };


  host.on(
    "SIGINT",
    handler
  );


  return () => {
    if (
      !installed
    ) {
      return;
    }

    installed =
      false;

    host.off(
      "SIGINT",
      handler
    );
  };
}