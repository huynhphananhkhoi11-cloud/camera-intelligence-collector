import type {
  BrowserObserverPolicy
} from "./observerPolicy.js";


export interface FocusableClosablePage {
  bringToFront():
    Promise<void>;

  close():
    Promise<void>;
}


export interface WorkerPageContext<
  TPage extends
    FocusableClosablePage
> {
  newPage():
    Promise<TPage>;
}


export interface PreparedWorkerPage<
  TPage extends
    FocusableClosablePage
> {
  readonly workerId:
    number;

  readonly page:
    TPage;

  readonly observer:
    boolean;
}


export interface PrepareWorkerPagesOptions {
  readonly onFocusError?:
    (
      error:
        unknown
    ) =>
      void;
}


function reportFocusError(
  handler:
    PrepareWorkerPagesOptions[
      "onFocusError"
    ],

  error:
    unknown
): void {

  if (
    handler ===
      undefined
  ) {
    return;
  }


  try {

    handler(
      error
    );
  }
  catch {

    /*
     * Foreground visibility is UX-only.
     * A failing diagnostic sink cannot alter acquisition truth.
     */
  }
}


async function cleanupPreparedPages<
  TPage extends
    FocusableClosablePage
>(
  prepared:
    readonly PreparedWorkerPage<TPage>[],

  originalError:
    unknown
): Promise<never> {

  const cleanupErrors:
    unknown[] = [];


  for (
    const slot
    of [
      ...prepared
    ].reverse()
  ) {

    try {

      await slot.page.close();
    }
    catch (
      error
    ) {

      cleanupErrors.push(
        error
      );
    }
  }


  if (
    cleanupErrors.length >
      0
  ) {

    throw new AggregateError(
      [
        originalError,
        ...cleanupErrors
      ],
      "Worker page preparation failed and cleanup also failed."
    );
  }


  throw originalError;
}


export async function prepareWorkerPages<
  TPage extends
    FocusableClosablePage
>(
  context:
    WorkerPageContext<TPage>,

  policy:
    BrowserObserverPolicy,

  options:
    PrepareWorkerPagesOptions = {}
): Promise<
  readonly PreparedWorkerPage<TPage>[]
> {

  const prepared:
    PreparedWorkerPage<TPage>[] =
      [];


  try {

    for (
      const workerId
      of policy.workerIds()
    ) {

      const page =
        await context.newPage();


      prepared.push({
        workerId,

        page,

        observer:
          policy.isObserverWorker(
            workerId
          )
      });
    }
  }
  catch (
    error
  ) {

    return cleanupPreparedPages(
      prepared,
      error
    );
  }


  const observer =
    prepared.find(
      slot =>
        slot.observer
    );


  if (
    observer !==
      undefined &&
    policy.claimInitialFocus(
      observer.workerId
    )
  ) {

    try {

      /*
       * Important ordering invariant:
       * every worker page already exists before the only explicit
       * foreground operation occurs.
       */
      await observer.page
        .bringToFront();
    }
    catch (
      error
    ) {

      /*
       * Browser focusing is presentation-only.
       * Never fail or retry the data collection run because of it.
       */
      reportFocusError(
        options.onFocusError,
        error
      );
    }
  }


  return Object.freeze(
    prepared.map(
      slot =>
        Object.freeze({
          ...slot
        })
    )
  );
}