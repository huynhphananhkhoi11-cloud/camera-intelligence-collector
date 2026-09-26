import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const FROZEN_V15_SEMANTIC_SHA256 = {
  "src/v04/ai/geminiVisualExtractor.ts":
    "d0134ef35de32a8949810b3342f99ebf27ded72c6b5a36e0e8454d6c22146ae1",
  "src/v04/ai/productCameraSemanticPrompt.ts":
    "dbb7859880f463f325fb6d77c8bd55a3346113b1d578f418c007c3897e876c12",
  "src/v04/ai/simpleSemantic13Prompt.ts":
    "023bfb1c938de7a823180ee0d5a4d201e3026f3ccb651c0ae41987f34667cd9f",
  "src/v04/contracts/minimalVisualDecision.ts":
    "5c837402380e2bd61a5cd34a7867facfaac7870fefee29d45964b1f468b84d12",
  "src/v04/contracts/v15PipelineContracts.ts":
    "8085d556ed54079484b0da04e06cda7e45c7944ff0a94ae6ed966008e1ed7b85",
  "src/v04/validation/structuralValidator.ts":
    "6938832c8ba682ba4eb628b71c5e5650d7dea671252a825c7acfe287bd631c75"
} as const;

describe("V16 DEV5 legacy semantic freeze guard", () => {
  test("adapter does not import frozen V15 semantic modules", async () => {
    const source = await readFile(
      resolve(process.cwd(), "src/v16/fallback/legacyV15FallbackAdapter.ts"),
      "utf8"
    );

    for (const frozenPath of Object.keys(FROZEN_V15_SEMANTIC_SHA256)) {
      expect(source).not.toContain(frozenPath.split("/").at(-1));
    }
  });

  test("frozen V15 semantic files retain the FIX13 release hashes", async () => {
    for (const [filePath, expectedHash] of Object.entries(
      FROZEN_V15_SEMANTIC_SHA256
    )) {
      const bytes = await readFile(resolve(process.cwd(), filePath));
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      expect(actualHash).toBe(expectedHash);
    }
  });
});
