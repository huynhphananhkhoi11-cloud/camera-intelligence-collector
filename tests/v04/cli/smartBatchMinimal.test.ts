import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  configuredProviderProfile,
  parseRetentionPolicy,
  parseUrls
} from "../../../src/v04/cli/smartBatchMinimal.js";

describe("V04 minimal CLI helpers", () => {
  test("parses URL text files while ignoring blanks and comments", () => {
    expect(parseUrls("# note\nhttps://a.example/x\n\n https://b.example/y \n")).toEqual([
      "https://a.example/x",
      "https://b.example/y"
    ]);
  });

  test("validates explicit V15 evidence-retention policy", () => {
    expect(parseRetentionPolicy("AUDIT_KEEP_ALL")).toBe("AUDIT_KEEP_ALL");
    expect(parseRetentionPolicy("LEAN_DELETE_SUCCESS")).toBe("LEAN_DELETE_SUCCESS");
    expect(() => parseRetentionPolicy("DELETE_ALWAYS")).toThrow(
      "Invalid retention policy"
    );
  });

  test("builds one provider profile from the configured Gemini key", () => {
    const profile = configuredProviderProfile({
      GEMINI_AUTH_KEY: "key-1",
      GEMINI_PROJECT_ID: "project-1"
    });

    expect(profile.profile.id).toBe("gemini-primary");
    expect(profile.profile.projectId).toBe("project-1");
    expect(profile.credential.authKey).toBe("key-1");
  });

  test("wires the V15 product runtime by default and full site discovery behind an explicit --discover mode", async () => {
    const source = await readFile(
      join(process.cwd(), "src/v04/cli/smartBatchMinimal.ts"),
      "utf8"
    );

    expect(source).toContain("runCameraOnlyProductUrls");
    expect(source).toContain("runCameraOnlyDiscoveryPipeline");
    expect(source).toContain('"--discover"');
    expect(source).toContain('"--retention <policy>"');
    expect(source).toContain('"LEAN_DELETE_SUCCESS"');
    expect(source).not.toContain("runDurableBatch({");
  });

});
