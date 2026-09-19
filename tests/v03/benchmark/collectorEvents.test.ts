import {
  describe,
  expect,
  it
} from "vitest";

import {
  emitCollectorEvent,
  type CollectorEvent
} from "../../../src/v03/ui/collectorEvents.js";


describe(
  "collector events",
  () => {

    it(
      "emits observable events without changing collector behavior",
      () => {

        const events:
          CollectorEvent[] =
            [];


        emitCollectorEvent(
          event => {
            events.push(
              event
            );
          },
          {
            type:
              "BROWSER_OPEN",

            at:
              100,

            url:
              "https://example.test/r50"
          }
        );


        emitCollectorEvent(
          event => {
            events.push(
              event
            );
          },
          {
            type:
              "AI_ATTEMPT_STARTED",

            at:
              200,

            url:
              "https://example.test/r50",

            provider:
              "gemini",

            model:
              "gemini-3.6-flash",

            reasoning:
              "LOW",

            attempt:
              1
          }
        );


        expect(
          events.map(
            event =>
              event.type
          )
        ).toEqual([
          "BROWSER_OPEN",
          "AI_ATTEMPT_STARTED"
        ]);
      }
    );


    it(
      "is safe when no UI observer exists",
      () => {

        expect(
          () =>
            emitCollectorEvent(
              undefined,
              {
                type:
                  "BROWSER_CLOSE",

                at:
                  Date.now(),

                url:
                  "https://example.test/r50"
              }
            )
        ).not.toThrow();
      }
    );
  }
);