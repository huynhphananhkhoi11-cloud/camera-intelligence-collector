import {
  describe,
  expect,
  it
} from "vitest";

import {
  createVisualStateFingerprint,
  isDuplicateVisualState
} from "../../../src/v04/vision/visualStateFingerprint.js";


describe(
  "V04 visual state fingerprint",
  () => {

    it(
      "treats exact image hash equality as duplicate regardless of scroll metadata",
      () => {
        const first =
          createVisualStateFingerprint(
            Buffer.from("same-image"),
            0,
            1_600
          );

        const sameImageElsewhere =
          createVisualStateFingerprint(
            Buffer.from("same-image"),
            800,
            2_400
          );

        expect(
          isDuplicateVisualState(
            sameImageElsewhere,
            [
              first
            ]
          )
        ).toBe(
          true
        );
      }
    );


    it(
      "keeps visually different hashes even when position metadata matches",
      () => {
        const first =
          createVisualStateFingerprint(
            Buffer.from("image-a"),
            400,
            2_000
          );

        const second =
          createVisualStateFingerprint(
            Buffer.from("image-b"),
            400,
            2_000
          );

        expect(
          isDuplicateVisualState(
            second,
            [
              first
            ]
          )
        ).toBe(
          false
        );
      }
    );
  }
);
