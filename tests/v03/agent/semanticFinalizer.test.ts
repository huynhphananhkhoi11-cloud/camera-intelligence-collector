import {
  describe,
  expect,
  it
} from "vitest";

import {
  analyzeFinalEvidenceLow
} from "../../../src/v03/agent/semanticFinalizer.js";

import type {
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";

import type {
  GeminiAnalyzeResult
} from "../../../src/v03/ai/geminiSemanticProvider.js";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../../../src/v03/ai/semanticContracts.js";


describe(
  "analyzeFinalEvidenceLow",
  () => {

    it(
      "runs exactly one LOW semantic call and validates the result",
      async () => {

        const packet =
          {
            packetId:
              "pkt_test",
            pageUrl:
              "https://example.test/camera",
            finalUrl:
              "https://example.test/camera"
          } as
            EvidencePacket;


        const decision =
          {
            entity: {
              type:
                "UNKNOWN"
            }
          } as
            AISemanticDecision;


        const providerResult =
          {
            decision,
            model:
              "gemini-test",
            totalDurationMs:
              10,
            loadDurationMs:
              null,
            promptEvalCount:
              100,
            evalCount:
              20
          } as
            GeminiAnalyzeResult;


        const calls:
          string[] =
          [];


        const provider =
          {
            analyze:
              async (
                _packet:
                  EvidencePacket,

                _model:
                  string,

                _timeoutMs?:
                  number,

                thinking?:
                  "minimal" |
                  "low" |
                  "medium" |
                  "high"
              ) => {

                calls.push(
                  thinking ??
                  "missing"
                );

                return providerResult;
              }
          };


        const validation =
          {
            status:
              "VALIDATED",
            issues:
              []
          } as
            SemanticValidationResult;


        const result =
          await analyzeFinalEvidenceLow({
            packet,
            provider,
            model:
              "gemini-test",

            validate:
              () =>
                validation
          });


        expect(
          calls
        ).toEqual([
          "low"
        ]);

        expect(
          result.reasoningProfile
        ).toBe(
          "LOW"
        );

        expect(
          result.providerResult
        ).toBe(
          providerResult
        );

        expect(
          result.validation
        ).toBe(
          validation
        );
      }
    );
  }
);