import {
  AISemanticDecisionSchema,
  AI_SEMANTIC_JSON_SCHEMA,
  type AISemanticDecision
} from "./semanticContracts.js";

import {
  serializeEvidencePacketForPrompt
} from "./evidencePacket.js";

import type {
  EvidencePacket
} from "./evidenceTypes.js";


export const HUMAN_READER_SYSTEM_PROMPT =
  [
    "You are CameraIntel Human-Like Product Reader.",
    "",
    "Read ONE e-commerce product page the way a careful human shopper would.",
    "The supplied image is what the shopper sees around the primary product.",
    "The compact DOM/evidence list is supporting evidence.",
    "",
    "IMPORTANT:",
    "1. Identify the ONE primary product first.",
    "2. Read the currently represented or selected configuration, not every number on the page.",
    "3. CURRENT currentPrice is the price a shopper would associate with the selected/default configuration.",
    "4. Do not create a price range just because several prices exist.",
    "5. Old price, gift value, saving, installment, accessory price and variant delta are not currentPrice.",
    "6. A '+ X VND' option is normally a price delta, not a full product price.",
    "7. Selected variant/condition controls outrank unselected choices.",
    "8. Related/recommended products are not the primary product.",
    "9. Existing ownershipHint is only a weak sensor hint. It is NOT truth.",
    "10. No semanticRole from the deterministic rule engine is supplied to you on purpose.",
    "11. Use only supplied evidence IDs. Never invent a numeric value.",
    "12. If the page does not support a field, return null/empty rather than guessing.",
    "13. Keep conflicts when visible evidence and structured metadata disagree.",
    "14. Return only the requested JSON schema.",
    "",
    "Think like a human looking at the page, but ground every final field in evidence IDs."
  ].join(
    "\n"
  );


export interface OllamaSemanticProviderOptions {
  readonly baseUrl?:
    string;

  readonly timeoutMs?:
    number;

  readonly contextLength?:
    number;

  readonly fetchFn?:
    typeof fetch;
}


export interface OllamaAnalyzeResult {
  readonly decision:
    AISemanticDecision;

  readonly model:
    string;

  readonly totalDurationMs:
    number |
    null;

  readonly loadDurationMs:
    number |
    null;

  readonly promptEvalCount:
    number |
    null;

  readonly evalCount:
    number |
    null;
}


function durationMs(
  value:
    unknown
): number |
  null {

  const numeric =
    Number(
      value
    );


  return Number.isFinite(
    numeric
  )
    ? Math.round(
        numeric /
        1_000_000
      )
    : null;
}


export class OllamaSemanticProvider {
  private readonly baseUrl:
    string;


  private readonly timeoutMs:
    number;


  private readonly contextLength:
    number;


  private readonly fetchFn:
    typeof fetch;


  constructor(
    options:
      OllamaSemanticProviderOptions = {}
  ) {

    this.baseUrl =
      (
        options.baseUrl ??
        "http://127.0.0.1:11434"
      ).replace(
        /\/+$/u,
        ""
      );


    this.timeoutMs =
      options.timeoutMs ??
      120_000;


    this.contextLength =
      options.contextLength ??
      10_240;


    this.fetchFn =
      options.fetchFn ??
      fetch;
  }


  async unload(
    model:
      string
  ): Promise<void> {

    const response =
      await this.fetchFn(
        this.baseUrl +
        "/api/chat",
        {
          method:
            "POST",

          headers: {
            "content-type":
              "application/json"
          },

          body:
            JSON.stringify({
              model,
              messages:
                [],
              keep_alive:
                0
            })
        }
      );


    if (
      !response.ok
    ) {
      throw new Error(
        "Failed to unload Ollama model " +
        model +
        ": HTTP " +
        response.status
      );
    }
  }


  async analyze(
    packet:
      EvidencePacket,
    model:
      string
  ):
    Promise<
      OllamaAnalyzeResult
    > {

    const controller =
      new AbortController();


    const timer =
      setTimeout(
        () =>
          controller.abort(),
        this.timeoutMs
      );


    try {

      const userContent =
        [
          "Read this single product page as a human shopper.",
          "",
          "First use the image to understand visual hierarchy and which controls/prices belong to the primary product.",
          "Then use the compact evidence JSON to ground each answer in evidence IDs.",
          "",
          serializeEvidencePacketForPrompt(
            packet
          )
        ].join(
          "\n"
        );


      const message:
        Record<
          string,
          unknown
        > = {
        role:
          "user",

        content:
          userContent
      };


      if (
        packet.evidenceBoard
      ) {
        message.images = [
          packet.evidenceBoard.base64
        ];
      }


      const response =
        await this.fetchFn(
          this.baseUrl +
          "/api/chat",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json"
            },

            signal:
              controller.signal,

            body:
              JSON.stringify({
                model,

                stream:
                  false,

                format:
                  AI_SEMANTIC_JSON_SCHEMA,

                messages: [
                  {
                    role:
                      "system",

                    content:
                      HUMAN_READER_SYSTEM_PROMPT
                  },

                  message
                ],

                options: {
                  temperature:
                    0,

                  num_ctx:
                    this.contextLength,

                  num_predict:
                    768
                },

                keep_alive:
                  "5m"
              })
          }
        );


      if (
        !response.ok
      ) {

        const body =
          await response.text();


        throw new Error(
          "Ollama semantic request failed: HTTP " +
          response.status +
          " " +
          body.slice(
            0,
            500
          )
        );
      }


      const body =
        await response.json() as {
          model?:
            string;

          message?: {
            content?:
              string;
          };

          total_duration?:
            number;

          load_duration?:
            number;

          prompt_eval_count?:
            number;

          eval_count?:
            number;
        };


      const content =
        body.message
          ?.content;


      if (
        !content
      ) {
        throw new Error(
          "Ollama returned no semantic JSON content."
        );
      }


      let parsed:
        unknown;


      try {
        parsed =
          JSON.parse(
            content
          );
      }
      catch {
        throw new Error(
          "Ollama returned invalid JSON despite structured-output mode."
        );
      }


      const decision =
        AISemanticDecisionSchema.parse(
          parsed
        );


      return {
        decision,

        model:
          body.model ??
          model,

        totalDurationMs:
          durationMs(
            body.total_duration
          ),

        loadDurationMs:
          durationMs(
            body.load_duration
          ),

        promptEvalCount:
          Number.isFinite(
            Number(
              body.prompt_eval_count
            )
          )
            ? Number(
                body.prompt_eval_count
              )
            : null,

        evalCount:
          Number.isFinite(
            Number(
              body.eval_count
            )
          )
            ? Number(
                body.eval_count
              )
            : null
      };
    }
    finally {

      clearTimeout(
        timer
      );
    }
  }
}
