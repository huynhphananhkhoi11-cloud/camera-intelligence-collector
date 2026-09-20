import {
  readFileSync
} from "node:fs";

import {
  resolve
} from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";


describe(
  "C4 browser lifecycle order",
  () => {

    it(
      "captures final evidence and awaits semantic validation before browser cleanup",
      () => {

        const source =
          readFileSync(
            resolve(
              "src/v03/agent/browserAgentSession.ts"
            ),
            "utf8"
          );


        const captureAt =
          source.indexOf(
            "await captureFinalEvidencePacket("
          );


        const finalizeAt =
          source.indexOf(
            "await finalizeBeforeClose(",
            captureAt
          );


        const completedAt =
          source.indexOf(
            '"SESSION_COMPLETED"',
            finalizeAt
          );


        const contextCloseAt =
          source.indexOf(
            "await context.close();",
            finalizeAt
          );


        const browserCloseAt =
          source.indexOf(
            "await browser.close();",
            contextCloseAt
          );


        expect(
          captureAt
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          finalizeAt
        ).toBeGreaterThan(
          captureAt
        );


        expect(
          completedAt
        ).toBeGreaterThan(
          finalizeAt
        );


        expect(
          contextCloseAt
        ).toBeGreaterThan(
          completedAt
        );


        expect(
          browserCloseAt
        ).toBeGreaterThan(
          contextCloseAt
        );
      }
    );
  }
);
