import {
  describe,
  expect,
  test
} from "vitest";

import {
  selectProductCandidates
} from "../../../src/v02/discovery/productCandidateSelection.js";


describe(
  "selectProductCandidates",
  () => {

    test(
      "ranks globally after all discovery pages and keeps strongest duplicate observation",
      () => {

        const selected =
          selectProductCandidates(
            [
              {
                url:
                  "https://example.com/early-low",
                score:
                  40,
                reasons: [
                  "early"
                ]
              },
              {
                url:
                  "https://example.com/shared",
                score:
                  55,
                reasons: [
                  "page-1"
                ]
              },
              {
                url:
                  "https://example.com/later-best",
                score:
                  120,
                reasons: [
                  "page-2"
                ]
              },
              {
                url:
                  "https://example.com/shared",
                score:
                  85,
                reasons: [
                  "page-2-stronger"
                ]
              }
            ],
            2
          );

        expect(
          selected.map(
            item =>
              item.url
          )
        ).toEqual([
          "https://example.com/later-best",
          "https://example.com/shared"
        ]);

        expect(
          selected[1]?.score
        ).toBe(
          85
        );

        expect(
          selected[1]?.reasons
        ).toEqual(
          expect.arrayContaining([
            "page-1",
            "page-2-stronger"
          ])
        );
      }
    );


    test(
      "uses deterministic URL ordering for equal scores",
      () => {

        const selected =
          selectProductCandidates(
            [
              {
                url:
                  "https://example.com/b",
                score:
                  80,
                reasons: []
              },
              {
                url:
                  "https://example.com/a",
                score:
                  80,
                reasons: []
              }
            ],
            2
          );

        expect(
          selected.map(
            item =>
              item.url
          )
        ).toEqual([
          "https://example.com/a",
          "https://example.com/b"
        ]);
      }
    );

    test(
      "preserves a proven requested direct-product seed even when its score is lower and limit is one",
      () => {

        const selected =
          selectProductCandidates(
            [
              {
                url:
                  "https://example.com/requested-camera",
                score:
                  70,
                reasons: [
                  "current-page product detail"
                ]
              },
              {
                url:
                  "https://example.com/related-camera",
                score:
                  120,
                reasons: [
                  "related product card"
                ]
              }
            ],
            1,
            {
              pinnedUrl:
                "https://example.com/requested-camera"
            }
          );

        expect(
          selected.map(
            item =>
              item.url
          )
        ).toEqual([
          "https://example.com/requested-camera"
        ]);
      }
    );


    test(
      "does not invent a pinned product that was not discovered",
      () => {

        const selected =
          selectProductCandidates(
            [
              {
                url:
                  "https://example.com/real-product",
                score:
                  90,
                reasons: [
                  "catalog product"
                ]
              }
            ],
            1,
            {
              pinnedUrl:
                "https://example.com/not-discovered"
            }
          );

        expect(
          selected.map(
            item =>
              item.url
          )
        ).toEqual([
          "https://example.com/real-product"
        ]);
      }
    );

  }
);