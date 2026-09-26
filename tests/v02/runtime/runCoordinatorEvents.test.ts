import {
  mkdtempSync,
  rmSync
} from "node:fs";

import {
  join
} from "node:path";

import {
  tmpdir
} from "node:os";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  RunCoordinator
} from "../../../src/v02/runtime/runCoordinator.ts";

import {
  RunEventBus,
  type RunEvent
} from "../../../src/v02/runtime/runEventBus.ts";


const STORE_NOW =
  "2026-09-18T10:30:00.000Z";

const EVENT_NOW =
  "2026-09-18T10:30:01.000Z";


function tempDatabase() {

  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-11c2-"
      )
    );


  return {
    path:
      join(
        directory,
        "state.sqlite"
      ),

    cleanup:
      () =>
        rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true
          }
        )
  };
}


function coordinator(
  databasePath:
    string,
  eventBus:
    RunEventBus,
  onEventError?:
    (
      error:
        unknown
    ) =>
      void
): RunCoordinator {

  /*
   * Cast is intentional for RED:
   * pre-11C.2 RunCoordinatorOptions does not yet expose
   * eventBus/onEventError, but JavaScript accepts the object.
   */
  return new RunCoordinator(
    databasePath,
    {
      now:
        () =>
          STORE_NOW,

      eventBus,

      onEventError
    } as never
  );
}


function startRun(
  runtime:
    RunCoordinator,
  runId:
    string,
  count:
    1 |
    2 =
      2
): void {

  const urls =
    [
      "https://example.com/p/a",
      "https://example.com/p/b"
    ].slice(
      0,
      count
    );


  runtime.startNewRun({
    run: {
      runId,

      inputUrl:
        "https://example.com/catalog",

      canonicalOrigin:
        "https://example.com",

      startedAt:
        STORE_NOW,

      codeVersion:
        "phase11c2-test",

      configHash:
        "cfg-phase11c2"
    },

    productUrls:
      urls.map(
        (
          canonicalUrl,
          index
        ) => ({
          canonicalUrl,

          discoveryScore:
            100 -
            index,

          sourcesJson:
            "[]"
        })
      )
  });
}


function collector() {

  const events:
    RunEvent[] = [];


  const bus =
    new RunEventBus({
      now:
        () =>
          EVENT_NOW
    });


  bus.subscribe(
    event => {
      events.push(
        event
      );
    }
  );


  return {
    bus,
    events
  };
}


