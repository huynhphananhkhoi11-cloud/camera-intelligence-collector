import {
  describe,
  expect,
  test
} from "vitest";

import {
  detectChallenge,
  shouldInvokeCaptchaProvider
} from "../../../src/v03/contracts/challengeContract.ts";


describe(
  "V3 challenge semantic contract",
  () => {

    test(
      "429 is rate limiting, not CAPTCHA",
      () => {

        const detection =
          detectChallenge({
            status:
              429,
            bodyText:
              "Too Many Requests"
          });

        expect(
          detection.state
        ).toBe(
          "RATE_LIMIT"
        );

        expect(
          shouldInvokeCaptchaProvider(
            "auto",
            detection
          )
        ).toBe(false);
      }
    );


    test(
      "ordinary 403 does not invoke a CAPTCHA provider",
      () => {

        const detection =
          detectChallenge({
            status:
              403,
            bodyText:
              "Forbidden"
          });

        expect(
          detection.state
        ).toBe(
          "FORBIDDEN"
        );

        expect(
          shouldInvokeCaptchaProvider(
            "auto",
            detection
          )
        ).toBe(false);
      }
    );


    test(
      "confirmed challenge invokes provider only in explicit auto mode",
      () => {

        const detection =
          detectChallenge({
            status:
              403,
            bodyText:
              "<div class=\"cf-turnstile\"></div>"
          });

        expect(
          detection.state
        ).toBe(
          "CHALLENGE_CONFIRMED"
        );

        expect(
          shouldInvokeCaptchaProvider(
            "off",
            detection
          )
        ).toBe(false);

        expect(
          shouldInvokeCaptchaProvider(
            "manual",
            detection
          )
        ).toBe(false);

        expect(
          shouldInvokeCaptchaProvider(
            "auto",
            detection
          )
        ).toBe(true);
      }
    );
  }
);
