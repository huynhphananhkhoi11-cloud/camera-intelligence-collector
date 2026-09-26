export const MAX_BROWSER_WORKERS =
  8;


export interface BrowserObserverPolicyOptions {
  readonly headless:
    boolean;

  readonly requestedWorkers:
    number;
}


export interface BrowserObserverPolicySnapshot {
  readonly headless:
    boolean;

  readonly workerCount:
    number;

  readonly observerWorkerId:
    1;

  readonly focusClaimed:
    boolean;
}


export function normalizeWorkerCount(
  requestedWorkers:
    number
): number {

  if (
    !Number.isFinite(
      requestedWorkers
    )
  ) {
    return 1;
  }


  const integer =
    Math.trunc(
      requestedWorkers
    );


  return Math.max(
    1,
    Math.min(
      integer,
      MAX_BROWSER_WORKERS
    )
  );
}


export class BrowserObserverPolicy {
  readonly headless:
    boolean;

  readonly workerCount:
    number;

  readonly observerWorkerId =
    1 as const;


  private focusClaimed =
    false;


  constructor(
    options:
      BrowserObserverPolicyOptions
  ) {

    this.headless =
      options.headless;

    this.workerCount =
      normalizeWorkerCount(
        options.requestedWorkers
      );
  }


  workerIds():
    readonly number[] {

    return Object.freeze(
      Array.from(
        {
          length:
            this.workerCount
        },

        (
          _,
          index
        ) =>
          index +
          1
      )
    );
  }


  isObserverWorker(
    workerId:
      number
  ): boolean {

    return (
      Number.isInteger(
        workerId
      ) &&
      workerId ===
        this.observerWorkerId
    );
  }


  claimInitialFocus(
    workerId:
      number
  ): boolean {

    if (
      this.headless ||
      this.focusClaimed ||
      !this.isObserverWorker(
        workerId
      )
    ) {
      return false;
    }


    this.focusClaimed =
      true;


    return true;
  }


  snapshot():
    BrowserObserverPolicySnapshot {

    return Object.freeze({
      headless:
        this.headless,

      workerCount:
        this.workerCount,

      observerWorkerId:
        this.observerWorkerId,

      focusClaimed:
        this.focusClaimed
    });
  }
}