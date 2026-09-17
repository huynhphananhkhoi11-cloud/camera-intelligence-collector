import {
  describe,
  expect,
  test
} from "vitest";

import {
  resolveSiteEntry,
  type SiteFetch
} from "../../../src/v02/discovery/redirectResolver.ts";


function response(
  status: number,
  location?: string
): Response {

  const headers =
    new Headers();

  if (location) {
    headers.set(
      "location",
      location
    );
  }

  return new Response(
    null,
    {
      status,
      headers
    }
  );
}


describe(
  "Redirect Resolver V2",
  () => {

    test(
      "follows redirects and derives canonical origin",
      async () => {

        const fetchFn:
          SiteFetch =
          async input => {

            const url =
              String(input);

            if (
              url ===
              "https://example.com/"
            ) {
              return response(
                301,
                "https://www.example.com/shop/?utm_source=test#top"
              );
            }

            if (
              url ===
              "https://www.example.com/shop"
            ) {
              return response(
                200
              );
            }

            throw new Error(
              `Unexpected URL: ${url}`
            );
          };


        const result =
          await resolveSiteEntry(
            "example.com",
            {
              fetchFn
            }
          );


        expect(
          result.normalizedUrl
        ).toBe(
          "https://example.com/"
        );

        expect(
          result.finalUrl
        ).toBe(
          "https://www.example.com/shop"
        );

        expect(
          result.canonicalOrigin
        ).toBe(
          "https://www.example.com/"
        );

        expect(
          result.redirects
        ).toHaveLength(
          1
        );

        expect(
          result.redirects[0]
        ).toMatchObject({
          from:
            "https://example.com/",
          to:
            "https://www.example.com/shop",
          status:
            301
        });
      }
    );


    test(
      "resolves relative redirect locations",
      async () => {

        const fetchFn:
          SiteFetch =
          async input => {

            const url =
              String(input);

            if (
              url ===
              "https://example.com/"
            ) {
              return response(
                302,
                "/catalog/"
              );
            }

            if (
              url ===
              "https://example.com/catalog"
            ) {
              return response(
                200
              );
            }

            throw new Error(
              `Unexpected URL: ${url}`
            );
          };


        const result =
          await resolveSiteEntry(
            "https://example.com"
          ,
            {
              fetchFn
            }
          );


        expect(
          result.finalUrl
        ).toBe(
          "https://example.com/catalog"
        );

        expect(
          result.canonicalOrigin
        ).toBe(
          "https://example.com/"
        );
      }
    );


    test(
      "falls back from HEAD to GET when HEAD is rejected",
      async () => {

        const methods:
          string[] = [];


        const fetchFn:
          SiteFetch =
          async (
            _input,
            init
          ) => {

            methods.push(
              String(
                init?.method
              )
            );

            if (
              init?.method ===
              "HEAD"
            ) {
              return response(
                405
              );
            }

            return response(
              200
            );
          };


        const result =
          await resolveSiteEntry(
            "https://example.com",
            {
              fetchFn
            }
          );


        expect(
          methods
        ).toEqual([
          "HEAD",
          "GET"
        ]);

        expect(
          result.method
        ).toBe(
          "GET"
        );
      }
    );


    test(
      "detects redirect loops",
      async () => {

        const fetchFn:
          SiteFetch =
          async input => {

            const url =
              String(input);

            if (
              url ===
              "https://example.com/"
            ) {
              return response(
                301,
                "/a"
              );
            }

            return response(
              302,
              "/"
            );
          };


        await expect(
          resolveSiteEntry(
            "https://example.com",
            {
              fetchFn
            }
          )
        ).rejects.toThrow(
          /redirect loop/i
        );
      }
    );


    test(
      "rejects invalid redirect target",
      async () => {

        const fetchFn:
          SiteFetch =
          async () =>
            response(
              301,
              "javascript:alert(1)"
            );


        await expect(
          resolveSiteEntry(
            "https://example.com",
            {
              fetchFn
            }
          )
        ).rejects.toThrow(
          /invalid redirect target/i
        );
      }
    );

  }
);