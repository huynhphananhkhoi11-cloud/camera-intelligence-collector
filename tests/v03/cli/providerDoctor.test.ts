import {
  describe,
  expect,
  test
} from "vitest";

import {
  inspectGeminiCredentials,
  maskGeminiApiKey
} from "../../../src/v03/config/geminiCredentials.js";

import {
  formatProviderDoctorReport
} from "../../../src/v03/cli/providerDoctor.js";


describe(
  "V3 Gemini provider doctor",
  () => {

    test(
      "reports missing credential without calling a provider",
      () => {

        const result =
          inspectGeminiCredentials(
            {}
          );


        expect(
          result
        ).toMatchObject({
          provider:
            "Gemini",

          credential:
            "MISSING",

          profile:
            "default",

          maskedKey:
            null,

          status:
            "MISCONFIGURED"
        });


        expect(
          formatProviderDoctorReport(
            {}
          )
        ).toContain(
          "Set GEMINI_API_KEY before running AI commands."
        );
      }
    );


    test(
      "reports a present credential as READY",
      () => {

        const result =
          inspectGeminiCredentials({
            GEMINI_API_KEY:
              "example-gemini-key-1234",

            CAMINTEL_GEMINI_PROFILE:
              "default"
          });


        expect(
          result
        ).toMatchObject({
          credential:
            "FOUND",

          profile:
            "default",

          maskedKey:
            "****1234",

          status:
            "READY",

          message:
            null
        });
      }
    );


    test(
      "masks the credential to its final four characters",
      () => {

        expect(
          maskGeminiApiKey(
            "example-secret-abcd"
          )
        ).toBe(
          "****abcd"
        );
      }
    );


    test(
      "never emits the full API key in doctor output",
      () => {

        const apiKey =
          "super-secret-gemini-key-9876";


        const report =
          formatProviderDoctorReport({
            GEMINI_API_KEY:
              apiKey
          });


        expect(
          report
        ).toContain(
          "Key: ****9876"
        );


        expect(
          report
        ).not.toContain(
          apiKey
        );
      }
    );


    test(
      "rejects malformed credential containing whitespace",
      () => {

        const report =
          formatProviderDoctorReport({
            GEMINI_API_KEY:
              "invalid key value"
          });


        expect(
          report
        ).toContain(
          "Credential: FOUND"
        );


        expect(
          report
        ).toContain(
          "Status: MISCONFIGURED"
        );


        expect(
          report
        ).not.toContain(
          "invalid key value"
        );
      }
    );
  }
);
