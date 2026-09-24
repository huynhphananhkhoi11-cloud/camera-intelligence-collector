import { describe, expect, it } from "vitest";

import {
  EXPECTED_CAMERA_DATA_HEADERS,
  inspectCanonicalSemanticContract,
  inspectFrozenNumberedContracts,
  inspectRequiredLaneCoverage,
  inspectWorkbookContract,
  scanNumberedPacketArchitecture
} from "./v15NumberedPacketGuards.mjs";

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

describe("V15 numbered packet architecture guards", () => {
  it("keeps the exact frozen 13-column workbook contract", async () => {
    expect(EXPECTED_CAMERA_DATA_HEADERS).toEqual(EXPECTED_HEADERS);
    expect(await inspectWorkbookContract(process.cwd())).toEqual([]);
  });

  it("freezes numbered visual-shot metadata and lean-retention policy in the shared contract", async () => {
    expect(await inspectFrozenNumberedContracts(process.cwd())).toEqual([]);
  });

  it("reuses the canonical V14 semantic dictionary instead of duplicating it", async () => {
    expect(await inspectCanonicalSemanticContract(process.cwd())).toEqual([]);
  });

  it("forbids semantic/browser drift, benchmark repair, retailer literals and audit HTML media", async () => {
    expect(await scanNumberedPacketArchitecture(process.cwd())).toEqual([]);
  });

  it("requires explicit regression evidence from every numbered-packet lane", async () => {
    expect(await inspectRequiredLaneCoverage(process.cwd())).toEqual([]);
  });
});
