import {
  describe,
  expect,
  test
} from "vitest";

import {
  RunReconciliation
} from "../../../src/v02/coverage/runReconciliation.ts";


describe(
  "Phase 9D zero-silent-drop reconciliation core",
  () => {

    test(
      "registers every run-scope URL before crawl as IN_PROGRESS",
      () => {

        const reconciliation =
          new RunReconciliation(
            "run-001",
            [
              "https://example.com/a",
              "https://example.com/b",
              "https://example.com/a"
            ]
          );

        const report =
          reconciliation.report();

        expect(
          report.discovered
        ).toBe(
          2
        );

        expect(
          report.inProgress
        ).toBe(
          2
        );

        expect(
          report.accounted
        ).toBe(
          2
        );

        expect(
          report.balanced
        ).toBe(true);

        expect(
          report.complete
        ).toBe(false);

        expect(
          reconciliation.rows().map(
            row =>
              row.state
          )
        ).toEqual([
          "IN_PROGRESS",
          "IN_PROGRESS"
        ]);
      }
    );


    test(
      "complete run satisfies exact terminal reconciliation invariant",
      () => {

        const reconciliation =
          new RunReconciliation(
            "run-002",
            [
              "https://example.com/accept",
              "https://example.com/review",
              "https://example.com/exclude",
              "https://example.com/error"
            ]
          );

        reconciliation.markDecision(
          "https://example.com/accept",
          "ACCEPT"
        );

        reconciliation.markDecision(
          "https://example.com/review",
          "REVIEW"
        );

        reconciliation.markDecision(
          "https://example.com/exclude",
          "EXCLUDE"
        );

        reconciliation.markError(
          "https://example.com/error",
          {
            stage:
              "DETAIL",

            errorClass:
              "TimeoutError",

            message:
              "navigation timed out",

            attempts:
              2,

            lastStatus:
              null,

            retriable:
              true,

            diagnosticPath:
              null
          }
        );

        const report =
          reconciliation.assertComplete();

        expect(
          report
        ).toMatchObject({
          discovered:
            4,

          accepted:
            1,

          review:
            1,

          excluded:
            1,

          error:
            1,

          inProgress:
            0,

          accounted:
            4,

          balanced:
            true,

          complete:
            true
        });

        expect(
          report.discovered
        ).toBe(
          report.accepted +
          report.review +
          report.excluded +
          report.error
        );
      }
    );


    test(
      "technical ERROR is terminal and preserves Error ledger fields",
      () => {

        const reconciliation =
          new RunReconciliation(
            "run-003",
            [
              "https://example.com/fail"
            ]
          );

        reconciliation.markError(
          "https://example.com/fail",
          {
            stage:
              "DETAIL",

            errorClass:
              "NavigationError",

            message:
              "HTTP navigation failed",

            attempts:
              2,

            lastStatus:
              503,

            retriable:
              true,

            diagnosticPath:
              "output/diagnostics/fail.png"
          }
        );

        expect(
          reconciliation.errorRows()
        ).toEqual([
          {
            runId:
              "run-003",

            url:
              "https://example.com/fail",

            stage:
              "DETAIL",

            errorClass:
              "NavigationError",

            message:
              "HTTP navigation failed",

            attempts:
              2,

            lastStatus:
              503,

            retriable:
              true,

            diagnosticPath:
              "output/diagnostics/fail.png"
          }
        ]);

        expect(
          reconciliation.rows()[0]
            .state
        ).toBe(
          "ERROR"
        );
      }
    );


    test(
      "unknown URL cannot silently enter the terminal counts",
      () => {

        const reconciliation =
          new RunReconciliation(
            "run-004",
            [
              "https://example.com/known"
            ]
          );

        expect(
          () =>
            reconciliation.markDecision(
              "https://example.com/unknown",
              "ACCEPT"
            )
        ).toThrow(
          /not registered/i
        );

        expect(
          reconciliation.report()
        ).toMatchObject({
          discovered:
            1,

          inProgress:
            1,

          accounted:
            1
        });
      }
    );


    test(
      "a URL cannot be terminalized twice",
      () => {

        const reconciliation =
          new RunReconciliation(
            "run-005",
            [
              "https://example.com/a"
            ]
          );

        reconciliation.markDecision(
          "https://example.com/a",
          "ACCEPT"
        );

        expect(
          () =>
            reconciliation.markDecision(
              "https://example.com/a",
              "REVIEW"
            )
        ).toThrow(
          /terminal state/i
        );
      }
    );


    test(
      "assertComplete fails while any discovered URL remains IN_PROGRESS",
      () => {

        const reconciliation =
          new RunReconciliation(
            "run-006",
            [
              "https://example.com/a",
              "https://example.com/b"
            ]
          );

        reconciliation.markDecision(
          "https://example.com/a",
          "ACCEPT"
        );

        expect(
          () =>
            reconciliation.assertComplete()
        ).toThrow(
          /incomplete/i
        );

        expect(
          reconciliation.report()
            .inProgress
        ).toBe(
          1
        );
      }
    );


    test(
      "invalid Error ledger input does not partially terminalize URL",
      () => {

        const reconciliation =
          new RunReconciliation(
            "run-007",
            [
              "https://example.com/a"
            ]
          );

        expect(
          () =>
            reconciliation.markError(
              "https://example.com/a",
              {
                stage:
                  "DETAIL",

                errorClass:
                  "TimeoutError",

                message:
                  "timeout",

                attempts:
                  0,

                lastStatus:
                  null,

                retriable:
                  true
              }
            )
        ).toThrow(
          /attempts/i
        );

        expect(
          reconciliation.rows()[0]
            .state
        ).toBe(
          "IN_PROGRESS"
        );

        expect(
          reconciliation.errorRows()
        ).toEqual([]);
      }
    );
  }
);