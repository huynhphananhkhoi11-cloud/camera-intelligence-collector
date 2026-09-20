import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  analyzeFinalVisionEvidence,
  toGeminiVisionEvidenceInput
} from "../../../src/v03/agent/visionFastPath.js";

import type {
  GeminiVisionResult
} from "../../../src/v03/ai/geminiVisionProvider.js";

import type {
  VisionEvidencePacket
} from "../../../src/v03/vision/visionEvidenceTypes.js";

import {
  C6_GOLDEN_CASES
} from "../c6/c6GoldenFixtures.js";


describe(
  "C9 fast vision integration seam",
  () => {

    it(
      "maps C9A evidence into one C9B call then validates against the source EvidencePacket",
      async () => {

        const golden =
          C6_GOLDEN_CASES[0];


        const visionPacket:
          VisionEvidencePacket = {
            packetId:
              "vision_packet_test",

            sourceEvidencePacketId:
              golden.packet.packetId,

            pageUrl:
              golden.packet.pageUrl,

            finalUrl:
              golden.packet.finalUrl,

            productIdentity:
              golden.packet.productIdentity,

            productRegionScreenshot: {
              imageId:
                "vision_image_test",

              mimeType:
                "image/png",

              base64:
                "ZmFrZS1wbmc=",

              width:
                640,

              height:
                480,

              selectorUsed:
                "main",

              fallback:
                false
            },

            compactDomEvidence:
              golden.packet
                .allEvidence
                .slice(
                  0,
                  6
                )
                .map(
                  item => ({
                    id:
                      item.id,

                    fieldHint:
                      item.fieldHint,

                    rawValue:
                      item.rawValue,

                    normalizedValue:
                      item.normalizedValue,

                    sourceKind:
                      item.sourceKind,

                    locator:
                      item.locator,

                    context:
                      item.context,

                    ownershipHint:
                      item.ownershipHint
                  })
                ),

            selectedControls:
              golden.packet
                .selectedControls
                .map(
                  item => ({
                    id:
                      item.id,

                    fieldHint:
                      item.fieldHint,

                    rawValue:
                      item.rawValue,

                    normalizedValue:
                      item.normalizedValue,

                    sourceKind:
                      item.sourceKind,

                    locator:
                      item.locator,

                    context:
                      item.context,

                    ownershipHint:
                      item.ownershipHint
                  })
                ),

            structuredFacts:
              []
          };


        const expectedProviderResult:
          GeminiVisionResult = {
            decision:
              golden.decision,

            model:
              "gemini-3.5-flash-lite",

            attempts:
              1,

            latencyMs:
              12,

            usage: {
              inputTokens:
                111,

              outputTokens:
                222,

              thoughtTokens:
                0,

              totalTokens:
                333
            }
          };


        const analyze =
          vi.fn(
            async () =>
              expectedProviderResult
          );


        const result =
          await analyzeFinalVisionEvidence({
            sourcePacket:
              golden.packet,

            visionPacket,

            provider: {
              analyze
            }
          });


        expect(
          analyze
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          analyze
        ).toHaveBeenCalledWith(
          toGeminiVisionEvidenceInput(
            visionPacket
          )
        );


        expect(
          result.validation.status
        ).toBe(
          "VALIDATED"
        );


        expect(
          result.validation.issues
        ).toEqual(
          []
        );


        expect(
          result.decision
        ).toEqual(
          golden.decision
        );


        expect(
          result.providerResult.attempts
        ).toBe(
          1
        );
      }
    );


    it(
      "rejects a vision packet from a different source packet before calling Gemini",
      async () => {

        const golden =
          C6_GOLDEN_CASES[0];


        const visionPacket:
          VisionEvidencePacket = {
            packetId:
              "vision_packet_wrong",

            sourceEvidencePacketId:
              "pkt_some_other_source",

            pageUrl:
              golden.packet.pageUrl,

            finalUrl:
              golden.packet.finalUrl,

            productIdentity:
              golden.packet.productIdentity,

            productRegionScreenshot: {
              imageId:
                "vision_image_wrong",

              mimeType:
                "image/png",

              base64:
                "ZmFrZQ==",

              width:
                10,

              height:
                10,

              selectorUsed:
                null,

              fallback:
                true
            },

            compactDomEvidence:
              [],

            selectedControls:
              [],

            structuredFacts:
              []
          };


        const analyze =
          vi.fn();


        await expect(
          analyzeFinalVisionEvidence({
            sourcePacket:
              golden.packet,

            visionPacket,

            provider: {
              analyze:
                analyze as never
            }
          })
        ).rejects.toThrow(
          "VISION_PACKET_SOURCE_MISMATCH"
        );


        expect(
          analyze
        ).not
          .toHaveBeenCalled();
      }
    );
  }
);