describe(
  "Phase 11C.2 RunCoordinator event integration",
  () => {

    test(
      "new run emits committed initial counters",
      () => {

        const temp =
          tempDatabase();

        const {
          bus,
          events
        } =
          collector();


        let runtime:
          RunCoordinator |
          null =
            null;

        let statusObservedDuringEvent:
          string |
          null =
            null;


        bus.subscribe(
          event => {

            if (
              event.type ===
                "COUNTERS_UPDATED"
            ) {
              statusObservedDuringEvent =
                runtime
                  ?.getActiveRun()
                  ?.status ??
                null;
            }
          }
        );


        runtime =
          coordinator(
            temp.path,
            bus
          );


        try {

          startRun(
            runtime,
            "run-11c2-start"
          );


          expect(
            events.map(
              event =>
                event.type
            )
          ).toEqual([
            "COUNTERS_UPDATED"
          ]);


          const event =
            events[0]!;


          expect(
            event.type
          ).toBe(
            "COUNTERS_UPDATED"
          );


          if (
            event.type !==
              "COUNTERS_UPDATED"
          ) {
            throw new Error(
              "Expected COUNTERS_UPDATED."
            );
          }


          expect(
            event.counters
          ).toEqual({
            accept:
              0,

            review:
              0,

            exclude:
              0,

            error:
              0,

            /*
             * UX outstanding =
             * persistent DISCOVERED + IN_PROGRESS.
             */
            inProgress:
              2,

            total:
              2
          });


          /*
           * This proves emission happened AFTER startRun()
           * persisted RUNNING state.
           */
          expect(
            statusObservedDuringEvent
          ).toBe(
            "RUNNING"
          );
        }
        finally {

          runtime.close();

          temp.cleanup();
        }
      }
    );


    test(
      "terminal product transitions emit persisted terminal counters",
      () => {

        const temp =
          tempDatabase();

        const {
          bus,
          events
        } =
          collector();

        const runtime =
          coordinator(
            temp.path,
            bus
          );


        try {

          startRun(
            runtime,
            "run-11c2-counters"
          );


          events.length =
            0;


          runtime.beginProduct(
            "https://example.com/p/a"
          );

          runtime.terminalizeProduct(
            "https://example.com/p/a",
            "ACCEPT"
          );


          runtime.beginProduct(
            "https://example.com/p/b"
          );

          runtime.terminalizeProduct(
            "https://example.com/p/b",
            "REVIEW"
          );


          const counters =
            events.filter(
              event =>
                event.type ===
                "COUNTERS_UPDATED"
            );


          expect(
            counters
          ).toHaveLength(
            2
          );


          const first =
            counters[0]!;

          const second =
            counters[1]!;


          if (
            first.type !==
              "COUNTERS_UPDATED" ||
            second.type !==
              "COUNTERS_UPDATED"
          ) {
            throw new Error(
              "Unexpected event type."
            );
          }


          expect(
            first.counters
          ).toEqual({
            accept:
              1,

            review:
              0,

            exclude:
              0,

            error:
              0,

            inProgress:
              1,

            total:
              2
          });


          expect(
            second.counters
          ).toEqual({
            accept:
              1,

            review:
              1,

            exclude:
              0,

            error:
              0,

            inProgress:
              0,

            total:
              2
          });
        }
        finally {

          runtime.close();

          temp.cleanup();
        }
      }
    );


    test(
      "explicit reconciliation emits the persisted reconciliation snapshot",
      () => {

        const temp =
          tempDatabase();

        const {
          bus,
          events
        } =
          collector();

        const runtime =
          coordinator(
            temp.path,
            bus
          );


        try {

          startRun(
            runtime,
            "run-11c2-reconcile"
          );


          runtime.beginProduct(
            "https://example.com/p/a"
          );

          runtime.terminalizeProduct(
            "https://example.com/p/a",
            "ACCEPT"
          );


          runtime.beginProduct(
            "https://example.com/p/b"
          );

          runtime.terminalizeProduct(
            "https://example.com/p/b",
            "REVIEW"
          );


          events.length =
            0;


          const report =
            runtime.reconciliation();


          expect(
            report.complete
          ).toBe(
            true
          );


          expect(
            events
          ).toHaveLength(
            1
          );


          const event =
            events[0]!;


          expect(
            event.type
          ).toBe(
            "RECONCILIATION_COMPLETED"
          );


          if (
            event.type !==
              "RECONCILIATION_COMPLETED"
          ) {
            throw new Error(
              "Expected reconciliation event."
            );
          }


          expect(
            event.report
          ).toEqual({
            discovered:
              2,

            accept:
              1,

            review:
              1,

            exclude:
              0,

            error:
              0,

            inProgress:
              0,

            balanced:
              true
          });
        }
        finally {

          runtime.close();

          temp.cleanup();
        }
      }
    );


    test(
      "finalization publishes RUN_COMPLETED only after persisted completion",
      () => {

        const temp =
          tempDatabase();

        const {
          bus,
          events
        } =
          collector();

        let runtime:
          RunCoordinator |
          null =
            null;

        let persistedStatusDuringEvent:
          string |
          null =
            null;


        bus.subscribe(
          event => {

            if (
              event.type ===
                "RUN_COMPLETED"
            ) {
              persistedStatusDuringEvent =
                runtime
                  ?.getActiveRun()
                  ?.status ??
                null;
            }
          }
        );


        runtime =
          coordinator(
            temp.path,
            bus
          );


        try {

          startRun(
            runtime,
            "run-11c2-complete",
            1
          );


          runtime.beginProduct(
            "https://example.com/p/a"
          );

          runtime.terminalizeProduct(
            "https://example.com/p/a",
            "ACCEPT"
          );


          events.length =
            0;


          const finalized =
            runtime.finalizeRun();


          expect(
            finalized.status
          ).toBe(
            "COMPLETED"
          );


          expect(
            persistedStatusDuringEvent
          ).toBe(
            "COMPLETED"
          );


          const completed =
            events.filter(
              event =>
                event.type ===
                "RUN_COMPLETED"
            );


          expect(
            completed
          ).toHaveLength(
            1
          );


          const event =
            completed[0]!;


          if (
            event.type !==
              "RUN_COMPLETED"
          ) {
            throw new Error(
              "Expected RUN_COMPLETED."
            );
          }


          expect(
            event.status
          ).toBe(
            "COMPLETED"
          );


          expect(
            event.summary
          ).toEqual({
            accept:
              1,

            review:
              0,

            exclude:
              0,

            error:
              0,

            inProgress:
              0,

            total:
              1
          });
        }
        finally {

          runtime.close();

          temp.cleanup();
        }
      }
    );


    test(
      "completed-with-errors lifecycle is represented truthfully",
      () => {

        const temp =
          tempDatabase();

        const {
          bus,
          events
        } =
          collector();

        const runtime =
          coordinator(
            temp.path,
            bus
          );


        try {

          startRun(
            runtime,
            "run-11c2-errors",
            1
          );


          runtime.beginProduct(
            "https://example.com/p/a"
          );

          runtime.terminalizeProduct(
            "https://example.com/p/a",
            "ERROR"
          );


          events.length =
            0;


          const finalized =
            runtime.finalizeRun();


          expect(
            finalized.status
          ).toBe(
            "COMPLETED_WITH_ERRORS"
          );


          expect(
            events
          ).toHaveLength(
            1
          );


          const event =
            events[0]!;


          expect(
            event.type
          ).toBe(
            "RUN_COMPLETED"
          );


          if (
            event.type !==
              "RUN_COMPLETED"
          ) {
            throw new Error(
              "Expected RUN_COMPLETED."
            );
          }


          expect(
            event.status
          ).toBe(
            "COMPLETED_WITH_ERRORS"
          );


          expect(
            event.summary.error
          ).toBe(
            1
          );
        }
        finally {

          runtime.close();

          temp.cleanup();
        }
      }
    );


    test(
      "interruption emits exactly once and only after persisted transition",
      () => {

        const temp =
          tempDatabase();

        const {
          bus,
          events
        } =
          collector();

        let runtime:
          RunCoordinator |
          null =
            null;

        let persistedStatusDuringEvent:
          string |
          null =
            null;


        bus.subscribe(
          event => {

            if (
              event.type ===
                "RUN_INTERRUPTED"
            ) {
              persistedStatusDuringEvent =
                runtime
                  ?.getActiveRun()
                  ?.status ??
                null;
            }
          }
        );


        runtime =
          coordinator(
            temp.path,
            bus
          );


        try {

          startRun(
            runtime,
            "run-11c2-interrupt"
          );


          runtime.beginProduct(
            "https://example.com/p/a"
          );


          events.length =
            0;


          const first =
            runtime.interruptActiveRun();

          const second =
            runtime.interruptActiveRun();


          expect(
            first
          ).toMatchObject({
            interrupted:
              true,

            status:
              "INTERRUPTED"
          });


          expect(
            second
          ).toMatchObject({
            interrupted:
              false,

            status:
              "INTERRUPTED"
          });


          const interrupts =
            events.filter(
              event =>
                event.type ===
                "RUN_INTERRUPTED"
            );


          expect(
            interrupts
          ).toHaveLength(
            1
          );


          const event =
            interrupts[0]!;


          if (
            event.type !==
              "RUN_INTERRUPTED"
          ) {
            throw new Error(
              "Expected RUN_INTERRUPTED."
            );
          }


          expect(
            event.remaining
          ).toBe(
            2
          );


          expect(
            persistedStatusDuringEvent
          ).toBe(
            "INTERRUPTED"
          );


          expect(
            () =>
              runtime
                ?.beginProduct(
                  "https://example.com/p/b"
                )
          ).toThrow(
            /interruption|cancellation/i
          );
        }
        finally {

          runtime.close();

          temp.cleanup();
        }
      }
    );


    test(
      "failing subscriber never rolls back persisted lifecycle",
      () => {

        const temp =
          tempDatabase();

        const errors:
          unknown[] = [];

        const observed:
          string[] = [];


        const bus =
          new RunEventBus({
            now:
              () =>
                EVENT_NOW
          });


        bus.subscribe(
          () => {
            throw new Error(
              "renderer exploded"
            );
          }
        );


        bus.subscribe(
          event => {
            observed.push(
              event.type
            );
          }
        );


        const runtime =
          coordinator(
            temp.path,
            bus,
            error => {
              errors.push(
                error
              );
            }
          );


        try {

          expect(
            () =>
              startRun(
                runtime,
                "run-11c2-listener",
                1
              )
          ).not.toThrow();


          expect(
            runtime
              .getActiveRun()
              ?.status
          ).toBe(
            "RUNNING"
          );


          expect(
            () => {
              runtime.beginProduct(
                "https://example.com/p/a"
              );

              runtime.terminalizeProduct(
                "https://example.com/p/a",
                "ACCEPT"
              );
            }
          ).not.toThrow();


          const report =
            runtime.reconciliation();


          expect(
            report.accepted
          ).toBe(
            1
          );


          expect(
            observed
          ).toContain(
            "COUNTERS_UPDATED"
          );


          expect(
            errors.length
          ).toBeGreaterThanOrEqual(
            1
          );
        }
        finally {

          runtime.close();

          temp.cleanup();
        }
      }
    );


    test(
      "event infrastructure failure is non-fatal to persisted run state",
      () => {

        const temp =
          tempDatabase();

        const errors:
          unknown[] = [];


        const brokenBus =
          new RunEventBus({
            now:
              () => {
                throw new Error(
                  "event clock failed"
                );
              }
          });


        const runtime =
          coordinator(
            temp.path,
            brokenBus,
            error => {
              errors.push(
                error
              );
            }
          );


        try {

          expect(
            () =>
              startRun(
                runtime,
                "run-11c2-bus-failure",
                1
              )
          ).not.toThrow();


          expect(
            runtime
              .getActiveRun()
              ?.status
          ).toBe(
            "RUNNING"
          );


          expect(
            errors
          ).toHaveLength(
            1
          );


          expect(
            errors[0]
          ).toBeInstanceOf(
            Error
          );
        }
        finally {

          runtime.close();

          temp.cleanup();
        }
      }
    );
  }
);