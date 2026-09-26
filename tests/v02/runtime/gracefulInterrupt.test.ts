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
  installGracefulInterrupt,
  type SigintHost
} from "../../../src/v02/runtime/gracefulInterrupt.ts";

import {
  RunCoordinator
} from "../../../src/v02/runtime/runCoordinator.ts";


const NOW =
  "2026-09-18T10:00:00.000Z";


class FakeSigintHost
implements SigintHost {

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


  listenerCount():
    number {
    return this.listeners.size;
  }
}


function tempDatabase() {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-phase10i2-"
      )
    );

  return {
    directory,

    path:
      join(
        directory,
        "runtime.sqlite"
      ),

    cleanup:
      () => {
        rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true
          }
        );
      }
  };
}


function coordinator(
  path:
    string
): RunCoordinator {
  return new RunCoordinator(
    path,
    {
      now:
        () =>
          NOW
    }
  );
}


function startRun(
  runtime:
    RunCoordinator,
  runId:
    string
): void {
  runtime.startNewRun({
    run: {
      runId,

      inputUrl:
        "https://example.com",

      canonicalOrigin:
        "https://example.com",

      startedAt:
        "2026-09-18T09:55:00.000Z",

      codeVersion:
        "1e133d8",

      configHash:
        "cfg-phase10i2"
    },

    productUrls: [
      {
        canonicalUrl:
          "https://example.com/p/a",

        discoveryScore:
          90,

        sourcesJson:
          "[]"
      },
      {
        canonicalUrl:
          "https://example.com/p/b",

        discoveryScore:
          80,

        sourcesJson:
          "[]"
      }
    ]
  });
}


describe(
  "Phase 10I.2 graceful SIGINT bridge",
  () => {

    test(
      "SIGINT marks active run INTERRUPTED without process exit",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        const host =
          new FakeSigintHost();

        const results:
          Array<{
            interrupted:
              boolean;

            status:
              string |
              null;
          }> = [];


        const uninstall =
          installGracefulInterrupt(
            host,
            runtime,
            {
              onInterrupt:
                result => {
                  results.push({
                    interrupted:
                      result.interrupted,

                    status:
                      result.status
                  });
                }
            }
          );


        try {
          startRun(
            runtime,
            "run-sigint"
          );


          host.emitSigint();


          expect(
            runtime.getActiveRun()
          ).toMatchObject({
            runId:
              "run-sigint",

            status:
              "INTERRUPTED"
          });


          expect(
            runtime.isInterruptionRequested()
          ).toBe(
            true
          );


          expect(
            results
          ).toEqual([
            {
              interrupted:
                true,

              status:
                "INTERRUPTED"
            }
          ]);
        }
        finally {
          uninstall();
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "second SIGINT is idempotent at persistent lifecycle boundary",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        const host =
          new FakeSigintHost();

        const interrupted:
          boolean[] = [];


        const uninstall =
          installGracefulInterrupt(
            host,
            runtime,
            {
              onInterrupt:
                result => {
                  interrupted.push(
                    result.interrupted
                  );
                }
            }
          );


        try {
          startRun(
            runtime,
            "run-double-sigint"
          );

          host.emitSigint();
          host.emitSigint();


          expect(
            interrupted
          ).toEqual([
            true,
            false
          ]);


          expect(
            runtime.getActiveRun()
              ?.status
          ).toBe(
            "INTERRUPTED"
          );
        }
        finally {
          uninstall();
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "SIGINT with no active run is harmless",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        const host =
          new FakeSigintHost();

        const results:
          unknown[] = [];


        const uninstall =
          installGracefulInterrupt(
            host,
            runtime,
            {
              onInterrupt:
                result => {
                  results.push(
                    result
                  );
                }
            }
          );


        try {
          expect(
            () =>
              host.emitSigint()
          ).not.toThrow();


          expect(
            results
          ).toEqual([
            {
              runId:
                null,

              interrupted:
                false,

              status:
                null
            }
          ]);
        }
        finally {
          uninstall();
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "uninstall removes signal handler",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        const host =
          new FakeSigintHost();


        try {
          const uninstall =
            installGracefulInterrupt(
              host,
              runtime
            );


          expect(
            host.listenerCount()
          ).toBe(
            1
          );


          uninstall();


          expect(
            host.listenerCount()
          ).toBe(
            0
          );


          expect(
            () =>
              uninstall()
          ).not.toThrow();


          host.emitSigint();


          expect(
            runtime.getActiveRun()
          ).toBeNull();
        }
        finally {
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "SIGINT preserves stale IN_PROGRESS so resume recovery can requeue it",
      () => {
        const temp =
          tempDatabase();

        const first =
          coordinator(
            temp.path
          );

        const host =
          new FakeSigintHost();

        const uninstall =
          installGracefulInterrupt(
            host,
            first
          );


        try {
          startRun(
            first,
            "run-sigint-resume"
          );


          first.beginProduct(
            "https://example.com/p/a"
          );


          host.emitSigint();


          expect(
            first.getActiveRun()
              ?.status
          ).toBe(
            "INTERRUPTED"
          );
        }
        finally {
          uninstall();
          first.close();
        }


        const resumed =
          coordinator(
            temp.path
          );

        try {
          const plan =
            resumed.resumeRun(
              "run-sigint-resume"
            );


          expect(
            plan.recoveredInProgress
          ).toBe(
            1
          );


          expect(
            plan.queuedUrls
          ).toEqual([
            "https://example.com/p/a",
            "https://example.com/p/b"
          ]);


          expect(
            resumed.getActiveRun()
              ?.status
          ).toBe(
            "RUNNING"
          );
        }
        finally {
          resumed.close();
          temp.cleanup();
        }
      }
    );


    test(
      "signal handler reports coordinator failures through onError",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        const host =
          new FakeSigintHost();

        const errors:
          unknown[] = [];


        const uninstall =
          installGracefulInterrupt(
            host,
            runtime,
            {
              onError:
                error => {
                  errors.push(
                    error
                  );
                }
            }
          );


        try {
          runtime.close();


          expect(
            () =>
              host.emitSigint()
          ).not.toThrow();


          expect(
            errors
          ).toHaveLength(
            1
          );


          expect(
            String(
              errors[0]
            )
          ).toMatch(
            /closed/i
          );
        }
        finally {
          uninstall();

          try {
            runtime.close();
          }
          finally {
            temp.cleanup();
          }
        }
      }
    );
  }
);