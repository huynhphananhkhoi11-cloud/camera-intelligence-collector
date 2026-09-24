import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CAMERA_DATA_HEADERS,
  buildPortableCommandInvocation,
  inspectRequiredCoverage,
  scanProductionArchitecture
} from "../../../scripts/v04/run-v15-smoke4.mjs";

const EXPECTED_HEADERS = [
  "Website",
  "Tên sản phẩm",
  "Hàng cũ/Hàng mới",
  "Thông số mô tả",
  "Giá thuê/ngày",
  "Điều kiện thuê riêng",
  "Phụ kiện đi kèm",
  "Combo/gói đi kèm",
  "Điểm đánh giá",
  "Số lượt đánh giá/review",
  "Tồn kho",
  "Giá bán",
  "URL"
] as const;

describe("V15 frozen architecture regression gate", () => {

  it("routes Windows npm/npx .cmd shims through cmd.exe instead of spawning them directly", () => {
    expect(
      buildPortableCommandInvocation("npm.cmd", ["run", "check"], {
        platform: "win32",
        comspec: "C:\\Windows\\System32\\cmd.exe"
      })
    ).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd", "run", "check"]
    });

    expect(
      buildPortableCommandInvocation("git", ["diff", "--check"], {
        platform: "win32",
        comspec: "C:\\Windows\\System32\\cmd.exe"
      })
    ).toEqual({
      command: "git",
      args: ["diff", "--check"]
    });
  });

  it("keeps the exact frozen 13-column workbook contract", () => {
    expect(CAMERA_DATA_HEADERS).toEqual(EXPECTED_HEADERS);
  });

  it("keeps the shared packet/route interfaces readonly and candidate-ID based", async () => {
    const source = await readFile(
      join(process.cwd(), "src/v04/contracts/v15PipelineContracts.ts"),
      "utf8"
    );

    expect(source).toMatch(/interface\s+CameraRouteDecision/);
    expect(source).toMatch(/readonly\s+approvedCandidateIds\s*:\s*readonly\s+string\[\]/);
    expect(source).toMatch(/interface\s+FrozenProductVisualPacket/);
    expect(source).toMatch(/readonly\s+screenshots\s*:\s*readonly/);
    expect(source).toMatch(/readonly\s+imagePaths\s*:\s*readonly\s+string\[\]/);
    expect(source).toMatch(/interface\s+CapturedProductWorkItem/);
    expect(source).toMatch(/readonly\s+packet\s*:\s*FrozenProductVisualPacket/);
  });

  it("keeps the canonical V15 integration path wired to the frozen stages", async () => {
    const source = await readFile(
      join(process.cwd(), "src/v04/pipeline/cameraOnlyDiscoveryPipeline.ts"),
      "utf8"
    );

    for (const moduleName of [
      "siteReconnaissance",
      "cameraRouteSelector",
      "approvedRouteDiscovery",
      "productCapturePacket",
      "pipelinedProductRuntime"
    ]) {
      expect(source).toContain(moduleName);
    }
  });

  it("forbids retailer/benchmark semantic hardcodes in browser/runtime paths", async () => {
    const findings = await scanProductionArchitecture(process.cwd());
    expect(findings).toEqual([]);
  });

  it("retains all required V15 acceptance coverage files and markers", async () => {
    const findings = await inspectRequiredCoverage(process.cwd());
    expect(findings).toEqual([]);
  });
});
