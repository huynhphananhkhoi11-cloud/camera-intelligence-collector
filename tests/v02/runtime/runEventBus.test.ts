import {
  describe,
  expect,
  test
} from "vitest";

import {
  RunEventBus,
  type RunEvent,
  type RunEventPayload
} from "../../../src/v02/runtime/runEventBus.ts";


function stage(
  stageName:
    "BOOTSTRAP" |
    "DETAIL_COLLECTION"
): RunEventPayload {

  return {
    type:
      "STAGE_STARTED",

    runId:
      "run-event-test",

    stage:
      stageName
  };
}


describe(
  "RunEventBus",
  () => {

    test(
      "publishes synchronously in subscription order with monotonic sequence",
      () => {

        const times = [
          "2026-09-18T09:00:00.000Z",
          "2026-09-18T09:00:01.000Z"
        ];

        let timeIndex =
          0;


        const bus =
          new RunEventBus({
            now:
              () =>
                times[
                  timeIndex++
                ]!
          });


        const observed:
          string[] = [];


        bus.subscribe(
          event => {
            observed.push(
              `A:${event.sequence}:${event.type}`
            );
          }
        );


        bus.subscribe(
          event => {
            observed.push(
              `B:${event.sequence}:${event.type}`
            );
          }
        );


        const first =
          bus.publish(
            stage(
              "BOOTSTRAP"
            )
          );


        const second =
          bus.publish(
            stage(
              "DETAIL_COLLECTION"
            )
          );


        expect(
          observed
        ).toEqual([
          "A:1:STAGE_STARTED",
          "B:1:STAGE_STARTED",
          "A:2:STAGE_STARTED",
          "B:2:STAGE_STARTED"
        ]);


        expect(
          first.event.sequence
        ).toBe(
          1
        );

        expect(
          first.event.timestamp
        ).toBe(
          times[0]
        );


        expect(
          second.event.sequence
        ).toBe(
          2
        );

        expect(
          second.event.timestamp
        ).toBe(
          times[1]
        );


        expect(
          first.delivered
        ).toBe(
          2
        );

        expect(
          first.failed
        ).toBe(
          0
        );
      }
    );


    test(
      "subscriber failure is isolated and reported without blocking later subscribers",
      () => {

        const bus =
          new RunEventBus({
            now:
              () =>
                "2026-09-18T09:01:00.000Z"
          });


        const observed:
          string[] = [];


        bus.subscribe(
          () => {
            throw new Error(
              "renderer failed"
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


        const report =
          bus.publish(
            stage(
              "BOOTSTRAP"
            )
          );


        expect(
          observed
        ).toEqual([
          "STAGE_STARTED"
        ]);


        expect(
          report.delivered
        ).toBe(
          1
        );

        expect(
          report.failed
        ).toBe(
          1
        );

        expect(
          report.failures
        ).toHaveLength(
          1
        );

        expect(
          report.failures[0]
            ?.listenerIndex
        ).toBe(
          0
        );

        expect(
          report.failures[0]
            ?.error
        ).toBeInstanceOf(
          Error
        );
      }
    );


    test(
      "unsubscribe is idempotent and prevents future delivery",
      () => {

        const bus =
          new RunEventBus();


        let calls =
          0;


        const unsubscribe =
          bus.subscribe(
            () => {
              calls +=
                1;
            }
          );


        bus.publish(
          stage(
            "BOOTSTRAP"
          )
        );


        unsubscribe();
        unsubscribe();


        bus.publish(
          stage(
            "DETAIL_COLLECTION"
          )
        );


        expect(
          calls
        ).toBe(
          1
        );
      }
    );


    test(
      "subscription changes during delivery affect only later events",
      () => {

        const bus =
          new RunEventBus();


        const observed:
          string[] = [];


        let installed =
          false;


        bus.subscribe(
          event => {

            observed.push(
              `FIRST:${event.sequence}`
            );


            if (
              !installed
            ) {
              installed =
                true;

              bus.subscribe(
                later => {
                  observed.push(
                    `LATE:${later.sequence}`
                  );
                }
              );
            }
          }
        );


        bus.publish(
          stage(
            "BOOTSTRAP"
          )
        );


        bus.publish(
          stage(
            "DETAIL_COLLECTION"
          )
        );


        expect(
          observed
        ).toEqual([
          "FIRST:1",
          "FIRST:2",
          "LATE:2"
        ]);
      }
    );


    test(
      "published event is an immutable detached snapshot",
      () => {

        const bus =
          new RunEventBus({
            now:
              () =>
                "2026-09-18T09:02:00.000Z"
          });


        const options = {
          headless:
            false,

          workers:
            3,

          fresh:
            false,

          outputPath:
            null
        };


        const payload:
          RunEventPayload = {
            type:
              "RUN_STARTED",

            runId:
              "run-freeze",

            inputUrl:
              "https://example.com/catalog",

            mode:
              "NEW",

            options
        };


        let received:
          RunEvent |
          null =
            null;


        bus.subscribe(
          event => {
            received =
              event;
          }
        );


        const report =
          bus.publish(
            payload
          );


        options.workers =
          99;


        expect(
          report.event.type
        ).toBe(
          "RUN_STARTED"
        );


        if (
          report.event.type !==
            "RUN_STARTED"
        ) {
          throw new Error(
            "Unexpected event type."
          );
        }


        expect(
          report.event.options
            .workers
        ).toBe(
          3
        );


        expect(
          Object.isFrozen(
            report.event
          )
        ).toBe(
          true
        );


        expect(
          Object.isFrozen(
            report.event.options
          )
        ).toBe(
          true
        );


        expect(
          received
        ).toBe(
          report.event
        );
      }
    );


    test(
      "publishing with no subscribers is valid",
      () => {

        const bus =
          new RunEventBus();


        const report =
          bus.publish(
            stage(
              "BOOTSTRAP"
            )
          );


        expect(
          report.delivered
        ).toBe(
          0
        );

        expect(
          report.failed
        ).toBe(
          0
        );

        expect(
          report.failures
        ).toEqual(
          []
        );
      }
    );
  }
);