import {
  describe,
  expect,
  test
} from "vitest";

import {
  classifyEntity
} from "../../src/v02/entityClassifier.ts";

describe(
  "Entity Classifier V2 — verified cameras",
  () => {

    test.each([
      {
        name: "Canon R50",
        category: "THUÊ MÁY ẢNH 📷",
        specs:
          "Loại máy: Mirrorless; Cảm biến APS-C CMOS 24.2MP; Hệ thống lấy nét Dual Pixel CMOS AF II 651 điểm; ISO 100-32000; Kính ngắm EVF; Quay video 4K; Ngàm RF-S"
      },
      {
        name: "Sony A6400",
        category: "THUÊ MÁY ẢNH 📷",
        specs:
          "Loại máy: Mirrorless; Cảm biến APS-C Exmor CMOS 24.2MP; ISO 100-32000; 425 điểm lấy nét; EVF OLED; Quay video 4K; Sony E-mount"
      },
      {
        name: "Canon M",
        category: "THUÊ MÁY ẢNH 📷",
        specs:
          "Loại máy: Máy ảnh mirrorless; Cảm biến APS-C CMOS 18MP; ISO 100-12800; Hybrid CMOS AF II 49 điểm lấy nét; quay video Full HD; ngàm EF-M"
      },
      {
        name: "DJI Osmo 360",
        category: "THUÊ MÁY ẢNH 📷",
        specs:
          "Camera hành động quay video 360 độ; cảm biến kép CMOS; ISO 100-51200; chụp ảnh 120MP; quay video 8K 30fps; quay video 4K 120fps"
      },
      {
        name: "DJI Osmo Pocket 4 Standard Combo",
        category: "THUÊ MÁY ẢNH 📷",
        specs:
          "Cảm biến CMOS 1 inch; độ phân giải ảnh 36MP; quay video 4K 60fps; slow motion 4K 240fps; gimbal 3 trục chống rung"
      },
      {
        name: "Canon 70D + 50mm f/1.8 STM",
        category: "THUÊ MÁY ẢNH 📷",
        specs:
          "Canon EOS 70D cảm biến CMOS APS-C 20.2MP; ISO 100-12800; lấy nét 19 điểm; chụp liên tiếp 7fps; quay video Full HD; ngàm EF/EF-S. Ống kính 50mm f/1.8, tiêu cự 50mm, đường kính filter 49mm"
      }
    ])(
      "$name => CAMERA",
      ({
        name,
        category,
        specs
      }) => {

        const result =
          classifyEntity({
            title: name,
            category,
            specs
          });

        expect(
          result.type
        ).toBe("CAMERA");

        expect(
          result.isCamera
        ).toBe(true);
      }
    );

    test(
      "camera rental category plus an explicit branded body unit proves a sparse camera kit",
      () => {

        const result =
          classifyEntity({
            title:
              "Sony A6400 + Lens Sony 18-105mm",

            category:
              "Tất Cả Camera Cho Thuê",

            description:
              "Set thiết bị cho thuê bao gồm: 1 Body Sony A6400; 1 Lens Sony 18-105mm f4; 2 Pin; 1 Sạc Pin."
          });

        expect(
          result.type
        ).toBe(
          "CAMERA"
        );

        expect(
          result.isCamera
        ).toBe(true);
      }
    );


    test.each([
      "Cho thuê Máy ảnh Sony Alpha A6400 (Máy 2)",
      "Sony a6400 (Chính hãng) (Body Only)",
      "Máy ảnh Sony Alpha A6400 (Black) + Lens Sigma 18-50mm f/2.8 | Chính hãng"
    ])(
      "sparse direct camera title %s => CAMERA",
      title => {

        const result =
          classifyEntity({
            title
          });

        expect(
          result.type
        ).toBe(
          "CAMERA"
        );

        expect(
          result.evidence.some(
            evidence =>
              evidence.source ===
                "TITLE"
          )
        ).toBe(true);
      }
    );


  }
);


