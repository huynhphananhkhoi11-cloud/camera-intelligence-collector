import {
  describe,
  expect,
  test
} from "vitest";

import {
  classifyJsonResponse
} from "../../../src/v02/network/jsonResponseClassifier.ts";


describe(
  "JSON Response Classifier V2",
  () => {

    test(
      "detects repeated product-like API objects",
      () => {

        const result =
          classifyJsonResponse({
            data: {
              products: [
                {
                  id: 1,
                  name: "Canon R50",
                  price: 15000000,
                  slug: "canon-r50",
                  stock: 2
                },
                {
                  id: 2,
                  name: "Sony A6400",
                  price: 16000000,
                  slug: "sony-a6400",
                  stock: 1
                },
                {
                  id: 3,
                  name: "Fujifilm XT30",
                  price: 17000000,
                  slug: "fuji-xt30",
                  stock: 0
                }
              ]
            }
          });


        expect(
          result.candidates
        ).toHaveLength(
          1
        );


        const candidate =
          result.candidates[0];


        expect(
          candidate?.path
        ).toBe(
          "$.data.products"
        );


        expect(
          candidate?.itemCount
        ).toBe(
          3
        );


        expect(
          candidate?.signalKeys
        ).toEqual(
          expect.arrayContaining([
            "id",
            "name",
            "price",
            "slug",
            "stock"
          ])
        );


        expect(
          candidate?.score
        ).toBeGreaterThanOrEqual(
          70
        );
      }
    );


    test(
      "finds nested repeated collection",
      () => {

        const result =
          classifyJsonResponse({
            payload: {
              sections: [
                {
                  label: "featured",
                  items: [
                    {
                      id: 1,
                      title: "A",
                      url: "/a"
                    },
                    {
                      id: 2,
                      title: "B",
                      url: "/b"
                    }
                  ]
                }
              ]
            }
          });


        expect(
          result.candidates
            .some(
              candidate =>
                candidate.path ===
                "$.payload.sections[*].items"
            )
        ).toBe(true);
      }
    );


    test(
      "does not classify unrelated telemetry arrays",
      () => {

        const result =
          classifyJsonResponse({
            events: [
              {
                timestamp:
                  1,
                duration:
                  22
              },
              {
                timestamp:
                  2,
                duration:
                  27
              },
              {
                timestamp:
                  3,
                duration:
                  31
              }
            ]
          });


        expect(
          result.candidates
        ).toEqual([]);
      }
    );


    test(
      "does not promote a lone object to repeated API candidate",
      () => {

        const result =
          classifyJsonResponse({
            product: {
              id: 1,
              name:
                "Canon R50",
              price:
                15000000,
              url:
                "/canon-r50"
            }
          });


        expect(
          result.candidates
        ).toEqual([]);
      }
    );

  }
);