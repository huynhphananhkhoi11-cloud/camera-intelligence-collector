import {
  describe,
  expect,
  test
} from "vitest";

import {
  fetchRobotsPolicy,
  isUrlAllowedByRobots,
  parseRobotsTxt,
  type RobotsFetch
} from "../../../src/v02/discovery/robotsPolicy.ts";


describe(
  "Robots Policy V2",
  () => {

    test(
      "extracts and canonicalizes multiple sitemap declarations",
      () => {

        const result =
          parseRobotsTxt(
            `
              User-agent: *
              Disallow: /private/

              Sitemap: /sitemap.xml
              Sitemap: https://example.com/sitemap-products.xml
              Sitemap: /sitemap.xml
            `,
            "https://example.com/"
          );


        expect(
          result.sitemapUrls
        ).toEqual([
          "https://example.com/sitemap.xml",
          "https://example.com/sitemap-products.xml"
        ]);
      }
    );


    test(
      "parses allow and disallow groups",
      () => {

        const result =
          parseRobotsTxt(
            `
              User-agent: *
              Disallow: /admin
              Allow: /admin/public
            `,
            "https://example.com/"
          );


        expect(
          result.groups
        ).toHaveLength(
          1
        );

        expect(
          result.groups[0]?.rules
        ).toEqual([
          {
            type:
              "DISALLOW",
            path:
              "/admin"
          },
          {
            type:
              "ALLOW",
            path:
              "/admin/public"
          }
        ]);
      }
    );


    test(
      "uses longest matching rule and allow wins",
      () => {

        const parsed =
          parseRobotsTxt(
            `
              User-agent: *
              Disallow: /admin
              Allow: /admin/public
            `,
            "https://example.com/"
          );


        const policy = {
          groups:
            parsed.groups
        };


        expect(
          isUrlAllowedByRobots(
            "https://example.com/admin/settings",
            policy
          )
        ).toBe(false);


        expect(
          isUrlAllowedByRobots(
            "https://example.com/admin/public/camera",
            policy
          )
        ).toBe(true);
      }
    );


    test(
      "specific user-agent group overrides wildcard group",
      () => {

        const parsed =
          parseRobotsTxt(
            `
              User-agent: *
              Disallow: /private

              User-agent: CameraIntelligenceCollector
              Allow: /private
            `,
            "https://example.com/"
          );


        expect(
          isUrlAllowedByRobots(
            "https://example.com/private/catalog",
            {
              groups:
                parsed.groups
            }
          )
        ).toBe(true);
      }
    );


    test(
      "fetches and parses robots.txt",
      async () => {

        const fetchFn:
          RobotsFetch =
          async input => {

            expect(
              String(input)
            ).toBe(
              "https://example.com/robots.txt"
            );

            return new Response(
              `
                User-agent: *
                Disallow: /checkout

                Sitemap: /sitemap.xml
              `,
              {
                status: 200
              }
            );
          };


        const policy =
          await fetchRobotsPolicy(
            "https://example.com/catalog",
            {
              fetchFn
            }
          );


        expect(
          policy.available
        ).toBe(true);

        expect(
          policy.status
        ).toBe(200);

        expect(
          policy.sitemapUrls
        ).toEqual([
          "https://example.com/sitemap.xml"
        ]);
      }
    );


    test(
      "treats missing robots.txt as non-fatal",
      async () => {

        const fetchFn:
          RobotsFetch =
          async () =>
            new Response(
              null,
              {
                status: 404
              }
            );


        const policy =
          await fetchRobotsPolicy(
            "https://example.com",
            {
              fetchFn
            }
          );


        expect(
          policy.available
        ).toBe(false);

        expect(
          policy.status
        ).toBe(404);

        expect(
          policy.groups
        ).toEqual([]);

        expect(
          policy.error
        ).toBeNull();
      }
    );

  }
);