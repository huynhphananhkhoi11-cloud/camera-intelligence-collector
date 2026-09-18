import {
  describe,
  expect,
  test
} from "vitest";

import {
  BrowserObserverPolicy
} from "../../../src/v02/browser/observerPolicy.ts";

import {
  prepareWorkerPages
} from "../../../src/v02/browser/workerPagePool.ts";


class FakePage {
  constructor(
    readonly id:
      number,

    private readonly log:
      string[],

    private readonly failFocus =
      false,

    private readonly failClose =
      false
  ) {
  }


  async bringToFront():
    Promise<void> {

    this.log.push(
      `focus:${this.id}`
    );


    if (
      this.failFocus
    ) {
      throw new Error(
        `focus failed:${this.id}`
      );
    }
  }


  async close():
    Promise<void> {

    this.log.push(
      `close:${this.id}`
    );


    if (
      this.failClose
    ) {
      throw new Error(
        `close failed:${this.id}`
      );
    }
  }
}


interface FakeContextOptions {
  readonly failCreateAt?:
    number;

  readonly failFocusAt?:
    number;
}


class FakeContext {
  private created =
    0;


  constructor(
    private readonly log:
      string[],

    private readonly options:
      FakeContextOptions = {}
  ) {
  }


  async newPage():
    Promise<FakePage> {

    this.created +=
      1;


    const id =
      this.created;


    this.log.push(
      `create:${id}`
    );


    if (
      this.options.failCreateAt ===
        id
    ) {
      throw new Error(
        `create failed:${id}`
      );
    }


    return new FakePage(
      id,
      this.log,
      this.options.failFocusAt ===
        id
    );
  }
}


describe(
  "Phase 11E.2 prepareWorkerPages",
  () => {

    test(
      "creates every worker page sequentially before focusing worker 1",
      async () => {

        const log:
          string[] = [];


        const policy =
          new BrowserObserverPolicy({
            headless:
              false,

            requestedWorkers:
              3
          });


        const prepared =
          await prepareWorkerPages(
            new FakeContext(
              log
            ),
            policy
          );


        expect(
          log
        ).toEqual([
          "create:1",
          "create:2",
          "create:3",
          "focus:1"
        ]);


        expect(
          prepared.map(
            slot =>
              slot.workerId
          )
        ).toEqual([
          1,
          2,
          3
        ]);


        expect(
          prepared.map(
            slot =>
              slot.observer
          )
        ).toEqual([
          true,
          false,
          false
        ]);


        expect(
          policy.snapshot()
            .focusClaimed
        ).toBe(
          true
        );
      }
    );


    test(
      "headless mode prepares pages without any focus call",
      async () => {

        const log:
          string[] = [];


        const policy =
          new BrowserObserverPolicy({
            headless:
              true,

            requestedWorkers:
              3
          });


        const prepared =
          await prepareWorkerPages(
            new FakeContext(
              log
            ),
            policy
          );


        expect(
          prepared
        ).toHaveLength(
          3
        );


        expect(
          log
        ).toEqual([
          "create:1",
          "create:2",
          "create:3"
        ]);


        expect(
          policy.snapshot()
            .focusClaimed
        ).toBe(
          false
        );
      }
    );


    test(
      "observer focus failure is non-fatal and reported once",
      async () => {

        const log:
          string[] = [];

        const focusErrors:
          unknown[] = [];


        const policy =
          new BrowserObserverPolicy({
            headless:
              false,

            requestedWorkers:
              3
          });


        const prepared =
          await prepareWorkerPages(
            new FakeContext(
              log,
              {
                failFocusAt:
                  1
              }
            ),
            policy,
            {
              onFocusError:
                error => {
                  focusErrors.push(
                    error
                  );
                }
            }
          );


        expect(
          prepared
        ).toHaveLength(
          3
        );


        expect(
          log
        ).toEqual([
          "create:1",
          "create:2",
          "create:3",
          "focus:1"
        ]);


        expect(
          focusErrors
        ).toHaveLength(
          1
        );


        expect(
          focusErrors[0]
        ).toBeInstanceOf(
          Error
        );


        expect(
          policy.snapshot()
            .focusClaimed
        ).toBe(
          true
        );


        /*
         * A failed bringToFront is still a consumed one-shot
         * focus attempt. Never flicker/retry during detail URLs.
         */
        expect(
          policy.claimInitialFocus(
            1
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "focus diagnostic callback failure is isolated",
      async () => {

        const log:
          string[] = [];


        const policy =
          new BrowserObserverPolicy({
            headless:
              false,

            requestedWorkers:
              2
          });


        await expect(
          prepareWorkerPages(
            new FakeContext(
              log,
              {
                failFocusAt:
                  1
              }
            ),
            policy,
            {
              onFocusError:
                () => {
                  throw new Error(
                    "diagnostic sink failed"
                  );
                }
            }
          )
        ).resolves.toHaveLength(
          2
        );
      }
    );


    test(
      "page creation failure closes already-created pages in reverse order",
      async () => {

        const log:
          string[] = [];


        const policy =
          new BrowserObserverPolicy({
            headless:
              false,

            requestedWorkers:
              4
          });


        await expect(
          prepareWorkerPages(
            new FakeContext(
              log,
              {
                failCreateAt:
                  3
              }
            ),
            policy
          )
        ).rejects.toThrow(
          "create failed:3"
        );


        expect(
          log
        ).toEqual([
          "create:1",
          "create:2",
          "create:3",
          "close:2",
          "close:1"
        ]);


        expect(
          policy.snapshot()
            .focusClaimed
        ).toBe(
          false
        );
      }
    );


    test(
      "prepared worker slots are immutable snapshots",
      async () => {

        const policy =
          new BrowserObserverPolicy({
            headless:
              true,

            requestedWorkers:
              2
          });


        const prepared =
          await prepareWorkerPages(
            new FakeContext(
              []
            ),
            policy
          );


        expect(
          Object.isFrozen(
            prepared
          )
        ).toBe(
          true
        );


        expect(
          prepared.every(
            slot =>
              Object.isFrozen(
                slot
              )
          )
        ).toBe(
          true
        );
      }
    );
  }
);