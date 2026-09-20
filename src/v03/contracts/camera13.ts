export const CAMERA13_HEADERS = [
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

export type Camera13Header =
  typeof CAMERA13_HEADERS[number];

export type CameraCondition =
  | "NEW"
  | "USED";

export interface Camera13Evidence<T> {
  readonly value: T;
  readonly rawText: string;
  readonly shotId: string;
}

export interface Camera13MoneyEvidence
  extends Camera13Evidence<number> {
  readonly currency: string;
}

export interface Camera13Extraction {
  readonly website: string;
  readonly productName:
    Camera13Evidence<string> |
    null;
  readonly condition:
    Camera13Evidence<CameraCondition> |
    null;
  readonly specs:
    readonly Camera13Evidence<string>[];
  readonly rentalPricePerDay:
    Camera13MoneyEvidence |
    null;
  readonly rentalTerms:
    Camera13Evidence<string> |
    null;
  readonly accessoriesIncluded:
    readonly Camera13Evidence<string>[] |
    null;
  readonly bundleIncluded:
    readonly Camera13Evidence<string>[] |
    null;
  readonly rating:
    Camera13Evidence<number> |
    null;
  readonly reviewCount:
    Camera13Evidence<number> |
    null;
  readonly stock:
    Camera13Evidence<string | number> |
    null;
  readonly salePrice:
    Camera13MoneyEvidence |
    null;
  readonly url: string;
}

export type Camera13ValidationStatus =
  | "VALIDATED"
  | "REVIEW";

export interface Camera13ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

export interface Camera13ValidatedResult {
  readonly status: Camera13ValidationStatus;
  readonly issues: readonly Camera13ValidationIssue[];
  readonly value: Camera13Extraction;
}
