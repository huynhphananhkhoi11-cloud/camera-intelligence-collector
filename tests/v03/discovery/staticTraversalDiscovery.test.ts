import {
  describe,
  expect,
  test
} from "vitest";

import {
  StaticTraversalDiscovery
} from "../../../src/v03/discovery/staticTraversalDiscovery.js";

import type {
  StaticFetch
} from "../../../src/v03/acquisition/staticHttpBackend.js";


function response(
  url:
    string,
  body:
    string
) {

  return {
    status:
      200,
    ok:
      true,
    url,
    headers: {
      get(
        name:
          string
      ) {
        return name.toLowerCase() ===
          "content-type"
          ? "text/html"
          : null;
      }
    },
    async text() {
      return body;
    }
  };
}


describe(
  "V3 static traversal discovery",
  () => {

    test(
      "follows bounded camera/category links and collects product-like internal links",
      async () => {

        const fetchFn:
          StaticFetch =
            async (
              input
            ) => {

              const url =
                String(
                  input
                );


              if (
                url ===
                  "https://example.com/"
              ) {
                return response(
                  url,
                  [
                    '<a href="/may-anh">Máy ảnh</a>',
                    '<a href="/tin-tuc">Tin tức</a>',
                    '<a href="/cart">Giỏ hàng</a>'
                  ].join(
                    ""
                  )
                );
              }


              if (
                url ===
                  "https://example.com/may-anh"
              ) {
                return response(
                  url,
                  [
                    '<a href="/may-anh/canon-eos-r50">Canon EOS R50</a>',
                    '<a href="/may-anh/sony-a7c-ii">Sony A7C II</a>'
                  ].join(
                    ""
                  )
                );
              }


              return response(
                url,
                "<html></html>"
              );
            };


        const discovery =
          new StaticTraversalDiscovery({
            staticHttp: {
              fetchFn
            },
            maxPages:
              10,
            maxDepth:
              2
          });


        const result =
          await discovery.discover(
            "https://example.com/"
          );


        expect(
          result.visitedPages
        ).toContain(
          "https://example.com/may-anh"
        );


        expect(
          result.visitedPages
        ).not.toContain(
          "https://example.com/tin-tuc"
        );


        expect(
          result.evidence.map(
            item =>
              item.url
          )
        ).toEqual(
          expect.arrayContaining([
            "https://example.com/may-anh/canon-eos-r50",
            "https://example.com/may-anh/sony-a7c-ii"
          ])
        );
      }
    );
  }
);
