import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test, vi } from "vitest";

import {
  createGeminiInteractionsProvider,
  createMinimalSemanticRequestFactory,
  websiteForUrl
} from "../../../src/v04/pipeline/minimalProductPipeline.js";
import { toResolvedProviderProfile } from "../../../src/v03/provider/providerProfile.js";

function fakeCaptureResult(root: string, url: string) {
  return async () => {
    await mkdir(root, { recursive: true });
    const image = join(root, "hero-01.png");
    const manifestPath = join(root, "capture_manifest.json");
    await writeFile(image, Buffer.from("hero"));
    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        url,
        finalUrl: url + "?final=1",
        captureTimestamp: "2026-09-21T00:00:00.000Z",
        shots: [
          {
            shotId: "hero-01",
            role: "hero",
            imageHash: "hash",
            scrollY: 0,
            documentHeight: 1000,
            path: "hero-01.png"
          }
        ]
      }) + "\n"
    );

    return {
      screenshots: [
        {
          shotId: "hero-01",
          role: "hero" as const,
          bytes: Buffer.from("hero"),
          fingerprint: { imageHash: "hash", scrollY: 0, documentHeight: 1000 }
        }
      ],
      manifest: {
        schemaVersion: 1 as const,
        url,
        finalUrl: url + "?final=1",
        captureTimestamp: "2026-09-21T00:00:00.000Z",
        shots: [
          {
            shotId: "hero-01",
            role: "hero" as const,
            imageHash: "hash",
            scrollY: 0,
            documentHeight: 1000,
            path: "hero-01.png"
          }
        ]
      },
      manifestPath,
      imagePaths: [image]
    };
  };
}

describe("V04 minimal product pipeline adapters", () => {
  test("normalizes the authoritative website host", () => {
    expect(websiteForUrl("https://www.Shop.Example/a")).toBe("shop.example");
  });

  test("uses one durable capture and reuses it when the request factory is called again", async () => {
    const root = await mkdtemp(join(tmpdir(), "v04-pipeline-"));
    const captureDir = join(root, "run", "0001");
    const capture = vi.fn(fakeCaptureResult(captureDir, "https://shop.example/item"));

    const browser = {
      async newContext() {
        return {
          async newPage() { return {} as never; },
          async close() {}
        };
      }
    };

    const factory = createMinimalSemanticRequestFactory({
      browser,
      captureRoot: join(root, "run"),
      capture
    });

    const first = await factory({ index: 0, url: "https://shop.example/item" });
    const second = await factory({ index: 0, url: "https://shop.example/item" });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(first.captureManifestPath).toBe(second.captureManifestPath);
    expect(first.requestPayloadPath).toBe(second.requestPayloadPath);

    const payload = JSON.parse(await readFile(first.requestPayloadPath, "utf8"));
    expect(payload.finalUrl).toBe("https://shop.example/item?final=1");
    expect(payload.screenshots).toEqual([
      { role: "hero", path: "hero-01.png" }
    ]);
  });

  test("posts the Dev1 provider request to Gemini interactions and returns output text", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual(
        expect.objectContaining({ "x-goog-api-key": "key-1" })
      );
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.input).toEqual([
        { type: "text", text: "x" },
        {
          type: "image",
          data: "aGVybw==",
          mime_type: "image/png",
          resolution: "high"
        }
      ]);
      return new Response(
        JSON.stringify({
          status: "completed",
          model: "gemini-test",
          output_text: '{"classification":"NON_CAMERA","row":null}'
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const provider = createGeminiInteractionsProvider("key-1", { fetchFn });
    const result = await provider({
      model: "gemini-test",
      input: [
        { type: "text", text: "x" },
        {
          type: "image",
          data: "aGVybw==",
          mime_type: "image/png",
          resolution: "high"
        }
      ],
      system_instruction: "system",
      response_format: { type: "text", mime_type: "application/json", schema: {} },
      generation_config: { thinking_level: "low", temperature: 0.1, max_output_tokens: 100 },
      store: false
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.text).toContain("NON_CAMERA");
    expect(result.model).toBe("gemini-test");
  });

  test("semantic request execution uses the selected provider credential and returns the parsed decision", async () => {
    const root = await mkdtemp(join(tmpdir(), "v04-pipeline-exec-"));
    const captureDir = join(root, "run", "0001");
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("fake-key");
      return new Response(
        JSON.stringify({
          status: "completed",
          output_text: JSON.stringify({
            classification: "CAMERA_PRODUCT",
            row: {
              website: "model.invalid",
              productName: "Camera X",
              condition: null,
              specs: [],
              rentalPricePerDay: null,
              rentalTerms: null,
              accessoriesIncluded: null,
              bundleIncluded: null,
              rating: null,
              reviewCount: null,
              stock: null,
              salePrice: null,
              url: "https://model.invalid/x"
            }
          })
        }),
        { status: 200 }
      );
    });

    const factory = createMinimalSemanticRequestFactory({
      browser: {
        async newContext() {
          return {
            async newPage() { return {} as never; },
            async close() {}
          };
        }
      },
      captureRoot: join(root, "run"),
      capture: fakeCaptureResult(captureDir, "https://shop.example/item"),
      fetchFn
    });

    const request = await factory({ index: 0, url: "https://shop.example/item" });
    const decision = await request.execute(
      toResolvedProviderProfile({
        id: "p1",
        label: "P1",
        projectId: "project-1",
        authKey: "fake-key"
      })
    );

    expect(decision.classification).toBe("CAMERA_PRODUCT");
    expect(decision.row?.website).toBe("shop.example");
    expect(decision.row?.url).toBe("https://shop.example/item?final=1");
  });
});
