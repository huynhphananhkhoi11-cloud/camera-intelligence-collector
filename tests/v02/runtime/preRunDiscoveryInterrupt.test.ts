import {
  describe,
  expect,
  test
} from "vitest";

import {
  installPreRunDiscoveryInterrupt,
  type SigintTarget
} from "../../../src/v02/runtime/preRunDiscoveryInterrupt.js";


class FakeTarget
  implements SigintTarget {

  private readonly listeners =
    new Set<
      () => void
    >();


  on(
    event:
      "SIGINT",
    listener:
      () => void
  ): this {

    if (
      event ===
        "SIGINT"
    ) {
      this.listeners.add(
        listener
      );
    }

    return this;
  }


  off(
    event:
      "SIGINT",
    listener:
      () => void
  ): this {

    if (
      event ===
        "SIGINT"
    ) {
      this.listeners.delete(
        listener
      );
    }

    return this;
  }


  emitSigint():
    void {

    for (
      const listener
      of Array.from(
        this.listeners
      )
    ) {
      listener();
    }
  }
}


describe(
  "pre-run discovery interrupt",
  () => {

    test(
      "Ctrl+C requests cancellation once and becomes observable synchronously",
      async () => {

        const target =
          new FakeTarget();

        let cancellations =
          0;


        const interrupt =
          installPreRunDiscoveryInterrupt(
            target as SigintTarget,
            async () => {

              cancellations++;
            }
          );


        target.emitSigint();

        target.emitSigint();


        expect(
          interrupt.requested()
        ).toBe(
          true
        );


        expect(
          () =>
            interrupt.throwIfRequested()
        ).toThrow(
          /interrupted/i
        );


        await Promise.resolve();
        await Promise.resolve();


        expect(
          cancellations
        ).toBe(
          1
        );


        interrupt.uninstall();
      }
    );


    test(
      "uninstall removes ownership before the persistent run handler takes over",
      async () => {

        const target =
          new FakeTarget();

        let cancellations =
          0;


        const interrupt =
          installPreRunDiscoveryInterrupt(
            target as SigintTarget,
            () => {

              cancellations++;
            }
          );


        interrupt.uninstall();

        interrupt.uninstall();


        target.emitSigint();


        await Promise.resolve();


        expect(
          interrupt.requested()
        ).toBe(
          false
        );


        expect(
          cancellations
        ).toBe(
          0
        );
      }
    );


    test(
      "cancellation rejection is contained by the signal boundary",
      async () => {

        const target =
          new FakeTarget();


        const interrupt =
          installPreRunDiscoveryInterrupt(
            target as SigintTarget,
            async () => {

              throw new Error(
                "close failed"
              );
            }
          );


        target.emitSigint();


        await Promise.resolve();
        await Promise.resolve();


        expect(
          interrupt.requested()
        ).toBe(
          true
        );


        interrupt.uninstall();
      }
    );
  }
);