import {
  describe,
  expect,
  test
} from "vitest";

import {
  CAMERA_ROUTE_MODEL,
  CAMERA_ROUTE_RESPONSE_JSON_SCHEMA,
  CameraRouteSelectionContractError,
  buildCameraRouteSelectionPrompt,
  selectCameraRoutes,
  type CameraRouteGeminiRequest
} from "../../../src/v04/ai/cameraRouteSelector.js";

import type {
  SiteReconnaissancePacket
} from "../../../src/v04/contracts/v15PipelineContracts.js";

function packet(): SiteReconnaissancePacket {
  return {
    website: "shop.example",
    rootUrl: "https://shop.example/",
    finalUrl: "https://shop.example/",
    candidates: [
      {
        candidateId: "c-camera",
        label: "Interchangeable-lens cameras",
        url: "https://shop.example/cameras"
      },
      {
        candidateId: "c-accessory",
        label: "Photo accessories",
        url: "https://shop.example/accessories"
      },
      {
        candidateId: "c-service",
        label: "Services",
        url: "https://shop.example/services"
      }
    ],
    shots: [
      {
        shotId: "nav-01",
        role: "landing",
        bytes: Buffer.from("navigation-image-one"),
        imageHash: "hash-nav-01",
        visibleCandidateIds: [
          "c-camera",
          "c-accessory"
        ]
      },
      {
        shotId: "nav-02",
        role: "navigation-reveal",
        bytes: Buffer.from("navigation-image-two"),
        imageHash: "hash-nav-02",
        visibleCandidateIds: [
          "c-service"
        ]
      }
    ]
  };
}

async function captureError(
  action: () => Promise<unknown>
): Promise<unknown> {
  try {
    await action();
    return null;
  }
  catch (error) {
    return error;
  }
}

describe(
  "V15 Gemini camera route selector ordered navigation input",
  () => {
    test(
      "sends ordered navigation screenshots as separate image parts in one Gemini call",
      async () => {
        const input = packet();
        let calls = 0;
        const requests: CameraRouteGeminiRequest[] = [];

        const decision = await selectCameraRoutes(
          input,
          async (sent: any) => {
            calls += 1;
            requests.push(sent);
            return JSON.stringify({
              approvedCandidateIds: [
                "c-camera"
              ]
            });
          }
        );

        expect(calls).toBe(1);
        expect(decision).toEqual({
          approvedCandidateIds: [
            "c-camera"
          ]
        });
        expect(requests).toHaveLength(1);

        const request = requests[0]!;
        expect(request.model).toBe(
          "gemini-3.5-flash-lite"
        );
        expect(request.model).toBe(CAMERA_ROUTE_MODEL);
        expect(request.input).toHaveLength(3);
        expect(request.input[0]?.type).toBe("text");
        expect(request.input[1]).toEqual({
          type: "image",
          shotId: "nav-01",
          data: input.shots[0]!.bytes.toString("base64"),
          mime_type: "image/png"
        });
        expect(request.input[2]).toEqual({
          type: "image",
          shotId: "nav-02",
          data: input.shots[1]!.bytes.toString("base64"),
          mime_type: "image/png"
        });
        expect(request.responseSchema).toBe(
          CAMERA_ROUTE_RESPONSE_JSON_SCHEMA
        );
      }
    );

    test(
      "does not send audit HTML or a collage transport",
      async () => {
        const requests: CameraRouteGeminiRequest[] = [];

        await selectCameraRoutes(
          packet(),
          async (sent: any) => {
            requests.push(sent);
            return JSON.stringify({
              approvedCandidateIds: []
            });
          }
        );

        const requestText = JSON.stringify(
          requests[0]
        );

        expect(requestText).not.toContain(
          "capture-audit.html"
        );
        expect(requestText.toLowerCase()).not.toContain(
          "collage"
        );
        expect(
          requests[0]!.input.filter(
            (part: any) => part.type === "image"
          )
        ).toHaveLength(2);
      }
    );

    test(
      "prompt declares ordered reconnaissance views of one site and camera-only semantics",
      () => {
        const prompt = buildCameraRouteSelectionPrompt(
          packet()
        );

        expect(prompt).toContain(
          "ordered reconnaissance views of one site"
        );
        expect(prompt).toContain(
          "return only approved candidate IDs"
        );
        expect(prompt).toContain("camera bodies");
        expect(prompt).toContain("new cameras");
        expect(prompt).toContain("used cameras");
        expect(prompt).toContain("DSLR");
        expect(prompt).toContain("mirrorless");
        expect(prompt).toContain("standalone lenses");
        expect(prompt).toContain("memory cards");
        expect(prompt).toContain("vouchers");
        expect(prompt).toContain("unrelated services");
        expect(prompt).toContain("Never invent candidate IDs");
        expect(prompt).toContain("c-camera");
        expect(prompt).toContain("nav-01");
        expect(prompt.indexOf("nav-01")).toBeLessThan(
          prompt.indexOf("nav-02")
        );
      }
    );

    test(
      "response schema exposes candidate IDs only",
      () => {
        expect(
          Object.keys(
            CAMERA_ROUTE_RESPONSE_JSON_SCHEMA.properties
          )
        ).toEqual([
          "approvedCandidateIds"
        ]);
        expect(
          CAMERA_ROUTE_RESPONSE_JSON_SCHEMA.required
        ).toEqual([
          "approvedCandidateIds"
        ]);
        expect(
          CAMERA_ROUTE_RESPONSE_JSON_SCHEMA.additionalProperties
        ).toBe(false);
      }
    );

    test(
      "accepts an empty approved route list",
      async () => {
        const decision = await selectCameraRoutes(
          packet(),
          async () => JSON.stringify({
            approvedCandidateIds: []
          })
        );

        expect(decision).toEqual({
          approvedCandidateIds: []
        });
      }
    );

    test(
      "rejects invalid JSON without issuing a second Gemini call",
      async () => {
        let calls = 0;

        const error = await captureError(
          () => selectCameraRoutes(
            packet(),
            async () => {
              calls += 1;
              return "{not-json";
            }
          )
        );

        expect(calls).toBe(1);
        expect(error).toBeInstanceOf(
          CameraRouteSelectionContractError
        );
      }
    );

    test(
      "rejects schema-invalid route decisions without semantic repair",
      async () => {
        let calls = 0;

        const error = await captureError(
          () => selectCameraRoutes(
            packet(),
            async () => {
              calls += 1;
              return JSON.stringify({
                approvedCandidateIds: [
                  "c-camera"
                ],
                approvedRoutes: [
                  {
                    label: "invented",
                    url: "https://invented.example/"
                  }
                ]
              });
            }
          )
        );

        expect(calls).toBe(1);
        expect(error).toBeInstanceOf(
          CameraRouteSelectionContractError
        );
      }
    );
  }
);
