import {
  describe,
  expect,
  test
} from "vitest";

import {
  BrowserObserverPolicy,
  MAX_BROWSER_WORKERS,
  normalizeWorkerCount
} from "../../../src/v02/browser/observerPolicy.ts";


describe(
  "Phase 11E.1 BrowserObserverPolicy",
  () => {

    test(
      "normalizes worker count to the locked Phase 11 range",
      () => {

        expect(
          MAX_BROWSER_WORKERS
        ).toBe(
          8
        );


        expect(
          normalizeWorkerCount(
            0
          )
        ).toBe(
          1
        );


        expect(
          normalizeWorkerCount(
            -5
          )
        ).toBe(
          1
        );


        expect(
          normalizeWorkerCount(
            1
          )
        ).toBe(
          1
        );


        expect(
          normalizeWorkerCount(
            3
          )
        ).toBe(
          3
        );


        expect(
          normalizeWorkerCount(
            3.9
          )
        ).toBe(
          3
        );


        expect(
          normalizeWorkerCount(
            99
          )
        ).toBe(
          8
        );


        expect(
          normalizeWorkerCount(
            Number.NaN
          )
        ).toBe(
          1
        );


        expect(
          normalizeWorkerCount(
            Number.POSITIVE_INFINITY
          )
        ).toBe(
          1
        );
      }
    );


    test(
      "assigns deterministic worker IDs and worker 1 as observer",
      () => {

        const policy =
          new BrowserObserverPolicy({
            headless:
              false,

            requestedWorkers:
              3
          });


        expect(
          policy.workerCount
        ).toBe(
          3
        );


        expect(
          policy.observerWorkerId
        ).toBe(
          1
        );


        expect(
          policy.workerIds()
        ).toEqual([
          1,
          2,
          3
        ]);


        expect(
          policy.isObserverWorker(
            1
          )
        ).toBe(
          true
        );


        expect(
          policy.isObserverWorker(
            2
          )
        ).toBe(
          false
        );


        expect(
          policy.isObserverWorker(
            3
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "headed mode grants observer focus exactly once",
      () => {

        const policy =
          new BrowserObserverPolicy({
            headless:
              false,

            requestedWorkers:
              3
          });


        expect(
          policy.claimInitialFocus(
            1
          )
        ).toBe(
          true
        );


        expect(
          policy.claimInitialFocus(
            1
          )
        ).toBe(
          false
        );


        expect(
          policy.snapshot()
            .focusClaimed
        ).toBe(
          true
        );
      }
    );


    test(
      "non-observer focus attempts do not consume observer focus",
      () => {

        const policy =
          new BrowserObserverPolicy({
            headless:
              false,

            requestedWorkers:
              3
          });


        expect(
          policy.claimInitialFocus(
            2
          )
        ).toBe(
          false
        );


        expect(
          policy.snapshot()
            .focusClaimed
        ).toBe(
          false
        );


        expect(
          policy.claimInitialFocus(
            1
          )
        ).toBe(
          true
        );


        expect(
          policy.snapshot()
            .focusClaimed
        ).toBe(
          true
        );
      }
    );


    test(
      "headless mode never grants browser focus",
      () => {

        const policy =
          new BrowserObserverPolicy({
            headless:
              true,

            requestedWorkers:
              3
          });


        expect(
          policy.isObserverWorker(
            1
          )
        ).toBe(
          true
        );


        expect(
          policy.claimInitialFocus(
            1
          )
        ).toBe(
          false
        );


        expect(
          policy.claimInitialFocus(
            1
          )
        ).toBe(
          false
        );


        expect(
          policy.snapshot()
        ).toEqual({
          headless:
            true,

          workerCount:
            3,

          observerWorkerId:
            1,

          focusClaimed:
            false
        });
      }
    );


    test(
      "worker ID snapshots are deterministic and detached",
      () => {

        const policy =
          new BrowserObserverPolicy({
            headless:
              false,

            requestedWorkers:
              4
          });


        const first =
          policy.workerIds();

        const second =
          policy.workerIds();


        expect(
          first
        ).toEqual([
          1,
          2,
          3,
          4
        ]);


        expect(
          second
        ).toEqual([
          1,
          2,
          3,
          4
        ]);


        expect(
          first
        ).not.toBe(
          second
        );


        expect(
          Object.isFrozen(
            first
          )
        ).toBe(
          true
        );


        expect(
          Object.isFrozen(
            second
          )
        ).toBe(
          true
        );
      }
    );
  }
);