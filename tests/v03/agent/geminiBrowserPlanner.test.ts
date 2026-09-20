import {
  describe,
  expect,
  it
} from "vitest";

import {
  GeminiBrowserPlanner
} from "../../../src/v03/agent/geminiBrowserPlanner.js";

import type {
  BrowserAgentObservation
} from "../../../src/v03/agent/browserAgentTypes.js";

const observation:
  BrowserAgentObservation = {
    url:
      "https://example.com/camera",
    title:
      "Camera",
    viewportText:
      "Camera price specs",
    candidates: [
      {
        id: "ai_001",
        tag: "div",
        role: null,
        text: "Price",
        value: null,
        selected: false,
        href: null
      },
      {
        id: "ai_002",
        tag: "button",
        role: "button",
        text: "Specifications",
        value: null,
        selected: false,
        href: null
      }
    ]
  };

function response(
  body: unknown
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status: 200,
      headers: {
        "content-type":
          "application/json"
      }
    }
  );
}

function completedBody(
  text: string,
  id = "int_1"
): unknown {
  return {
    id,
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text
          }
        ]
      }
    ],
    usage: {
      total_input_tokens: 100,
      total_output_tokens: 20,
      total_thought_tokens: 0,
      total_cached_tokens: 0,
      total_tokens: 120,
      total_tool_use_tokens: 0
    }
  };
}

describe(
  "GeminiBrowserPlanner contract",
  () => {
    it(
      "parses valid JSON and caps plans at four safe actions",
      async () => {
        const payload =
          JSON.stringify({
            summary:
              "Inspect product facts.",
            actions: [
              {
                action: "SCROLL_TO",
                targetId: "ai_001",
                field: "CURRENT_PRICE",
                value: null,
                reason: "Find price."
              },
              {
                action: "INSPECT",
                targetId: "ai_001",
                field: "CURRENT_PRICE",
                value: null,
                reason: "Read price."
              },
              {
                action: "CLICK",
                targetId: "ai_002",
                field: "SPECS",
                value: null,
                reason: "Open specs."
              },
              {
                action: "INSPECT",
                targetId: "ai_002",
                field: "SPECS",
                value: null,
                reason: "Read specs."
              },
              {
                action: "FINISH",
                targetId: null,
                field: null,
                value: null,
                reason: "Done."
              }
            ],
            unresolvedFields: [
              "STOCK"
            ]
          });

        const fetchFn =
          (async () =>
            response(
              completedBody(
                payload
              )
            )) as typeof fetch;

        const planner =
          new GeminiBrowserPlanner({
            apiKey: "test-key",
            fetchFn,
            debugArtifactDir: null
          });

        const result =
          await planner.plan(
            observation
          );

        expect(
          result.plan.actions
        ).toHaveLength(4);

        expect(
          result.plan.actions.map(
            action =>
              action.action
          )
        ).toEqual([
          "SCROLL_TO",
          "INSPECT",
          "CLICK",
          "INSPECT"
        ]);
      }
    );

    it(
      "strips one surrounding JSON code fence locally without a repair call",
      async () => {
        let calls = 0;

        const fetchFn =
          (async () => {
            calls += 1;

            return response(
              completedBody(
                "```json\n" +
                JSON.stringify({
                  summary: "Done.",
                  actions: [
                    {
                      action: "FINISH",
                      targetId: null,
                      field: null,
                      value: null,
                      reason: "Enough evidence."
                    }
                  ],
                  unresolvedFields: []
                }) +
                "\n```"
              )
            );
          }) as typeof fetch;

        const planner =
          new GeminiBrowserPlanner({
            apiKey: "test-key",
            fetchFn,
            debugArtifactDir: null
          });

        const result =
          await planner.plan(
            observation
          );

        expect(calls).toBe(1);
        expect(
          result.plan.actions[0]
            ?.action
        ).toBe("FINISH");
      }
    );

    it(
      "classifies incomplete output and performs exactly one tiny stateful repair",
      async () => {
        let calls = 0;

        const requestBodies:
          Array<Record<string, unknown>> =
          [];

        const fetchFn =
          (async (
            _input:
              string | URL | Request,
            init?:
              RequestInit
          ) => {
            calls += 1;

            requestBodies.push(
              JSON.parse(
                String(init?.body)
              ) as
                Record<
                  string,
                  unknown
                >
            );

            if (calls === 1) {
              return response({
                id: "int_first",
                status: "incomplete",
                steps: [
                  {
                    type:
                      "model_output",
                    content: [
                      {
                        type: "text",
                        text:
                          "{\"summary\":\"cut"
                      }
                    ]
                  }
                ],
                usage: {
                  total_input_tokens:
                    120,
                  total_output_tokens:
                    10,
                  total_tokens:
                    130
                }
              });
            }

            return response(
              completedBody(
                JSON.stringify({
                  summary:
                    "Repaired.",
                  actions: [
                    {
                      action: "FINISH",
                      targetId: null,
                      field: null,
                      value: null,
                      reason: "Done."
                    }
                  ],
                  unresolvedFields: []
                }),
                "int_repair"
              )
            );
          }) as typeof fetch;

        const planner =
          new GeminiBrowserPlanner({
            apiKey: "test-key",
            fetchFn,
            debugArtifactDir: null
          });

        const result =
          await planner.plan(
            observation
          );

        expect(calls).toBe(2);

        expect(
          requestBodies[1]
            ?.previous_interaction_id
        ).toBe("int_first");

        const repairInput =
          requestBodies[1]
            ?.input as
              Array<
                Record<
                  string,
                  unknown
                >
              >;

        expect(
          repairInput
        ).toHaveLength(1);

        expect(
          repairInput[0]?.type
        ).toBe("text");

        expect(
          result.interactionId
        ).toBe("int_repair");

        expect(
          result.usage.inputTokens
        ).toBe(220);
      }
    );

    it(
      "never performs more than one repair",
      async () => {
        let calls = 0;

        const fetchFn =
          (async () => {
            calls += 1;

            return response({
              id:
                `int_${calls}`,
              status: "completed",
              steps: [
                {
                  type:
                    "model_output",
                  content: [
                    {
                      type: "text",
                      text: "{bad"
                    }
                  ]
                }
              ],
              usage: {
                total_input_tokens:
                  10,
                total_output_tokens:
                  5,
                total_tokens:
                  15
              }
            });
          }) as typeof fetch;

        const planner =
          new GeminiBrowserPlanner({
            apiKey: "test-key",
            fetchFn,
            debugArtifactDir: null
          });

        await expect(
          planner.plan(
            observation
          )
        ).rejects.toThrow(
          "GEMINI_BROWSER_PLANNER_INVALID_JSON"
        );

        expect(calls).toBe(2);
      }
    );
  }
);

