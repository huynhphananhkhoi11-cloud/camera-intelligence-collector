import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildCapturePlan,
  classifyCaptureSection,
  type CaptureSectionCandidate
} from "../../../src/v03/vision/capturePlan.js";


function candidate(
  overrides:
    Partial<CaptureSectionCandidate> &
    Pick<CaptureSectionCandidate, "selector" | "label" | "text" | "y">
): CaptureSectionCandidate {

  return {
    selector:
      overrides.selector,

    label:
      overrides.label,

    text:
      overrides.text,

    y:
      overrides.y,

    height:
      overrides.height ??
      320,

    visible:
      overrides.visible ??
      true,

    kindHint:
      overrides.kindHint ??
      null
  };
}


describe(
  "V3 capture plan",
  () => {

    it(
      "classifies target sections but rejects recommendation/related-product sections",
      () => {

        expect(
          classifyCaptureSection(
            candidate({
              selector:
                "#rental",

              label:
                "Dịch vụ thuê",

              text:
                "Giá thuê theo ngày và điều kiện thuê",

              y:
                600
            })
          )
        ).toBe(
          "commerce"
        );

        expect(
          classifyCaptureSection(
            candidate({
              selector:
                "#specs",

              label:
                "Thông số kỹ thuật",

              text:
                "Cảm biến APS-C 24.2MP",

              y:
                1_000
            })
          )
        ).toBe(
          "specs"
        );

        expect(
          classifyCaptureSection(
            candidate({
              selector:
                "#reviews",

              label:
                "Đánh giá sản phẩm",

              text:
                "4.8/5 từ 21 đánh giá",

              y:
                1_500
            })
          )
        ).toBe(
          "reviews"
        );

        expect(
          classifyCaptureSection(
            candidate({
              selector:
                "#related",

              label:
                "Sản phẩm liên quan",

              text:
                "Khách hàng thường mua thêm Sony 50mm",

              y:
                2_000
            })
          )
        ).toBeNull();
      }
    );


    it(
      "builds a deterministic hero-first plan capped at six screenshots",
      () => {

        const hero =
          candidate({
            selector:
              "#product-hero",

            label:
              "Canon EOS R50",

            text:
              "Canon EOS R50 Body Only 15.990.000đ",

            y:
              80,

            height:
              520,

            kindHint:
              "hero"
          });

        const sections =
          [
            candidate({
              selector:
                "#rental",

              label:
                "Thuê máy",

              text:
                "Giá thuê 400.000đ/ngày",

              y:
                700
            }),
            candidate({
              selector:
                "#specs",

              label:
                "Thông số kỹ thuật",

              text:
                "Cảm biến APS-C",

              y:
                1_100
            }),
            candidate({
              selector:
                "#reviews",

              label:
                "Đánh giá",

              text:
                "4.8/5 21 reviews",

              y:
                1_600
            }),
            candidate({
              selector:
                "#description",

              label:
                "Mô tả chi tiết",

              text:
                "Thông tin sản phẩm",

              y:
                2_100
            }),
            candidate({
              selector:
                "#extra-a",

              label:
                "Thông tin khác",

              text:
                "Thông tin cửa hàng",

              y:
                2_500
            }),
            candidate({
              selector:
                "#extra-b",

              label:
                "Hướng dẫn",

              text:
                "Hướng dẫn sử dụng",

              y:
                2_900
            }),
            candidate({
              selector:
                "#related",

              label:
                "You may also like",

              text:
                "Related products",

              y:
                3_300
            })
          ];

        const first =
          buildCapturePlan({
            hero,
            sections,
            maxShots:
              6
          });

        const second =
          buildCapturePlan({
            hero,
            sections,
            maxShots:
              6
          });

        expect(
          first
        ).toEqual(
          second
        );

        expect(
          first.length
        ).toBeLessThanOrEqual(
          6
        );

        expect(
          first[0]?.shotId
        ).toBe(
          "hero-01"
        );

        expect(
          first.map(
            shot =>
              shot.shotId
          )
        ).toContain(
          "commerce-02"
        );

        expect(
          first.map(
            shot =>
              shot.shotId
          )
        ).toContain(
          "specs-03"
        );

        expect(
          first.map(
            shot =>
              shot.shotId
          )
        ).toContain(
          "reviews-04"
        );

        expect(
          first.some(
            shot =>
              shot.selector ===
              "#related"
          )
        ).toBe(
          false
        );
      }
    );
  }
);
