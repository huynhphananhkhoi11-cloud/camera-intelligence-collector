export const TARGET = "CAMERA" as const;

export type CameraBusinessMode =
  | "RENTAL"
  | "SECOND_HAND"
  | "NEW";

export type SiteMode =
  | "RENTAL"
  | "SALE_SECOND_HAND"
  | "SALE_NEW"
  | "SALE_MIXED"
  | "MIXED"
  | "UNKNOWN";

export type ProductLabel =
  | "RENTAL_CAMERA"
  | "SECOND_HAND_CAMERA"
  | "NEW_CAMERA"
  | "LENS"
  | "ACCESSORY"
  | "SERVICE"
  | "ARTICLE"
  | "OTHER"
  | "UNKNOWN";

export interface CameraRecord {
  website: string;
  productName: string;
  businessMode: CameraBusinessMode;
  specs: string;
  rentalPricePerDay: number | null;
  rentalConditions: string;
  includedAccessories: string;
  bundle: string;
  rating: number | null;
  reviewCount: number | null;
  stock: string;
  salePrice: number | null;
  url: string;
}

export interface BrowserNode {
  id: string;
  tag: string;
  text: string;
  role: string;
  href: string;
  ariaLabel: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
