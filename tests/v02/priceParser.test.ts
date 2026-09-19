import {
  describe,
  expect,
  test
} from "vitest";

import {
  parseRentalPrice,
  parseSalePrice,
  parseStructuredPrice
} from "../../src/v02/priceParser.ts";

describe("Price Parser V2 — structured price", () => {

  test.each([
    ["180000.00", 180000],
    ["180000,00", 180000],
    ["180000", 180000],
    [180000, 180000],
    ["14.500.000", 14500000],
    ["14,500,000", 14500000],
    ["288.000", 288000],
    ["288,000", 288000],
    ["180,000.00", 180000],
    ["180.000,00", 180000]
  ])(
    "%j => %s",
    (input, expected) => {
      expect(
        parseStructuredPrice(input)
      ).toBe(expected);
    }
  );

  test.each([
    [null],
    [undefined],
    [""],
    ["not-a-price"]
  ])(
    "%j => null",
    (input) => {
      expect(
        parseStructuredPrice(input)
      ).toBeNull();
    }
  );
});


describe("Price Parser V2 — rental", () => {

  test.each([
    ["288.000đ/ngày", 288000],
    ["288.000 đ / ngày", 288000],
    ["360,000 ₫/ngày", 360000],
    ["Giá thuê: 180.000đ/ngày", 180000],
    ["Giá thuê: 250.000 VND / day", 250000]
  ])(
    "%j => %s",
    (input, expected) => {
      expect(
        parseRentalPrice(input)
      ).toBe(expected);
    }
  );

  test.each([
    ["651 điểm lấy nét"],
    ["2400 điểm ảnh"],
    ["49 điểm AF"],
    ["91 \u0111i\u1ec3m AF"],
    ["17"],
    ["16"],
    ["14.500.000đ"],
    ["ISO 100-25600"],
    ["24.2 MP"]
  ])(
    "rejects non-rental value %j",
    (input) => {
      expect(
        parseRentalPrice(input)
      ).toBeNull();
    }
  );
});


describe("Price Parser V2 — sale", () => {

  test.each([
    ["14.500.000đ", 14500000],
    ["10.500.000 ₫", 10500000],
    ["Giá: 18.000.000đ", 18000000],
    ["15,500,000 VND", 15500000],
    ["27.480.000đ30.990.000đGiảm: 3.510.000đ", 27480000],
    ["12.753.818 ₫Giảm 2.753.818 ₫", 12753818]
  ])(
    "%j => %s",
    (input, expected) => {
      expect(
        parseSalePrice(input)
      ).toBe(expected);
    }
  );

  test.each([
    ["288.000đ/ngày"],
    ["651 điểm lấy nét"],
    ["49 điểm AF"],
    ["91 \u0111i\u1ec3m AF"],
    ["17"],
    ["16"],
    ["24.2 MP"],
    ["ISO 100-25600"]
  ])(
    "rejects non-sale value %j",
    (input) => {
      expect(
        parseSalePrice(input)
      ).toBeNull();
    }
  );
});