describe(
  "Entity Classifier V2 — verified non-cameras",
  () => {

    test(
      "NP-FW50 => BATTERY",
      () => {

        const result =
          classifyEntity({
            title:
              "PIN NP-FW50 (SONY A6000, A6400)",
            category:
              "THUÊ PHỤ KIỆN KHÁC",
            specs:
              "Loại pin: Pin sạc Lithium-Ion; Dung lượng: 1020 mAh; Điện áp: 7.2V; Công suất: 7.3Wh"
          });

        expect(
          result.type
        ).toBe("BATTERY");

        expect(
          result.isCamera
        ).toBe(false);
      }
    );

    test(
      "Canon EF 24-105mm => LENS",
      () => {

        const result =
          classifyEntity({
            title:
              "CANON EF 24-105MM F4L IS USM",
            category:
              "THUÊ PHỤ KIỆN - LENS",
            specs:
              "Tiêu cự 24-105mm; khẩu độ f/4; cấu trúc quang học; đường kính filter 77mm"
          });

        expect(
          result.type
        ).toBe("LENS");
      }
    );

    test(
      "Viltrox 56mm => LENS",
      () => {

        const result =
          classifyEntity({
            title:
              "VILTROX 56MM F/1.4 XF",
            category:
              "THUÊ PHỤ KIỆN - LENS",
            specs:
              "Tiêu cự 56mm; khẩu độ f/1.4; ngàm Fujifilm X; đường kính filter"
          });

        expect(
          result.type
        ).toBe("LENS");
      }
    );

    test(
      "battery charger => CHARGER",
      () => {

        const result =
          classifyEntity({
            title:
              "BỘ SẠC PIN ĐÔI NP-FW50",
            category:
              "THUÊ PHỤ KIỆN KHÁC",
            specs:
              "Bộ sạc hai pin NP-FW50"
          });

        expect(
          result.type
        ).toBe("CHARGER");
      }
    );

    test(
      "Canon SELPHY => PRINTER",
      () => {

        const result =
          classifyEntity({
            title:
              "CANON SELPHY CP1500",
            category:
              "THUÊ MÁY ẢNH",
            specs:
              "Máy in ảnh; công nghệ in nhiệt; tốc độ in ảnh; hỗ trợ giấy in"
          });

        expect(
          result.type
        ).toBe("PRINTER");

        expect(
          result.isCamera
        ).toBe(false);
      }
    );

    test(
      "Photobooth Mirror => PHOTOBOOTH",
      () => {

        const result =
          classifyEntity({
            title:
              "PHOTOBOOTH MIRROR",
            category:
              "THUÊ MÁY ẢNH",
            specs:
              "Photobooth sự kiện"
          });

        expect(
          result.type
        ).toBe("PHOTOBOOTH");
      }
    );
  }
);


describe(
  "Entity Classifier V2 — ambiguity safety",
  () => {

    test(
      "unknown model with no evidence => UNCERTAIN",
      () => {

        const result =
          classifyEntity({
            title:
              "MODEL X100",
            specs: ""
          });

        expect(
          result.type
        ).toBe("UNCERTAIN");
      }
    );

    test(
      "word camera only in compatibility text does not prove CAMERA",
      () => {

        const result =
          classifyEntity({
            title:
              "Accessory X",
            category:
              "THUÊ PHỤ KIỆN KHÁC",
            specs:
              "Tương thích nhiều camera Sony Canon Nikon"
          });

        expect(
          result.type
        ).not.toBe("CAMERA");
      }
    );

    test(
      "camera compatibility wording in an accessory title does not prove CAMERA",
      () => {

        const result =
          classifyEntity({
            title:
              "Túi đựng máy ảnh Sony A6400",
            category:
              "Phụ kiện"
          });

        expect(
          result.type
        ).not.toBe(
          "CAMERA"
        );
      }
    );

  }
);
