# Camera Intelligence Collector

Camera Intelligence Collector V3 combines a Playwright collection browser with Gemini for grounded e-commerce product intelligence.

## Gemini BYOK

This repository uses bring-your-own-key (BYOK).

Operators must provide a Gemini API credential that belongs to a project/account they are authorized to use.

Environment variables:

    GEMINI_API_KEY=
    CAMINTEL_GEMINI_PROFILE=default

Never commit a real API key.

For the current PowerShell session:

    $env:GEMINI_API_KEY="YOUR_KEY"
    $env:CAMINTEL_GEMINI_PROFILE="default"

Do not include credentials in logs, screenshots, bug reports, artifacts, or pull requests.

## Provider Doctor

The provider doctor checks local credential configuration only. It does not make a Gemini API request.

Run:

    npx.cmd tsx src/v03/cli/providerDoctor.ts

Configured example:

    CAMERA INTELLIGENCE PROVIDER DOCTOR
    Provider: Gemini
    Credential: FOUND
    Profile: default
    Key: ****abcd
    Status: READY

Missing credential example:

    CAMERA INTELLIGENCE PROVIDER DOCTOR
    Provider: Gemini
    Credential: MISSING
    Profile: default
    Status: MISCONFIGURED
    Set GEMINI_API_KEY before running AI commands.

The complete API key must never be printed.

## Quota ownership

Gemini API rate limits apply per project rather than per individual API key.

Multiple API keys within the same project do not increase that project's quota.

Camera Intelligence Collector does not rotate or round-robin API keys to bypass rate limits.

Quota, billing, and account ownership remain the responsibility of the operator supplying the credential.

Official documentation:

https://ai.google.dev/gemini-api/docs/rate-limits

## Interaction storage and privacy

V3 has both stateful and stateless Gemini calls.

The live browser planner may use previous_interaction_id and therefore uses store=true for stateful continuation.

Operators should understand that planner interaction data may be retained according to the Gemini Interactions API policy and their account/project settings.

The standalone semantic extraction flow uses store=false because individual product extraction does not require conversational continuation.

Official documentation:

https://ai.google.dev/gemini-api/docs/interactions-overview

Review current Gemini privacy and retention documentation before processing confidential information.

## Read-only browser safety

The browser is an observation tool, not a purchasing agent.

Allowed behavior includes:

- scrolling;
- inspecting visible product information;
- opening safe product-information tabs or accordions.

The collector must not intentionally:

- add products to cart;
- purchase or checkout;
- log in;
- submit forms;
- send messages;
- perform transactions;
- intentionally change the default product variant.

Playwright remains the collection browser.

## Token budget

The V3 live browser planner uses a hard input budget of 20,000 tokens per URL.

The collector should prefer useful multi-action plans instead of making an AI call for every scroll or minor interaction.

Runs must not silently continue beyond the hard planner budget.

Production does not fall back to local Ollama when Gemini authentication, configuration, quota, or network access fails.

## Local files and artifacts

Local credentials and generated artifacts are ignored by Git, including:

    .env
    .env.*
    artifacts/
    data/runs/
    *.partial.xlsx
    CameraIntelligence_AI_Test.xlsx

.env.example intentionally remains tracked and must contain placeholders only.

During the V3 parallel sprint, stage only files owned by the current development lane. Do not use git add .
