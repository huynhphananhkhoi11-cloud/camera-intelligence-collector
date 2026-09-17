import {
  describe,
  expect,
  test
} from "vitest";

import {
  classifyCondition
} from "../../src/v02/conditionClassifier.ts";


describe(
  "Condition Classifier V2 — structured",
  () => {

    test(
      "NewCondition => NEW",
      () => {

        const result =
          classifyCondition({
            jsonLdItemConditions: [
              "https://schema.org/NewCondition"
            ]
          });

        expect(
          result.condition
        ).toBe("NEW");

        expect(
          result.confidence
        ).toBe("HIGH");
      }
    );


    test(
      "UsedCondition => USED",
      () => {

        const result =
          classifyCondition({
            jsonLdItemConditions: [
              "https://schema.org/UsedCondition"
            ]
          });

        expect(
          result.condition
        ).toBe("USED");
      }
    );


    test(
      "RefurbishedCondition",
      () => {

        const result =
          classifyCondition({
            jsonLdItemConditions: [
              "https://schema.org/RefurbishedCondition"
            ]
          });

        expect(
          result.condition
        ).toBe(
          "REFURBISHED"
        );
      }
    );


    test(
      "DamagedCondition",
      () => {

        const result =
          classifyCondition({
            jsonLdItemConditions: [
              "https://schema.org/DamagedCondition"
            ]
          });

        expect(
          result.condition
        ).toBe(
          "DAMAGED"
        );
      }
    );
  }
);


describe(
  "Condition Classifier V2 — Máy Ảnh Top 1",
  () => {

    test(
      "Canon EOS R hàng cũ => USED",
      () => {

        const result =
          classifyCondition({
            title:
              "CANON EOS R (BODY) - HÀNG CŨ",

            category:
              "MÁY ẢNH CŨ",

            breadcrumbs: [
              "Trang chủ",
              "Máy ảnh cũ",
              "Canon"
            ]
          });

        expect(
          result.condition
        ).toBe("USED");

        expect(
          result.confidence
        ).toBe("HIGH");
      }
    );


    test(
      "Canon 760D 99% + used category => USED",
      () => {

        const result =
          classifyCondition({
            title:
              "CANON EOS 760D (BODY) - 99%",

            category:
              "MÁY ẢNH CŨ"
          });

        expect(
          result.condition
        ).toBe("USED");
      }
    );


    test(
      "Canon R50 NEW 100% => NEW",
      () => {

        const result =
          classifyCondition({
            title:
              "CANON EOS R50 (NEW 100%)",

            category:
              "MÁY ẢNH CHÍNH HÃNG"
          });

        expect(
          result.condition
        ).toBe("NEW");

        expect(
          result.confidence
        ).toBe("HIGH");
      }
    );


    test(
      "detail condition hàng cũ => USED",
      () => {

        const result =
          classifyCondition({
            title:
              "Canon EOS R",

            pageText:
              "Tình trạng: Hàng cũ. Bảo hành 6 tháng."
          });

        expect(
          result.condition
        ).toBe("USED");
      }
    );
  }
);


describe(
  "Condition Classifier V2 — safety",
  () => {

    test(
      "chính hãng alone does not prove NEW",
      () => {

        const result =
          classifyCondition({
            category:
              "MÁY ẢNH CHÍNH HÃNG"
          });

        expect(
          result.condition
        ).toBe("UNKNOWN");
      }
    );


    test(
      "sale price alone does not prove condition",
      () => {

        const result =
          classifyCondition({
            title:
              "Canon Camera",

            pageText:
              "Giá: 15.000.000đ"
          });

        expect(
          result.condition
        ).toBe("UNKNOWN");
      }
    );


    test(
      "rental product has no forced condition",
      () => {

        const result =
          classifyCondition({
            title:
              "Sony A6400",

            category:
              "THUÊ MÁY ẢNH",

            pageText:
              "360.000đ/ngày THUÊ NGAY"
          });

        expect(
          result.condition
        ).toBe("UNKNOWN");
      }
    );


    test(
      "used category alone is insufficient",
      () => {

        const result =
          classifyCondition({
            category:
              "MÁY ẢNH CŨ"
          });

        expect(
          result.condition
        ).toBe("UNKNOWN");
      }
    );


    test(
      "contradictory NEW and USED => conflict",
      () => {

        const result =
          classifyCondition({
            title:
              "Canon EOS R NEW 100%",

            pageText:
              "Tình trạng: hàng cũ"
          });

        expect(
          result.condition
        ).toBe("UNKNOWN");

        expect(
          result.conflict
        ).toBe(true);
      }
    );


    test(
      "99% alone without context is insufficient",
      () => {

        const result =
          classifyCondition({
            title:
              "Unknown Product 99%"
          });

        expect(
          result.condition
        ).toBe("UNKNOWN");
      }
    );
  }
);
