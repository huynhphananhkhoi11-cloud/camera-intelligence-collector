import {
  describe,
  expect,
  test
} from "vitest";

import {
  ApiCandidateStore
} from "../../../src/v02/network/apiCandidateStore.ts";


describe(
  "API Candidate Store V2",
  () => {

    test(
      "deduplicates same response URL and JSON path",
      () => {

        const store =
          new ApiCandidateStore();


        store.add({
          responseUrl:
            "https://example.com/api/products?page=1",

          method:
            "GET",

          status:
            200,

          contentType:
            "application/json",

          candidate: {
            path:
              "$.data",

            itemCount:
              10,

            score:
              75,

            commonKeys: [
              "id",
              "name",
              "url"
            ],

            signalKeys: [
              "id",
              "name",
              "url"
            ],

            sample: []
          }
        });


        store.add({
          responseUrl:
            "https://example.com/api/products?page=1",

          method:
            "GET",

          status:
            200,

          contentType:
            "application/json",

          candidate: {
            path:
              "$.data",

            itemCount:
              12,

            score:
              90,

            commonKeys: [
              "id",
              "name",
              "price",
              "url"
            ],

            signalKeys: [
              "id",
              "name",
              "price",
              "url"
            ],

            sample: [
              {
                id: 1,
                name: "A"
              }
            ]
          }
        });


        expect(
          store.size
        ).toBe(1);


        const stored =
          store.values()[0];


        expect(
          stored?.seenCount
        ).toBe(2);

        expect(
          stored?.score
        ).toBe(90);

        expect(
          stored?.itemCount
        ).toBe(12);

        expect(
          stored?.signalKeys
        ).toContain(
          "price"
        );
      }
    );


    test(
      "keeps different API response paths separately",
      () => {

        const store =
          new ApiCandidateStore();


        const base = {
          responseUrl:
            "https://example.com/api/home",

          method:
            "GET",

          status:
            200,

          contentType:
            "application/json"
        };


        store.add({
          ...base,

          candidate: {
            path:
              "$.products",

            itemCount: 3,

            score: 80,

            commonKeys: [
              "id",
              "name",
              "price"
            ],

            signalKeys: [
              "id",
              "name",
              "price"
            ],

            sample: []
          }
        });


        store.add({
          ...base,

          candidate: {
            path:
              "$.recommended",

            itemCount: 2,

            score: 70,

            commonKeys: [
              "id",
              "title",
              "url"
            ],

            signalKeys: [
              "id",
              "title",
              "url"
            ],

            sample: []
          }
        });


        expect(
          store.size
        ).toBe(2);
      }
    );

  }
);