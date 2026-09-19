import {
  describe,
  expect,
  test
} from "vitest";

import {
  createAcquisitionContext,
  normalizeRootUrl
} from "../../../src/v03/acquisition/acquisitionContext.js";


describe(
  "V3 acquisition context",
  () => {

    test(
      "normalizes a valid HTTP(S) root URL without inventing site-specific behavior",
      () => {

        expect(
          normalizeRootUrl(
            "  https://example.com/catalog#section  "
          )
        ).toBe(
          "https://example.com/catalog"
        );
      }
    );


    test(
      "rejects unsupported protocols",
      () => {

        expect(
          () =>
            normalizeRootUrl(
              "file:///tmp/site.html"
            )
        ).toThrow(
          "Unsupported URL protocol: file:"
        );
      }
    );


    test(
      "preserves the caller abort signal",
      () => {

        const controller =
          new AbortController();

        const context =
          createAcquisitionContext(
            "https://example.com",
            controller.signal
          );


        expect(
          context.signal
        ).toBe(
          controller.signal
        );
      }
    );
  }
);
