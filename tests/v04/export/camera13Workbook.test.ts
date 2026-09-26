import ExcelJS from "exceljs";

import {
  access,
  mkdtemp,
  rm
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  afterEach,
  describe,
  expect,
  test
} from "vitest";

import {
  CAMERA13_HEADERS,
  exportCamera13WorkbookAtomic
} from "../../../src/v04/export/camera13Workbook.js";

import {
  validateVisualDecision
} from "../../../src/v04/validation/structuralValidator.js";

const EXPECTED_FROZEN_HEADERS = [
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

const tempRoots: string[] = [];

function cameraDecision() {
  return {
    classification: "CAMERA_PRODUCT",
    row: {
      website: "shop.test",
      productName: "Camera X",
      condition: "USED",
      specs: [
        "24 MP",
        "APS-C"
      ],
      rentalPricePerDay: {
        value: 250000,
        currency: "VND"
      },
      rentalTerms: "Theo ngày",
      accessoriesIncluded: [
        "Pin",
        "Sạc"
      ],
      bundleIncluded: null,
      rating: 4.8,
      reviewCount: 27,
      stock: "Còn hàng",
      salePrice: {
        value: 18000000,
        currency: "VND"
      },
      url: "https://shop.test/camera-x"
    }
  } as const;
}

function nullableCameraDecision() {
  return {
    classification: "CAMERA_PRODUCT",
    row: {
      website: "nullable.test",
      productName: null,
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
      url: "https://nullable.test/x"
    }
  } as const;
}

function textOf(value: ExcelJS.CellValue): string {
  return value === null || value === undefined
    ? ""
    : String(value);
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(
      root =>
        rm(
          root,
          {
            force: true,
            recursive: true
          }
        )
    )
  );
});

describe("V04 Camera13 workbook", () => {
  test("exports the exact frozen Website to URL header contract", () => {
    expect(CAMERA13_HEADERS).toEqual(EXPECTED_FROZEN_HEADERS);
  });

  test("writes exactly the 13 frozen headers and only validated products", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "camintel-v04-workbook-")
    );
    tempRoots.push(root);

    const output = join(root, "result.xlsx");

    await exportCamera13WorkbookAtomic(
      output,
      [
        validateVisualDecision(cameraDecision()),
        validateVisualDecision({
          classification: "NON_CAMERA",
          row: null
        }),
        validateVisualDecision({
          classification: "REVIEW",
          row: nullableCameraDecision().row
        })
      ]
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(output);

    const cameraData = workbook.getWorksheet("Camera Data");
    expect(cameraData).toBeDefined();
    expect(workbook.worksheets).toHaveLength(1);

    const headers = CAMERA13_HEADERS.map(
      (_, index) => cameraData!.getRow(1).getCell(index + 1).value
    );

    expect(headers).toEqual([...CAMERA13_HEADERS]);
    expect(cameraData!.columnCount).toBe(13);
    expect(cameraData!.actualRowCount).toBe(2);

    const row = cameraData!.getRow(2);
    expect(row.getCell(1).value).toBe("shop.test");
    expect(row.getCell(2).value).toBe("Camera X");
    expect(row.getCell(3).value).toBe("USED");
    expect(row.getCell(4).value).toBe("24 MP | APS-C");
    expect(row.getCell(5).value).toBe("250.000 VND");
    expect(row.getCell(7).value).toBe("Pin | Sạc");
    expect(row.getCell(9).value).toBe(4.8);
    expect(row.getCell(10).value).toBe(27);
    expect(row.getCell(12).value).toBe("18.000.000 VND");
    expect(row.getCell(13).value).toBe("https://shop.test/camera-x");
  });

  test("exports null optional semantic values as blank cells", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "camintel-v04-nullable-")
    );
    tempRoots.push(root);

    const output = join(root, "nullable.xlsx");

    await exportCamera13WorkbookAtomic(
      output,
      [
        validateVisualDecision(nullableCameraDecision())
      ]
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(output);

    const row = workbook
      .getWorksheet("Camera Data")!
      .getRow(2);

    expect(textOf(row.getCell(1).value)).toBe("nullable.test");

    for (let column = 2; column <= 12; column += 1) {
      expect(textOf(row.getCell(column).value)).toBe("");
    }

    expect(textOf(row.getCell(13).value)).toBe(
      "https://nullable.test/x"
    );
  });

  test("atomically promotes the workbook and leaves no partial file", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "camintel-v04-atomic-")
    );
    tempRoots.push(root);

    const output = join(root, "atomic.xlsx");

    await exportCamera13WorkbookAtomic(
      output,
      [
        validateVisualDecision(cameraDecision())
      ]
    );

    await expect(access(output)).resolves.toBeUndefined();
    await expect(
      access(output + ".partial.xlsx")
    ).rejects.toBeDefined();
  });
});
