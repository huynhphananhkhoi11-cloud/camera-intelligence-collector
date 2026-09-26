# V3 Challenge Contract — Phase 12A

## Principle

Challenge handling is an optional fallback capability. It is not part of normal crawling.

## Detection states

The system distinguishes:
- normal response;
- rate limit;
- ordinary forbidden response;
- confirmed CAPTCHA/human-verification challenge.

Important:
- HTTP 429 != CAPTCHA.
- HTTP 403 != CAPTCHA.
- empty response != CAPTCHA.

A CAPTCHA is confirmed only with challenge evidence such as:
- reCAPTCHA;
- hCaptcha;
- Cloudflare Turnstile;
- AWS WAF CAPTCHA;
- explicit human-verification/challenge markup.

## Modes

- `off`: never invoke a CAPTCHA provider.
- `manual`: default; open/retain visible browser and wait for user verification.
- `auto`: only after CHALLENGE_CONFIRMED may an explicitly configured provider be invoked.

## Provider contract

A provider such as NopeCHA is lazy-loaded only after a confirmed challenge and only when auto mode is explicitly enabled.

Provider failure falls back to manual verification.

Challenge handling MUST NOT be used to mask unrelated acquisition, parsing, network, or rate-limit failures.
