import {
  describe,
  expect,
  test
} from "vitest";

import {
  RenderedDomDiscovery
} from "../../../src/v03/discovery/renderedDomDiscovery.js";

import type {
  RenderedDomRuntime
} from "../../../src/v03/discovery/renderedDomDiscovery.js";


describe(
  "V3 rendered DOM discovery",
  () => {

    test(
      "keeps only same-origin rendered links with provenance",
      async () => {

        const runtime:
          RenderedDomRuntime = {
            async collectLinks() {
              return [
                {
                  url:
                    "https://example.com/may-anh/canon-r50",
                  text:
                    "Canon EOS R50"
                },
                {
                  url:
                    "https://outside.example/camera",
                  text:
                    "External"
                }
              ];
            }
          };


        const discovery =
          new RenderedDomDiscovery(
            runtime
          );


        const result =
          await discovery.discover(
            "https://example.com/"
          );


        expect(
          result.evidence
        ).toHaveLength(
          1
        );


        expect(
          result.evidence[0]
        ).toMatchObject({
          url:
            "https://example.com/may-anh/canon-r50",
          channel:
            "RENDERED_DOM",
          parentUrl:
            "https://example.com/"
        });
      }
    );
  }
);
