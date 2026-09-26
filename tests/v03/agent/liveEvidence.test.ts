import {
  describe,
  expect,
  it
} from "vitest";

import type {
  Page
} from "playwright";

import {
  captureFinalEvidencePacket
} from "../../../src/v03/agent/browserAgentSession.js";


describe(
  "captureFinalEvidencePacket",
  () => {

    it(
      "builds evidence from the final live DOM without the agent overlay",
      async () => {

        const html =
          [
            "<!doctype html>",
            "<html>",
            "<head>",
            "<title>Canon EOS R50</title>",
            '<script type="application/ld+json">',
            JSON.stringify({
              "@context":
                "https://schema.org",
              "@type":
                "Product",
              name:
                "Canon EOS R50",
              offers: {
                "@type":
                  "Offer",
                price:
                  "15990000",
                priceCurrency:
                  "VND",
                availability:
                  "https://schema.org/InStock"
              }
            }),
            "</script>",
            "</head>",
            "<body>",
            '<div id="__camintel_agent_overlay">CAMERA INTELLIGENCE AI</div>',
            "<h1>Canon EOS R50</h1>",
            "<div>15.990.000Ä‘</div>",
            "</body>",
            "</html>"
          ].join(
            ""
          );


        const cleanedHtml =
          html.replace(
            '<div id="__camintel_agent_overlay">CAMERA INTELLIGENCE AI</div>',
            ""
          );


        const page =
          {
            url:
              () =>
                "https://example.test/canon-r50",

            evaluate:
              async (
                callback:
                  unknown
              ) => {

                const source =
                  String(
                    callback
                  );


                if (
                  source.includes(
                    "cloneNode"
                  )
                ) {
                  return cleanedHtml;
                }


                return (
                  "Canon EOS R50\n" +
                  "15.990.000Ä‘"
                );
              }
          } as unknown as
            Page;


        const packet =
          await captureFinalEvidencePacket(
            page,
            "https://example.test/canon-r50"
          );


        expect(
          packet.finalUrl
        ).toBe(
          "https://example.test/canon-r50"
        );

        expect(
          packet.primaryRegionText
        ).toContain(
          "Canon EOS R50"
        );

        expect(
          packet.allEvidence.length
        ).toBeGreaterThan(
          0
        );

        expect(
          packet.allEvidence.some(
            item =>
              item.rawValue.includes(
                "CAMERA INTELLIGENCE AI"
              )
          )
        ).toBe(false);
      }
    );
  }
);
