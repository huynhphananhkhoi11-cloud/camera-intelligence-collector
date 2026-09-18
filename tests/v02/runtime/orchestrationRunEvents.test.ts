import {
  readFileSync
} from "node:fs";

import {
  resolve
} from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  RunEventBus,
  publishRunEventSafely
} from "../../../src/v02/runtime/runEventBus.ts";


function bootstrapEvent() {

  return {
    type:
      "STAGE_STARTED" as const,

    runId:
      "run-11c3a",

    stage:
      "BOOTSTRAP" as const
  };
}


describe(
  "Phase 11C.3A safe orchestration publishing",
  () => {

    test(
      "subscriber failures are reported without escaping publish",
      () => {

        const failures:
          unknown[] = [];

        const observed:
          string[] = [];


        const bus =
          new RunEventBus({
            now:
              () =>
                "2026-09-18T11:00:00.000Z"
          });


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
          publishRunEventSafely(
            bus,
            bootstrapEvent(),
            error => {
              failures.push(
                error
              );
            }
          );


        expect(
          report
        ).not.toBeNull();


        expect(
          observed
        ).toEqual([
          "STAGE_STARTED"
        ]);


        expect(
          failures
        ).toHaveLength(
          1
        );


        expect(
          failures[0]
        ).toBeInstanceOf(
          Error
        );
      }
    );


    test(
      "event-bus infrastructure failure is converted to null and reported",
      () => {

        const failures:
          unknown[] = [];


        const bus =
          new RunEventBus({
            now:
              () => {
                throw new Error(
                  "clock failed"
                );
              }
          });


        let result:
          unknown;


        expect(
          () => {
            result =
              publishRunEventSafely(
                bus,
                bootstrapEvent(),
                error => {
                  failures.push(
                    error
                  );
                }
              );
          }
        ).not.toThrow();


        expect(
          result
        ).toBeNull();


        expect(
          failures
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "error callback failure is itself isolated",
      () => {

        const bus =
          new RunEventBus({
            now:
              () => {
                throw new Error(
                  "event infra failed"
                );
              }
          });


        expect(
          () =>
            publishRunEventSafely(
              bus,
              bootstrapEvent(),
              () => {
                throw new Error(
                  "diagnostic sink failed"
                );
              }
            )
        ).not.toThrow();
      }
    );
  }
);


describe(
  "Phase 11C.3A collectV2 shared event wiring",
  () => {

    const source =
      readFileSync(
        resolve(
          process.cwd(),
          "src/v02/cli/collectV2.ts"
        ),
        "utf8"
      );


    test(
      "collectV2 exposes an injectable orchestration event seam",
      () => {

        expect(
          source
        ).toContain(
          "CollectV2RuntimeOptions"
        );


        expect(
          source
        ).toContain(
          "runtimeOptions:"
        );


        expect(
          source
        ).toContain(
          "runtimeOptions.eventBus"
        );


        expect(
          source
        ).toContain(
          "publishRunEventSafely"
        );
      }
    );


    test(
      "the same RunEventBus instance is injected into RunCoordinator",
      () => {

        const busIndex =
          source.indexOf(
            "const eventBus ="
          );

        const coordinatorIndex =
          source.indexOf(
            "new RunCoordinator("
          );


        expect(
          busIndex
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          coordinatorIndex
        ).toBeGreaterThan(
          busIndex
        );


        expect(
          source
        ).toContain(
          "eventBus,"
        );


        expect(
          source
        ).toContain(
          "onEventError"
        );
      }
    );


    test(
      "RUN_STARTED is emitted only after durable new/resume establishment",
      () => {

        const resumeIndex =
          source.indexOf(
            "coordinator.resumeRun("
          );

        const newRunIndex =
          source.indexOf(
            "coordinator.startNewRun({"
          );

        const startedEventIndex =
          source.indexOf(
            '"RUN_STARTED"'
          );

        const bannerIndex =
          source.indexOf(
            '"=== CAMERA INTELLIGENCE COLLECTOR v0.2 ==="'
          );


        expect(
          startedEventIndex
        ).toBeGreaterThan(
          resumeIndex
        );


        expect(
          startedEventIndex
        ).toBeGreaterThan(
          newRunIndex
        );


        expect(
          bannerIndex
        ).toBeGreaterThan(
          startedEventIndex
        );
      }
    );


    test(
      "RUN_STARTED captures truthful current orchestration options",
      () => {

        expect(
          source
        ).toContain(
          "inputUrl:"
        );


        expect(
          source
        ).toContain(
          "headless:"
        );


        expect(
          source
        ).toContain(
          "workers:"
        );


        expect(
          source
        ).toContain(
          "fresh:"
        );


        expect(
          source
        ).toContain(
          "outputPath:"
        );
      }
    );


    test(
      "11C.3A does not fabricate pre-persistence discovery events",
      () => {

        expect(
          source
        ).not.toContain(
          '"ROOT_FOUND"'
        );


        expect(
          source
        ).not.toContain(
          '"PRODUCT_DISCOVERED"'
        );
      }
    );
  }
);